use serde::Serialize;

#[derive(Serialize)]
pub struct AppInfo {
    pub version: String,
    pub data_dir: String,
}

#[tauri::command]
pub async fn get_app_info() -> Result<AppInfo, String> {
    let data_dir = dirs::data_dir()
        .unwrap_or_default()
        .join("crane")
        .to_string_lossy()
        .to_string();
    Ok(AppInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        data_dir,
    })
}
