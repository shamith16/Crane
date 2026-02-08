use crane_core::hash::{self, HashAlgorithm};
use tauri::State;

use crate::state::AppState;

#[tauri::command]
pub async fn open_file(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let dl = state
        .queue
        .db()
        .get_download(&id)
        .map_err(|e| e.to_string())?;
    open::that(&dl.save_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_folder(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let dl = state
        .queue
        .db()
        .get_download(&id)
        .map_err(|e| e.to_string())?;
    let path = std::path::Path::new(&dl.save_path);
    let folder = path.parent().unwrap_or(path);
    open::that(folder).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn calculate_hash(
    state: State<'_, AppState>,
    id: String,
    algorithm: String,
) -> Result<String, String> {
    let dl = state
        .queue
        .db()
        .get_download(&id)
        .map_err(|e| e.to_string())?;
    let algo = match algorithm.as_str() {
        "sha256" => HashAlgorithm::Sha256,
        "md5" => HashAlgorithm::Md5,
        _ => return Err(format!("Unsupported algorithm: {algorithm}")),
    };
    hash::compute_hash(std::path::Path::new(&dl.save_path), algo)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_download_path(
    state: State<'_, AppState>,
    id: String,
) -> Result<String, String> {
    let dl = state
        .queue
        .db()
        .get_download(&id)
        .map_err(|e| e.to_string())?;
    Ok(dl.save_path)
}
