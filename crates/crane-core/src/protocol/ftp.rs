use std::path::Path;
use std::sync::Arc;

use async_trait::async_trait;
use tokio_util::sync::CancellationToken;

use crate::metadata::mime::categorize_extension;
use crate::metadata::sanitize_filename;
use crate::network::is_public_host;
use crate::types::{CraneError, DownloadOptions, DownloadProgress, DownloadResult, UrlAnalysis};

use super::ProtocolHandler;

/// Parsed components of an FTP/FTPS URL.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FtpUrlParts {
    pub host: String,
    pub port: u16,
    pub use_tls: bool,
    pub username: String,
    pub password: String,
    pub path: String,
    pub filename: String,
}

/// Parse an FTP or FTPS URL into its components.
///
/// - Rejects non-ftp/ftps schemes.
/// - Default port is 21; `ftps://` sets `use_tls = true`.
/// - Empty username defaults to `"anonymous"`, empty password defaults to `""`.
/// - Username and password are URL-decoded.
/// - Filename is extracted from the last path segment; defaults to `"download"`.
pub fn parse_ftp_url(url: &str) -> Result<FtpUrlParts, CraneError> {
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
        .map(|s| urlencoding::decode(s).unwrap_or_else(|_| s.into()).into_owned())
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
        _url: &str,
        _save_path: &Path,
        _options: &DownloadOptions,
        _resume_from: u64,
        _cancel_token: CancellationToken,
        _on_progress: Arc<dyn Fn(&DownloadProgress) + Send + Sync>,
    ) -> Result<DownloadResult, CraneError> {
        todo!("FTP download not yet implemented")
    }

    fn supports_multi_connection(&self) -> bool {
        false
    }
}

/// Analyze an FTP (non-TLS) connection: get file size and check resumability.
async fn analyze_ftp(
    addr: &str,
    parts: &FtpUrlParts,
) -> Result<(Option<u64>, bool), CraneError> {
    use suppaftp::types::FileType;
    use suppaftp::AsyncFtpStream;

    let mut ftp = AsyncFtpStream::connect(addr)
        .await
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
async fn analyze_ftps(
    addr: &str,
    parts: &FtpUrlParts,
) -> Result<(Option<u64>, bool), CraneError> {
    use suppaftp::types::FileType;
    use suppaftp::{AsyncRustlsConnector, AsyncRustlsFtpStream};

    let ftp = AsyncRustlsFtpStream::connect(addr)
        .await
        .map_err(|e| CraneError::Ftp(format!("connection failed: {e}")))?;

    let connector = build_rustls_connector()
        .map_err(|e| CraneError::Ftp(format!("TLS setup failed: {e}")))?;

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

    Ok(futures_rustls::TlsConnector::from(std::sync::Arc::new(config)))
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
        let parts =
            parse_ftp_url("ftp://user%40domain:p%40ss@ftp.example.com/file.txt").unwrap();
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
}
