// Multi-connection HTTP/HTTPS downloader with byte-range splitting

use std::path::{Path, PathBuf};

use crate::types::{CraneError, DownloadOptions, DownloadProgress, DownloadResult};

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
    let n = std::cmp::min(
        requested_connections as u64,
        total_size / MIN_CHUNK_SIZE,
    )
    .max(1) as u32;

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
    todo!("will be implemented in Task 3")
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
        assert!(chunks.len() <= 2, "expected at most 2 chunks, got {}", chunks.len());
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

        assert!(result.is_err(), "download should fail when all connections return 500");
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
            .respond_with(CustomRangeResponder {
                body: body.clone(),
            })
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
