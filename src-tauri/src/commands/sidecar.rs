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
    let mut pid = *state.sidecar_pid.lock().await;
    let (ec_connected, version) = {
        let ec = state.ec.lock().await;
        (ec.is_some(), ec.as_ref().map(|c| c.server_version().to_string()))
    };
    let running = pid.is_some() || ec_connected;

    // Connected to an amuled we did not spawn (adopted or external): look up
    // its PID only in that case, since this spawns a `tasklist` process.
    if ec_connected && pid.is_none() {
        pid = crate::sidecar_manager::find_amuled_pid().await;
    }
    Ok(DaemonStatus {
        running,
        pid,
        ec_connected,
        version,
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

