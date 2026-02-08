use crane_core::config::AppConfig;
use tauri::State;

use crate::state::AppState;

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<AppConfig, String> {
    let config = state.config.lock().await;
    Ok(config.get().clone())
}

#[tauri::command]
pub async fn update_settings(
    state: State<'_, AppState>,
    settings: serde_json::Value,
) -> Result<(), String> {
    let mut config = state.config.lock().await;
    config.update(settings).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_config_path(state: State<'_, AppState>) -> Result<String, String> {
    let config = state.config.lock().await;
    Ok(config.path().to_string_lossy().to_string())
}

#[tauri::command]
pub async fn open_config_file(state: State<'_, AppState>) -> Result<(), String> {
    let path = {
        let config = state.config.lock().await;
        config.path().to_string_lossy().to_string()
    };
    open::that(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_settings(
    state: State<'_, AppState>,
    path: String,
) -> Result<(), String> {
    let config = state.config.lock().await;
    config
        .export_to(std::path::Path::new(&path))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_settings(
    state: State<'_, AppState>,
    path: String,
) -> Result<(), String> {
    let mut config = state.config.lock().await;
    config
        .import_from(std::path::Path::new(&path))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reset_settings(state: State<'_, AppState>) -> Result<(), String> {
    let mut config = state.config.lock().await;
    config.reset().map_err(|e| e.to_string())
}
