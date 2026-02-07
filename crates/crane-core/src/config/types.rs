use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ─── Enums ──────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum NotificationLevel {
    #[default]
    All,
    FailedOnly,
    Never,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DuplicateAction {
    #[default]
    Ask,
    Rename,
    Overwrite,
    Skip,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProxyMode {
    #[default]
    None,
    System,
    Http,
    Socks5,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    System,
    Light,
    #[default]
    Dark,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FontSize {
    Small,
    #[default]
    Default,
    Large,
}

// ─── Config Structs ─────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    pub general: GeneralConfig,
    pub downloads: DownloadsConfig,
    pub file_organization: FileOrgConfig,
    pub network: NetworkConfig,
    pub appearance: AppearanceConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct GeneralConfig {
    pub download_location: String,
    pub launch_at_startup: bool,
    pub minimize_to_tray: bool,
    pub notification_level: NotificationLevel,
    pub language: String,
    pub auto_update: bool,
}

impl Default for GeneralConfig {
    fn default() -> Self {
        let download_location = dirs::download_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .to_string_lossy()
            .into_owned();
        Self {
            download_location,
            launch_at_startup: false,
            minimize_to_tray: true,
            notification_level: NotificationLevel::All,
            language: "en".to_string(),
            auto_update: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct DownloadsConfig {
    pub default_connections: u32,
    pub max_concurrent: u32,
    pub bandwidth_limit: Option<u64>,
    pub auto_resume: bool,
    pub large_file_threshold: Option<u64>,
}

impl Default for DownloadsConfig {
    fn default() -> Self {
        Self {
            default_connections: 8,
            max_concurrent: 3,
            bandwidth_limit: None,
            auto_resume: true,
            large_file_threshold: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct FileOrgConfig {
    pub auto_categorize: bool,
    pub date_subfolders: bool,
    pub duplicate_handling: DuplicateAction,
    pub category_folders: HashMap<String, String>,
}

impl Default for FileOrgConfig {
    fn default() -> Self {
        Self {
            auto_categorize: true,
            date_subfolders: false,
            duplicate_handling: DuplicateAction::Ask,
            category_folders: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct NetworkConfig {
    pub proxy: ProxyConfig,
    pub user_agent: Option<String>,
    pub speed_schedule: Vec<SpeedScheduleEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ProxyConfig {
    pub mode: ProxyMode,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub password: Option<String>,
}

impl Default for ProxyConfig {
    fn default() -> Self {
        Self {
            mode: ProxyMode::None,
            host: None,
            port: None,
            username: None,
            password: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppearanceConfig {
    pub theme: Theme,
    pub accent_color: String,
    pub font_size: FontSize,
    pub compact_mode: bool,
}

impl Default for AppearanceConfig {
    fn default() -> Self {
        Self {
            theme: Theme::Dark,
            accent_color: "#3B82F6".to_string(),
            font_size: FontSize::Default,
            compact_mode: false,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct SpeedScheduleEntry {
    pub start_hour: u8,
    pub end_hour: u8,
    pub limit: Option<u64>,
}
