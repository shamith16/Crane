// Queue manager with concurrency control for Crane downloads.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::db::Database;
use crate::engine::multi::{start_download, DownloadHandle};
use crate::metadata::analyzer::analyze_url;
use crate::types::{
    CraneError, Download, DownloadOptions, DownloadProgress, DownloadStatus,
};

/// Manages download concurrency: starts downloads immediately when under the
/// limit, queues them otherwise, and auto-promotes queued downloads when slots
/// open up (pause/cancel).
pub struct QueueManager {
    db: Arc<Database>,
    active: tokio::sync::Mutex<HashMap<String, DownloadHandle>>,
    max_concurrent: u32,
}

impl QueueManager {
    /// Create a new queue manager backed by the given database.
    pub fn new(db: Arc<Database>, max_concurrent: u32) -> Self {
        Self {
            db,
            active: tokio::sync::Mutex::new(HashMap::new()),
            max_concurrent,
        }
    }

    /// Accessor for the underlying database.
    pub fn db(&self) -> &Database {
        &self.db
    }

    /// Add a new download. If there is capacity it starts immediately;
    /// otherwise it is queued with the next available queue position.
    pub async fn add_download(
        &self,
        url: &str,
        save_dir: &str,
        options: DownloadOptions,
    ) -> Result<String, CraneError> {
        // Analyze URL to get metadata (filename, size, mime, etc.)
        let analysis = analyze_url(url).await?;

        let id = uuid::Uuid::new_v4().to_string();
        let filename = options
            .filename
            .clone()
            .unwrap_or_else(|| analysis.filename.clone());
        let save_path = PathBuf::from(save_dir).join(&filename);
        let now = chrono::Utc::now().to_rfc3339();

        let download = Download {
            id: id.clone(),
            url: url.to_string(),
            filename,
            save_path: save_path.to_string_lossy().to_string(),
            total_size: analysis.total_size,
            downloaded_size: 0,
            status: DownloadStatus::Pending,
            error_message: None,
            error_code: None,
            mime_type: analysis.mime_type.clone(),
            category: options
                .category
                .clone()
                .unwrap_or_else(|| analysis.category.clone()),
            resumable: analysis.resumable,
            connections: options.connections.unwrap_or(8),
            speed: 0.0,
            source_domain: url::Url::parse(url)
                .ok()
                .and_then(|u| u.host_str().map(|h| h.to_string())),
            referrer: options.referrer.clone(),
            cookies: options.cookies.clone(),
            user_agent: options.user_agent.clone(),
            queue_position: None,
            retry_count: 0,
            created_at: now.clone(),
            started_at: None,
            completed_at: None,
            updated_at: now,
        };

        self.db.insert_download(&download)?;

        let mut active = self.active.lock().await;
        if (active.len() as u32) < self.max_concurrent {
            self.start_download_internal(&id, &save_path, &options, &mut active)
                .await?;
        } else {
            let max_pos = self.db.get_max_queue_position()?.unwrap_or(0);
            self.db.update_queue_position(&id, Some(max_pos + 1))?;
            self.db.update_download_status(
                &id,
                DownloadStatus::Queued,
                None,
                None,
            )?;
        }

        Ok(id)
    }

    /// Pause a currently active download. Frees the slot and auto-starts
    /// the next queued download if one exists.
    pub async fn pause(&self, id: &str) -> Result<(), CraneError> {
        let mut active = self.active.lock().await;
        let handle = active
            .remove(id)
            .ok_or_else(|| CraneError::InvalidState {
                from: "unknown".to_string(),
                to: "paused".to_string(),
            })?;

        handle.pause().await;

        self.db.update_download_status(
            id,
            DownloadStatus::Paused,
            None,
            None,
        )?;

        self.try_start_next(&mut active).await?;

        Ok(())
    }

    /// Resume a paused download. If there is capacity it starts immediately;
    /// otherwise it is re-queued.
    pub async fn resume(&self, id: &str) -> Result<(), CraneError> {
        let dl = self.db.get_download(id)?;
        if dl.status != DownloadStatus::Paused {
            return Err(CraneError::InvalidState {
                from: dl.status.as_str().to_string(),
                to: "downloading".to_string(),
            });
        }

        let mut active = self.active.lock().await;
        if (active.len() as u32) < self.max_concurrent {
            let save_path = PathBuf::from(&dl.save_path);
            let options = DownloadOptions {
                filename: Some(dl.filename.clone()),
                connections: Some(dl.connections),
                referrer: dl.referrer.clone(),
                cookies: dl.cookies.clone(),
                user_agent: dl.user_agent.clone(),
                ..Default::default()
            };
            self.start_download_internal(id, &save_path, &options, &mut active)
                .await?;
        } else {
            let max_pos = self.db.get_max_queue_position()?.unwrap_or(0);
            self.db.update_queue_position(id, Some(max_pos + 1))?;
            self.db.update_download_status(
                id,
                DownloadStatus::Queued,
                None,
                None,
            )?;
        }

        Ok(())
    }

