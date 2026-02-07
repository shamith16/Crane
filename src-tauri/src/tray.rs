use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

use crate::state::AppState;

pub fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let pause_all = MenuItem::with_id(app, "pause_all", "Pause All", true, None::<&str>)?;
    let resume_all = MenuItem::with_id(app, "resume_all", "Resume All", true, None::<&str>)?;
    let separator2 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Crane", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &show,
            &separator,
            &pause_all,
            &resume_all,
            &separator2,
            &quit,
        ],
    )?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "pause_all" => {
                let state = app.state::<AppState>();
                let queue = state.queue.clone();
                tauri::async_runtime::spawn(async move {
                    if let Ok(downloads) = queue.list_downloads() {
                        for dl in downloads {
                            if dl.status == crane_core::types::DownloadStatus::Downloading {
                                let _ = queue.pause(&dl.id).await;
                            }
                        }
                    }
                });
            }
            "resume_all" => {
                let state = app.state::<AppState>();
                let queue = state.queue.clone();
                tauri::async_runtime::spawn(async move {
                    if let Ok(downloads) = queue.list_downloads() {
                        for dl in downloads {
                            if dl.status == crane_core::types::DownloadStatus::Paused {
                                let _ = queue.resume(&dl.id).await;
                            }
                        }
                    }
                });
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}
