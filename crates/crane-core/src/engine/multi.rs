// Multi-connection HTTP/HTTPS downloader with byte-range splitting

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

use futures_util::StreamExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::task::JoinSet;
use url::Url;

use super::download::{MAX_RETRIES, PROGRESS_INTERVAL_MS, RETRY_BACKOFF_MS, USER_AGENT};
use crate::metadata::analyzer::analyze_url;
use crate::types::{
    ConnectionProgress, CraneError, DownloadOptions, DownloadProgress, DownloadResult,
};

const MIN_CHUNK_SIZE: u64 = 262_144; // 256KB
const DEFAULT_CONNECTIONS: u32 = 8;

/// Plan for a single byte-range chunk.
#[derive(Debug, Clone)]
struct ChunkPlan {
    connection_num: u32,
    range_start: u64,
    range_end: u64,
}

/// Build the temp directory path for chunk storage.
fn temp_dir_path(save_path: &Path) -> PathBuf {
    let mut dir_name = save_path.as_os_str().to_os_string();
    dir_name.push(".crane_tmp");
    PathBuf::from(dir_name)
}

/// Compute chunk boundaries for multi-connection download.
fn plan_chunks(total_size: u64, requested_connections: u32) -> Vec<ChunkPlan> {
    let n = std::cmp::min(requested_connections as u64, total_size / MIN_CHUNK_SIZE).max(1) as u32;

    let chunk_size = total_size / n as u64;
    (0..n)
        .map(|i| {
            let range_start = i as u64 * chunk_size;
            let range_end = if i == n - 1 {
                total_size - 1
            } else {
                (i as u64 + 1) * chunk_size - 1
            };
            ChunkPlan {
                connection_num: i,
                range_start,
                range_end,
            }
        })
        .collect()
}

/// Download a single chunk with retry logic.
async fn download_chunk(
    client: &reqwest::Client,
    url: &str,
    chunk: &ChunkPlan,
    temp_dir: &Path,
    options: &DownloadOptions,
    counter: Arc<AtomicU64>,
) -> Result<u64, CraneError> {
    let chunk_path = temp_dir.join(format!("chunk_{}", chunk.connection_num));
    let mut last_error: Option<CraneError> = None;

    for attempt in 0..=MAX_RETRIES {
        if attempt > 0 {
            let _ = tokio::fs::remove_file(&chunk_path).await;
            let backoff = RETRY_BACKOFF_MS[(attempt - 1) as usize];
            tokio::time::sleep(std::time::Duration::from_millis(backoff)).await;
        }

        // Reset counter for this chunk on retry
        counter.store(0, Ordering::Relaxed);

        let mut request = client.get(url).header(
            "Range",
            format!("bytes={}-{}", chunk.range_start, chunk.range_end),
        );

        if let Some(ref referrer) = options.referrer {
            request = request.header("Referer", referrer);
        }
        if let Some(ref cookies) = options.cookies {
            request = request.header("Cookie", cookies);
        }
        if let Some(ref headers) = options.headers {
            for (key, value) in headers {
                request = request.header(key.as_str(), value.as_str());
            }
        }

        let response = match request.send().await {
            Ok(r) => r,
            Err(e) => {
                let err = CraneError::Network(e);
                if attempt == MAX_RETRIES {
                    return Err(err);
                }
                last_error = Some(err);
                continue;
            }
        };

        let status = response.status();
        if status.is_server_error() {
            let err = CraneError::Http {
                status: status.as_u16(),
                message: status.canonical_reason().unwrap_or("Unknown").to_string(),
            };
            if attempt == MAX_RETRIES {
                return Err(err);
            }
            last_error = Some(err);
            continue;
        }
        if !status.is_success() {
            return Err(CraneError::Http {
                status: status.as_u16(),
                message: status.canonical_reason().unwrap_or("Unknown").to_string(),
            });
        }

        let mut file = tokio::fs::File::create(&chunk_path).await?;
        let mut stream = response.bytes_stream();
        let mut downloaded: u64 = 0;

        let mut stream_err = None;
        while let Some(chunk_result) = stream.next().await {
            match chunk_result {
                Ok(bytes) => {
                    file.write_all(&bytes).await?;
                    downloaded += bytes.len() as u64;
                    counter.store(downloaded, Ordering::Relaxed);
                }
                Err(e) => {
                    stream_err = Some(CraneError::Network(e));
                    break;
                }
            }
        }

        file.shutdown().await?;

        if let Some(err) = stream_err {
            if attempt == MAX_RETRIES {
                return Err(err);
            }
            last_error = Some(err);
            continue;
        }

        return Ok(downloaded);
    }

    Err(last_error.unwrap_or_else(|| CraneError::Http {
        status: 0,
        message: "unknown error".to_string(),
    }))
}

