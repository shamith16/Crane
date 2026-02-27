use crate::db::Database;
use crate::types::{CraneError, Download, DownloadStatus, FileCategory};
use rusqlite::params;

/// Map a SQLite row to a Download struct.
fn row_to_download(row: &rusqlite::Row) -> Result<Download, CraneError> {
    let status_str: String = row
        .get::<_, String>(6)
        .map_err(|e| CraneError::Database(e.to_string()))?;
    let category_str: String = row
        .get::<_, String>(10)
        .map_err(|e| CraneError::Database(e.to_string()))?;
    let resumable_int: i64 = row
        .get(11)
        .map_err(|e| CraneError::Database(e.to_string()))?;

    Ok(Download {
        id: row
            .get(0)
            .map_err(|e| CraneError::Database(e.to_string()))?,
        url: row
            .get(1)
            .map_err(|e| CraneError::Database(e.to_string()))?,
        filename: row
            .get(2)
            .map_err(|e| CraneError::Database(e.to_string()))?,
        save_path: row
            .get(3)
            .map_err(|e| CraneError::Database(e.to_string()))?,
        total_size: row
            .get::<_, Option<i64>>(4)
            .map_err(|e| CraneError::Database(e.to_string()))?
            .map(|v| v as u64),
        downloaded_size: row
            .get::<_, i64>(5)
            .map_err(|e| CraneError::Database(e.to_string()))? as u64,
        status: DownloadStatus::from_db_str(&status_str)?,
        error_message: row
            .get(7)
            .map_err(|e| CraneError::Database(e.to_string()))?,
        error_code: row
            .get(8)
            .map_err(|e| CraneError::Database(e.to_string()))?,
        mime_type: row
            .get(9)
            .map_err(|e| CraneError::Database(e.to_string()))?,
        category: FileCategory::from_db_str(&category_str)?,
        resumable: resumable_int != 0,
        connections: row
            .get::<_, i64>(12)
            .map_err(|e| CraneError::Database(e.to_string()))? as u32,
        speed: row
            .get(13)
            .map_err(|e| CraneError::Database(e.to_string()))?,
        source_domain: row
            .get(14)
            .map_err(|e| CraneError::Database(e.to_string()))?,
        referrer: row
            .get(15)
            .map_err(|e| CraneError::Database(e.to_string()))?,
        cookies: row
            .get(16)
            .map_err(|e| CraneError::Database(e.to_string()))?,
        user_agent: row
            .get(17)
            .map_err(|e| CraneError::Database(e.to_string()))?,
        queue_position: row
            .get::<_, Option<i64>>(18)
            .map_err(|e| CraneError::Database(e.to_string()))?
            .map(|v| v as u32),
        retry_count: row
            .get::<_, i64>(19)
            .map_err(|e| CraneError::Database(e.to_string()))? as u32,
        created_at: row
            .get(20)
            .map_err(|e| CraneError::Database(e.to_string()))?,
        started_at: row
            .get(21)
            .map_err(|e| CraneError::Database(e.to_string()))?,
        completed_at: row
            .get(22)
            .map_err(|e| CraneError::Database(e.to_string()))?,
        updated_at: row
            .get(23)
            .map_err(|e| CraneError::Database(e.to_string()))?,
        headers: row
            .get(24)
            .map_err(|e| CraneError::Database(e.to_string()))?,
    })
}

const SELECT_ALL_COLUMNS: &str =
    "SELECT id, url, filename, save_path, total_size, downloaded_size, \
     status, error_message, error_code, mime_type, category, resumable, \
     connections, speed, source_domain, referrer, cookies, user_agent, \
     queue_position, retry_count, created_at, started_at, completed_at, \
     updated_at, headers FROM downloads";

