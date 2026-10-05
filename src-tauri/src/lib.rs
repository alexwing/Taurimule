//! TauriMule — Modern ED2K/Kad desktop client
//!
//! Entry point for the Tauri v2 application.
//! Manages the amuled sidecar process, system tray, window minimize/restore,
//! and exposes Tauri Commands for the frontend.

/// Timeout for acquiring the shared EC connection lock.
pub const EC_LOCK_TIMEOUT: std::time::Duration = std::time::Duration::from_millis(5000);
/// Timeout for a single EC request/response round-trip.
pub const EC_REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_millis(5000);

/// Run an EC request on the shared connection with lock + request timeouts.
/// A timed-out request drops the connection (stream may be desynchronised);
/// the backend poller will reconnect.
#[macro_export]
macro_rules! ec_call {
    ($ec:expr, |$c:ident| $body:expr) => {{
        match tokio::time::timeout($crate::EC_LOCK_TIMEOUT, $ec.lock()).await {
            Err(_) => Err::<_, String>("EC connection busy (timeout)".to_string()),
            Ok(mut guard) => match guard.as_mut() {
                None => Err("Not connected to amuled".to_string()),
                Some($c) => {
                    let res = tokio::time::timeout($crate::EC_REQUEST_TIMEOUT, $body).await;
                    match res {
                        Ok(r) => r,
                        Err(_) => {
                            *guard = None;
                            Err("EC request timed out".to_string())
                        }
                    }
                }
            },
        }
    }};
}

mod commands;
pub mod ec_client;
mod sidecar_manager;

use std::sync::Arc;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WindowEvent,
};
use tokio::sync::Mutex;

const TRAY_ICON_IDLE: &[u8] = include_bytes!("../icons/tray-idle.png");
const TRAY_ICON_ACTIVE: &[u8] = include_bytes!("../icons/tray-active.png");
const TRAY_ICON_DOWNLOADING: &[u8] = include_bytes!("../icons/tray-downloading.png");
const TRAY_ICON_WARNING: &[u8] = include_bytes!("../icons/tray-warning.png");
const TRAY_ID: &str = "main-tray";

/// Last state snapshot fetched from the daemon by the backend poller.
#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct Snapshot {
    pub downloads: Vec<ec_client::types::DownloadInfo>,
    pub stats: Option<ec_client::types::GlobalStats>,
    pub uploads: Vec<ec_client::types::UploadInfo>,
    pub connected: bool,
    pub error: Option<String>,
    pub updated_at: u64,
}

/// Global application state shared across all Tauri Commands.
pub struct AppState {
    /// Live EC protocol connection to amuled.
    pub ec: Arc<Mutex<Option<ec_client::EcConnection>>>,
    /// PID of the running amuled sidecar process.
    pub sidecar_pid: Arc<Mutex<Option<u32>>>,
    /// Last snapshot from the backend poller.
    pub snapshot: Arc<std::sync::Mutex<Snapshot>>,
}

#[derive(Clone, serde::Serialize)]
struct DaemonStatusEvent {
    connected: bool,
    error: Option<String>,
}

