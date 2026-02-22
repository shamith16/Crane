pub mod ftp;
pub mod http;

use std::path::Path;
use std::sync::Arc;

use async_trait::async_trait;
use tokio_util::sync::CancellationToken;

use crate::bandwidth::BandwidthLimiter;
use crate::types::{CraneError, DownloadOptions, DownloadProgress, DownloadResult, UrlAnalysis};

#[async_trait]
pub trait ProtocolHandler: Send + Sync {
    async fn analyze(&self, url: &str) -> Result<UrlAnalysis, CraneError>;

    async fn download(
        &self,
        url: &str,
        save_path: &Path,
        options: &DownloadOptions,
        resume_from: u64,
        cancel_token: CancellationToken,
        on_progress: Arc<dyn Fn(&DownloadProgress) + Send + Sync>,
        limiter: Option<Arc<BandwidthLimiter>>,
    ) -> Result<DownloadResult, CraneError>;

    fn supports_multi_connection(&self) -> bool;
}

pub fn handler_for_url(url: &str) -> Result<Box<dyn ProtocolHandler>, CraneError> {
    let parsed = url::Url::parse(url)?;
    match parsed.scheme() {
        "http" | "https" => Ok(Box::new(http::HttpHandler)),
        "ftp" | "ftps" => Ok(Box::new(ftp::FtpHandler)),
        scheme => Err(CraneError::UnsupportedScheme(scheme.to_string())),
    }
}
