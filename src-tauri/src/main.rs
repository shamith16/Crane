#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod notifications;
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Initialize database
            let data_dir = dirs::data_dir()
                .expect("Cannot determine data directory")
                .join("crane");
            std::fs::create_dir_all(&data_dir).expect("Cannot create data directory");

            let db_path = data_dir.join("crane.db");
            let db = Arc::new(Database::open(&db_path).expect("Cannot open database"));

            // Initialize config
            let config_dir = dirs::config_dir()
                .expect("Cannot determine config directory")
                .join("crane");
            let config_path = config_dir.join("config.toml");
            let config_manager =
                crane_core::config::ConfigManager::load(&config_path).expect("Cannot load config");

            // Use config for save dir
            let save_dir = {
                let loc = &config_manager.get().general.download_location;
                if loc.is_empty() {
                    dirs::download_dir()
                        .unwrap_or_else(|| dirs::home_dir().unwrap().join("Downloads"))
                        .to_string_lossy()
                        .to_string()
                } else {
                    loc.clone()
                }
            };

            // Extract queue/bandwidth settings before moving config_manager
            let max_concurrent = config_manager.get().downloads.max_concurrent;
            let bandwidth_limit = config_manager.get().downloads.bandwidth_limit;
            let speed_schedule = config_manager.get().network.speed_schedule.clone();

            let config = Arc::new(tokio::sync::Mutex::new(config_manager));

            // Create queue manager with bandwidth settings from config
            let queue = Arc::new(QueueManager::new(
                db,
                max_concurrent,
                bandwidth_limit,
                speed_schedule,
            ));

            // Spawn completion + pending monitor with notifications
            let monitor_queue = queue.clone();
            let monitor_save_dir = save_dir.clone();
            let monitor_config = config.clone();
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_secs(1));
                loop {
                    interval.tick().await;
                    if let Ok(finished) = monitor_queue.check_completed().await {
                        notifications::notify_finished(
                            &app_handle,
                            monitor_queue.db(),
                            &monitor_config,
                            &finished,
                        )
                        .await;
                    }
                    if let Err(e) = monitor_queue.check_pending(&monitor_save_dir).await {
                        eprintln!("check_pending error: {e}");
                    }
                }
            });

            app.manage(AppState {
                queue,
                config,
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
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::get_config_path,
            commands::settings::open_config_file,
            commands::settings::export_settings,
            commands::settings::import_settings,
            commands::settings::reset_settings,
            commands::files::open_file,
            commands::files::open_folder,
            commands::files::calculate_hash,
            commands::files::get_download_path,
            commands::system::get_app_info,
            commands::system::get_disk_space,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
