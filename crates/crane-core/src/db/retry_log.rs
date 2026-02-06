use crate::db::Database;
use crate::types::CraneError;
use rusqlite::params;

/// A single retry attempt for a download.
#[derive(Debug, Clone)]
pub struct RetryEntry {
    pub attempt: u32,
    pub error_message: Option<String>,
    pub error_code: Option<String>,
    pub timestamp: String,
}

impl Database {
    /// Record a retry attempt for a download (timestamp = now).
    pub fn insert_retry(
        &self,
        download_id: &str,
        attempt: u32,
        error_message: Option<&str>,
        error_code: Option<&str>,
    ) -> Result<(), CraneError> {
        let now = chrono::Utc::now().to_rfc3339();
        self.conn()
            .execute(
                "INSERT INTO retry_log (download_id, attempt, error_message, error_code, timestamp)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![download_id, attempt as i64, error_message, error_code, now],
            )
            .map_err(|e| CraneError::Database(e.to_string()))?;

        Ok(())
    }

    /// Get all retry entries for a download, ordered by attempt ascending.
    pub fn get_retries(&self, download_id: &str) -> Result<Vec<RetryEntry>, CraneError> {
        let mut stmt = self
            .conn()
            .prepare(
                "SELECT attempt, error_message, error_code, timestamp
                 FROM retry_log
                 WHERE download_id = ?1
                 ORDER BY attempt ASC",
            )
            .map_err(|e| CraneError::Database(e.to_string()))?;

        let rows = stmt
            .query_map(params![download_id], |row| {
                Ok(RetryEntry {
                    attempt: row.get::<_, i64>(0)? as u32,
                    error_message: row.get(1)?,
                    error_code: row.get(2)?,
                    timestamp: row.get(3)?,
                })
            })
            .map_err(|e| CraneError::Database(e.to_string()))?;

        let mut entries = Vec::new();
        for row in rows {
            entries.push(row.map_err(|e| CraneError::Database(e.to_string()))?);
        }
        Ok(entries)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_db_with_download() -> Database {
        let db = Database::open_in_memory().unwrap();
        db.conn()
            .execute(
                "INSERT INTO downloads (id, url, filename, save_path, status, category, created_at, updated_at)
                 VALUES ('dl-1', 'https://example.com/f.zip', 'f.zip', '/tmp/f.zip', 'downloading', 'other', '2026-01-01', '2026-01-01')",
                [],
            )
            .unwrap();
        db
    }

    #[test]
    fn test_insert_and_get_retries() {
        let db = setup_db_with_download();

        db.insert_retry("dl-1", 1, Some("connection reset"), Some("E001"))
            .unwrap();
        db.insert_retry("dl-1", 2, Some("timeout"), None).unwrap();
        db.insert_retry("dl-1", 3, None, None).unwrap();

        let retries = db.get_retries("dl-1").unwrap();
        assert_eq!(retries.len(), 3);

        assert_eq!(retries[0].attempt, 1);
        assert_eq!(retries[0].error_message.as_deref(), Some("connection reset"));
        assert_eq!(retries[0].error_code.as_deref(), Some("E001"));

        assert_eq!(retries[1].attempt, 2);
        assert_eq!(retries[1].error_message.as_deref(), Some("timeout"));
        assert!(retries[1].error_code.is_none());

        assert_eq!(retries[2].attempt, 3);
        assert!(retries[2].error_message.is_none());
        assert!(retries[2].error_code.is_none());

        // Non-existent download returns empty
        let empty = db.get_retries("dl-nonexistent").unwrap();
        assert!(empty.is_empty());
    }

    #[test]
    fn test_retry_log_cascade_delete() {
        let db = setup_db_with_download();

        db.insert_retry("dl-1", 1, Some("error"), None).unwrap();
        db.insert_retry("dl-1", 2, Some("error again"), None)
            .unwrap();

        assert_eq!(db.get_retries("dl-1").unwrap().len(), 2);

        // Delete parent download
        db.conn()
            .execute("DELETE FROM downloads WHERE id = 'dl-1'", [])
            .unwrap();

        // Retry log should be gone via CASCADE
        let retries = db.get_retries("dl-1").unwrap();
        assert!(retries.is_empty());
    }
}
