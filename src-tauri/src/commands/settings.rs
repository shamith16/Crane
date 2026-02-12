use crane_core::config::AppConfig;
use tauri::State;

use crate::state::AppState;

/// Validate that a settings file path is safe for export/import.
/// Rejects paths containing traversal sequences or pointing to sensitive locations.
fn validate_settings_path(path: &std::path::Path) -> Result<(), String> {
    // Must have .toml extension
    match path.extension().and_then(|e| e.to_str()) {
        Some("toml") => {}
        _ => return Err("Settings files must have .toml extension".to_string()),
    }

    // Reject path traversal
    let path_str = path.to_string_lossy();
    if path_str.contains("..") {
        return Err("Path traversal is not allowed".to_string());
    }

    // Reject sensitive directories
    let sensitive_prefixes: &[&str] = &["/etc", "/var", "/usr", "/bin", "/sbin", "/sys", "/proc"];
    for prefix in sensitive_prefixes {
        if path_str.starts_with(prefix) {
            return Err(format!("Cannot access files in {prefix}"));
        }
    }

    Ok(())
}

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
    let export_path = std::path::Path::new(&path);
    validate_settings_path(export_path)?;

    let config = state.config.lock().await;
    config
        .export_to(export_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_settings(
    state: State<'_, AppState>,
    path: String,
) -> Result<(), String> {
    let import_path = std::path::Path::new(&path);
    validate_settings_path(import_path)?;

    let mut config = state.config.lock().await;
    config
        .import_from(import_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reset_settings(state: State<'_, AppState>) -> Result<(), String> {
    let mut config = state.config.lock().await;
    config.reset().map_err(|e| e.to_string())
}
