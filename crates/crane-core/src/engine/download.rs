// Single-connection HTTP/HTTPS downloader

use std::path::Path;

use crate::types::{CraneError, DownloadOptions, DownloadProgress, DownloadResult};

const CHUNK_SIZE: usize = 65_536; // 64KB
const PROGRESS_INTERVAL_MS: u64 = 250;
const MAX_RETRIES: u32 = 3;
const RETRY_BACKOFF_MS: [u64; 3] = [1000, 2000, 4000];
const USER_AGENT: &str = "Crane/0.1.0";

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
    todo!()
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
