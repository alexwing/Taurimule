//! TauriMule — Modern ED2K/Kad desktop client
//!
//! Entry point for the Tauri v2 application.
//! Manages the amuled sidecar process, system tray, window minimize/restore,
//! and exposes Tauri Commands for the frontend.

mod commands;
pub mod ec_client;
mod sidecar_manager;

use std::sync::Arc;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WindowEvent,
};
use tokio::sync::Mutex;

const TRAY_ICON_IDLE: &[u8] = include_bytes!("../icons/tray-idle.png");
const TRAY_ICON_ACTIVE: &[u8] = include_bytes!("../icons/tray-active.png");
const TRAY_ICON_DOWNLOADING: &[u8] = include_bytes!("../icons/tray-downloading.png");
const TRAY_ICON_WARNING: &[u8] = include_bytes!("../icons/tray-warning.png");
const TRAY_ID: &str = "main-tray";

/// Global application state shared across all Tauri Commands.
pub struct AppState {
    /// Live EC protocol connection to amuled.
    pub ec: Arc<Mutex<Option<ec_client::EcConnection>>>,
    /// PID of the running amuled sidecar process.
    pub sidecar_pid: Arc<Mutex<Option<u32>>>,
}

#[derive(Debug, Clone, Copy)]
pub enum TrayState {
    Connected,
    Downloading,
    Warning,
    Idle,
}

/// Helper to update tray icon based on state
pub fn update_tray_state(app: &AppHandle, state: TrayState) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let icon_bytes = match state {
            TrayState::Connected => TRAY_ICON_ACTIVE,
            TrayState::Downloading => TRAY_ICON_DOWNLOADING,
            TrayState::Warning => TRAY_ICON_WARNING,
            TrayState::Idle => TRAY_ICON_IDLE,
        };
        if let Ok(icon) = Image::from_bytes(icon_bytes) {
            let _ = tray.set_icon(Some(icon));
        }
    }
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .manage(AppState {
            ec: Arc::new(Mutex::new(None)),
            sidecar_pid: Arc::new(Mutex::new(None)),
        })
        .setup(|app| {
            // Build Tray Menu
            let show_i = MenuItem::with_id(app, "show", "Mostrar TauriMule", true, None::<&str>)?;
            let toggle_i = MenuItem::with_id(app, "toggle_daemon", "Iniciar / Detener Servidor", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Salir de TauriMule", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &toggle_i, &quit_i])?;

            let active_icon = Image::from_bytes(TRAY_ICON_ACTIVE)?;

            let _tray = TrayIconBuilder::with_id(TRAY_ID)
                .icon(active_icon)
                .tooltip("TauriMule — ED2K/Kad Client")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        let handle = app.clone();
                        tauri::async_runtime::block_on(async {
                            sidecar_manager::stop_amuled(&handle).await;
                        });
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "toggle_daemon" => {
                        let handle = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let state = handle.state::<AppState>();
                            let is_running = {
                                let pid = state.sidecar_pid.lock().await;
                                pid.is_some()
                            };
                            if is_running {
                                sidecar_manager::stop_amuled(&handle).await;
                                update_tray_state(&handle, TrayState::Idle);
                            } else {
                                let _ = sidecar_manager::start_amuled(&handle).await;
                                update_tray_state(&handle, TrayState::Connected);
                            }
                        });
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| match event {
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } => {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }

            let handle = app.handle().clone();

            // Start amuled sidecar in background on app launch
            tauri::async_runtime::spawn(async move {
                match sidecar_manager::start_amuled(&handle).await {
                    Ok(()) => {
                        log::info!("amuled sidecar started successfully");
                        update_tray_state(&handle, TrayState::Connected);
                    }
                    Err(e) => {
                        log::error!("Failed to start amuled sidecar: {}", e);
                        update_tray_state(&handle, TrayState::Idle);
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // When close 'X' is clicked, minimize to system tray instead of closing!
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Sidecar management
            commands::sidecar::start_daemon,
            commands::sidecar::stop_daemon,
            commands::sidecar::get_daemon_status,
            commands::sidecar::set_tray_icon_state,
            // Servers & Network
            commands::servers::get_server_list,
            commands::servers::connect_server,
            commands::servers::disconnect_server,
            commands::servers::get_stats,
            commands::servers::get_kad_status,
            // Search
            commands::search::start_search,
            commands::search::get_search_results,
            commands::search::stop_search,
            // Downloads
            commands::downloads::get_download_queue,
            commands::downloads::download_file,
            commands::downloads::pause_download,
            commands::downloads::resume_download,
            commands::downloads::delete_download,
            commands::downloads::set_download_priority,
            commands::downloads::launch_file,
            commands::downloads::show_in_folder,
            commands::downloads::rename_file,
            commands::downloads::add_ed2k_link,
            commands::downloads::add_ed2k_links,
            // Uploads
            commands::uploads::get_upload_queue,
        ])
        .run(tauri::generate_context!())
        .expect("error while running TauriMule");
}