/// Single backend poller: fetches downloads + stats + uploads every ~1s and emits
/// `downloads-updated`. Never blocks the UI; errors are reported via `daemon-status`.
fn spawn_poller(handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut was_connected = false;
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
            let state = handle.state::<AppState>();

            // Reconnect if the connection was dropped while the sidecar is alive.
            let need_reconnect = {
                match state.ec.try_lock() {
                    Ok(g) => g.is_none(),
                    Err(_) => false,
                }
            };
            if need_reconnect {
                let running = state.sidecar_pid.lock().await.is_some();
                if running {
                    let _ = tokio::time::timeout(
                        std::time::Duration::from_millis(3000),
                        sidecar_manager::connect_ec(&handle),
                    )
                    .await;
                }
            }

            let res: Result<_, String> = async {
                let downloads = ec_call!(state.ec, |c| c.get_download_queue())?;
                let stats = ec_call!(state.ec, |c| c.get_stats())?;
                let uploads = ec_call!(state.ec, |c| c.get_upload_queue()).unwrap_or_default();
                Ok((downloads, stats, uploads))
            }
            .await;

            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);

            match res {
                Ok((downloads, stats, uploads)) => {
                    let snap = Snapshot {
                        downloads,
                        stats: Some(stats),
                        uploads,
                        connected: true,
                        error: None,
                        updated_at: now,
                    };
                    if let Ok(mut s) = state.snapshot.lock() {
                        *s = snap.clone();
                    }
                    let _ = handle.emit("downloads-updated", &snap);
                    if !was_connected {
                        let _ = handle.emit("daemon-status", DaemonStatusEvent { connected: true, error: None });
                    }
                    was_connected = true;
                }
                Err(e) => {
                    if let Ok(mut s) = state.snapshot.lock() {
                        s.connected = false;
                        s.error = Some(e.clone());
                    }
                    let _ = handle.emit("daemon-status", DaemonStatusEvent { connected: false, error: Some(e) });
                    was_connected = false;
                }
            }
        }
    });
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
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            for arg in &args {
                let trimmed = arg.trim_matches('"').trim_matches('\'').trim();
                let decoded = crate::commands::downloads::url_decode(trimmed);
                let target_link = crate::commands::downloads::normalize_ed2k_link(&decoded)
                    .or_else(|| crate::commands::downloads::normalize_ed2k_link(trimmed))
                    .or_else(|| if trimmed.starts_with("ed2k://") { Some(trimmed.to_string()) } else { None });

                if let Some(link) = target_link {
                    let _ = app.emit("ed2k-link-received", link);
                }
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            ec: Arc::new(Mutex::new(None)),
            sidecar_pid: Arc::new(Mutex::new(None)),
            snapshot: Arc::new(std::sync::Mutex::new(Snapshot::default())),
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

            // Check cold start CLI args for ed2k link
            for arg in std::env::args() {
                let trimmed = arg.trim_matches('"').trim_matches('\'').trim().to_string();
                let decoded = crate::commands::downloads::url_decode(&trimmed);
                let target_link = crate::commands::downloads::normalize_ed2k_link(&decoded)
                    .or_else(|| crate::commands::downloads::normalize_ed2k_link(&trimmed))
                    .or_else(|| if trimmed.starts_with("ed2k://") { Some(trimmed) } else { None });

                if let Some(link) = target_link {
                    let handle_clone = handle.clone();
                    tauri::async_runtime::spawn(async move {
                        tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;
                        let _ = handle_clone.emit("ed2k-link-received", link);
                    });
                }
            }

            spawn_poller(handle.clone());

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
            commands::servers::start_kad,
            commands::servers::stop_kad,
            commands::servers::bootstrap_kad,
            commands::servers::add_server,
            commands::servers::remove_server,
            commands::servers::update_servers_from_url,
            commands::servers::load_local_server_met,
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
            commands::downloads::request_more_sources,
            commands::downloads::launch_file,
            commands::downloads::show_in_folder,
            commands::downloads::get_snapshot,
            commands::downloads::open_downloads_folder,
            commands::downloads::add_ed2k_link,
            commands::downloads::add_ed2k_links,
            // Uploads
            commands::uploads::get_upload_queue,
            // Configuration & Import
            commands::config::get_config,
            commands::config::save_config,
            commands::config::import_from_emule,
            commands::config::import_from_amule,
            commands::config::pick_folder,
            commands::config::open_folder,
            commands::config::is_ed2k_associated,
            commands::config::register_ed2k_association,
            commands::config::unregister_ed2k_association,
        ])
        .build(tauri::generate_context!())
        .expect("error while building TauriMule")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                let handle = app_handle.clone();
                tauri::async_runtime::block_on(async {
                    sidecar_manager::stop_amuled(&handle).await;
                });
            }
        });
}
