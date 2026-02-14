use std::path::Path;
use std::sync::Arc;

use async_trait::async_trait;
use tokio_util::sync::CancellationToken;

use crate::types::{CraneError, DownloadOptions, DownloadProgress, DownloadResult, UrlAnalysis};
use super::ProtocolHandler;

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
    ) -> Result<DownloadResult, CraneError> {
        unimplemented!("HTTP downloads use the multi-connection engine directly")
    }

    fn supports_multi_connection(&self) -> bool {
        true
    }
}
