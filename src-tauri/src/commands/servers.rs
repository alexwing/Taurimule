use tauri::State;
use crate::AppState;
use crate::ec_client::types::{ServerInfo, GlobalStats};

#[tauri::command]
pub async fn get_server_list(
    state: State<'_, AppState>,
) -> Result<Vec<ServerInfo>, String> {
    let mut ec = state.ec.lock().await;
    let conn = ec.as_mut().ok_or("Not connected to amuled")?;
    conn.get_server_list().await
}

#[tauri::command]
pub async fn connect_server(
    state: State<'_, AppState>,
    ip: String,
    port: u16,
) -> Result<(), String> {
    let mut ec = state.ec.lock().await;
    let conn = ec.as_mut().ok_or("Not connected to amuled")?;
    conn.connect_server(&ip, port).await
}

#[tauri::command]
pub async fn disconnect_server(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut ec = state.ec.lock().await;
    let conn = ec.as_mut().ok_or("Not connected to amuled")?;
    conn.disconnect_server().await
}

#[tauri::command]
pub async fn get_stats(
    state: State<'_, AppState>,
) -> Result<GlobalStats, String> {
    let mut ec = state.ec.lock().await;
    let conn = ec.as_mut().ok_or("Not connected to amuled")?;
    conn.get_stats().await
}

#[tauri::command]
pub async fn get_kad_status(
    state: State<'_, AppState>,
) -> Result<GlobalStats, String> {
    get_stats(state).await
}
