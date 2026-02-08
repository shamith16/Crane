use std::sync::Arc;

use crane_core::config::ConfigManager;
use crane_core::queue::QueueManager;
use tokio::sync::Mutex;

pub struct AppState {
    pub queue: Arc<QueueManager>,
    pub config: Arc<Mutex<ConfigManager>>,
    pub default_save_dir: String,
}
