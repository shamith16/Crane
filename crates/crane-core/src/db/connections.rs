use crate::db::Database;
use crate::types::{ConnectionInfo, ConnectionStatus, CraneError};
use rusqlite::params;

impl Database {
    /// Insert connection chunks for a download.
    ///
    /// Each connection's temp_file is set to `{temp_dir}/chunk_{connection_num}`.
    pub fn insert_connections(
        &self,
        download_id: &str,
        connections: &[ConnectionInfo],
        temp_dir: &str,
    ) -> Result<(), CraneError> {
        let conn = self.conn();
        let mut stmt = conn
            .prepare(
                "INSERT INTO connections (download_id, connection_num, range_start, range_end, downloaded, status, temp_file)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )
            .map_err(|e| CraneError::Database(e.to_string()))?;

        for c in connections {
            let temp_file = format!("{temp_dir}/chunk_{}", c.connection_num);
            stmt.execute(params![
                download_id,
                c.connection_num as i64,
                c.range_start as i64,
                c.range_end as i64,
                c.downloaded as i64,
                c.status.as_str(),
                temp_file,
            ])
            .map_err(|e| CraneError::Database(e.to_string()))?;
        }

        Ok(())
    }

    /// Get all connections for a download, ordered by connection_num.
    pub fn get_connections(&self, download_id: &str) -> Result<Vec<ConnectionInfo>, CraneError> {
        let conn = self.conn();
        let mut stmt = conn
            .prepare(
                "SELECT connection_num, range_start, range_end, downloaded, status
                 FROM connections
                 WHERE download_id = ?1
                 ORDER BY connection_num",
            )
            .map_err(|e| CraneError::Database(e.to_string()))?;

        let rows = stmt
            .query_map(params![download_id], |row| {
                let status_str: String = row.get(4)?;
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                    status_str,
                ))
            })
            .map_err(|e| CraneError::Database(e.to_string()))?;

        let mut connections = Vec::new();
        for row in rows {
            let (num, start, end, downloaded, status_str) =
                row.map_err(|e| CraneError::Database(e.to_string()))?;
            connections.push(ConnectionInfo {
                connection_num: num as u32,
                range_start: start as u64,
                range_end: end as u64,
                downloaded: downloaded as u64,
                status: ConnectionStatus::from_db_str(&status_str)?,
            });
        }
        Ok(connections)
    }

    /// Update how many bytes a connection has downloaded.
    pub fn update_connection_progress(
        &self,
        download_id: &str,
        connection_num: u32,
        downloaded: u64,
    ) -> Result<(), CraneError> {
        let rows = self
            .conn()
            .execute(
                "UPDATE connections SET downloaded = ?1 WHERE download_id = ?2 AND connection_num = ?3",
                params![downloaded as i64, download_id, connection_num as i64],
            )
            .map_err(|e| CraneError::Database(e.to_string()))?;

        if rows == 0 {
            return Err(CraneError::NotFound(format!(
                "connection {connection_num} for download {download_id}"
            )));
        }
        Ok(())
    }

    /// Update the status of a single connection.
    pub fn update_connection_status(
        &self,
        download_id: &str,
        connection_num: u32,
        status: ConnectionStatus,
    ) -> Result<(), CraneError> {
        let rows = self
            .conn()
            .execute(
                "UPDATE connections SET status = ?1 WHERE download_id = ?2 AND connection_num = ?3",
                params![status.as_str(), download_id, connection_num as i64],
            )
            .map_err(|e| CraneError::Database(e.to_string()))?;

        if rows == 0 {
            return Err(CraneError::NotFound(format!(
                "connection {connection_num} for download {download_id}"
            )));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::ConnectionStatus;

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

    fn sample_connections() -> Vec<ConnectionInfo> {
        vec![
            ConnectionInfo {
                connection_num: 0,
                range_start: 0,
                range_end: 511,
                downloaded: 0,
                status: ConnectionStatus::Pending,
            },
            ConnectionInfo {
                connection_num: 1,
                range_start: 512,
                range_end: 1023,
                downloaded: 0,
                status: ConnectionStatus::Pending,
            },
        ]
    }

    #[test]
    fn test_insert_and_get_connections() {
        let db = setup_db_with_download();
        let conns = sample_connections();

        db.insert_connections("dl-1", &conns, "/tmp/f.zip.crane_tmp")
            .unwrap();

        let fetched = db.get_connections("dl-1").unwrap();
        assert_eq!(fetched.len(), 2);

        assert_eq!(fetched[0].connection_num, 0);
        assert_eq!(fetched[0].range_start, 0);
        assert_eq!(fetched[0].range_end, 511);
        assert_eq!(fetched[0].downloaded, 0);
        assert_eq!(fetched[0].status, ConnectionStatus::Pending);

        assert_eq!(fetched[1].connection_num, 1);
        assert_eq!(fetched[1].range_start, 512);
        assert_eq!(fetched[1].range_end, 1023);
    }

    #[test]
    fn test_update_connection_progress() {
        let db = setup_db_with_download();
        let conns = sample_connections();
        db.insert_connections("dl-1", &conns, "/tmp/f.zip.crane_tmp")
            .unwrap();

        db.update_connection_progress("dl-1", 0, 256).unwrap();

        let fetched = db.get_connections("dl-1").unwrap();
        assert_eq!(fetched[0].downloaded, 256);
        assert_eq!(fetched[1].downloaded, 0); // unchanged
    }

    #[test]
    fn test_update_connection_status() {
        let db = setup_db_with_download();
        let conns = sample_connections();
        db.insert_connections("dl-1", &conns, "/tmp/f.zip.crane_tmp")
            .unwrap();

        db.update_connection_status("dl-1", 1, ConnectionStatus::Active)
            .unwrap();

        let fetched = db.get_connections("dl-1").unwrap();
        assert_eq!(fetched[0].status, ConnectionStatus::Pending);
        assert_eq!(fetched[1].status, ConnectionStatus::Active);

        db.update_connection_status("dl-1", 1, ConnectionStatus::Completed)
            .unwrap();

        let fetched = db.get_connections("dl-1").unwrap();
        assert_eq!(fetched[1].status, ConnectionStatus::Completed);
    }

    #[test]
    fn test_cascade_delete_connections() {
        let db = setup_db_with_download();
        let conns = sample_connections();
        db.insert_connections("dl-1", &conns, "/tmp/f.zip.crane_tmp")
            .unwrap();

        // Verify connections exist
        assert_eq!(db.get_connections("dl-1").unwrap().len(), 2);

        // Delete parent download
        db.conn()
            .execute("DELETE FROM downloads WHERE id = 'dl-1'", [])
            .unwrap();

        // Connections should be gone via CASCADE
        let fetched = db.get_connections("dl-1").unwrap();
        assert!(fetched.is_empty());
    }
}
