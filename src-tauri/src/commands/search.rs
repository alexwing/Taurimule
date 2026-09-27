use tauri::State;
use crate::AppState;
use crate::ec_client::types::{SearchParams, SearchResult};

#[tauri::command]
pub async fn start_search(
    state: State<'_, AppState>,
    params: SearchParams,
) -> Result<(), String> {
    let mut ec = state.ec.lock().await;
    let conn = ec.as_mut().ok_or("Not connected to amuled")?;
    conn.search_start(&params).await
}

#[tauri::command]
pub async fn get_search_results(
    state: State<'_, AppState>,
) -> Result<Vec<SearchResult>, String> {
    let mut ec = state.ec.lock().await;
    let conn = ec.as_mut().ok_or("Not connected to amuled")?;
    conn.search_results().await
}

#[tauri::command]
pub async fn stop_search(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut ec = state.ec.lock().await;
    let conn = ec.as_mut().ok_or("Not connected to amuled")?;
    conn.search_stop().await
}
