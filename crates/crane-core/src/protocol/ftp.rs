use std::path::Path;
use std::sync::Arc;

use async_trait::async_trait;
use tokio_util::sync::CancellationToken;

use crate::types::{CraneError, DownloadOptions, DownloadProgress, DownloadResult, UrlAnalysis};
use super::ProtocolHandler;

pub struct FtpHandler;

#[async_trait]
impl ProtocolHandler for FtpHandler {
    async fn analyze(&self, _url: &str) -> Result<UrlAnalysis, CraneError> {
        todo!("FTP analysis not yet implemented")
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
