#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod state;
mod tray;

use std::sync::Arc;

use crane_core::db::Database;
use crane_core::queue::QueueManager;
use state::AppState;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Initialize database
            let data_dir = dirs::data_dir()
                .expect("Cannot determine data directory")
                .join("crane");
            std::fs::create_dir_all(&data_dir).expect("Cannot create data directory");

            let db_path = data_dir.join("crane.db");
            let db = Arc::new(Database::open(&db_path).expect("Cannot open database"));

            // Default save directory
            let save_dir = dirs::download_dir()
                .unwrap_or_else(|| dirs::home_dir().unwrap().join("Downloads"))
                .to_string_lossy()
                .to_string();

            // Create queue manager (max 3 concurrent downloads)
            let queue = Arc::new(QueueManager::new(db, 3));

            // Spawn completion + pending monitor
            let monitor_queue = queue.clone();
            let monitor_save_dir = save_dir.clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_secs(1));
                loop {
                    interval.tick().await;
                    let _ = monitor_queue.check_completed().await;
                    let _ = monitor_queue.check_pending(&monitor_save_dir).await;
                }
            });

            app.manage(AppState {
                queue,
                default_save_dir: save_dir,
            });

            // Setup system tray
            tray::setup_tray(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::downloads::analyze_url,
            commands::downloads::add_download,
            commands::downloads::pause_download,
            commands::downloads::resume_download,
            commands::downloads::cancel_download,
            commands::downloads::get_downloads,
            commands::downloads::get_download,
            commands::downloads::subscribe_progress,
            commands::downloads::retry_download,
            commands::downloads::delete_download,
            commands::downloads::pause_all_downloads,
            commands::downloads::resume_all_downloads,
            commands::downloads::delete_completed,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
