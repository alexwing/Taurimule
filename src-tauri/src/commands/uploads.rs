use tauri::State;
use crate::AppState;
use crate::ec_client::types::UploadInfo;

#[tauri::command]
pub async fn get_upload_queue(
    state: State<'_, AppState>,
) -> Result<Vec<UploadInfo>, String> {
    let mut ec = state.ec.lock().await;
    let conn = ec.as_mut().ok_or("Not connected to amuled")?;
    conn.get_upload_queue().await
}
