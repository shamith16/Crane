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

    /// Set pragmas, create version table, and run migrations.
    fn setup(&self) -> Result<(), CraneError> {
        let conn = self.conn();
        conn.execute_batch("PRAGMA journal_mode=WAL;")
            .map_err(|e| CraneError::Database(e.to_string()))?;
        conn.execute_batch("PRAGMA foreign_keys=ON;")
            .map_err(|e| CraneError::Database(e.to_string()))?;

        // Create version tracking table
        conn.execute_batch("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);")
            .map_err(|e| CraneError::Database(e.to_string()))?;

        run_migrations(&conn)?;
        Ok(())
    }
}

fn get_schema_version(conn: &Connection) -> Result<i64, CraneError> {
    match conn.query_row("SELECT version FROM schema_version LIMIT 1", [], |row| {
        row.get::<_, i64>(0)
    }) {
        Ok(v) => Ok(v),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(0),
        Err(e) => Err(CraneError::Database(e.to_string())),
    }
}

fn set_schema_version(conn: &Connection, version: i64) -> Result<(), CraneError> {
    conn.execute("DELETE FROM schema_version", [])
        .map_err(|e| CraneError::Database(e.to_string()))?;
    conn.execute(
        "INSERT INTO schema_version (version) VALUES (?1)",
        [version],
    )
    .map_err(|e| CraneError::Database(e.to_string()))?;
    Ok(())
}

fn run_migrations(conn: &Connection) -> Result<(), CraneError> {
    let current = get_schema_version(conn)?;

    let migrations: &[fn(&Connection) -> Result<(), CraneError>] =
        &[migrate_v0_to_v1, migrate_v1_to_v2];

    for (i, migrate) in migrations.iter().enumerate() {
        let target = (i + 1) as i64;
        if current < target {
            conn.execute_batch("BEGIN;")
                .map_err(|e| CraneError::Database(e.to_string()))?;
            match migrate(conn).and_then(|()| set_schema_version(conn, target)) {
                Ok(()) => {
                    conn.execute_batch("COMMIT;")
                        .map_err(|e| CraneError::Database(e.to_string()))?;
                    tracing::info!("[db] Migrated schema to version {target}");
                }
                Err(e) => {
                    let _ = conn.execute_batch("ROLLBACK;");
                    return Err(e);
                }
            }
        }
    }

    Ok(())
}

