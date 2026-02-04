// Single-connection HTTP/HTTPS downloader

use std::path::{Path, PathBuf};
use std::time::Instant;

use futures_util::StreamExt;
use tokio::io::AsyncWriteExt;
use url::Url;

use crate::types::{CraneError, DownloadOptions, DownloadProgress, DownloadResult};

#[allow(dead_code)] // Used in tests to size mock response bodies
const CHUNK_SIZE: usize = 65_536; // 64KB
const PROGRESS_INTERVAL_MS: u64 = 250;
const MAX_RETRIES: u32 = 3;
const RETRY_BACKOFF_MS: [u64; 3] = [1000, 2000, 4000];
const USER_AGENT: &str = "Crane/0.1.0";

/// Build the temporary download path by appending `.cranedownload`.
fn temp_path(save_path: &Path) -> PathBuf {
    let mut temp_name = save_path.as_os_str().to_os_string();
    temp_name.push(".cranedownload");
    PathBuf::from(temp_name)
}

/// Perform a single download attempt: send GET, stream body to temp file.
///
/// Returns `(downloaded_bytes, total_size)` on success, or a `CraneError`
/// on failure. The caller is responsible for renaming the temp file.
async fn attempt_download<F>(
    parsed_url: &Url,
    save_path: &Path,
    options: &DownloadOptions,
    on_progress: &F,
    start_time: Instant,
) -> Result<(u64, Option<u64>), CraneError>
where
    F: Fn(&DownloadProgress) + Send,
{
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

    // Build request
    let mut request = client.get(parsed_url.as_str());

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

    // Send request
    let response = request.send().await.map_err(CraneError::Network)?;
    let status = response.status();
    if !status.is_success() {
        return Err(CraneError::Http {
            status: status.as_u16(),
            message: status.canonical_reason().unwrap_or("Unknown").to_string(),
        });
    }

    let total_size = response.content_length();

    // Ensure parent directory exists
    let tmp = temp_path(save_path);
    if let Some(parent) = tmp.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    // Stream body to temp file
    let mut file = tokio::fs::File::create(&tmp).await?;
    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut last_progress_time = Instant::now();
    let mut last_speed_bytes: u64 = 0;
    let mut last_speed_time = Instant::now();
    let mut current_speed: f64 = 0.0;

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(CraneError::Network)?;
        file.write_all(&chunk).await?;
        downloaded += chunk.len() as u64;

        // Update speed calculation every 1 second
        let speed_elapsed = last_speed_time.elapsed().as_secs_f64();
        if speed_elapsed >= 1.0 {
            current_speed = (downloaded - last_speed_bytes) as f64 / speed_elapsed;
            last_speed_bytes = downloaded;
            last_speed_time = Instant::now();
        }

        // Report progress at most every PROGRESS_INTERVAL_MS
        if last_progress_time.elapsed().as_millis() >= PROGRESS_INTERVAL_MS as u128 {
            let eta = if current_speed > 0.0 {
                total_size.map(|total| {
                    let remaining = total.saturating_sub(downloaded);
                    (remaining as f64 / current_speed) as u64
                })
            } else {
                None
            };

            on_progress(&DownloadProgress {
                download_id: String::new(),
                downloaded_size: downloaded,
                total_size,
                speed: current_speed,
                eta_seconds: eta,
                connections: vec![],
            });
            last_progress_time = Instant::now();
        }
    }

    file.flush().await?;
    drop(file);

    // Final speed calculation
    let total_elapsed = start_time.elapsed().as_secs_f64();
    if total_elapsed > 0.0 {
        current_speed = downloaded as f64 / total_elapsed;
    }

    // Final progress report
    let eta = Some(0u64);
    on_progress(&DownloadProgress {
        download_id: String::new(),
        downloaded_size: downloaded,
        total_size,
        speed: current_speed,
        eta_seconds: eta,
        connections: vec![],
    });

    Ok((downloaded, total_size))
}