/// Download a file using multiple connections with byte-range splitting.
///
/// If the server supports range requests and the file size is known,
/// splits the download into parallel chunks. Otherwise falls back to
/// single-connection download.
pub async fn download<F>(
    url: &str,
    save_path: &Path,
    options: &DownloadOptions,
    on_progress: F,
) -> Result<DownloadResult, CraneError>
where
    F: Fn(&DownloadProgress) + Send + Sync + 'static,
{
    // Validate URL
    let parsed = Url::parse(url)?;
    match parsed.scheme() {
        "http" | "https" => {}
        scheme => return Err(CraneError::UnsupportedScheme(scheme.to_string())),
    }

    // Analyze URL to determine resumability and size
    let analysis = analyze_url(url).await?;

    let requested_connections = options.connections.unwrap_or(DEFAULT_CONNECTIONS);

    // Check if multi-connection is eligible
    let multi_eligible =
        analysis.resumable && analysis.total_size.is_some() && requested_connections > 1;

    if !multi_eligible {
        return super::download::download_file(url, save_path, options, on_progress).await;
    }

    let total_size = analysis.total_size.unwrap();
    let start_time = Instant::now();

    // Plan chunks
    let chunks = plan_chunks(total_size, requested_connections);
    let num_chunks = chunks.len();

    // Build HTTP client
    let ua = options
        .user_agent
        .as_deref()
        .unwrap_or(USER_AGENT)
        .to_string();
    let client = reqwest::Client::builder()
        .user_agent(ua)
        .build()
        .map_err(CraneError::Network)?;

    // Create temp directory
    let temp_dir = temp_dir_path(save_path);
    tokio::fs::create_dir_all(&temp_dir).await?;

    // Create shared progress counters (one per chunk)
    let counters: Vec<Arc<AtomicU64>> = (0..num_chunks)
        .map(|_| Arc::new(AtomicU64::new(0)))
        .collect();

    // Wrap on_progress in Arc for sharing
    let on_progress = Arc::new(on_progress);
    let progress_on_progress = on_progress.clone();

    // Spawn progress reporter task
    let progress_counters: Vec<Arc<AtomicU64>> = counters.iter().map(Arc::clone).collect();
    let progress_chunks: Vec<ChunkPlan> = chunks.clone();
    let progress_stop = Arc::new(AtomicBool::new(false));
    let progress_stop_clone = progress_stop.clone();

    let progress_handle = tokio::spawn(async move {
        let mut last_total: u64 = 0;
        let mut last_speed_time = Instant::now();

        loop {
            tokio::time::sleep(std::time::Duration::from_millis(PROGRESS_INTERVAL_MS)).await;

            if progress_stop_clone.load(Ordering::Relaxed) {
                break;
            }

            let mut connections = Vec::with_capacity(progress_chunks.len());
            let mut total_downloaded: u64 = 0;

            for (i, chunk) in progress_chunks.iter().enumerate() {
                let downloaded = progress_counters[i].load(Ordering::Relaxed);
                total_downloaded += downloaded;
                connections.push(ConnectionProgress {
                    connection_num: chunk.connection_num,
                    downloaded,
                    range_start: chunk.range_start,
                    range_end: chunk.range_end,
                });
            }

            let elapsed = last_speed_time.elapsed().as_secs_f64();
            let speed = if elapsed > 0.0 {
                (total_downloaded.saturating_sub(last_total)) as f64 / elapsed
            } else {
                0.0
            };

            let eta = if speed > 0.0 {
                let remaining = total_size.saturating_sub(total_downloaded);
                Some((remaining as f64 / speed) as u64)
            } else {
                None
            };

            progress_on_progress(&DownloadProgress {
                download_id: String::new(),
                downloaded_size: total_downloaded,
                total_size: Some(total_size),
                speed,
                eta_seconds: eta,
                connections,
            });

            last_total = total_downloaded;
            last_speed_time = Instant::now();
        }
    });

    // Spawn chunk download tasks
    let mut join_set = JoinSet::new();

    for (i, chunk) in chunks.iter().enumerate() {
        let client = client.clone();
        let url = url.to_string();
        let chunk = chunk.clone();
        let temp_dir = temp_dir.clone();
        let options = options.clone();
        let counter = Arc::clone(&counters[i]);

        join_set.spawn(async move {
            download_chunk(&client, &url, &chunk, &temp_dir, &options, counter).await
        });
    }

    // Collect results
    let mut first_error: Option<CraneError> = None;

    while let Some(result) = join_set.join_next().await {
        match result {
            Ok(Ok(_bytes)) => {}
            Ok(Err(e)) => {
                if first_error.is_none() {
                    first_error = Some(e);
                }
            }
            Err(e) => {
                if first_error.is_none() {
                    first_error = Some(CraneError::Config(format!("task join error: {e}")));
                }
            }
        }
    }

    // Stop progress reporter
    progress_stop.store(true, Ordering::Relaxed);
    let _ = progress_handle.await;

    // If any task failed, clean up and return error
    if let Some(err) = first_error {
        let _ = tokio::fs::remove_dir_all(&temp_dir).await;
        return Err(err);
    }

    // Merge chunk files into final file
    if let Some(parent) = save_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let mut final_file = tokio::fs::File::create(save_path).await?;
    let mut merged_bytes: u64 = 0;

    for i in 0..num_chunks {
        let chunk_path = temp_dir.join(format!("chunk_{i}"));
        let mut chunk_file = tokio::fs::File::open(&chunk_path).await?;
        let mut buf = vec![0u8; 65_536];
        loop {
            let n = chunk_file.read(&mut buf).await?;
            if n == 0 {
                break;
            }
            final_file.write_all(&buf[..n]).await?;
            merged_bytes += n as u64;
        }
    }

    final_file.shutdown().await?;

    // Verify total bytes
    if merged_bytes != total_size {
        let _ = tokio::fs::remove_file(save_path).await;
        let _ = tokio::fs::remove_dir_all(&temp_dir).await;
        return Err(CraneError::Config(format!(
            "merge size mismatch: expected {total_size}, got {merged_bytes}"
        )));
    }

    // Cleanup temp directory
    let _ = tokio::fs::remove_dir_all(&temp_dir).await;

    // Final progress callback
    let elapsed = start_time.elapsed();
    let speed = if elapsed.as_secs_f64() > 0.0 {
        merged_bytes as f64 / elapsed.as_secs_f64()
    } else {
        0.0
    };

    on_progress(&DownloadProgress {
        download_id: String::new(),
        downloaded_size: merged_bytes,
        total_size: Some(total_size),
        speed,
        eta_seconds: Some(0),
        connections: chunks
            .iter()
            .map(|c| ConnectionProgress {
                connection_num: c.connection_num,
                downloaded: c.range_end - c.range_start + 1,
                range_start: c.range_start,
                range_end: c.range_end,
            })
            .collect(),
    });

    Ok(DownloadResult {
        downloaded_bytes: merged_bytes,
        elapsed_ms: elapsed.as_millis() as u64,
        final_path: save_path.to_path_buf(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};
    use tempfile::TempDir;
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn noop_progress(_: &DownloadProgress) {}

    /// Helper: responds to Range requests with the correct byte slice.
    struct RangeResponder {
        body: Vec<u8>,
    }

    impl wiremock::Respond for RangeResponder {
        fn respond(&self, request: &wiremock::Request) -> wiremock::ResponseTemplate {
            if let Some(range_header) = request.headers.get(&reqwest::header::RANGE) {
                let range_str = range_header.to_str().unwrap();
                let range = range_str.trim_start_matches("bytes=");
                let parts: Vec<&str> = range.split('-').collect();
                let start: usize = parts[0].parse().unwrap();
                let end: usize = parts[1].parse().unwrap();
                let slice = &self.body[start..=end];
                wiremock::ResponseTemplate::new(206)
                    .set_body_bytes(slice.to_vec())
                    .insert_header("Content-Length", slice.len().to_string().as_str())
                    .insert_header(
                        "Content-Range",
                        format!("bytes {start}-{end}/{}", self.body.len()).as_str(),
                    )
            } else {
                wiremock::ResponseTemplate::new(200)
                    .set_body_bytes(self.body.clone())
                    .insert_header("Content-Length", self.body.len().to_string().as_str())
            }
        }
    }

    /// Mount HEAD mock that advertises Accept-Ranges: bytes and Content-Length.
    async fn mount_head_with_ranges(server: &MockServer, url_path: &str, size: u64) {
        Mock::given(method("HEAD"))
            .and(path(url_path))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("Accept-Ranges", "bytes")
                    .insert_header("Content-Length", size.to_string().as_str())
                    .insert_header("Content-Type", "application/octet-stream"),
            )
            .mount(server)
            .await;
    }

    /// Mount HEAD mock without Accept-Ranges.
    async fn mount_head_no_ranges(server: &MockServer, url_path: &str, size: u64) {
        Mock::given(method("HEAD"))
            .and(path(url_path))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("Content-Length", size.to_string().as_str())
                    .insert_header("Content-Type", "application/octet-stream"),
            )
            .mount(server)
            .await;
    }

    /// Mount GET mock using RangeResponder.
    async fn mount_get_range(server: &MockServer, url_path: &str, body: &[u8]) {
        Mock::given(method("GET"))
            .and(path(url_path))
            .respond_with(RangeResponder {
                body: body.to_vec(),
            })
            .mount(server)
            .await;
    }

    // ── Test 1: Basic multi-connection download ──

    #[tokio::test]
    async fn test_multi_connection_basic() {
        let server = MockServer::start().await;
        let body: Vec<u8> = (0..1_048_576u32).map(|i| (i % 256) as u8).collect();

        mount_head_with_ranges(&server, "/multi.bin", body.len() as u64).await;
        mount_get_range(&server, "/multi.bin", &body).await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("multi.bin");

        let opts = DownloadOptions {
            connections: Some(4),
            ..Default::default()
        };

        let result = download(
            &format!("{}/multi.bin", server.uri()),
            &save,
            &opts,
            noop_progress,
        )
        .await
        .unwrap();

        assert_eq!(result.downloaded_bytes, body.len() as u64);
        assert_eq!(result.final_path, save);
        assert_eq!(std::fs::read(&save).unwrap(), body);
    }

    // ── Test 2: Chunk splitting exact boundaries ──

    #[test]
    fn test_chunk_splitting_exact() {
        let chunks = plan_chunks(1_048_576, 4);
        assert_eq!(chunks.len(), 4);

        // Each chunk is 262144 bytes
        assert_eq!(chunks[0].range_start, 0);
        assert_eq!(chunks[0].range_end, 262_143);
        assert_eq!(chunks[1].range_start, 262_144);
        assert_eq!(chunks[1].range_end, 524_287);
        assert_eq!(chunks[2].range_start, 524_288);
        assert_eq!(chunks[2].range_end, 786_431);
        assert_eq!(chunks[3].range_start, 786_432);
        assert_eq!(chunks[3].range_end, 1_048_575);
    }

    // ── Test 3: Chunk splitting covers all bytes ──

    #[test]
    fn test_chunk_splitting_covers_all_bytes() {
        let chunks = plan_chunks(1_000_000, 7);

        // First starts at 0
        assert_eq!(chunks[0].range_start, 0);

        // Last ends at total_size - 1
        assert_eq!(chunks.last().unwrap().range_end, 999_999);

        // No gaps between chunks
        for window in chunks.windows(2) {
            assert_eq!(
                window[1].range_start,
                window[0].range_end + 1,
                "gap between chunk {} and {}",
                window[0].connection_num,
                window[1].connection_num
            );
        }
    }

    // ── Test 4: Fallback to single connection ──

    #[tokio::test]
    async fn test_fallback_to_single_connection() {
        let server = MockServer::start().await;
        let body = vec![0xABu8; 512 * 1024]; // 512KB

        // HEAD without Accept-Ranges → not resumable
        mount_head_no_ranges(&server, "/single.bin", body.len() as u64).await;

        // GET returns full body (single-connection fallback)
        Mock::given(method("GET"))
            .and(path("/single.bin"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_bytes(body.clone())
                    .insert_header("Content-Length", body.len().to_string().as_str()),
            )
            .mount(&server)
            .await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("single.bin");

        let opts = DownloadOptions {
            connections: Some(4),
            ..Default::default()
        };

        let result = download(
            &format!("{}/single.bin", server.uri()),
            &save,
            &opts,
            noop_progress,
        )
        .await
        .unwrap();

        assert_eq!(result.downloaded_bytes, body.len() as u64);
        assert_eq!(std::fs::read(&save).unwrap(), body);
    }

    // ── Test 5: Small file caps connections ──

    #[tokio::test]
    async fn test_small_file_caps_connections() {
        let server = MockServer::start().await;
        let body: Vec<u8> = (0..524_288u32).map(|i| (i % 256) as u8).collect(); // 512KB

        mount_head_with_ranges(&server, "/small.bin", body.len() as u64).await;
        mount_get_range(&server, "/small.bin", &body).await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("small.bin");

        let opts = DownloadOptions {
            connections: Some(8), // Request 8 but 512KB / 256KB = 2 max
            ..Default::default()
        };

        let result = download(
            &format!("{}/small.bin", server.uri()),
            &save,
            &opts,
            noop_progress,
        )
        .await
        .unwrap();

        assert_eq!(result.downloaded_bytes, body.len() as u64);
        assert_eq!(std::fs::read(&save).unwrap(), body);

        // Verify: plan_chunks would give at most 2 connections for 512KB
        let chunks = plan_chunks(body.len() as u64, 8);
        assert!(
            chunks.len() <= 2,
            "expected at most 2 chunks, got {}",
            chunks.len()
        );
    }

    // ── Test 6: Connection failure aborts download ──

    #[tokio::test]
    async fn test_connection_failure_aborts_download() {
        let server = MockServer::start().await;
        let size: u64 = 1_048_576;

        mount_head_with_ranges(&server, "/fail.bin", size).await;

        // GET always returns 500
        Mock::given(method("GET"))
            .and(path("/fail.bin"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&server)
            .await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("fail.bin");

        let opts = DownloadOptions {
            connections: Some(4),
            ..Default::default()
        };

        let result = download(
            &format!("{}/fail.bin", server.uri()),
            &save,
            &opts,
            noop_progress,
        )
        .await;

        assert!(
            result.is_err(),
            "download should fail when all connections return 500"
        );
        assert!(!save.exists(), "final file should not exist after failure");
    }

    // ── Test 7: Progress includes connections ──

    #[tokio::test]
    async fn test_progress_includes_connections() {
        let server = MockServer::start().await;
        let body: Vec<u8> = (0..1_048_576u32).map(|i| (i % 256) as u8).collect();

        mount_head_with_ranges(&server, "/progress.bin", body.len() as u64).await;
        mount_get_range(&server, "/progress.bin", &body).await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("progress.bin");

        let progress_log: Arc<Mutex<Vec<DownloadProgress>>> = Arc::new(Mutex::new(Vec::new()));
        let log_clone = progress_log.clone();

        let opts = DownloadOptions {
            connections: Some(4),
            ..Default::default()
        };

        let _result = download(
            &format!("{}/progress.bin", server.uri()),
            &save,
            &opts,
            move |p: &DownloadProgress| {
                log_clone.lock().unwrap().push(p.clone());
            },
        )
        .await
        .unwrap();

        let log = progress_log.lock().unwrap();
        // At least one progress report should have connection info
        let has_connections = log.iter().any(|p| !p.connections.is_empty());
        assert!(
            has_connections,
            "at least one progress callback should include ConnectionProgress entries"
        );
    }

    // ── Test 8: Merge integrity with prime-modulus pattern ──

    #[tokio::test]
    async fn test_merge_integrity() {
        let server = MockServer::start().await;
        // Generate body with prime-modulus pattern to catch off-by-one errors
        let body: Vec<u8> = (0..1_048_576u64).map(|i| (i % 251) as u8).collect();

        mount_head_with_ranges(&server, "/integrity.bin", body.len() as u64).await;
        mount_get_range(&server, "/integrity.bin", &body).await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("integrity.bin");

        let opts = DownloadOptions {
            connections: Some(4),
            ..Default::default()
        };

        let result = download(
            &format!("{}/integrity.bin", server.uri()),
            &save,
            &opts,
            noop_progress,
        )
        .await
        .unwrap();

        let saved = std::fs::read(&save).unwrap();
        assert_eq!(saved.len(), body.len(), "file size mismatch");
        assert_eq!(saved, body, "merged file is not byte-identical to source");
        assert_eq!(result.downloaded_bytes, body.len() as u64);
    }

    // ── Test 9: Temp dir cleaned on success ──

    #[tokio::test]
    async fn test_temp_dir_cleaned_on_success() {
        let server = MockServer::start().await;
        let body: Vec<u8> = (0..524_288u32).map(|i| (i % 256) as u8).collect(); // 512KB

        mount_head_with_ranges(&server, "/cleanup.bin", body.len() as u64).await;
        mount_get_range(&server, "/cleanup.bin", &body).await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("cleanup.bin");

        let opts = DownloadOptions {
            connections: Some(2),
            ..Default::default()
        };

        let _result = download(
            &format!("{}/cleanup.bin", server.uri()),
            &save,
            &opts,
            noop_progress,
        )
        .await
        .unwrap();

        let temp_dir = temp_dir_path(&save);
        assert!(
            !temp_dir.exists(),
            "temp dir {:?} should not exist after successful download",
            temp_dir
        );
        assert!(save.exists(), "final file should exist");
    }

    // ── Test 10: Custom headers in multi-connection download ──

    #[tokio::test]
    async fn test_custom_headers_in_multi() {
        let server = MockServer::start().await;
        let body: Vec<u8> = (0..1_048_576u32).map(|i| (i % 256) as u8).collect();

        mount_head_with_ranges(&server, "/headers.bin", body.len() as u64).await;

        // Custom RangeResponder that also validates X-Custom header presence.
        // We use wiremock matchers to require the header on GET.
        struct CustomRangeResponder {
            body: Vec<u8>,
        }

        impl wiremock::Respond for CustomRangeResponder {
            fn respond(&self, request: &wiremock::Request) -> wiremock::ResponseTemplate {
                if let Some(range_header) = request.headers.get(&reqwest::header::RANGE) {
                    let range_str = range_header.to_str().unwrap();
                    let range = range_str.trim_start_matches("bytes=");
                    let parts: Vec<&str> = range.split('-').collect();
                    let start: usize = parts[0].parse().unwrap();
                    let end: usize = parts[1].parse().unwrap();
                    let slice = &self.body[start..=end];
                    wiremock::ResponseTemplate::new(206)
                        .set_body_bytes(slice.to_vec())
                        .insert_header("Content-Length", slice.len().to_string().as_str())
                        .insert_header(
                            "Content-Range",
                            format!("bytes {start}-{end}/{}", self.body.len()).as_str(),
                        )
                } else {
                    wiremock::ResponseTemplate::new(200)
                        .set_body_bytes(self.body.clone())
                        .insert_header("Content-Length", self.body.len().to_string().as_str())
                }
            }
        }

        // GET requires X-Custom header
        Mock::given(method("GET"))
            .and(path("/headers.bin"))
            .and(header("X-Custom", "test-value"))
            .respond_with(CustomRangeResponder { body: body.clone() })
            .mount(&server)
            .await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("headers.bin");

        let mut custom_headers = HashMap::new();
        custom_headers.insert("X-Custom".to_string(), "test-value".to_string());

        let opts = DownloadOptions {
            connections: Some(4),
            headers: Some(custom_headers),
            ..Default::default()
        };

        let result = download(
            &format!("{}/headers.bin", server.uri()),
            &save,
            &opts,
            noop_progress,
        )
        .await
        .unwrap();

        assert_eq!(result.downloaded_bytes, body.len() as u64);
        assert_eq!(std::fs::read(&save).unwrap(), body);
    }
}