    /// Cancel a download. If active, stops it and frees the slot.
    /// Sets status to Failed with error_message "cancelled".
    pub async fn cancel(&self, id: &str) -> Result<(), CraneError> {
        let mut active = self.active.lock().await;
        if let Some(handle) = active.remove(id) {
            handle.cancel().await;
        }

        self.db.update_download_status(
            id,
            DownloadStatus::Failed,
            Some("cancelled"),
            None,
        )?;

        self.try_start_next(&mut active).await?;

        Ok(())
    }

    /// Number of currently active (in-flight) downloads.
    pub async fn active_count(&self) -> usize {
        self.active.lock().await.len()
    }

    /// List all downloads from the database.
    pub fn list_downloads(&self) -> Result<Vec<Download>, CraneError> {
        self.db.list_downloads()
    }

    /// If there is capacity, start the next queued download.
    async fn try_start_next(
        &self,
        active: &mut HashMap<String, DownloadHandle>,
    ) -> Result<(), CraneError> {
        if (active.len() as u32) >= self.max_concurrent {
            return Ok(());
        }

        if let Some(next) = self.db.get_next_queued()? {
            self.db.update_queue_position(&next.id, None)?;
            let save_path = PathBuf::from(&next.save_path);
            let options = DownloadOptions {
                filename: Some(next.filename.clone()),
                connections: Some(next.connections),
                referrer: next.referrer.clone(),
                cookies: next.cookies.clone(),
                user_agent: next.user_agent.clone(),
                ..Default::default()
            };
            self.start_download_internal(&next.id, &save_path, &options, active)
                .await?;
        }

        Ok(())
    }