/// Download a file from a URL to a local path using a single HTTP connection.
///
/// Streams the response body in 64KB chunks, writing to a temporary
/// `.cranedownload` file and renaming on success. Retries transient
/// (5xx) errors up to 3 times with exponential backoff.
///
/// The `on_progress` callback fires at most every 250ms with current
/// download statistics.
pub async fn download_file<F>(
    url: &str,
    save_path: &Path,
    options: &DownloadOptions,
    on_progress: F,
) -> Result<DownloadResult, CraneError>
where
    F: Fn(&DownloadProgress) + Send,
{
    // Validate URL
    let parsed = Url::parse(url)?;
    match parsed.scheme() {
        "http" | "https" => {}
        scheme => return Err(CraneError::UnsupportedScheme(scheme.to_string())),
    }

    let start = Instant::now();
    let tmp = temp_path(save_path);
    let mut last_error: Option<CraneError> = None;

    // Initial attempt + up to MAX_RETRIES retries
    for attempt in 0..=MAX_RETRIES {
        if attempt > 0 {
            // Clean up temp file from previous failed attempt
            let _ = tokio::fs::remove_file(&tmp).await;

            let backoff = RETRY_BACKOFF_MS[(attempt - 1) as usize];
            tokio::time::sleep(std::time::Duration::from_millis(backoff)).await;
        }

        match attempt_download(&parsed, save_path, options, &on_progress, start).await {
            Ok((downloaded_bytes, _total_size)) => {
                // Rename temp file to final path
                tokio::fs::rename(&tmp, save_path).await?;

                return Ok(DownloadResult {
                    downloaded_bytes,
                    elapsed_ms: start.elapsed().as_millis() as u64,
                    final_path: save_path.to_path_buf(),
                });
            }
            Err(e) => {
                // Don't retry 4xx errors or URL-level errors — they're permanent
                let is_retryable = matches!(&e, CraneError::Http { status, .. } if *status >= 500);
                if !is_retryable || attempt == MAX_RETRIES {
                    // Clean up temp file on final failure
                    let _ = tokio::fs::remove_file(&tmp).await;
                    return Err(e);
                }
                last_error = Some(e);
            }
        }
    }

    // Should not reach here, but just in case
    let _ = tokio::fs::remove_file(&tmp).await;
    Err(last_error.unwrap_or_else(|| CraneError::Http {
        status: 0,
        message: "unknown error".to_string(),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    use tempfile::TempDir;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn noop_progress(_: &DownloadProgress) {}

    #[tokio::test]
    async fn test_basic_download() {
        let server = MockServer::start().await;
        let body = b"Hello, Crane!";

        Mock::given(method("GET"))
            .and(path("/file.txt"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_bytes(body.to_vec())
                    .insert_header("Content-Length", body.len().to_string().as_str()),
            )
            .expect(1)
            .mount(&server)
            .await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("file.txt");

        let result = download_file(
            &format!("{}/file.txt", server.uri()),
            &save,
            &DownloadOptions::default(),
            noop_progress,
        )
        .await
        .unwrap();

        assert_eq!(result.downloaded_bytes, body.len() as u64);
        assert_eq!(result.final_path, save);
        assert_eq!(std::fs::read(&save).unwrap(), body);
    }

    #[tokio::test]
    async fn test_progress_reporting() {
        let server = MockServer::start().await;
        let body = vec![0xABu8; CHUNK_SIZE * 3];

        Mock::given(method("GET"))
            .and(path("/big.bin"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_bytes(body.clone())
                    .insert_header("Content-Length", body.len().to_string().as_str()),
            )
            .expect(1)
            .mount(&server)
            .await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("big.bin");

        let progress_log: Arc<Mutex<Vec<u64>>> = Arc::new(Mutex::new(Vec::new()));
        let log_clone = progress_log.clone();

        let result = download_file(
            &format!("{}/big.bin", server.uri()),
            &save,
            &DownloadOptions::default(),
            move |p: &DownloadProgress| {
                log_clone.lock().unwrap().push(p.downloaded_size);
            },
        )
        .await
        .unwrap();

        let log = progress_log.lock().unwrap();
        assert!(!log.is_empty(), "progress callback should have been called");

        // Bytes should be non-decreasing
        for window in log.windows(2) {
            assert!(window[1] >= window[0], "progress should be non-decreasing");
        }

        // Last reported size must equal total downloaded
        assert_eq!(
            *log.last().unwrap(),
            result.downloaded_bytes,
            "final progress must equal total downloaded"
        );
    }

    #[tokio::test]
    async fn test_unknown_content_length() {
        let server = MockServer::start().await;
        let body = b"no content-length here";

        Mock::given(method("GET"))
            .and(path("/mystery.bin"))
            .respond_with(
                ResponseTemplate::new(200).set_body_bytes(body.to_vec()), // no Content-Length
            )
            .expect(1)
            .mount(&server)
            .await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("mystery.bin");

        let result = download_file(
            &format!("{}/mystery.bin", server.uri()),
            &save,
            &DownloadOptions::default(),
            noop_progress,
        )
        .await
        .unwrap();

        assert_eq!(result.downloaded_bytes, body.len() as u64);
        assert_eq!(std::fs::read(&save).unwrap(), body);
    }

    #[tokio::test]
    async fn test_http_error_404() {
        let server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/missing.txt"))
            .respond_with(ResponseTemplate::new(404))
            .expect(1)
            .mount(&server)
            .await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("missing.txt");

        let err = download_file(
            &format!("{}/missing.txt", server.uri()),
            &save,
            &DownloadOptions::default(),
            noop_progress,
        )
        .await
        .unwrap_err();

        match err {
            CraneError::Http { status, .. } => assert_eq!(status, 404),
            other => panic!("expected CraneError::Http, got: {other:?}"),
        }
    }

    #[tokio::test]
    async fn test_retry_success_on_second_attempt() {
        let server = MockServer::start().await;
        let body = b"retry success";

        // First request returns 500, then expires
        Mock::given(method("GET"))
            .and(path("/retry.bin"))
            .respond_with(ResponseTemplate::new(500))
            .up_to_n_times(1)
            .expect(1)
            .mount(&server)
            .await;

        // Subsequent requests return 200
        Mock::given(method("GET"))
            .and(path("/retry.bin"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_bytes(body.to_vec())
                    .insert_header("Content-Length", body.len().to_string().as_str()),
            )
            .expect(1)
            .mount(&server)
            .await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("retry.bin");

        let result = download_file(
            &format!("{}/retry.bin", server.uri()),
            &save,
            &DownloadOptions::default(),
            noop_progress,
        )
        .await
        .unwrap();

        assert_eq!(result.downloaded_bytes, body.len() as u64);
        assert_eq!(std::fs::read(&save).unwrap(), body);
    }

    #[tokio::test]
    async fn test_retry_exhausted() {
        let server = MockServer::start().await;

        // All requests return 500; expect 1 initial + 3 retries = 4
        Mock::given(method("GET"))
            .and(path("/always-fail.bin"))
            .respond_with(ResponseTemplate::new(500))
            .expect(4)
            .mount(&server)
            .await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("always-fail.bin");

        let err = download_file(
            &format!("{}/always-fail.bin", server.uri()),
            &save,
            &DownloadOptions::default(),
            noop_progress,
        )
        .await;

        assert!(err.is_err(), "should have failed after retries exhausted");
        assert!(!save.exists(), "final file should not exist");
    }

    #[tokio::test]
    async fn test_custom_user_agent() {
        let server = MockServer::start().await;
        let body = b"ua-test";

        Mock::given(method("GET"))
            .and(path("/ua.txt"))
            .and(wiremock::matchers::header("User-Agent", "CustomAgent/1.0"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_bytes(body.to_vec())
                    .insert_header("Content-Length", body.len().to_string().as_str()),
            )
            .expect(1)
            .mount(&server)
            .await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("ua.txt");

        let opts = DownloadOptions {
            user_agent: Some("CustomAgent/1.0".to_string()),
            ..Default::default()
        };

        let result = download_file(
            &format!("{}/ua.txt", server.uri()),
            &save,
            &opts,
            noop_progress,
        )
        .await
        .unwrap();

        assert_eq!(result.downloaded_bytes, body.len() as u64);
    }

    #[tokio::test]
    async fn test_custom_referrer() {
        let server = MockServer::start().await;
        let body = b"ref-test";

        Mock::given(method("GET"))
            .and(path("/ref.txt"))
            .and(wiremock::matchers::header(
                "Referer",
                "https://example.com/page",
            ))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_bytes(body.to_vec())
                    .insert_header("Content-Length", body.len().to_string().as_str()),
            )
            .expect(1)
            .mount(&server)
            .await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("ref.txt");

        let opts = DownloadOptions {
            referrer: Some("https://example.com/page".to_string()),
            ..Default::default()
        };

        let result = download_file(
            &format!("{}/ref.txt", server.uri()),
            &save,
            &opts,
            noop_progress,
        )
        .await
        .unwrap();

        assert_eq!(result.downloaded_bytes, body.len() as u64);
    }

    #[tokio::test]
    async fn test_empty_body() {
        let server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/empty.txt"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_bytes(Vec::new())
                    .insert_header("Content-Length", "0"),
            )
            .expect(1)
            .mount(&server)
            .await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("empty.txt");

        let result = download_file(
            &format!("{}/empty.txt", server.uri()),
            &save,
            &DownloadOptions::default(),
            noop_progress,
        )
        .await
        .unwrap();

        assert_eq!(result.downloaded_bytes, 0);
        assert!(save.exists());
        assert_eq!(std::fs::read(&save).unwrap().len(), 0);
    }

    #[tokio::test]
    async fn test_invalid_url() {
        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("invalid.txt");

        let err = download_file(
            "not-a-url",
            &save,
            &DownloadOptions::default(),
            noop_progress,
        )
        .await;

        assert!(err.is_err(), "invalid URL should return an error");
    }

    #[tokio::test]
    async fn test_unsupported_scheme() {
        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("ftp.txt");

        let err = download_file(
            "ftp://example.com/file.txt",
            &save,
            &DownloadOptions::default(),
            noop_progress,
        )
        .await
        .unwrap_err();

        match err {
            CraneError::UnsupportedScheme(scheme) => {
                assert_eq!(scheme, "ftp");
            }
            other => panic!("expected CraneError::UnsupportedScheme, got: {other:?}"),
        }
    }

    #[tokio::test]
    async fn test_progress_has_speed() {
        let server = MockServer::start().await;
        let body = vec![0xCDu8; CHUNK_SIZE * 5];

        Mock::given(method("GET"))
            .and(path("/speed.bin"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_bytes(body.clone())
                    .insert_header("Content-Length", body.len().to_string().as_str()),
            )
            .expect(1)
            .mount(&server)
            .await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("speed.bin");

        let progress_log: Arc<Mutex<Vec<DownloadProgress>>> = Arc::new(Mutex::new(Vec::new()));
        let log_clone = progress_log.clone();

        let result = download_file(
            &format!("{}/speed.bin", server.uri()),
            &save,
            &DownloadOptions::default(),
            move |p: &DownloadProgress| {
                log_clone.lock().unwrap().push(p.clone());
            },
        )
        .await
        .unwrap();

        let log = progress_log.lock().unwrap();
        assert!(!log.is_empty());

        let last = log.last().unwrap();
        assert_eq!(
            last.downloaded_size, result.downloaded_bytes,
            "final progress downloaded_size must match result"
        );
        assert_eq!(
            last.total_size,
            Some(body.len() as u64),
            "total_size should be Some when Content-Length is known"
        );
    }

    #[tokio::test]
    async fn test_temp_file_cleaned_on_success() {
        let server = MockServer::start().await;
        let body = b"temp cleanup test";

        Mock::given(method("GET"))
            .and(path("/cleanup.txt"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_bytes(body.to_vec())
                    .insert_header("Content-Length", body.len().to_string().as_str()),
            )
            .expect(1)
            .mount(&server)
            .await;

        let tmp = TempDir::new().unwrap();
        let save = tmp.path().join("cleanup.txt");

        let _result = download_file(
            &format!("{}/cleanup.txt", server.uri()),
            &save,
            &DownloadOptions::default(),
            noop_progress,
        )
        .await
        .unwrap();

        // Construct the expected temp path the same way the implementation does
        let mut temp_name = save.as_os_str().to_os_string();
        temp_name.push(".cranedownload");
        let temp_path = std::path::PathBuf::from(temp_name);

        assert!(
            !temp_path.exists(),
            "temp file {temp_path:?} should not exist after successful download"
        );
        assert!(save.exists(), "final file should exist");
    }
}
