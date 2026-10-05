//! Sidecar Manager — Lifecycle control for the amuled daemon process.
//!
//! Manages starting, monitoring (stdout/stderr), and stopping amuled
//! as a Tauri sidecar process, then connecting via EC protocol.

use std::time::Duration;

use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

use crate::AppState;

/// CREATE_NO_WINDOW: avoids a console flashing when spawning helper tools.
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

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
            if let Some(val) = line.strip_prefix("IncomingDir=") {
                let normalized = val.trim().replace('\\', "/").trim_end_matches('/').to_string();
                let new_line = format!("IncomingDir={}", normalized);
                if line != new_line { modified = true; }
                new_lines.push(new_line);
            } else if let Some(val) = line.strip_prefix("TempDir=") {
                let normalized = val.trim().replace('\\', "/").trim_end_matches('/').to_string();
                let new_line = format!("TempDir={}", normalized);
                if line != new_line { modified = true; }
                new_lines.push(new_line);
            } else if line.starts_with("ECPassword=") {
                // Ensure password hash matches MD5("taurimule")
                let new_line = "ECPassword=fbb1617ec78c584fc2d75d801fd62e2b".to_string();
                if line != new_line { modified = true; }
                new_lines.push(new_line);
            } else if line.starts_with("ECAddress=") {
                // Never listen on all interfaces (imported confs may leave it empty)
                let new_line = "ECAddress=127.0.0.1".to_string();
                if line != new_line { modified = true; }
                new_lines.push(new_line);
            } else if line.starts_with("AcceptExternalConnections=") {
                let new_line = "AcceptExternalConnections=1".to_string();
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

/// Build a `tokio::process::Command` that never opens a console window on Windows.
fn helper_command(program: &str) -> tokio::process::Command {
    #[allow(unused_mut)]
    let mut cmd = tokio::process::Command::new(program);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

/// Whether a process with this PID exists and is an amuled.
async fn is_pid_alive(pid: u32) -> bool {
    #[cfg(target_os = "windows")]
    {
        match helper_command("tasklist")
            .args(["/FI", &format!("PID eq {}", pid), "/NH", "/FO", "CSV"])
            .output()
            .await
        {
            Ok(out) => String::from_utf8_lossy(&out.stdout)
                .to_ascii_lowercase()
                .contains("amuled"),
            Err(_) => false,
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        match helper_command("kill").args(["-0", &pid.to_string()]).status().await {
            Ok(status) => status.success(),
            Err(_) => false,
        }
    }
}

/// PID of the first amuled process found on the system, if any.
pub(crate) async fn find_amuled_pid() -> Option<u32> {
    #[cfg(target_os = "windows")]
    {
        let out = helper_command("tasklist")
            .args(["/FI", "IMAGENAME eq amuled.exe", "/NH", "/FO", "CSV"])
            .output()
            .await
            .ok()?;
        let text = String::from_utf8_lossy(&out.stdout);
        // Row format: "amuled.exe","1234","Console","1","50,000 K"
        let line = text
            .lines()
            .find(|l| l.to_ascii_lowercase().contains("amuled"))?;
        line.split(',')
            .nth(1)?
            .trim()
            .trim_matches('"')
            .parse::<u32>()
            .ok()
    }
    #[cfg(not(target_os = "windows"))]
    {
        let out = helper_command("pgrep").args(["-x", "amuled"]).output().await.ok()?;
        String::from_utf8_lossy(&out.stdout)
            .lines()
            .next()?
            .trim()
            .parse::<u32>()
            .ok()
    }
}

/// Force-kill a process (and its tree on Windows) by PID. Never by image name.
async fn kill_pid(pid: u32) {
    #[cfg(target_os = "windows")]
    let res = helper_command("taskkill")
        .args(["/F", "/T", "/PID", &pid.to_string()])
        .output()
        .await;
    #[cfg(not(target_os = "windows"))]
    let res = helper_command("kill").args(["-9", &pid.to_string()]).output().await;
    if let Err(e) = res {
        log::warn!("Failed to kill PID {}: {}", pid, e);
    }
}

/// Start the amuled daemon as a sidecar process.
pub async fn start_amuled(handle: &AppHandle) -> Result<(), String> {
    let state = handle.state::<AppState>();

    // Serialize start/stop; held until pid and child are stored.
    let lifecycle_guard = state.lifecycle.lock().await;

    // Check if already running in current session
    {
        let pid = state.sidecar_pid.lock().await;
        if pid.is_some() {
            log::info!("amuled already running");
            return Ok(());
        }
    }

    // Adoption: a live amuled that accepts our password uses our config
    // (typically left over from a previous session that did not close cleanly).
    let tcp_open = matches!(
        tokio::time::timeout(
            Duration::from_millis(500),
            tokio::net::TcpStream::connect(("127.0.0.1", EC_PORT)),
        )
        .await,
        Ok(Ok(_))
    );
    if tcp_open {
        match tokio::time::timeout(Duration::from_secs(2), connect_ec(handle)).await {
            Ok(Ok(())) => {
                let adopted = find_amuled_pid().await;
                log::info!("Adopted an existing amuled (PID {:?}) on EC port {}", adopted, EC_PORT);
                *state.sidecar_pid.lock().await = adopted;
                return Ok(());
            }
            Ok(Err(e)) => {
                return Err(format!(
                    "Another aMule/amuled is listening on port {} with a different password; close it and try again ({})",
                    EC_PORT, e
                ));
            }
            Err(_) => {
                return Err(format!(
                    "Another aMule/amuled is listening on port {} and did not answer the EC handshake; close it and try again",
                    EC_PORT
                ));
            }
        }
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

    // Store the PID and the child handle
    *state.sidecar_pid.lock().await = Some(pid);
    *state.sidecar_child.lock().await = Some(child);
    drop(lifecycle_guard);

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
                    // Clean up state only if it still belongs to this process
                    let state = handle_clone.state::<AppState>();
                    let mut pid_lock = state.sidecar_pid.lock().await;
                    if *pid_lock == Some(pid) {
                        *pid_lock = None;
                        drop(pid_lock);
                        *state.sidecar_child.lock().await = None;
                        *state.ec.lock().await = None;
                    } else {
                        log::info!("[amuled] Ignoring Terminated of stale PID {}", pid);
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

/// Gracefully stop the amuled daemon, waiting for it to persist its state.
pub async fn stop_amuled(handle: &AppHandle) {
    let state = handle.state::<AppState>();
    let _lifecycle_guard = state.lifecycle.lock().await;

    let pid = *state.sidecar_pid.lock().await;
    let child = state.sidecar_child.lock().await.take();

    // Step 1: Send EC shutdown command (graceful)
    let shutdown = async {
        let mut ec = state.ec.lock().await;
        if let Some(ref mut conn) = *ec {
            log::info!("Sending EC shutdown to amuled...");
            if let Err(e) = conn.shutdown().await {
                log::warn!("EC shutdown command failed: {}", e);
            }
        }
        *ec = None;
    };
    if tokio::time::timeout(Duration::from_secs(5), shutdown).await.is_err() {
        log::warn!("EC shutdown timed out");
        if let Ok(mut ec) = tokio::time::timeout(Duration::from_secs(1), state.ec.lock()).await {
            *ec = None;
        }
    }

    // Step 2: Wait for the process to exit on its own so it can save its files
    if let Some(p) = pid {
        let started = std::time::Instant::now();
        let mut exited = false;
        while started.elapsed() < Duration::from_secs(15) {
            let cleared = state.sidecar_pid.lock().await.is_none();
            if cleared || !is_pid_alive(p).await {
                exited = true;
                break;
            }
            tokio::time::sleep(Duration::from_millis(300)).await;
        }

        if exited {
            log::info!("amuled (PID {}) exited after {} ms", p, started.elapsed().as_millis());
        } else {
            log::warn!("amuled (PID {}) did not exit within 15 s, killing it", p);
            match child {
                Some(c) => {
                    if let Err(e) = c.kill() {
                        log::warn!("child.kill() failed: {}", e);
                        kill_pid(p).await;
                    }
                }
                None => kill_pid(p).await,
            }
        }
    }

    *state.sidecar_pid.lock().await = None;
    *state.sidecar_child.lock().await = None;

    log::info!("amuled stopped");
}
