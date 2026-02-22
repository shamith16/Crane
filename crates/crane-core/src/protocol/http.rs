use std::path::Path;
use std::sync::Arc;

use async_trait::async_trait;
use tokio_util::sync::CancellationToken;

use super::ProtocolHandler;
use crate::bandwidth::BandwidthLimiter;
use crate::types::{CraneError, DownloadOptions, DownloadProgress, DownloadResult, UrlAnalysis};

pub struct HttpHandler;

#[async_trait]
impl ProtocolHandler for HttpHandler {
    async fn analyze(&self, url: &str) -> Result<UrlAnalysis, CraneError> {
        crate::metadata::analyzer::analyze_url(url).await
    }

    async fn download(
        &self,
        _url: &str,
        _save_path: &Path,
        _options: &DownloadOptions,
        _resume_from: u64,
        _cancel_token: CancellationToken,
        _on_progress: Arc<dyn Fn(&DownloadProgress) + Send + Sync>,
        _limiter: Option<Arc<BandwidthLimiter>>,
    ) -> Result<DownloadResult, CraneError> {
        unimplemented!("HTTP downloads use the multi-connection engine directly")
    }

    fn supports_multi_connection(&self) -> bool {
        true
    }
}