impl Database {
    /// Insert a new download record.
    pub fn insert_download(&self, dl: &Download) -> Result<(), CraneError> {
        self.conn()
            .execute(
                "INSERT INTO downloads (
                    id, url, filename, save_path, total_size, downloaded_size,
                    status, error_message, error_code, mime_type, category,
                    resumable, connections, speed, source_domain, referrer,
                    cookies, user_agent, queue_position, retry_count,
                    created_at, started_at, completed_at, updated_at, headers
                ) VALUES (
                    ?1, ?2, ?3, ?4, ?5, ?6,
                    ?7, ?8, ?9, ?10, ?11,
                    ?12, ?13, ?14, ?15, ?16,
                    ?17, ?18, ?19, ?20,
                    ?21, ?22, ?23, ?24, ?25
                )",
                params![
                    dl.id,
                    dl.url,
                    dl.filename,
                    dl.save_path,
                    dl.total_size.map(|v| v as i64),
                    dl.downloaded_size as i64,
                    dl.status.as_str(),
                    dl.error_message,
                    dl.error_code,
                    dl.mime_type,
                    dl.category.as_str(),
                    dl.resumable as i64,
                    dl.connections as i64,
                    dl.speed,
                    dl.source_domain,
                    dl.referrer,
                    dl.cookies,
                    dl.user_agent,
                    dl.queue_position.map(|v| v as i64),
                    dl.retry_count as i64,
                    dl.created_at,
                    dl.started_at,
                    dl.completed_at,
                    dl.created_at, // updated_at = created_at initially
                    dl.headers,
                ],
            )
            .map_err(|e| CraneError::Database(e.to_string()))?;

