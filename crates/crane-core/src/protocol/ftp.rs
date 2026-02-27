use std::path::Path;
use std::sync::Arc;

use async_trait::async_trait;
use tokio_util::sync::CancellationToken;

use crate::bandwidth::BandwidthLimiter;
use crate::metadata::mime::categorize_extension;
use crate::metadata::sanitize_filename;
use crate::network::is_public_host;
use crate::types::{CraneError, DownloadOptions, DownloadProgress, DownloadResult, UrlAnalysis};

use super::ProtocolHandler;

/// Parsed components of an FTP/FTPS URL.
#[derive(Clone, PartialEq, Eq)]
pub(crate) struct FtpUrlParts {
    pub host: String,
    pub port: u16,
    pub use_tls: bool,
    pub username: String,
    pub password: String,
    pub path: String,
    pub filename: String,
}

impl std::fmt::Debug for FtpUrlParts {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("FtpUrlParts")
            .field("host", &self.host)
            .field("port", &self.port)
            .field("use_tls", &self.use_tls)
            .field("username", &self.username)
            .field("password", &"[REDACTED]")
            .field("path", &self.path)
            .field("filename", &self.filename)
            .finish()
    }
}

/// Parse an FTP or FTPS URL into its components.
///
/// - Rejects non-ftp/ftps schemes.
/// - Default port is 21; `ftps://` sets `use_tls = true`.
/// - Empty username defaults to `"anonymous"`, empty password defaults to `""`.
/// - Username and password are URL-decoded.
/// - Filename is extracted from the last path segment; defaults to `"download"`.
pub(crate) fn parse_ftp_url(url: &str) -> Result<FtpUrlParts, CraneError> {
    let parsed = url::Url::parse(url)?;

    match parsed.scheme() {
        "ftp" | "ftps" => {}
        scheme => {
            return Err(CraneError::Ftp(format!(
                "unsupported scheme: {scheme}, expected ftp or ftps"
            )));
        }
    }

    let use_tls = parsed.scheme() == "ftps";
    let host = parsed
        .host_str()
        .ok_or_else(|| CraneError::Ftp("missing host in FTP URL".to_string()))?
        .to_string();
    let port = parsed.port().unwrap_or(21);

    // URL-decode username and password; default to anonymous login
    let username = if parsed.username().is_empty() {
        "anonymous".to_string()
    } else {
        urlencoding::decode(parsed.username())
            .map_err(|e| CraneError::Ftp(format!("invalid username encoding: {e}")))?
            .into_owned()
    };

    let password = match parsed.password() {
        Some(p) => urlencoding::decode(p)
            .map_err(|e| CraneError::Ftp(format!("invalid password encoding: {e}")))?
            .into_owned(),
        None => String::new(),
    };

    let path = parsed.path().to_string();

    // Extract filename from last path segment
    let filename = path
        .rsplit('/')
        .find(|seg| !seg.is_empty())
        .map(|s| {
            urlencoding::decode(s)
                .unwrap_or_else(|_| s.into())
                .into_owned()
        })
        .unwrap_or_else(|| "download".to_string());

    let filename = if filename.is_empty() {
        "download".to_string()
    } else {
        filename
    };

    Ok(FtpUrlParts {
        host,
        port,
        use_tls,
        username,
        password,
        path,
        filename,
    })
}

/// Connection timeout for FTP/FTPS connections.
const FTP_CONNECT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

