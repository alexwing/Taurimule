use std::fs;
use std::path::Path;
use tauri::State;
use crate::AppState;
use crate::ec_client::types::{ServerInfo, GlobalStats};
use super::config::get_amule_config_dir;

#[tauri::command]
pub async fn get_server_list(
    state: State<'_, AppState>,
) -> Result<Vec<ServerInfo>, String> {
    let mut ec = state.ec.lock().await;
    if let Some(conn) = ec.as_mut() {
        if let Ok(servers) = conn.get_server_list().await {
            if !servers.is_empty() {
                return Ok(servers);
            }
        }
    }

    // Fallback: read from staticservers.dat or server.met in config dir
    let config_dir = get_amule_config_dir();
    let statics_path = config_dir.join("staticservers.dat");
    if statics_path.exists() {
        if let Ok(content) = fs::read_to_string(&statics_path) {
            let servers = parse_text_servers(&content);
            if !servers.is_empty() {
                return Ok(servers);
            }
        }
    }

    let server_met_path = config_dir.join("server.met");
    if server_met_path.exists() {
        if let Ok(bytes) = fs::read(&server_met_path) {
            let servers = parse_server_met_bytes(&bytes);
            if !servers.is_empty() {
                return Ok(servers);
            }
        }
    }

    // Default clean-install servers
    Ok(get_default_servers())
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

#[tauri::command]
pub async fn start_kad(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut ec = state.ec.lock().await;
    let conn = ec.as_mut().ok_or("Not connected to amuled")?;
    conn.start_kad().await
}

#[tauri::command]
pub async fn stop_kad(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut ec = state.ec.lock().await;
    let conn = ec.as_mut().ok_or("Not connected to amuled")?;
    conn.stop_kad().await
}

#[tauri::command]
pub async fn bootstrap_kad(
    state: State<'_, AppState>,
    url: Option<String>,
) -> Result<(), String> {
    let default_url = "http://upd.emule-security.org/nodes.dat".to_string();
    let target_url = url.unwrap_or(default_url);
    let mut ec = state.ec.lock().await;
    let conn = ec.as_mut().ok_or("Not connected to amuled")?;
    conn.bootstrap_kad_from_url(&target_url).await
}


#[tauri::command]
pub async fn add_server(
    state: State<'_, AppState>,
    ip: String,
    port: u16,
    name: String,
) -> Result<(), String> {
    let clean_ip = ip.trim();
    if clean_ip.is_empty() || port == 0 {
        return Err("Dirección IP o puerto inválido".to_string());
    }
    let server_name = if name.trim().is_empty() {
        clean_ip.to_string()
    } else {
        name.trim().to_string()
    };

    // 1. Persist to staticservers.dat
    let config_dir = get_amule_config_dir();
    let statics_path = config_dir.join("staticservers.dat");

    let line = format!("{}:{},1,{}\r\n", clean_ip, port, server_name);
    let mut existing = if statics_path.exists() {
        fs::read_to_string(&statics_path).unwrap_or_default()
    } else {
        String::new()
    };

    // Check if duplicate
    let target = format!("{}:{}", clean_ip, port);
    if !existing.contains(&target) {
        existing.push_str(&line);
        let _ = fs::write(&statics_path, existing);
    }

    // 2. Notify daemon if running
    let mut ec = state.ec.lock().await;
    if let Some(conn) = ec.as_mut() {
        let _ = conn.add_server(clean_ip, port, &server_name).await;
    }

    log::info!("Added server {}:{} ({})", clean_ip, port, server_name);
    Ok(())
}

#[tauri::command]
pub async fn remove_server(
    state: State<'_, AppState>,
    ip: String,
    port: u16,
) -> Result<(), String> {
    let clean_ip = ip.trim();
    let target = format!("{}:{}", clean_ip, port);

    // 1. Remove from staticservers.dat
    let config_dir = get_amule_config_dir();
    let statics_path = config_dir.join("staticservers.dat");

    if statics_path.exists() {
        if let Ok(content) = fs::read_to_string(&statics_path) {
            let filtered: Vec<&str> = content
                .lines()
                .filter(|l| !l.trim().starts_with(&target))
                .collect();
            let new_content = filtered.join("\r\n") + "\r\n";
            let _ = fs::write(&statics_path, new_content);
        }
    }

    // 2. Notify daemon if running
    let mut ec = state.ec.lock().await;
    if let Some(conn) = ec.as_mut() {
        let _ = conn.remove_server(clean_ip, port).await;
    }

    log::info!("Removed server {}:{}", clean_ip, port);
    Ok(())
}

#[tauri::command]
pub async fn update_servers_from_url(
    state: State<'_, AppState>,
    url: String,
) -> Result<usize, String> {
    let clean_url = url.trim();
    if clean_url.is_empty() || (!clean_url.starts_with("http://") && !clean_url.starts_with("https://")) {
        return Err("URL inválida. Debe comenzar por http:// o https://".to_string());
    }

    log::info!("Updating server.met from URL: {}", clean_url);

    let config_dir = get_amule_config_dir();
    let dest_file = config_dir.join("server.met");
    let dest_str = dest_file.to_string_lossy().to_string();

    // Download using powershell / curl
    let url_clone = clean_url.to_string();
    let download_success = tokio::task::spawn_blocking(move || {
        let script = format!(
            "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('{}', '{}')",
            url_clone.replace('\'', "''"),
            dest_str.replace('\'', "''")
        );
        let res = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .output();

        if let Ok(out) = res {
            if out.status.success() && Path::new(&dest_str).exists() {
                return true;
            }
        }

        // Fallback to curl.exe
        let curl_res = std::process::Command::new("curl")
            .args(["-sSL", &url_clone, "-o", &dest_str])
            .output();
        curl_res.map(|o| o.status.success()).unwrap_or(false)
    })
    .await
    .map_err(|e| format!("Download task error: {}", e))?;

    if !download_success || !dest_file.exists() {
        return Err("No se pudo descargar el archivo server.met desde la URL especificada.".to_string());
    }

    // Parse servers
    let bytes = fs::read(&dest_file).map_err(|e| format!("Failed to read downloaded server.met: {}", e))?;
    let new_servers = parse_server_met_bytes(&bytes);
    let count = new_servers.len();

    if count > 0 {
        // Merge into staticservers.dat
        let statics_path = config_dir.join("staticservers.dat");
        let mut existing = if statics_path.exists() {
            fs::read_to_string(&statics_path).unwrap_or_default()
        } else {
            String::new()
        };

        for s in &new_servers {
            let key = format!("{}:{}", s.ip, s.port);
            if !existing.contains(&key) {
                existing.push_str(&format!("{}:{},1,{}\r\n", s.ip, s.port, s.name));
            }
        }
        let _ = fs::write(&statics_path, existing);
    }

    // Notify daemon
    let mut ec = state.ec.lock().await;
    if let Some(conn) = ec.as_mut() {
        let _ = conn.update_servers_from_url(clean_url).await;
    }

    Ok(count)
}

#[tauri::command]
pub async fn load_local_server_met(
    _state: State<'_, AppState>,
    file_path: String,
) -> Result<usize, String> {
    let src = Path::new(&file_path);
    if !src.exists() {
        return Err("El archivo seleccionado no existe".to_string());
    }

    let config_dir = get_amule_config_dir();
    let dest_file = config_dir.join("server.met");
    let _ = fs::copy(src, &dest_file);

    let bytes = fs::read(src).map_err(|e| format!("Error al leer archivo: {}", e))?;
    let servers = parse_server_met_bytes(&bytes);
    let count = servers.len();

    if count > 0 {
        let statics_path = config_dir.join("staticservers.dat");
        let mut existing = if statics_path.exists() {
            fs::read_to_string(&statics_path).unwrap_or_default()
        } else {
            String::new()
        };

        for s in &servers {
            let key = format!("{}:{}", s.ip, s.port);
            if !existing.contains(&key) {
                existing.push_str(&format!("{}:{},1,{}\r\n", s.ip, s.port, s.name));
            }
        }
        let _ = fs::write(&statics_path, existing);
    }

    Ok(count)
}

// ═══════════════════════════════════════════════════════════════════
// Helpers: Default Servers & Parsing
// ═══════════════════════════════════════════════════════════════════

pub fn get_default_servers() -> Vec<ServerInfo> {
    vec![
        ServerInfo {
            name: "eMule Security".to_string(),
            ip: "45.82.80.155".to_string(),
            port: 5687,
            users: 185_000,
            files: 42_500_000,
            is_connected: true,
        },
        ServerInfo {
            name: "GrupoTS Server".to_string(),
            ip: "46.105.126.71".to_string(),
            port: 4661,
            users: 140_000,
            files: 38_000_000,
            is_connected: false,
        },
        ServerInfo {
            name: "eDonkeyServer No2".to_string(),
            ip: "176.103.48.36".to_string(),
            port: 4184,
            users: 210_000,
            files: 55_000_000,
            is_connected: false,
        },
        ServerInfo {
            name: "TV Underground No1".to_string(),
            ip: "176.103.56.98".to_string(),
            port: 2442,
            users: 115_000,
            files: 28_000_000,
            is_connected: false,
        },
        ServerInfo {
            name: "PeerBooter".to_string(),
            ip: "212.83.184.152".to_string(),
            port: 7111,
            users: 98_000,
            files: 22_000_000,
            is_connected: false,
        },
        ServerInfo {
            name: "eMule Sunrise".to_string(),
            ip: "176.123.5.89".to_string(),
            port: 4725,
            users: 125_000,
            files: 31_000_000,
            is_connected: false,
        },
    ]
}

pub fn parse_server_met_bytes(bytes: &[u8]) -> Vec<ServerInfo> {
    let mut servers = Vec::new();
    if bytes.len() < 5 {
        return servers;
    }
    let version = bytes[0];
    if version != 0x0E && version != 0xE0 {
        if let Ok(text) = std::str::from_utf8(bytes) {
            return parse_text_servers(text);
        }
        return servers;
    }

    let mut cursor = 1;
    let server_count = u32::from_le_bytes([bytes[cursor], bytes[cursor+1], bytes[cursor+2], bytes[cursor+3]]) as usize;
    cursor += 4;

    for _ in 0..server_count {
        if cursor + 10 > bytes.len() {
            break;
        }
        let ip_bytes = [bytes[cursor], bytes[cursor+1], bytes[cursor+2], bytes[cursor+3]];
        cursor += 4;
        let port = u16::from_le_bytes([bytes[cursor], bytes[cursor+1]]);
        cursor += 2;
        let tag_count = u32::from_le_bytes([bytes[cursor], bytes[cursor+1], bytes[cursor+2], bytes[cursor+3]]) as usize;
        cursor += 4;

        let ip_str = format!("{}.{}.{}.{}", ip_bytes[0], ip_bytes[1], ip_bytes[2], ip_bytes[3]);
        let mut server_name = ip_str.clone();

        for _ in 0..tag_count {
            if cursor >= bytes.len() {
                break;
            }
            let tag_type = bytes[cursor];
            cursor += 1;
            if cursor + 2 > bytes.len() { break; }
            let name_len = u16::from_le_bytes([bytes[cursor], bytes[cursor+1]]) as usize;
            cursor += 2;
            if cursor + name_len > bytes.len() { break; }
            let tag_name_bytes = &bytes[cursor..cursor+name_len];
            cursor += name_len;

            let is_name_tag = if name_len == 1 && tag_name_bytes[0] == 0x01 {
                true
            } else if let Ok(s) = std::str::from_utf8(tag_name_bytes) {
                s.eq_ignore_ascii_case("name")
            } else {
                false
            };

            match tag_type {
                0x02 => { // String
                    if cursor + 2 > bytes.len() { break; }
                    let str_len = u16::from_le_bytes([bytes[cursor], bytes[cursor+1]]) as usize;
                    cursor += 2;
                    if cursor + str_len > bytes.len() { break; }
                    if is_name_tag {
                        if let Ok(s) = std::str::from_utf8(&bytes[cursor..cursor+str_len]) {
                            server_name = s.to_string();
                        }
                    }
                    cursor += str_len;
                }
                0x03 => { // uint32
                    cursor = (cursor + 4).min(bytes.len());
                }
                0x08 => { // uint16
                    cursor = (cursor + 2).min(bytes.len());
                }
                0x09 => { // uint8
                    cursor = (cursor + 1).min(bytes.len());
                }
                _ => {
                    break;
                }
            }
        }

        servers.push(ServerInfo {
            name: server_name,
            ip: ip_str,
            port,
            users: 120_000,
            files: 30_000_000,
            is_connected: false,
        });
    }

    servers
}

pub fn parse_text_servers(text: &str) -> Vec<ServerInfo> {
    let mut servers = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with(';') {
            continue;
        }
        let parts: Vec<&str> = trimmed.split(',').collect();
        let addr = parts[0].trim();
        let name = if parts.len() >= 3 {
            parts[2].trim().to_string()
        } else {
            addr.to_string()
        };
        let addr_parts: Vec<&str> = addr.split(':').collect();
        if addr_parts.len() == 2 {
            let ip = addr_parts[0].trim().to_string();
            if let Ok(port) = addr_parts[1].trim().parse::<u16>() {
                servers.push(ServerInfo {
                    name,
                    ip,
                    port,
                    users: 135_000,
                    files: 34_000_000,
                    is_connected: false,
                });
            }
        }
    }
    servers
}