/// V1: Initial schema — the original CREATE TABLE IF NOT EXISTS batch.
fn migrate_v0_to_v1(conn: &Connection) -> Result<(), CraneError> {
    conn.execute_batch(
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

/// V2: Add `headers` column to the downloads table.
fn migrate_v1_to_v2(conn: &Connection) -> Result<(), CraneError> {
    conn.execute_batch("ALTER TABLE downloads ADD COLUMN headers TEXT;")
        .map_err(|e| CraneError::Database(e.to_string()))?;
    Ok(())
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
                "schema_version",
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

    #[test]
    fn test_fresh_db_has_schema_version_2() {
        let db = Database::open_in_memory().unwrap();
        let version: i64 = db
            .conn()
            .query_row("SELECT version FROM schema_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 2);
    }

    #[test]
    fn test_migration_is_idempotent() {
        let tmp = TempDir::new().unwrap();
        let db_path = tmp.path().join("crane.db");

        // Open once — runs migrations
        let db1 = Database::open(&db_path).unwrap();
        let v1: i64 = db1
            .conn()
            .query_row("SELECT version FROM schema_version", [], |row| row.get(0))
            .unwrap();
        drop(db1);

        // Open again — should not error, version stays the same
        let db2 = Database::open(&db_path).unwrap();
        let v2: i64 = db2
            .conn()
            .query_row("SELECT version FROM schema_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(v1, v2);
        assert_eq!(v2, 2);
    }

    #[test]
    fn test_existing_db_without_version_gets_migrated() {
        let tmp = TempDir::new().unwrap();
        let db_path = tmp.path().join("crane.db");

        // Simulate a pre-migration database: create tables manually without schema_version
        {
            let conn = Connection::open(&db_path).unwrap();
            conn.execute_batch("PRAGMA journal_mode=WAL;").unwrap();
            conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
            conn.execute_batch(
                "CREATE TABLE downloads (
                    id TEXT PRIMARY KEY,
                    url TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    save_path TEXT NOT NULL,
                    total_size INTEGER,
                    downloaded_size INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'pending',
                    error_message TEXT,
                    error_code TEXT,
                    mime_type TEXT,
                    category TEXT NOT NULL DEFAULT 'other',
                    resumable INTEGER NOT NULL DEFAULT 0,
                    connections INTEGER NOT NULL DEFAULT 1,
                    speed REAL NOT NULL DEFAULT 0.0,
                    source_domain TEXT,
                    referrer TEXT,
                    cookies TEXT,
                    user_agent TEXT,
                    queue_position INTEGER,
                    retry_count INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    started_at TEXT,
                    completed_at TEXT,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE connections (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    download_id TEXT NOT NULL REFERENCES downloads(id) ON DELETE CASCADE,
                    connection_num INTEGER NOT NULL,
                    range_start INTEGER NOT NULL,
                    range_end INTEGER NOT NULL,
                    downloaded INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'pending',
                    temp_file TEXT,
                    UNIQUE(download_id, connection_num)
                );
                CREATE TABLE speed_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    download_id TEXT NOT NULL REFERENCES downloads(id) ON DELETE CASCADE,
                    speed REAL NOT NULL,
                    timestamp TEXT NOT NULL
                );
                CREATE TABLE retry_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    download_id TEXT NOT NULL REFERENCES downloads(id) ON DELETE CASCADE,
                    attempt INTEGER NOT NULL,
                    error_message TEXT,
                    error_code TEXT,
                    timestamp TEXT NOT NULL
                );
                CREATE TABLE site_settings (
                    domain TEXT PRIMARY KEY,
                    connections INTEGER,
                    save_folder TEXT,
                    category TEXT,
                    user_agent TEXT,
                    created_at TEXT NOT NULL
                );",
            )
            .unwrap();
        }

        // Now open with Database::open — should detect missing version, run all migrations
        let db = Database::open(&db_path).unwrap();
        let version: i64 = db
            .conn()
            .query_row("SELECT version FROM schema_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 2);

        // Verify all 5 original tables still exist
        let conn = db.conn();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('downloads','connections','speed_history','retry_log','site_settings')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 5);
    }

    #[test]
    fn test_v1_db_gets_headers_column() {
        let tmp = TempDir::new().unwrap();
        let db_path = tmp.path().join("crane.db");

        // Create a v1-schema database manually (no headers column)
        {
            let conn = Connection::open(&db_path).unwrap();
            conn.execute_batch("PRAGMA journal_mode=WAL;").unwrap();
            conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
                 INSERT INTO schema_version (version) VALUES (1);",
            )
            .unwrap();
            // V1 schema — no headers column
            conn.execute_batch(
                "CREATE TABLE downloads (
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
                CREATE TABLE connections (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    download_id TEXT NOT NULL REFERENCES downloads(id) ON DELETE CASCADE,
                    connection_num INTEGER NOT NULL,
                    range_start INTEGER NOT NULL,
                    range_end INTEGER NOT NULL,
                    downloaded INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'pending',
                    temp_file TEXT,
                    UNIQUE(download_id, connection_num)
                );
                CREATE TABLE speed_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    download_id TEXT NOT NULL REFERENCES downloads(id) ON DELETE CASCADE,
                    speed REAL NOT NULL,
                    timestamp TEXT NOT NULL
                );
                CREATE TABLE retry_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    download_id TEXT NOT NULL REFERENCES downloads(id) ON DELETE CASCADE,
                    attempt INTEGER NOT NULL,
                    error_message TEXT,
                    error_code TEXT,
                    timestamp TEXT NOT NULL
                );
                CREATE TABLE site_settings (
                    domain TEXT PRIMARY KEY,
                    connections INTEGER,
                    save_folder TEXT,
                    category TEXT,
                    user_agent TEXT,
                    created_at TEXT NOT NULL
                );",
            )
            .unwrap();
        }

        // Open with Database::open — should run v1→v2 migration
        let db = Database::open(&db_path).unwrap();
        let version: i64 = db
            .conn()
            .query_row("SELECT version FROM schema_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 2);

        // Verify the headers column exists by querying it
        let conn = db.conn();
        let has_headers: bool = conn
            .prepare("SELECT headers FROM downloads LIMIT 0")
            .is_ok();
        assert!(has_headers, "headers column should exist after migration");
    }

    #[test]
    fn test_download_round_trip_with_headers() {
        use crate::types::{Download, DownloadStatus, FileCategory};

        let db = Database::open_in_memory().unwrap();

        let headers_json = r#"{"Authorization":"Bearer tok123","X-Custom":"value"}"#;
        let dl = Download {
            id: "hdr-1".to_string(),
            url: "https://example.com/file.bin".to_string(),
            filename: "file.bin".to_string(),
            save_path: "/tmp/file.bin".to_string(),
            total_size: Some(1024),
            downloaded_size: 0,
            status: DownloadStatus::Pending,
            error_message: None,
            error_code: None,
            mime_type: None,
            category: FileCategory::Other,
            resumable: false,
            connections: 1,
            speed: 0.0,
            source_domain: None,
            referrer: None,
            cookies: None,
            user_agent: None,
            headers: Some(headers_json.to_string()),
            queue_position: None,
            retry_count: 0,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            started_at: None,
            completed_at: None,
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        };

        db.insert_download(&dl).unwrap();
        let fetched = db.get_download("hdr-1").unwrap();

        assert_eq!(fetched.headers.as_deref(), Some(headers_json));
    }
}
