//! Sidecar Manager — Lifecycle control for the amuled daemon process.
//!
//! Manages starting, monitoring (stdout/stderr), and stopping amuled
//! as a Tauri sidecar process, then connecting via EC protocol.

use std::time::Duration;

use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

use crate::AppState;

const EC_PORT: u16 = 4712;
const EC_PASSWORD: &str = "taurimule";

/// Ensure amule.conf is present and correctly configured for amuled EC connections.
fn ensure_amule_config() {
    let config_dir = crate::commands::config::get_amule_config_dir();
    let conf_path = config_dir.join("amule.conf");
    if !conf_path.exists() {
        let _ = crate::commands::config::get_config();
        return;
    }
    if let Ok(content) = std::fs::read_to_string(&conf_path) {
        let mut modified = false;
        let mut new_lines = Vec::new();
        let mut has_ec_section = false;

        for line in content.lines() {
            if line.trim() == "[ExternalConnect]" {
                has_ec_section = true;
            }
            if line.starts_with("IncomingDir=") {
                let val = &line["IncomingDir=".len()..];
                let normalized = val.trim().replace('\\', "/").trim_end_matches('/').to_string();
                let new_line = format!("IncomingDir={}", normalized);
                if line != new_line { modified = true; }
                new_lines.push(new_line);
            } else if line.starts_with("TempDir=") {
                let val = &line["TempDir=".len()..];
                let normalized = val.trim().replace('\\', "/").trim_end_matches('/').to_string();
                let new_line = format!("TempDir={}", normalized);
                if line != new_line { modified = true; }
                new_lines.push(new_line);
            } else if line.starts_with("ECPassword=") {
                // Ensure password hash matches MD5("taurimule")
                let new_line = "ECPassword=fbb1617ec78c584fc2d75d801fd62e2b".to_string();
                if line != new_line { modified = true; }
                new_lines.push(new_line);
            } else {
                new_lines.push(line.to_string());
            }
        }

        if !has_ec_section {
            new_lines.push(String::new());
            new_lines.push("[ExternalConnect]".to_string());
            new_lines.push("AcceptExternalConnections=1".to_string());
            new_lines.push("ECAddress=127.0.0.1".to_string());
            new_lines.push("ECPort=4712".to_string());
            new_lines.push("ECPassword=fbb1617ec78c584fc2d75d801fd62e2b".to_string());
            new_lines.push("RequireEncryption=0".to_string());
            modified = true;
        }

        if modified {
            let _ = std::fs::write(&conf_path, new_lines.join("\n"));
        }
    }
}

/// Start the amuled daemon as a sidecar process.
pub async fn start_amuled(handle: &AppHandle) -> Result<(), String> {
    let state = handle.state::<AppState>();

    // Check if already running in current session
    {
        let pid = state.sidecar_pid.lock().await;
        if pid.is_some() {
            log::info!("amuled already running");
            return Ok(());
        }
    }

    // Clean up any stale or orphaned amuled instances from previous crashes / unclosed sessions
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/IM", "amuled.exe"])
            .output();
        tokio::time::sleep(Duration::from_millis(300)).await;
    }

    ensure_amule_config();

    let config_dir = crate::commands::config::get_amule_config_dir();
    let config_dir_str = config_dir.to_string_lossy().to_string();

    log::info!(
        "Starting official amuled sidecar on EC port {} with config: {}",
        EC_PORT,
        config_dir_str
    );

    let sidecar_command = handle
        .shell()
        .sidecar("amuled")
        .map_err(|e| format!("Failed to create sidecar command: {}", e))?
        .args([
            "-c",
            &config_dir_str,
            "--log-stdout",
        ]);

    let (mut rx, child) = sidecar_command
        .spawn()
        .map_err(|e| format!("Failed to spawn amuled: {}", e))?;

    let pid = child.pid();
    log::info!("amuled spawned with PID: {}", pid);

    // Store the PID
    {
        let mut pid_lock = state.sidecar_pid.lock().await;
        *pid_lock = Some(pid);
    }

    // Monitor stdout/stderr in background
    let handle_clone = handle.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let msg = String::from_utf8_lossy(&line);
                    log::info!("[amuled] {}", msg.trim());
                }
                CommandEvent::Stderr(line) => {
                    let msg = String::from_utf8_lossy(&line);
                    log::warn!("[amuled err] {}", msg.trim());
                }
                CommandEvent::Terminated(status) => {
                    log::warn!(
                        "[amuled] Process terminated. Exit code: {:?}, signal: {:?}",
                        status.code,
                        status.signal
                    );
                    // Clean up state
                    let state = handle_clone.state::<AppState>();
                    {
                        let mut pid_lock = state.sidecar_pid.lock().await;
                        *pid_lock = None;
                    }
                    {
                        let mut ec_lock = state.ec.lock().await;
                        *ec_lock = None;
                    }
                    break;
                }
                _ => {}
            }
        }
    });

    // Poll for amuled to be ready via EC connection with low-latency retries
    let max_attempts = 25;
    let mut last_err = String::new();
    for attempt in 1..=max_attempts {
        tokio::time::sleep(Duration::from_millis(if attempt == 1 { 300 } else { 400 })).await;
        match connect_ec(handle).await {
            Ok(()) => {
                log::info!("EC connected successfully to amuled on attempt {}", attempt);
                return Ok(());
            }
            Err(e) => {
                last_err = e;
            }
        }
    }

    Err(format!(
        "Failed to connect to amuled EC after {} attempts: {}",
        max_attempts, last_err
    ))
}

/// Connect to the running amuled daemon via EC protocol.
pub(crate) async fn connect_ec(handle: &AppHandle) -> Result<(), String> {
    let state = handle.state::<AppState>();

    let connection =
        crate::ec_client::EcConnection::connect("127.0.0.1", EC_PORT, EC_PASSWORD).await?;

    log::info!(
        "EC connected to amuled v{} on port {}",
        connection.server_version(),
        EC_PORT
    );

    let mut ec = state.ec.lock().await;
    *ec = Some(connection);

    Ok(())
}

/// Gracefully stop the amuled daemon.
pub async fn stop_amuled(handle: &AppHandle) {
    let state = handle.state::<AppState>();

    // Step 1: Send EC shutdown command (graceful)
    {
        let mut ec = state.ec.lock().await;
        if let Some(ref mut conn) = *ec {
            log::info!("Sending EC shutdown to amuled...");
            if let Err(e) = conn.shutdown().await {
                log::warn!("EC shutdown command failed: {}", e);
            }
        }
        *ec = None;
    }

    // Step 2: Clear PID reference
    {
        let mut pid = state.sidecar_pid.lock().await;
        if let Some(p) = *pid {
            log::info!("amuled (PID {}) shutdown initiated", p);

            // On Windows, force-kill the process tree to prevent zombies
            #[cfg(target_os = "windows")]
            {
                let _ = std::process::Command::new("taskkill")
                    .args(["/F", "/T", "/PID", &p.to_string()])
                    .output();
            }
        }
        *pid = None;

        #[cfg(target_os = "windows")]
        {
            let _ = std::process::Command::new("taskkill")
                .args(["/F", "/IM", "amuled.exe"])
                .output();
        }
    }

    log::info!("amuled stopped");
}
