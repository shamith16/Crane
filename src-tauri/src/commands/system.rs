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

#[derive(Serialize)]
pub struct DiskSpace {
    pub free_bytes: u64,
    pub total_bytes: u64,
}

#[tauri::command]
pub async fn get_disk_space(path: Option<String>) -> Result<DiskSpace, String> {
    let target = match path {
        Some(p) => std::path::PathBuf::from(p),
        None => dirs::download_dir().unwrap_or_else(|| dirs::home_dir().unwrap_or_default()),
    };
    let available = fs2::available_space(&target).map_err(|e| e.to_string())?;
    let total = fs2::total_space(&target).map_err(|e| e.to_string())?;
    Ok(DiskSpace {
        free_bytes: available,
        total_bytes: total,
    })
}
