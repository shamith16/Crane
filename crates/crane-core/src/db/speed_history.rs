use crate::db::Database;
use crate::types::CraneError;
use rusqlite::params;

/// A single speed measurement for a download.
#[derive(Debug, Clone)]
pub struct SpeedSample {
    pub speed: f64,
    pub timestamp: String,
}

impl Database {
    /// Record a speed sample for a download (timestamp = now).
    pub fn insert_speed_sample(&self, download_id: &str, speed: f64) -> Result<(), CraneError> {
        let now = chrono::Utc::now().to_rfc3339();
        self.conn()
            .execute(
                "INSERT INTO speed_history (download_id, speed, timestamp) VALUES (?1, ?2, ?3)",
                params![download_id, speed, now],
            )
            .map_err(|e| CraneError::Database(e.to_string()))?;

        Ok(())
    }

    /// Get speed history for the last `seconds` seconds, ordered oldest-first.
    pub fn get_speed_history(
        &self,
        download_id: &str,
        seconds: u64,
    ) -> Result<Vec<SpeedSample>, CraneError> {
        let cutoff = (chrono::Utc::now() - chrono::Duration::seconds(seconds as i64)).to_rfc3339();

        let mut stmt = self
            .conn()
            .prepare(
                "SELECT speed, timestamp FROM speed_history
                 WHERE download_id = ?1 AND timestamp >= ?2
                 ORDER BY timestamp ASC",
            )
            .map_err(|e| CraneError::Database(e.to_string()))?;

        let rows = stmt
            .query_map(params![download_id, cutoff], |row| {
                Ok(SpeedSample {
                    speed: row.get(0)?,
                    timestamp: row.get(1)?,
                })
            })
            .map_err(|e| CraneError::Database(e.to_string()))?;

        let mut samples = Vec::new();
        for row in rows {
            samples.push(row.map_err(|e| CraneError::Database(e.to_string()))?);
        }
        Ok(samples)
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
    fn test_insert_and_get_speed_history() {
        let db = setup_db_with_download();

        db.insert_speed_sample("dl-1", 1024.0).unwrap();
        db.insert_speed_sample("dl-1", 2048.0).unwrap();
        db.insert_speed_sample("dl-1", 512.0).unwrap();

        // All samples should be within the last 60 seconds
        let samples = db.get_speed_history("dl-1", 60).unwrap();
        assert_eq!(samples.len(), 3);
        assert!((samples[0].speed - 1024.0).abs() < f64::EPSILON);
        assert!((samples[1].speed - 2048.0).abs() < f64::EPSILON);
        assert!((samples[2].speed - 512.0).abs() < f64::EPSILON);

        // Zero-second window should return nothing (samples are at "now")
        // but since they're inserted at essentially the same timestamp,
        // let's verify a different download returns empty
        let empty = db.get_speed_history("dl-nonexistent", 60).unwrap();
        assert!(empty.is_empty());
    }

    #[test]
    fn test_speed_history_cascade_delete() {
        let db = setup_db_with_download();

        db.insert_speed_sample("dl-1", 1024.0).unwrap();
        db.insert_speed_sample("dl-1", 2048.0).unwrap();

        assert_eq!(db.get_speed_history("dl-1", 60).unwrap().len(), 2);

        // Delete parent download
        db.conn()
            .execute("DELETE FROM downloads WHERE id = 'dl-1'", [])
            .unwrap();

        // Speed history should be gone via CASCADE
        let samples = db.get_speed_history("dl-1", 60).unwrap();
        assert!(samples.is_empty());
    }
}