/// Shared streaming download body for FTP connections.
///
/// Both `AsyncFtpStream` and `AsyncRustlsFtpStream` are type aliases for
/// `ImplAsyncFtpStream<T>` with different `T`, and the `AsyncTlsStream` trait
/// bound is not publicly exported from suppaftp. We use a macro to avoid
/// duplicating the read loop across the FTP and FTPS code paths.
/// TODO: Refactor to a generic function if suppaftp exports `AsyncTlsStream`.
///
/// This macro expects `$ftp` to already be connected, logged in, and in
/// binary mode. It handles resume, streaming, progress, finalize, and rename.
macro_rules! ftp_download_stream {
    ($ftp:ident, $parts:expr, $save_path:expr, $resume_from:expr,
     $cancel_token:expr, $on_progress:expr, $limiter:expr) => {{
        use futures_util::io::AsyncReadExt;
        use tokio::io::AsyncWriteExt;

        let start_time = std::time::Instant::now();
        let total_size = $ftp.size(&$parts.path).await.ok().map(|s| s as u64);

        // Resume from offset if requested
        let mut downloaded: u64 = $resume_from;
        if $resume_from > 0 {
            $ftp.resume_transfer($resume_from as usize)
                .await
                .map_err(|e| CraneError::Ftp(format!("REST failed: {e}")))?;
        }

        // Open temp file (.cranedownload)
        let tmp_path = $save_path.with_extension(
            $save_path
                .extension()
                .map(|e| format!("{}.cranedownload", e.to_string_lossy()))
                .unwrap_or_else(|| "cranedownload".to_string()),
        );

        if let Some(parent) = tmp_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }

        let mut file = if $resume_from > 0 {
            tokio::fs::OpenOptions::new()
                .write(true)
                .append(true)
                .open(&tmp_path)
                .await?
        } else {
            tokio::fs::File::create(&tmp_path).await?
        };

        // RETR and stream bytes
        let mut reader = $ftp
            .retr_as_stream(&$parts.path)
            .await
            .map_err(|e| CraneError::Ftp(format!("RETR failed: {e}")))?;

        let mut buf = vec![0u8; 65536]; // 64KB buffer
        loop {
            if $cancel_token.is_cancelled() {
                drop(reader);
                let _ = $ftp.quit().await;
                return Err(CraneError::Ftp("Download cancelled".to_string()));
            }

            let n = reader
                .read(&mut buf)
                .await
                .map_err(|e| CraneError::Ftp(format!("read error: {e}")))?;

            if n == 0 {
                break;
            }

            file.write_all(&buf[..n]).await?;

            // Bandwidth limiting
            if let Some(ref lim) = $limiter {
                lim.acquire(n as u64).await;
            }

            downloaded += n as u64;

            // Report progress
            let elapsed_secs = start_time.elapsed().as_secs_f64();
            let speed = if elapsed_secs > 0.0 {
                (downloaded - $resume_from) as f64 / elapsed_secs
            } else {
                0.0
            };

            let eta = if speed > 0.0 {
                total_size.map(|total| {
                    let remaining = total.saturating_sub(downloaded);
                    (remaining as f64 / speed) as u64
                })
            } else {
                None
            };

            {
                let progress = DownloadProgress {
                    download_id: String::new(), // Filled by caller
                    downloaded_size: downloaded,
                    total_size,
                    speed,
                    eta_seconds: eta,
                    connections: vec![],
                };
                $on_progress(&progress);
            }
        }

        file.flush().await?;

        // Finalize RETR: drop reader (closes data connection), then read
        // the server's transfer-complete response on the control connection.
        $ftp.finalize_retr_stream(reader)
            .await
            .map_err(|e| CraneError::Ftp(format!("finalize RETR failed: {e}")))?;

        let _ = $ftp.quit().await;

        // Rename temp file to final path
        tokio::fs::rename(&tmp_path, $save_path).await?;

        Ok(DownloadResult {
            downloaded_bytes: downloaded,
            elapsed_ms: start_time.elapsed().as_millis() as u64,
            final_path: $save_path.to_path_buf(),
            hash_verified: None,
        })
    }};
}

pub struct FtpHandler;

#[async_trait]
impl ProtocolHandler for FtpHandler {
    async fn analyze(&self, url: &str) -> Result<UrlAnalysis, CraneError> {
        let parts = parse_ftp_url(url)?;

        // SSRF protection: block private/internal network addresses
        if !is_public_host(&parts.host) {
            return Err(CraneError::PrivateNetwork(parts.host.clone()));
        }

        let addr = format!("{}:{}", parts.host, parts.port);

        // Connect and analyze based on TLS requirement
        let (total_size, resumable) = if parts.use_tls {
            analyze_ftps(&addr, &parts).await?
        } else {
            analyze_ftp(&addr, &parts).await?
        };

        let filename = sanitize_filename(&parts.filename);
        let category = categorize_extension(&filename);

        Ok(UrlAnalysis {
            url: url.to_string(),
            filename,
            total_size,
            mime_type: None,
            resumable,
            category,
            server: None,
        })
    }

