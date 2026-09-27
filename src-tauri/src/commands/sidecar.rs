use tauri::{Manager, State};
use crate::AppState;
use crate::ec_client::types::DaemonStatus;

#[tauri::command]
pub async fn start_daemon(
    handle: tauri::AppHandle,
) -> Result<DaemonStatus, String> {
    crate::sidecar_manager::start_amuled(&handle).await?;
    let state = handle.state::<AppState>();
    get_daemon_status(state).await
}

#[tauri::command]
pub async fn stop_daemon(
    handle: tauri::AppHandle,
) -> Result<(), String> {
    crate::sidecar_manager::stop_amuled(&handle).await;
    Ok(())
}

#[tauri::command]
pub async fn get_daemon_status(
    state: State<'_, AppState>,
) -> Result<DaemonStatus, String> {
    let pid = state.sidecar_pid.lock().await;
    let ec = state.ec.lock().await;

    Ok(DaemonStatus {
        running: pid.is_some(),
        pid: *pid,
        ec_connected: ec.is_some(),
        version: ec.as_ref().map(|c| c.server_version().to_string()),
    })
}

#[tauri::command]
pub fn set_tray_icon_state(app: tauri::AppHandle, state: String) {
    let tray_state = match state.as_str() {
        "downloading" => crate::TrayState::Downloading,
        "warning" => crate::TrayState::Warning,
        "idle" => crate::TrayState::Idle,
        _ => crate::TrayState::Connected,
    };
    crate::update_tray_state(&app, tray_state);
}