        Ok(())
    }

    /// Get a single download by id.
    pub fn get_download(&self, id: &str) -> Result<Download, CraneError> {
        let sql = format!("{SELECT_ALL_COLUMNS} WHERE id = ?1");
        self.conn()
            .query_row(&sql, params![id], |row| {
                row_to_download(row).map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(
                        0,
                        rusqlite::types::Type::Text,
                        Box::new(e),
                    )
                })
            })
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => CraneError::NotFound(id.to_string()),
                _ => CraneError::Database(e.to_string()),
            })
    }

    /// List all downloads ordered by created_at descending.
    pub fn list_downloads(&self) -> Result<Vec<Download>, CraneError> {
        let sql = format!("{SELECT_ALL_COLUMNS} ORDER BY created_at DESC");
        let conn = self.conn();
        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| CraneError::Database(e.to_string()))?;

        let rows = stmt
            .query_map([], |row| {
                row_to_download(row).map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(
                        0,
                        rusqlite::types::Type::Text,
                        Box::new(e),
                    )
                })
            })
            .map_err(|e| CraneError::Database(e.to_string()))?;

        let mut downloads = Vec::new();
        for row in rows {
            downloads.push(row.map_err(|e| CraneError::Database(e.to_string()))?);
        }
        Ok(downloads)
    }

    /// Get downloads filtered by status, ordered by queue_position then created_at.
    pub fn get_downloads_by_status(
        &self,
        status: DownloadStatus,
    ) -> Result<Vec<Download>, CraneError> {
        let sql = format!(
            "{SELECT_ALL_COLUMNS} WHERE status = ?1 ORDER BY queue_position ASC, created_at ASC"
        );
        let conn = self.conn();
        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| CraneError::Database(e.to_string()))?;

        let rows = stmt
            .query_map(params![status.as_str()], |row| {
                row_to_download(row).map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(
                        0,
                        rusqlite::types::Type::Text,
                        Box::new(e),
                    )
                })
            })
            .map_err(|e| CraneError::Database(e.to_string()))?;

        let mut downloads = Vec::new();
        for row in rows {
            downloads.push(row.map_err(|e| CraneError::Database(e.to_string()))?);
        }
        Ok(downloads)
    }

    /// Check whether a download with the given URL already exists in an active
    /// state (pending, analyzing, downloading, queued, or paused).
    pub fn has_active_url(&self, url: &str) -> Result<bool, CraneError> {
        let conn = self.conn();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM downloads WHERE url = ?1 AND status IN ('pending', 'analyzing', 'downloading', 'queued', 'paused')",
                params![url],
                |row| row.get(0),
            )
            .map_err(|e| CraneError::Database(e.to_string()))?;
        Ok(count > 0)
    }

    /// Find the ID of an active download with the given URL, if one exists.
    pub fn find_active_download_id(&self, url: &str) -> Result<Option<String>, CraneError> {
        let conn = self.conn();
        let id: Option<String> = conn
            .query_row(
                "SELECT id FROM downloads WHERE url = ?1 AND status IN ('pending', 'analyzing', 'downloading', 'queued', 'paused') LIMIT 1",
                params![url],
                |row| row.get(0),
            )
            .ok();
        Ok(id)
    }

    /// Update the status of a download. Also sets:
    /// - `updated_at` to now
    /// - `completed_at` when status is Completed
    /// - `started_at` when status is Downloading
    pub fn update_download_status(
        &self,
        id: &str,
        status: DownloadStatus,
        error_message: Option<&str>,
        error_code: Option<&str>,
    ) -> Result<(), CraneError> {
        let now = chrono::Utc::now().to_rfc3339();

        let completed_at = if status == DownloadStatus::Completed {
            Some(now.clone())
        } else {
            None
        };
        let started_at = if status == DownloadStatus::Downloading {
            Some(now.clone())
        } else {
            None
        };

        // Build update dynamically to handle optional started_at / completed_at
        let rows = self
            .conn()
            .execute(
                "UPDATE downloads SET
                    status = ?1,
                    error_message = ?2,
                    error_code = ?3,
                    updated_at = ?4,
                    started_at = COALESCE(?5, started_at),
                    completed_at = COALESCE(?6, completed_at)
                WHERE id = ?7",
                params![
                    status.as_str(),
                    error_message,
                    error_code,
                    now,
                    started_at,
                    completed_at,
                    id,
                ],
            )
            .map_err(|e| CraneError::Database(e.to_string()))?;

        if rows == 0 {
            return Err(CraneError::NotFound(id.to_string()));
        }
        Ok(())
    }

    /// Update download progress (downloaded_size, speed, updated_at).
    pub fn update_download_progress(
        &self,
        id: &str,
        downloaded_size: u64,
        speed: f64,
    ) -> Result<(), CraneError> {
        let now = chrono::Utc::now().to_rfc3339();
        let rows = self
            .conn()
            .execute(
                "UPDATE downloads SET downloaded_size = ?1, speed = ?2, updated_at = ?3 WHERE id = ?4",
                params![downloaded_size as i64, speed, now, id],
            )
            .map_err(|e| CraneError::Database(e.to_string()))?;

        if rows == 0 {
            return Err(CraneError::NotFound(id.to_string()));
        }
        Ok(())
    }

    /// Delete a download by id.
    pub fn delete_download(&self, id: &str) -> Result<(), CraneError> {
        let rows = self
            .conn()
            .execute("DELETE FROM downloads WHERE id = ?1", params![id])
            .map_err(|e| CraneError::Database(e.to_string()))?;

        if rows == 0 {
            return Err(CraneError::NotFound(id.to_string()));
        }
        Ok(())
    }

    /// Update the queue position of a download.
    pub fn update_queue_position(&self, id: &str, position: Option<u32>) -> Result<(), CraneError> {
        let rows = self
            .conn()
            .execute(
                "UPDATE downloads SET queue_position = ?1, updated_at = ?2 WHERE id = ?3",
                params![
                    position.map(|v| v as i64),
                    chrono::Utc::now().to_rfc3339(),
                    id
                ],
            )
            .map_err(|e| CraneError::Database(e.to_string()))?;

        if rows == 0 {
            return Err(CraneError::NotFound(id.to_string()));
        }
        Ok(())
    }

    /// Get the next queued download (lowest queue_position).
    pub fn get_next_queued(&self) -> Result<Option<Download>, CraneError> {
        let sql = format!(
            "{SELECT_ALL_COLUMNS} WHERE status = 'queued' ORDER BY queue_position ASC LIMIT 1"
        );
        let conn = self.conn();
        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| CraneError::Database(e.to_string()))?;

        let mut rows = stmt
            .query_map([], |row| {
                row_to_download(row).map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(
                        0,
                        rusqlite::types::Type::Text,
                        Box::new(e),
                    )
                })
            })
            .map_err(|e| CraneError::Database(e.to_string()))?;

        match rows.next() {
            Some(result) => Ok(Some(
                result.map_err(|e| CraneError::Database(e.to_string()))?,
            )),
            None => Ok(None),
        }
    }

    /// Count active downloads (downloading or analyzing).
    pub fn count_active_downloads(&self) -> Result<u32, CraneError> {
        let count: i64 = self
            .conn()
            .query_row(
                "SELECT COUNT(*) FROM downloads WHERE status IN ('downloading', 'analyzing')",
                [],
                |row| row.get(0),
            )
            .map_err(|e| CraneError::Database(e.to_string()))?;

        Ok(count as u32)
    }

    /// Count downloads that are NOT in a terminal state (completed or failed).
    /// This includes: pending, analyzing, downloading, paused, queued.
    pub fn count_non_terminal_downloads(&self) -> Result<u32, CraneError> {
        let count: i64 = self
            .conn()
            .query_row(
                "SELECT COUNT(*) FROM downloads WHERE status NOT IN ('completed', 'failed')",
                [],
                |row| row.get(0),
            )
            .map_err(|e| CraneError::Database(e.to_string()))?;
        Ok(count as u32)
    }

    /// Delete all completed downloads. Returns number of deleted rows.
    pub fn delete_completed_downloads(&self) -> Result<u64, CraneError> {
        let count = self
            .conn()
            .execute("DELETE FROM downloads WHERE status = 'completed'", [])
            .map_err(|e| CraneError::Database(e.to_string()))?;
        Ok(count as u64)
    }

    /// Find the most recent failed download for a given URL.
    /// Returns `None` if no failed download exists for this URL.
    pub fn find_failed_download(&self, url: &str) -> Result<Option<Download>, CraneError> {
        let sql = format!(
            "{SELECT_ALL_COLUMNS} WHERE url = ?1 AND status = 'failed' \
             ORDER BY created_at DESC LIMIT 1"
        );
        let conn = self.conn();
        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| CraneError::Database(e.to_string()))?;

        let mut rows = stmt
            .query_map(params![url], |row| {
                row_to_download(row).map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(
                        0,
                        rusqlite::types::Type::Text,
                        Box::new(e),
                    )
                })
            })
            .map_err(|e| CraneError::Database(e.to_string()))?;

        match rows.next() {
            Some(result) => Ok(Some(
                result.map_err(|e| CraneError::Database(e.to_string()))?,
            )),
            None => Ok(None),
        }
    }

    /// Update a failed download's metadata for smart retry.
    /// Resets progress and error state, updates options from fresh analysis.
    pub fn update_download_for_retry(
        &self,
        id: &str,
        filename: &str,
        save_path: &str,
        total_size: Option<u64>,
        mime_type: Option<&str>,
        category: &str,
        resumable: bool,
        connections: u32,
    ) -> Result<(), CraneError> {
        let now = chrono::Utc::now().to_rfc3339();
        let rows = self
            .conn()
            .execute(
                "UPDATE downloads SET
                    filename = ?1,
                    save_path = ?2,
                    total_size = ?3,
                    mime_type = ?4,
                    category = ?5,
                    resumable = ?6,
                    connections = ?7,
                    downloaded_size = 0,
                    error_message = NULL,
                    error_code = NULL,
                    retry_count = 0,
                    speed = 0.0,
                    updated_at = ?8
                WHERE id = ?9",
                params![
                    filename,
                    save_path,
                    total_size.map(|v| v as i64),
                    mime_type,
                    category,
                    resumable as i64,
                    connections as i64,
                    now,
                    id,
                ],
            )
            .map_err(|e| CraneError::Database(e.to_string()))?;

        if rows == 0 {
            return Err(CraneError::NotFound(id.to_string()));
        }
        Ok(())
    }

    /// Get the maximum queue position among queued downloads.
    pub fn get_max_queue_position(&self) -> Result<Option<u32>, CraneError> {
        let result: Option<i64> = self
            .conn()
            .query_row(
                "SELECT MAX(queue_position) FROM downloads WHERE status = 'queued'",
                [],
                |row| row.get(0),
            )
            .map_err(|e| CraneError::Database(e.to_string()))?;

        Ok(result.map(|v| v as u32))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::FileCategory;

    fn make_test_download(id: &str, status: DownloadStatus) -> Download {
        Download {
            id: id.to_string(),
            url: format!("https://example.com/{id}.bin"),
            filename: format!("{id}.bin"),
            save_path: format!("/tmp/{id}.bin"),
            total_size: Some(1024),
            downloaded_size: 0,
            status,
            error_message: None,
            error_code: None,
            mime_type: Some("application/octet-stream".to_string()),
            category: FileCategory::Other,
            resumable: true,
            connections: 4,
            speed: 0.0,
            source_domain: Some("example.com".to_string()),
            referrer: None,
            cookies: None,
            user_agent: None,
            headers: None,
            queue_position: None,
            retry_count: 0,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            started_at: None,
            completed_at: None,
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn test_insert_and_get_download() {
        let db = Database::open_in_memory().unwrap();
        let dl = make_test_download("dl-1", DownloadStatus::Pending);

        db.insert_download(&dl).unwrap();
        let fetched = db.get_download("dl-1").unwrap();

        assert_eq!(fetched.id, "dl-1");
        assert_eq!(fetched.url, dl.url);
        assert_eq!(fetched.filename, dl.filename);
        assert_eq!(fetched.total_size, Some(1024));
        assert_eq!(fetched.status, DownloadStatus::Pending);
        assert!(fetched.resumable);
        assert_eq!(fetched.connections, 4);
    }

    #[test]
    fn test_get_missing_download_returns_not_found() {
        let db = Database::open_in_memory().unwrap();
        let result = db.get_download("nonexistent");

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            matches!(err, CraneError::NotFound(ref id) if id == "nonexistent"),
            "Expected NotFound, got: {err:?}"
        );
    }

    #[test]
    fn test_list_downloads_ordered_by_created_at() {
        let db = Database::open_in_memory().unwrap();

        let mut dl1 = make_test_download("dl-1", DownloadStatus::Pending);
        dl1.created_at = "2026-01-01T00:00:00Z".to_string();

        let mut dl2 = make_test_download("dl-2", DownloadStatus::Downloading);
        dl2.created_at = "2026-01-02T00:00:00Z".to_string();

        let mut dl3 = make_test_download("dl-3", DownloadStatus::Completed);
        dl3.created_at = "2026-01-03T00:00:00Z".to_string();

        db.insert_download(&dl1).unwrap();
        db.insert_download(&dl2).unwrap();
        db.insert_download(&dl3).unwrap();

        let list = db.list_downloads().unwrap();
        assert_eq!(list.len(), 3);
        // Descending order
        assert_eq!(list[0].id, "dl-3");
        assert_eq!(list[1].id, "dl-2");
        assert_eq!(list[2].id, "dl-1");
    }

    #[test]
    fn test_update_status() {
        let db = Database::open_in_memory().unwrap();
        let dl = make_test_download("dl-1", DownloadStatus::Pending);
        db.insert_download(&dl).unwrap();

        db.update_download_status(
            "dl-1",
            DownloadStatus::Failed,
            Some("timeout"),
            Some("E001"),
        )
        .unwrap();

        let fetched = db.get_download("dl-1").unwrap();
        assert_eq!(fetched.status, DownloadStatus::Failed);
        assert_eq!(fetched.error_message.as_deref(), Some("timeout"));
        assert_eq!(fetched.error_code.as_deref(), Some("E001"));
    }

    #[test]
    fn test_update_status_completed_sets_completed_at() {
        let db = Database::open_in_memory().unwrap();
        let dl = make_test_download("dl-1", DownloadStatus::Downloading);
        db.insert_download(&dl).unwrap();

        db.update_download_status("dl-1", DownloadStatus::Completed, None, None)
            .unwrap();

        let fetched = db.get_download("dl-1").unwrap();
        assert_eq!(fetched.status, DownloadStatus::Completed);
        assert!(fetched.completed_at.is_some(), "completed_at should be set");
    }

    #[test]
    fn test_update_progress() {
        let db = Database::open_in_memory().unwrap();
        let dl = make_test_download("dl-1", DownloadStatus::Downloading);
        db.insert_download(&dl).unwrap();

        db.update_download_progress("dl-1", 512, 1024.5).unwrap();

        let fetched = db.get_download("dl-1").unwrap();
        assert_eq!(fetched.downloaded_size, 512);
        assert!((fetched.speed - 1024.5).abs() < f64::EPSILON);
    }

    #[test]
    fn test_delete_download() {
        let db = Database::open_in_memory().unwrap();
        let dl = make_test_download("dl-1", DownloadStatus::Pending);
        db.insert_download(&dl).unwrap();

        db.delete_download("dl-1").unwrap();

        let result = db.get_download("dl-1");
        assert!(matches!(result, Err(CraneError::NotFound(_))));
    }

    #[test]
    fn test_delete_missing_returns_not_found() {
        let db = Database::open_in_memory().unwrap();
        let result = db.delete_download("nonexistent");
        assert!(matches!(result, Err(CraneError::NotFound(_))));
    }

    #[test]
    fn test_get_downloads_by_status() {
        let db = Database::open_in_memory().unwrap();

        let dl1 = make_test_download("dl-1", DownloadStatus::Pending);
        let dl2 = make_test_download("dl-2", DownloadStatus::Downloading);
        let dl3 = make_test_download("dl-3", DownloadStatus::Pending);

        db.insert_download(&dl1).unwrap();
        db.insert_download(&dl2).unwrap();
        db.insert_download(&dl3).unwrap();

        let pending = db.get_downloads_by_status(DownloadStatus::Pending).unwrap();
        assert_eq!(pending.len(), 2);

        let downloading = db
            .get_downloads_by_status(DownloadStatus::Downloading)
            .unwrap();
        assert_eq!(downloading.len(), 1);
        assert_eq!(downloading[0].id, "dl-2");
    }

    #[test]
    fn test_queue_position_and_next_queued() {
        let db = Database::open_in_memory().unwrap();

        let mut dl1 = make_test_download("dl-1", DownloadStatus::Queued);
        dl1.queue_position = Some(2);
        let mut dl2 = make_test_download("dl-2", DownloadStatus::Queued);
        dl2.queue_position = Some(1);
        let dl3 = make_test_download("dl-3", DownloadStatus::Pending);

        db.insert_download(&dl1).unwrap();
        db.insert_download(&dl2).unwrap();
        db.insert_download(&dl3).unwrap();

        // Next queued should be dl-2 (position 1)
        let next = db.get_next_queued().unwrap();
        assert!(next.is_some());
        assert_eq!(next.unwrap().id, "dl-2");

        // Update queue position
        db.update_queue_position("dl-2", Some(10)).unwrap();
        let next = db.get_next_queued().unwrap();
        assert_eq!(next.unwrap().id, "dl-1"); // now dl-1 has lower position
    }

    #[test]
    fn test_count_active_downloads() {
        let db = Database::open_in_memory().unwrap();

        let dl1 = make_test_download("dl-1", DownloadStatus::Downloading);
        let dl2 = make_test_download("dl-2", DownloadStatus::Analyzing);
        let dl3 = make_test_download("dl-3", DownloadStatus::Pending);
        let dl4 = make_test_download("dl-4", DownloadStatus::Downloading);

        db.insert_download(&dl1).unwrap();
        db.insert_download(&dl2).unwrap();
        db.insert_download(&dl3).unwrap();
        db.insert_download(&dl4).unwrap();

        let count = db.count_active_downloads().unwrap();
        assert_eq!(count, 3); // dl-1 (downloading) + dl-2 (analyzing) + dl-4 (downloading)
    }

    #[test]
    fn test_get_max_queue_position() {
        let db = Database::open_in_memory().unwrap();

        // No queued downloads
        let max = db.get_max_queue_position().unwrap();
        assert!(max.is_none());

        let mut dl1 = make_test_download("dl-1", DownloadStatus::Queued);
        dl1.queue_position = Some(5);
        let mut dl2 = make_test_download("dl-2", DownloadStatus::Queued);
        dl2.queue_position = Some(10);

        db.insert_download(&dl1).unwrap();
        db.insert_download(&dl2).unwrap();

        let max = db.get_max_queue_position().unwrap();
        assert_eq!(max, Some(10));
    }

    #[test]
    fn test_delete_completed_downloads() {
        let db = Database::open_in_memory().unwrap();

        let dl1 = make_test_download("dl-1", DownloadStatus::Completed);
        let dl2 = make_test_download("dl-2", DownloadStatus::Downloading);
        let dl3 = make_test_download("dl-3", DownloadStatus::Completed);
        let dl4 = make_test_download("dl-4", DownloadStatus::Pending);

        db.insert_download(&dl1).unwrap();
        db.insert_download(&dl2).unwrap();
        db.insert_download(&dl3).unwrap();
        db.insert_download(&dl4).unwrap();

        let deleted = db.delete_completed_downloads().unwrap();
        assert_eq!(deleted, 2);

        // Completed ones should be gone
        assert!(matches!(
            db.get_download("dl-1"),
            Err(CraneError::NotFound(_))
        ));
        assert!(matches!(
            db.get_download("dl-3"),
            Err(CraneError::NotFound(_))
        ));

        // Non-completed ones should remain
        assert!(db.get_download("dl-2").is_ok());
        assert!(db.get_download("dl-4").is_ok());
    }

    #[test]
    fn test_delete_completed_downloads_returns_zero_when_none() {
        let db = Database::open_in_memory().unwrap();

        let dl1 = make_test_download("dl-1", DownloadStatus::Pending);
        db.insert_download(&dl1).unwrap();

        let deleted = db.delete_completed_downloads().unwrap();
        assert_eq!(deleted, 0);
    }

    #[test]
    fn test_duplicate_id_returns_error() {
        let db = Database::open_in_memory().unwrap();
        let dl = make_test_download("dl-1", DownloadStatus::Pending);

        db.insert_download(&dl).unwrap();
        let result = db.insert_download(&dl);

        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), CraneError::Database(_)));
    }

    #[test]
    fn test_count_non_terminal_downloads() {
        let db = Database::open_in_memory().unwrap();

        // Empty DB
        assert_eq!(db.count_non_terminal_downloads().unwrap(), 0);

        // Insert various statuses
        let dl1 = make_test_download("nt-1", DownloadStatus::Pending);
        let dl2 = make_test_download("nt-2", DownloadStatus::Downloading);
        let dl3 = make_test_download("nt-3", DownloadStatus::Completed);
        let dl4 = make_test_download("nt-4", DownloadStatus::Failed);
        let dl5 = make_test_download("nt-5", DownloadStatus::Paused);
        let dl6 = make_test_download("nt-6", DownloadStatus::Queued);
        let dl7 = make_test_download("nt-7", DownloadStatus::Analyzing);

        db.insert_download(&dl1).unwrap();
        db.insert_download(&dl2).unwrap();
        db.insert_download(&dl3).unwrap();
        db.insert_download(&dl4).unwrap();
        db.insert_download(&dl5).unwrap();
        db.insert_download(&dl6).unwrap();
        db.insert_download(&dl7).unwrap();

        // Should count: pending, downloading, paused, queued, analyzing = 5
        // Should NOT count: completed, failed = 2
        assert_eq!(db.count_non_terminal_downloads().unwrap(), 5);
    }

    #[test]
    fn test_has_active_url() {
        let db = Database::open_in_memory().unwrap();
        let url = "https://example.com/file.bin";

        // No downloads yet
        assert!(!db.has_active_url(url).unwrap());

        // Insert an active download with that URL
        let mut dl = make_test_download("dup-1", DownloadStatus::Downloading);
        dl.url = url.to_string();
        db.insert_download(&dl).unwrap();
        assert!(db.has_active_url(url).unwrap());

        // Different URL should not match
        assert!(!db.has_active_url("https://example.com/other.bin").unwrap());

        // Completed downloads should not count
        db.update_download_status("dup-1", DownloadStatus::Completed, None, None)
            .unwrap();
        assert!(!db.has_active_url(url).unwrap());

        // Failed downloads should not count
        let mut dl2 = make_test_download("dup-2", DownloadStatus::Failed);
        dl2.url = url.to_string();
        db.insert_download(&dl2).unwrap();
        assert!(!db.has_active_url(url).unwrap());

        // Paused downloads should count
        let mut dl3 = make_test_download("dup-3", DownloadStatus::Paused);
        dl3.url = url.to_string();
        db.insert_download(&dl3).unwrap();
        assert!(db.has_active_url(url).unwrap());
    }

    #[test]
    fn test_find_failed_download() {
        let db = Database::open_in_memory().unwrap();
        let url = "https://example.com/bigfile.zip";

        // No failed downloads → None
        assert!(db.find_failed_download(url).unwrap().is_none());

        // Insert a failed download
        let mut dl = make_test_download("fail-1", DownloadStatus::Failed);
        dl.url = url.to_string();
        dl.total_size = Some(5000);
        db.insert_download(&dl).unwrap();

        let found = db.find_failed_download(url).unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().id, "fail-1");

        // Non-failed download with same URL should not be returned
        let mut dl2 = make_test_download("active-1", DownloadStatus::Downloading);
        dl2.url = url.to_string();
        db.insert_download(&dl2).unwrap();

        let found = db.find_failed_download(url).unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().id, "fail-1"); // still returns the failed one

        // Different URL should not match
        assert!(db
            .find_failed_download("https://other.com/file")
            .unwrap()
            .is_none());
    }

    #[test]
    fn test_find_failed_download_returns_most_recent() {
        let db = Database::open_in_memory().unwrap();
        let url = "https://example.com/bigfile.zip";

        let mut dl1 = make_test_download("fail-old", DownloadStatus::Failed);
        dl1.url = url.to_string();
        dl1.created_at = "2026-01-01T00:00:00Z".to_string();
        db.insert_download(&dl1).unwrap();

        let mut dl2 = make_test_download("fail-new", DownloadStatus::Failed);
        dl2.url = url.to_string();
        dl2.created_at = "2026-02-01T00:00:00Z".to_string();
        db.insert_download(&dl2).unwrap();

        let found = db.find_failed_download(url).unwrap().unwrap();
        assert_eq!(found.id, "fail-new");
    }

    #[test]
    fn test_update_download_for_retry() {
        let db = Database::open_in_memory().unwrap();

        let mut dl = make_test_download("retry-1", DownloadStatus::Failed);
        dl.downloaded_size = 500;
        dl.error_message = Some("timeout".to_string());
        dl.error_code = Some("E001".to_string());
        dl.retry_count = 3;
        db.insert_download(&dl).unwrap();

        db.update_download_for_retry(
            "retry-1",
            "newname.zip",
            "/tmp/newname.zip",
            Some(2048),
            Some("application/zip"),
            "archives",
            true,
            16,
        )
        .unwrap();

        let updated = db.get_download("retry-1").unwrap();
        assert_eq!(updated.filename, "newname.zip");
        assert_eq!(updated.save_path, "/tmp/newname.zip");
        assert_eq!(updated.total_size, Some(2048));
        assert_eq!(updated.mime_type.as_deref(), Some("application/zip"));
        assert!(updated.resumable);
        assert_eq!(updated.connections, 16);
        assert_eq!(updated.downloaded_size, 0);
        assert!(updated.error_message.is_none());
        assert!(updated.error_code.is_none());
        assert_eq!(updated.retry_count, 0);
    }
}