    async fn download(
        &self,
        url: &str,
        save_path: &Path,
        _options: &DownloadOptions,
        resume_from: u64,
        cancel_token: CancellationToken,
        on_progress: Arc<dyn Fn(&DownloadProgress) + Send + Sync>,
        limiter: Option<Arc<BandwidthLimiter>>,
    ) -> Result<DownloadResult, CraneError> {
        use suppaftp::types::FileType;

        // SAFETY: async_trait desugars `Arc<dyn Fn(&DownloadProgress)>` losing the
        // higher-ranked `for<'a>` bound, making it impossible to call with local refs.
        // The Arc is 'static and the original closure had `for<'a>` — restoring it is sound.
        let on_progress: Arc<dyn Fn(&DownloadProgress) + Send + Sync> =
            unsafe { std::mem::transmute(on_progress) };

        let parts = parse_ftp_url(url)?;

        if !is_public_host(&parts.host) {
            return Err(CraneError::PrivateNetwork(parts.host.clone()));
        }

        let addr = format!("{}:{}", parts.host, parts.port);
        let backoff_delays = [1u64, 2, 4]; // seconds
        let max_attempts = backoff_delays.len() + 1; // 4 total: 1 initial + 3 retries

        let mut last_error = None;
        for attempt in 0..max_attempts {
            if cancel_token.is_cancelled() {
                return Err(CraneError::Ftp("Download cancelled".to_string()));
            }

            // Exponential backoff before retries (not before first attempt)
            if attempt > 0 {
                let delay = backoff_delays[attempt - 1];
                tokio::time::sleep(std::time::Duration::from_secs(delay)).await;
            }

            // Inline the download attempt. We use the ftp_download_stream!
            // macro for the shared read loop, but connect+login differs per
            // protocol and must be inlined here (not in a helper fn) because
            // async_trait loses the higher-ranked lifetime on `on_progress`.
            let result: Result<DownloadResult, CraneError> = if parts.use_tls {
                use suppaftp::{AsyncRustlsConnector, AsyncRustlsFtpStream};

                let connect_result = async {
                    let ftp_stream = tokio::time::timeout(
                        FTP_CONNECT_TIMEOUT,
                        AsyncRustlsFtpStream::connect(&addr),
                    )
                    .await
                    .map_err(|_| CraneError::Ftp("connection timed out".to_string()))?
                    .map_err(|e| CraneError::Ftp(format!("connection failed: {e}")))?;
                    let connector = build_rustls_connector()
                        .map_err(|e| CraneError::Ftp(format!("TLS setup failed: {e}")))?;
                    let mut ftp = ftp_stream
                        .into_secure(AsyncRustlsConnector::from(connector), &parts.host)
                        .await
                        .map_err(|e| CraneError::Ftp(format!("TLS upgrade failed: {e}")))?;
                    ftp.login(&parts.username, &parts.password)
                        .await
                        .map_err(|e| CraneError::Ftp(format!("login failed: {e}")))?;
                    ftp.transfer_type(FileType::Binary)
                        .await
                        .map_err(|e| CraneError::Ftp(format!("failed to set binary mode: {e}")))?;
                    Ok::<_, CraneError>(ftp)
                }
                .await;

                match connect_result {
                    Ok(mut ftp) => {
                        ftp_download_stream!(
                            ftp,
                            parts,
                            save_path,
                            resume_from,
                            cancel_token,
                            on_progress,
                            limiter
                        )
                    }
                    Err(e) => Err(e),
                }
            } else {
                use suppaftp::AsyncFtpStream;

                let connect_result = async {
                    let mut ftp =
                        tokio::time::timeout(FTP_CONNECT_TIMEOUT, AsyncFtpStream::connect(&addr))
                            .await
                            .map_err(|_| CraneError::Ftp("connection timed out".to_string()))?
                            .map_err(|e| CraneError::Ftp(format!("connection failed: {e}")))?;
                    ftp.login(&parts.username, &parts.password)
                        .await
                        .map_err(|e| CraneError::Ftp(format!("login failed: {e}")))?;
                    ftp.transfer_type(FileType::Binary)
                        .await
                        .map_err(|e| CraneError::Ftp(format!("failed to set binary mode: {e}")))?;
                    Ok::<_, CraneError>(ftp)
                }
                .await;

                match connect_result {
                    Ok(mut ftp) => {
                        ftp_download_stream!(
                            ftp,
                            parts,
                            save_path,
                            resume_from,
                            cancel_token,
                            on_progress,
                            limiter
                        )
                    }
                    Err(e) => Err(e),
                }
            };

            match result {
                Ok(r) => return Ok(r),
                Err(e) => {
                    eprintln!(
                        "FTP download attempt {}/{} failed: {e}",
                        attempt + 1,
                        max_attempts
                    );
                    last_error = Some(e);
                }
            }
        }

        // Clean up temp file on permanent failure
        let tmp_path = save_path.with_extension(
            save_path
                .extension()
                .map(|e| format!("{}.cranedownload", e.to_string_lossy()))
                .unwrap_or_else(|| "cranedownload".to_string()),
        );
        let _ = tokio::fs::remove_file(&tmp_path).await;

        Err(last_error.unwrap_or_else(|| CraneError::Ftp("Download failed".to_string())))
    }

