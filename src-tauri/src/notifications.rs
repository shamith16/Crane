use crane_core::config::types::NotificationLevel;
use crane_core::db::Database;
use crane_core::types::DownloadStatus;
use tauri_plugin_notification::NotificationExt;

/// Send notifications for downloads that just finished.
/// Checks the DB for their final status (completed/failed) and sends appropriate notifications.
/// Respects the notification_level setting.
pub async fn notify_finished(
    app: &tauri::AppHandle,
    db: &Database,
    config: &tokio::sync::Mutex<crane_core::config::ConfigManager>,
    finished_ids: &[String],
) {
    if finished_ids.is_empty() {
        return;
    }

    // Check notification level from config
    let level = {
        let cfg = config.lock().await;
        cfg.get().general.notification_level.clone()
    };

    if level == NotificationLevel::Never {
        return;
    }

    let mut completed = Vec::new();
    let mut failed = Vec::new();

    for id in finished_ids {
        if let Ok(dl) = db.get_download(id) {
            match dl.status {
                DownloadStatus::Completed => {
                    completed.push(dl.filename.clone());
                }
                DownloadStatus::Failed => {
                    let msg = dl
                        .error_message
                        .clone()
                        .unwrap_or_else(|| "Unknown error".to_string());
                    failed.push((dl.filename.clone(), msg));
                }
                _ => {}
            }
        }
    }

    // Send completed notifications (only if level is "all")
    if level == NotificationLevel::All && !completed.is_empty() {
        if completed.len() == 1 {
            let _ = app
                .notification()
                .builder()
                .title("Download Complete")
                .body(format!("{} — Download complete", completed[0]))
                .show();
        } else {
            let _ = app
                .notification()
                .builder()
                .title("Downloads Complete")
                .body(format!("{} downloads completed", completed.len()))
                .show();
        }
    }

    // Send failed notifications (for both "all" and "failed_only")
    if !failed.is_empty() {
        if failed.len() == 1 {
            let (name, err) = &failed[0];
            let _ = app
                .notification()
                .builder()
                .title("Download Failed")
                .body(format!("{} — {}", name, err))
                .show();
        } else {
            let _ = app
                .notification()
                .builder()
                .title("Downloads Failed")
                .body(format!("{} downloads failed", failed.len()))
                .show();
        }
    }
}
