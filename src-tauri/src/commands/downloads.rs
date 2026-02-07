use crane_core::metadata::analyzer;
use crane_core::types::{Download, DownloadOptions, DownloadProgress, UrlAnalysis};
use tauri::State;

use crate::state::AppState;

#[tauri::command]
pub async fn analyze_url(url: String) -> Result<UrlAnalysis, String> {
    analyzer::analyze_url(&url).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_download(
    state: State<'_, AppState>,
    url: String,
    options: Option<DownloadOptions>,
) -> Result<String, String> {
    let opts = options.unwrap_or_default();
    state
        .queue
        .add_download(&url, &state.default_save_dir, opts)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pause_download(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.queue.pause(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resume_download(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.queue.resume(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cancel_download(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.queue.cancel(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_downloads(state: State<'_, AppState>) -> Result<Vec<Download>, String> {
    state.queue.list_downloads().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_download(state: State<'_, AppState>, id: String) -> Result<Download, String> {
    state
        .queue
        .db()
        .get_download(&id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn subscribe_progress(
    state: State<'_, AppState>,
    download_id: String,
    on_progress: tauri::ipc::Channel<DownloadProgress>,
) -> Result<(), String> {
    let queue = state.queue.clone();
    let id = download_id.clone();

    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_millis(250));
        loop {
            interval.tick().await;
            match queue.get_progress(&id).await {
                Some(progress) => {
                    if on_progress.send(progress).is_err() {
                        break; // Frontend disconnected
                    }
                }
                None => break, // Download no longer active
            }
        }
    });

    Ok(())
}