    fn supports_multi_connection(&self) -> bool {
        false
    }
}

/// Analyze an FTP (non-TLS) connection: get file size and check resumability.
async fn analyze_ftp(addr: &str, parts: &FtpUrlParts) -> Result<(Option<u64>, bool), CraneError> {
    use suppaftp::types::FileType;
    use suppaftp::AsyncFtpStream;

    let mut ftp = tokio::time::timeout(FTP_CONNECT_TIMEOUT, AsyncFtpStream::connect(addr))
        .await
        .map_err(|_| CraneError::Ftp("connection timed out".to_string()))?
        .map_err(|e| CraneError::Ftp(format!("connection failed: {e}")))?;

    ftp.login(&parts.username, &parts.password)
        .await
        .map_err(|e| CraneError::Ftp(format!("login failed: {e}")))?;

    ftp.transfer_type(FileType::Binary)
        .await
        .map_err(|e| CraneError::Ftp(format!("failed to set binary mode: {e}")))?;

    // Try to get file size (SIZE command)
    let total_size = match ftp.size(&parts.path).await {
        Ok(size) => Some(size as u64),
        Err(_) => None,
    };

    // Check resumability via REST 0
    let resumable = ftp.resume_transfer(0).await.is_ok();

    let _ = ftp.quit().await;

    Ok((total_size, resumable))
}

/// Analyze an FTPS (TLS) connection: get file size and check resumability.
async fn analyze_ftps(addr: &str, parts: &FtpUrlParts) -> Result<(Option<u64>, bool), CraneError> {
    use suppaftp::types::FileType;
    use suppaftp::{AsyncRustlsConnector, AsyncRustlsFtpStream};

    let ftp = tokio::time::timeout(FTP_CONNECT_TIMEOUT, AsyncRustlsFtpStream::connect(addr))
        .await
        .map_err(|_| CraneError::Ftp("connection timed out".to_string()))?
        .map_err(|e| CraneError::Ftp(format!("connection failed: {e}")))?;

    let connector =
        build_rustls_connector().map_err(|e| CraneError::Ftp(format!("TLS setup failed: {e}")))?;

    let mut ftp = ftp
        .into_secure(AsyncRustlsConnector::from(connector), &parts.host)
        .await
        .map_err(|e| CraneError::Ftp(format!("TLS upgrade failed: {e}")))?;

    ftp.login(&parts.username, &parts.password)
        .await
        .map_err(|e| CraneError::Ftp(format!("login failed: {e}")))?;

    ftp.transfer_type(FileType::Binary)
        .await
        .map_err(|e| CraneError::Ftp(format!("failed to set binary mode: {e}")))?;

    // Try to get file size (SIZE command)
    let total_size = match ftp.size(&parts.path).await {
        Ok(size) => Some(size as u64),
        Err(_) => None,
    };

    // Check resumability via REST 0
    let resumable = ftp.resume_transfer(0).await.is_ok();

    let _ = ftp.quit().await;

    Ok((total_size, resumable))
}