    /// Start a download, update DB status, and insert the handle into the active map.
    async fn start_download_internal(
        &self,
        id: &str,
        save_path: &Path,
        options: &DownloadOptions,
        active: &mut HashMap<String, DownloadHandle>,
    ) -> Result<(), CraneError> {
        let dl = self.db.get_download(id)?;
        let url = dl.url.clone();

        let on_progress = move |_progress: &DownloadProgress| {};

        let handle = start_download(&url, save_path, options, on_progress).await?;

        self.db.update_download_status(
            id,
            DownloadStatus::Downloading,
            None,
            None,
        )?;

        active.insert(id.to_string(), handle);

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    async fn setup_server() -> MockServer {
        let server = MockServer::start().await;
        Mock::given(method("HEAD"))
            .and(path("/file.bin"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("content-length", "1024")
                    .insert_header("accept-ranges", "bytes")
                    .insert_header("content-type", "application/octet-stream"),
            )
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/file.bin"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_bytes(vec![0xAA; 1024])
                    .insert_header("content-length", "1024")
                    .insert_header("content-type", "application/octet-stream"),
            )
            .mount(&server)
            .await;
        server
    }

    /// Setup HEAD and GET mocks for a second file path.
    async fn setup_server_file2(server: &MockServer) {
        Mock::given(method("HEAD"))
            .and(path("/file2.bin"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("content-length", "1024")
                    .insert_header("accept-ranges", "bytes")
                    .insert_header("content-type", "application/octet-stream"),
            )
            .mount(server)
            .await;
        Mock::given(method("GET"))
            .and(path("/file2.bin"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_bytes(vec![0xBB; 1024])
                    .insert_header("content-length", "1024")
                    .insert_header("content-type", "application/octet-stream"),
            )
            .mount(server)
            .await;
    }

    fn make_db() -> Arc<Database> {
        Arc::new(Database::open_in_memory().unwrap())
    }

    // ── Test 1: add_download starts immediately when under limit ──

    #[tokio::test]
    async fn test_add_download_starts_immediately_when_under_limit() {
        let server = setup_server().await;
        let db = make_db();
        let tmp = TempDir::new().unwrap();
        let qm = QueueManager::new(db.clone(), 3);

        let url = format!("{}/file.bin", server.uri());
        let id = qm
            .add_download(&url, tmp.path().to_str().unwrap(), DownloadOptions::default())
            .await
            .unwrap();

        assert_eq!(qm.active_count().await, 1);
        let dl = db.get_download(&id).unwrap();
        assert_eq!(dl.status, DownloadStatus::Downloading);
    }

    // ── Test 2: add_download queues when at capacity ──

    #[tokio::test]
    async fn test_add_download_queues_when_at_capacity() {
        let server = setup_server().await;
        setup_server_file2(&server).await;
        let db = make_db();
        let tmp = TempDir::new().unwrap();
        let qm = QueueManager::new(db.clone(), 1);

        let url1 = format!("{}/file.bin", server.uri());
        let _id1 = qm
            .add_download(&url1, tmp.path().to_str().unwrap(), DownloadOptions::default())
            .await
            .unwrap();

        let url2 = format!("{}/file2.bin", server.uri());
        let id2 = qm
            .add_download(
                &url2,
                tmp.path().to_str().unwrap(),
                DownloadOptions {
                    filename: Some("file2.bin".to_string()),
                    ..Default::default()
                },
            )
            .await
            .unwrap();

        assert_eq!(qm.active_count().await, 1);
        let dl2 = db.get_download(&id2).unwrap();
        assert_eq!(dl2.status, DownloadStatus::Queued);
        assert!(dl2.queue_position.is_some());
    }

    // ── Test 3: pause frees slot and starts next ──

    #[tokio::test]
    async fn test_pause_frees_slot_and_starts_next() {
        let server = setup_server().await;
        setup_server_file2(&server).await;
        let db = make_db();
        let tmp = TempDir::new().unwrap();
        let qm = QueueManager::new(db.clone(), 1);

        let url1 = format!("{}/file.bin", server.uri());
        let id1 = qm
            .add_download(&url1, tmp.path().to_str().unwrap(), DownloadOptions::default())
            .await
            .unwrap();

        let url2 = format!("{}/file2.bin", server.uri());
        let id2 = qm
            .add_download(
                &url2,
                tmp.path().to_str().unwrap(),
                DownloadOptions {
                    filename: Some("file2.bin".to_string()),
                    ..Default::default()
                },
            )
            .await
            .unwrap();

        // Second should be queued
        assert_eq!(db.get_download(&id2).unwrap().status, DownloadStatus::Queued);

        // Pause first => slot opens => second should auto-start
        qm.pause(&id1).await.unwrap();

        assert_eq!(db.get_download(&id1).unwrap().status, DownloadStatus::Paused);
        assert_eq!(db.get_download(&id2).unwrap().status, DownloadStatus::Downloading);
        assert_eq!(qm.active_count().await, 1);
    }

    // ── Test 4: cancel frees slot ──

    #[tokio::test]
    async fn test_cancel_frees_slot() {
        let server = setup_server().await;
        let db = make_db();
        let tmp = TempDir::new().unwrap();
        let qm = QueueManager::new(db.clone(), 3);

        let url = format!("{}/file.bin", server.uri());
        let id = qm
            .add_download(&url, tmp.path().to_str().unwrap(), DownloadOptions::default())
            .await
            .unwrap();

        assert_eq!(qm.active_count().await, 1);

        qm.cancel(&id).await.unwrap();

        assert_eq!(qm.active_count().await, 0);
        let dl = db.get_download(&id).unwrap();
        assert_eq!(dl.status, DownloadStatus::Failed);
        assert_eq!(dl.error_message.as_deref(), Some("cancelled"));
    }

    // ── Test 5: resume paused download ──

    #[tokio::test]
    async fn test_resume_paused_download() {
        let server = setup_server().await;
        let db = make_db();
        let tmp = TempDir::new().unwrap();
        let qm = QueueManager::new(db.clone(), 3);

        let url = format!("{}/file.bin", server.uri());
        let id = qm
            .add_download(&url, tmp.path().to_str().unwrap(), DownloadOptions::default())
            .await
            .unwrap();

        qm.pause(&id).await.unwrap();
        assert_eq!(qm.active_count().await, 0);
        assert_eq!(db.get_download(&id).unwrap().status, DownloadStatus::Paused);

        qm.resume(&id).await.unwrap();
        assert_eq!(qm.active_count().await, 1);
        assert_eq!(db.get_download(&id).unwrap().status, DownloadStatus::Downloading);
    }

    // ── Test 6: resume queues when at capacity ──

    #[tokio::test]
    async fn test_resume_queues_when_at_capacity() {
        let server = setup_server().await;
        setup_server_file2(&server).await;
        let db = make_db();
        let tmp = TempDir::new().unwrap();
        let qm = QueueManager::new(db.clone(), 1);

        // Add first download (takes the only slot)
        let url1 = format!("{}/file.bin", server.uri());
        let id1 = qm
            .add_download(&url1, tmp.path().to_str().unwrap(), DownloadOptions::default())
            .await
            .unwrap();

        // Pause it to free the slot
        qm.pause(&id1).await.unwrap();

        // Add second download (takes the slot)
        let url2 = format!("{}/file2.bin", server.uri());
        let _id2 = qm
            .add_download(
                &url2,
                tmp.path().to_str().unwrap(),
                DownloadOptions {
                    filename: Some("file2.bin".to_string()),
                    ..Default::default()
                },
            )
            .await
            .unwrap();

        assert_eq!(qm.active_count().await, 1);

        // Resume first => should be queued since slot is full
        qm.resume(&id1).await.unwrap();

        let dl1 = db.get_download(&id1).unwrap();
        assert_eq!(dl1.status, DownloadStatus::Queued);
        assert!(dl1.queue_position.is_some());
        assert_eq!(qm.active_count().await, 1);
    }
}
