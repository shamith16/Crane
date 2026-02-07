pub mod connections;
pub mod downloads;
pub mod retry_log;
pub mod site_settings;
pub mod speed_history;

use crate::types::CraneError;
use rusqlite::Connection;
use std::path::Path;
use std::sync::{Mutex, MutexGuard};

/// Wrapper around a SQLite connection for Crane's persistence layer.
///
/// The connection is wrapped in a `Mutex` so that `Database` is `Send + Sync`,
/// which is required for use inside Tauri's managed state.
pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    /// Open (or create) the database at the given file path.
    ///
    /// Creates parent directories if they don't exist, enables WAL mode
    /// and foreign keys, then creates all tables and indexes.
    pub fn open(path: &Path) -> Result<Self, CraneError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let conn = Connection::open(path).map_err(|e| CraneError::Database(e.to_string()))?;

        let db = Self {
            conn: Mutex::new(conn),
        };
        db.setup()?;
        Ok(db)
    }

    /// Open an in-memory database — useful for tests.
    pub fn open_in_memory() -> Result<Self, CraneError> {
        let conn = Connection::open_in_memory().map_err(|e| CraneError::Database(e.to_string()))?;

        let db = Self {
            conn: Mutex::new(conn),
        };
        db.setup()?;
        Ok(db)
    }

    /// Accessor for the underlying connection.
    ///
    /// Locks the mutex and returns a guard. Panics if the mutex is poisoned.
    pub(crate) fn conn(&self) -> MutexGuard<'_, Connection> {
        self.conn.lock().expect("Database mutex poisoned")
    }

    /// Set pragmas and create all tables + indexes.
    fn setup(&self) -> Result<(), CraneError> {
        let conn = self.conn();
        conn.execute_batch("PRAGMA journal_mode=WAL;")
            .map_err(|e| CraneError::Database(e.to_string()))?;
        conn.execute_batch("PRAGMA foreign_keys=ON;")
            .map_err(|e| CraneError::Database(e.to_string()))?;
        drop(conn);

        self.create_tables()?;
        Ok(())
    }

    fn create_tables(&self) -> Result<(), CraneError> {
        self.conn()
            .execute_batch(
                "
            CREATE TABLE IF NOT EXISTS downloads (
                id             TEXT PRIMARY KEY,
                url            TEXT NOT NULL,
                filename       TEXT NOT NULL,
                save_path      TEXT NOT NULL,
                total_size     INTEGER,
                downloaded_size INTEGER NOT NULL DEFAULT 0,
                status         TEXT NOT NULL DEFAULT 'pending',
                error_message  TEXT,
                error_code     TEXT,
                mime_type      TEXT,
                category       TEXT NOT NULL DEFAULT 'other',
                resumable      INTEGER NOT NULL DEFAULT 0,
                connections    INTEGER NOT NULL DEFAULT 1,
                speed          REAL NOT NULL DEFAULT 0.0,
                source_domain  TEXT,
                referrer       TEXT,
                cookies        TEXT,
                user_agent     TEXT,
                queue_position INTEGER,
                retry_count    INTEGER NOT NULL DEFAULT 0,
                created_at     TEXT NOT NULL,
                started_at     TEXT,
                completed_at   TEXT,
                updated_at     TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_downloads_status
                ON downloads(status);
            CREATE INDEX IF NOT EXISTS idx_downloads_category
                ON downloads(category);
            CREATE INDEX IF NOT EXISTS idx_downloads_created
                ON downloads(created_at DESC);

            CREATE TABLE IF NOT EXISTS connections (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                download_id     TEXT NOT NULL REFERENCES downloads(id) ON DELETE CASCADE,
                connection_num  INTEGER NOT NULL,
                range_start     INTEGER NOT NULL,
                range_end       INTEGER NOT NULL,
                downloaded      INTEGER NOT NULL DEFAULT 0,
                status          TEXT NOT NULL DEFAULT 'pending',
                temp_file       TEXT,
                UNIQUE(download_id, connection_num)
            );

            CREATE INDEX IF NOT EXISTS idx_connections_download
                ON connections(download_id);

            CREATE TABLE IF NOT EXISTS speed_history (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                download_id TEXT NOT NULL REFERENCES downloads(id) ON DELETE CASCADE,
                speed       REAL NOT NULL,
                timestamp   TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_speed_download
                ON speed_history(download_id, timestamp);

            CREATE TABLE IF NOT EXISTS retry_log (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                download_id   TEXT NOT NULL REFERENCES downloads(id) ON DELETE CASCADE,
                attempt       INTEGER NOT NULL,
                error_message TEXT,
                error_code    TEXT,
                timestamp     TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS site_settings (
                domain      TEXT PRIMARY KEY,
                connections INTEGER,
                save_folder TEXT,
                category    TEXT,
                user_agent  TEXT,
                created_at  TEXT NOT NULL
            );
            ",
            )
            .map_err(|e| CraneError::Database(e.to_string()))?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_open_in_memory() {
        let db = Database::open_in_memory().unwrap();

        // Verify all 5 tables exist
        let conn = db.conn();
        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<Vec<String>, _>>()
            .unwrap();

        assert_eq!(
            tables,
            vec![
                "connections",
                "downloads",
                "retry_log",
                "site_settings",
                "speed_history",
            ]
        );
    }

    #[test]
    fn test_open_creates_parent_dirs() {
        let tmp = TempDir::new().unwrap();
        let db_path = tmp.path().join("deep").join("nested").join("crane.db");

        let _db = Database::open(&db_path).unwrap();

        assert!(db_path.exists());
    }

    #[test]
    fn test_foreign_keys_enabled() {
        let db = Database::open_in_memory().unwrap();
        let fk: i64 = db
            .conn()
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .unwrap();
        assert_eq!(fk, 1);
    }

    #[test]
    fn test_open_twice_is_idempotent() {
        let tmp = TempDir::new().unwrap();
        let db_path = tmp.path().join("crane.db");

        let _db1 = Database::open(&db_path).unwrap();
        drop(_db1);
        let _db2 = Database::open(&db_path).unwrap();
        // No error — tables already exist via IF NOT EXISTS
    }
}