/// Build a `futures_rustls::TlsConnector` with default webpki root certificates.
fn build_rustls_connector() -> Result<futures_rustls::TlsConnector, rustls::Error> {
    let mut root_store = rustls::RootCertStore::empty();
    root_store.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());

    let config = rustls::ClientConfig::builder()
        .with_root_certificates(root_store)
        .with_no_client_auth();

    Ok(futures_rustls::TlsConnector::from(std::sync::Arc::new(
        config,
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_ftp_url_basic() {
        let parts = parse_ftp_url("ftp://example.com/pub/file.zip").unwrap();
        assert_eq!(parts.host, "example.com");
        assert_eq!(parts.port, 21);
        assert!(!parts.use_tls);
        assert_eq!(parts.username, "anonymous");
        assert_eq!(parts.password, "");
        assert_eq!(parts.path, "/pub/file.zip");
        assert_eq!(parts.filename, "file.zip");
    }

    #[test]
    fn test_parse_ftp_url_with_auth() {
        let parts =
            parse_ftp_url("ftp://user:pass123@ftp.example.com:2121/data/report.csv").unwrap();
        assert_eq!(parts.host, "ftp.example.com");
        assert_eq!(parts.port, 2121);
        assert!(!parts.use_tls);
        assert_eq!(parts.username, "user");
        assert_eq!(parts.password, "pass123");
        assert_eq!(parts.path, "/data/report.csv");
        assert_eq!(parts.filename, "report.csv");
    }

    #[test]
    fn test_parse_ftps_url() {
        let parts = parse_ftp_url("ftps://secure.example.com/file.bin").unwrap();
        assert_eq!(parts.host, "secure.example.com");
        assert_eq!(parts.port, 21);
        assert!(parts.use_tls);
        assert_eq!(parts.username, "anonymous");
        assert_eq!(parts.filename, "file.bin");
    }

    #[test]
    fn test_parse_ftp_url_encoded_credentials() {
        let parts = parse_ftp_url("ftp://user%40domain:p%40ss@ftp.example.com/file.txt").unwrap();
        assert_eq!(parts.username, "user@domain");
        assert_eq!(parts.password, "p@ss");
        assert_eq!(parts.filename, "file.txt");
    }

    #[test]
    fn test_parse_ftp_url_no_filename() {
        let parts = parse_ftp_url("ftp://example.com/").unwrap();
        assert_eq!(parts.filename, "download");
    }

    #[test]
    fn test_parse_ftp_url_rejects_http() {
        let result = parse_ftp_url("http://example.com/file.txt");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("unsupported scheme"));
    }

    #[tokio::test]
    async fn test_analyze_connection_refused() {
        let handler = FtpHandler;
        // Port 19999 is unlikely to have an FTP server running
        let result = handler.analyze("ftp://127.0.0.1:19999/file.txt").await;
        assert!(result.is_err());
        match result.unwrap_err() {
            CraneError::PrivateNetwork(_) | CraneError::Ftp(_) => {}
            other => panic!("Expected Ftp or PrivateNetwork error, got: {other:?}"),
        }
    }

    #[tokio::test]
    async fn test_analyze_rejects_private_host() {
        let handler = FtpHandler;
        let result = handler.analyze("ftp://192.168.1.1/file.txt").await;
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), CraneError::PrivateNetwork(_)));
    }

    #[tokio::test]
    async fn test_download_rejects_private_host() {
        let handler = FtpHandler;
        let result = handler
            .download(
                "ftp://10.0.0.1/file.txt",
                Path::new("/tmp/test.txt"),
                &DownloadOptions::default(),
                0,
                CancellationToken::new(),
                Arc::new(|_| {}),
                None,
            )
            .await;
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), CraneError::PrivateNetwork(_)));
    }

    #[test]
    fn test_handler_for_url_ftp() {
        let handler = crate::protocol::handler_for_url("ftp://example.com/file.txt");
        assert!(handler.is_ok());
        assert!(!handler.unwrap().supports_multi_connection());
    }

    #[test]
    fn test_handler_for_url_ftps() {
        let handler = crate::protocol::handler_for_url("ftps://example.com/file.txt");
        assert!(handler.is_ok());
    }

    #[test]
    fn test_handler_for_url_http() {
        let handler = crate::protocol::handler_for_url("http://example.com/file.txt");
        assert!(handler.is_ok());
        assert!(handler.unwrap().supports_multi_connection());
    }

    #[test]
    fn test_handler_for_url_unsupported() {
        let handler = crate::protocol::handler_for_url("gopher://example.com/file.txt");
        assert!(handler.is_err());
    }
}
