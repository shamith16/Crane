use serde::{Deserialize, Serialize};

// ─── Download Status Machine ────────────────────────
//
//  pending → analyzing → downloading → completed
//                │              │
//                │              ├→ paused → downloading (resume)
//                │              │
//                │              └→ failed → downloading (retry)
//                │
//                └→ queued → downloading (when slot opens)

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DownloadStatus {
    Pending,
    Analyzing,
    Downloading,
    Paused,
    Completed,
    Failed,
    Queued,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FileCategory {
    Documents,
    Video,
    Audio,
    Images,
    Archives,
    Software,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionStatus {
    Pending,
    Active,
    Completed,
    Failed,
}

impl DownloadStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Analyzing => "analyzing",
            Self::Downloading => "downloading",
            Self::Paused => "paused",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Queued => "queued",
        }
    }

    pub fn from_db_str(s: &str) -> Result<Self, CraneError> {
        match s {
            "pending" => Ok(Self::Pending),
            "analyzing" => Ok(Self::Analyzing),
            "downloading" => Ok(Self::Downloading),
            "paused" => Ok(Self::Paused),
            "completed" => Ok(Self::Completed),
            "failed" => Ok(Self::Failed),
            "queued" => Ok(Self::Queued),
            _ => Err(CraneError::Database(format!(
                "Unknown download status: {s}"
            ))),
        }
    }
}

impl FileCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Documents => "documents",
            Self::Video => "video",
            Self::Audio => "audio",
            Self::Images => "images",
            Self::Archives => "archives",
            Self::Software => "software",
            Self::Other => "other",
        }
    }

    pub fn from_db_str(s: &str) -> Result<Self, CraneError> {
        match s {
            "documents" => Ok(Self::Documents),
            "video" => Ok(Self::Video),
            "audio" => Ok(Self::Audio),
            "images" => Ok(Self::Images),
            "archives" => Ok(Self::Archives),
            "software" => Ok(Self::Software),
            "other" => Ok(Self::Other),
            _ => Err(CraneError::Database(format!("Unknown file category: {s}"))),
        }
    }
}

impl ConnectionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Active => "active",
            Self::Completed => "completed",
            Self::Failed => "failed",
        }
    }

    pub fn from_db_str(s: &str) -> Result<Self, CraneError> {
        match s {
            "pending" => Ok(Self::Pending),
            "active" => Ok(Self::Active),
            "completed" => Ok(Self::Completed),
            "failed" => Ok(Self::Failed),
            _ => Err(CraneError::Database(format!(
                "Unknown connection status: {s}"
            ))),
        }
    }
}

/// Result of a HEAD request before downloading
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UrlAnalysis {
    pub url: String,
    pub filename: String,
    pub total_size: Option<u64>,
    pub mime_type: Option<String>,
    pub resumable: bool,
    pub category: FileCategory,
    pub server: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Download {
    pub id: String,
    pub url: String,
    pub filename: String,
    pub save_path: String,
    pub total_size: Option<u64>,
    pub downloaded_size: u64,
    pub status: DownloadStatus,
    pub error_message: Option<String>,
    pub error_code: Option<String>,
    pub mime_type: Option<String>,
    pub category: FileCategory,
    pub resumable: bool,
    pub connections: u32,
    pub speed: f64,
    pub source_domain: Option<String>,
    pub referrer: Option<String>,
    pub cookies: Option<String>,
    pub user_agent: Option<String>,
    pub queue_position: Option<u32>,
    pub retry_count: u32,
    pub created_at: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionInfo {
    pub connection_num: u32,
    pub range_start: u64,
    pub range_end: u64,
    pub downloaded: u64,
    pub status: ConnectionStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub download_id: String,
    pub downloaded_size: u64,
    pub total_size: Option<u64>,
    pub speed: f64,
    pub eta_seconds: Option<u64>,
    pub connections: Vec<ConnectionProgress>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionProgress {
    pub connection_num: u32,
    pub downloaded: u64,
    pub range_start: u64,
    pub range_end: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DownloadOptions {
    pub save_path: Option<String>,
    pub filename: Option<String>,
    pub connections: Option<u32>,
    pub category: Option<FileCategory>,
    pub referrer: Option<String>,
    pub cookies: Option<String>,
    pub user_agent: Option<String>,
    pub headers: Option<std::collections::HashMap<String, String>>,
}

/// Result returned after a successful download
#[derive(Debug, Clone)]
pub struct DownloadResult {
    pub downloaded_bytes: u64,
    pub elapsed_ms: u64,
    pub final_path: std::path::PathBuf,
}

// ─── Error Types ────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum CraneError {
    #[error("HTTP error: {status} {message}")]
    Http { status: u16, message: String },

    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("File system error: {0}")]
    FileSystem(#[from] std::io::Error),

    #[error("URL parse error: {0}")]
    UrlParse(#[from] url::ParseError),

    #[error("Config error: {0}")]
    Config(String),

    #[error("Download not found: {0}")]
    NotFound(String),

    #[error("Invalid state transition: {from} → {to}")]
    InvalidState { from: String, to: String },

    #[error("Disk full: {path}")]
    DiskFull { path: String },

    #[error("Hash mismatch: expected {expected}, got {actual}")]
    HashMismatch { expected: String, actual: String },

    #[error("Unsupported URL scheme: {0}")]
    UnsupportedScheme(String),

    #[error("Duplicate URL: {0}")]
    DuplicateUrl(String),

    #[error("Path traversal rejected: {0}")]
    PathTraversal(String),

    #[error("Database error: {0}")]
    Database(String),
}

impl From<CraneError> for String {
    fn from(err: CraneError) -> String {
        err.to_string()
    }
}
