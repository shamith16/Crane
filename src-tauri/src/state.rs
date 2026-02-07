use std::sync::Arc;

use crane_core::queue::QueueManager;

pub struct AppState {
    pub queue: Arc<QueueManager>,
    pub default_save_dir: String,
}
