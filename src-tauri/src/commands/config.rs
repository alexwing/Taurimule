//! Configuration & Import Commands for TauriMule
//!
//! Manages loading and saving amule.conf, dynamic directories (Incoming/Temp),
//! native folder selection dialogs, and importing configuration/servers from
//! existing eMule or aMule installations.

use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub nick: String,
    pub incoming_dir: String,
    pub temp_dir: String,
    pub port: u16,
    pub udp_port: u16,
    pub max_upload: u32,
    pub max_download: u32,
    pub connect_ed2k: bool,
    pub connect_kad: bool,
    pub auto_connect: bool,
    pub config_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub success: bool,
    pub message: String,
    pub servers_count: usize,
    pub incoming_dir: Option<String>,
    pub temp_dir: Option<String>,
}

/// Locate the aMule configuration directory (%APPDATA%\aMule on Windows)
pub fn get_amule_config_dir() -> PathBuf {
    if let Ok(appdata) = std::env::var("APPDATA") {
        let p = PathBuf::from(appdata).join("aMule");
        let _ = fs::create_dir_all(&p);
        p
    } else if let Ok(userprofile) = std::env::var("USERPROFILE") {
        let p = PathBuf::from(userprofile).join(".aMule");
        let _ = fs::create_dir_all(&p);
        p
    } else {
        let p = PathBuf::from("./config");
        let _ = fs::create_dir_all(&p);
        p
    }
}

/// Default Incoming folder: %USERPROFILE%\Downloads\TauriMule\Incoming
pub fn get_default_incoming_dir() -> PathBuf {
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        PathBuf::from(userprofile).join("Downloads").join("TauriMule").join("Incoming")
    } else {
        PathBuf::from("./Downloads/Incoming")
    }
}

/// Default Temp folder: %USERPROFILE%\Downloads\TauriMule\Temp
pub fn get_default_temp_dir() -> PathBuf {
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        PathBuf::from(userprofile).join("Downloads").join("TauriMule").join("Temp")
    } else {
        PathBuf::from("./Downloads/Temp")
    }
}

/// Parse amule.conf ini-style key/value pairs
pub fn parse_ini_file(path: &Path) -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    if let Ok(content) = fs::read_to_string(path) {
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with('#') || trimmed.starts_with(';') || trimmed.starts_with('[') {
                continue;
            }
            if let Some(eq_idx) = trimmed.find('=') {
                let key = trimmed[..eq_idx].trim().to_string();
                let val = trimmed[eq_idx + 1..].trim().to_string();
                map.insert(key, val);
            }
        }
    }
    map
}

/// Load configuration or generate standard clean install defaults
#[tauri::command]
pub fn get_config() -> Result<AppConfig, String> {
    let config_dir = get_amule_config_dir();
    let conf_path = config_dir.join("amule.conf");

    let default_incoming = get_default_incoming_dir();
    let default_temp = get_default_temp_dir();

    if !conf_path.exists() {
        // First launch on clean machine: ensure folders exist and write amule.conf
        let _ = fs::create_dir_all(&default_incoming);
        let _ = fs::create_dir_all(&default_temp);

        let default_config = AppConfig {
            nick: "TauriMule_User".to_string(),
            incoming_dir: default_incoming.to_string_lossy().to_string(),
            temp_dir: default_temp.to_string_lossy().to_string(),
            port: 4662,
            udp_port: 4672,
            max_upload: 100,
            max_download: 0,
            connect_ed2k: true,
            connect_kad: true,
            auto_connect: true,
            config_dir: config_dir.to_string_lossy().to_string(),
        };

        let _ = save_config(default_config.clone());
        return Ok(default_config);
    }

    let ini = parse_ini_file(&conf_path);

    let nick = ini.get("Nick").cloned().unwrap_or_else(|| "TauriMule_User".to_string());
    let incoming_dir = ini
        .get("IncomingDir")
        .cloned()
        .unwrap_or_else(|| default_incoming.to_string_lossy().to_string());
    let temp_dir = ini
        .get("TempDir")
        .cloned()
        .unwrap_or_else(|| default_temp.to_string_lossy().to_string());
    let port = ini.get("Port").and_then(|v| v.parse().ok()).unwrap_or(4662);
    let udp_port = ini.get("UDPPort").and_then(|v| v.parse().ok()).unwrap_or(4672);
    let max_upload = ini.get("MaxUpload").and_then(|v| v.parse().ok()).unwrap_or(100);
    let max_download = ini.get("MaxDownload").and_then(|v| v.parse().ok()).unwrap_or(0);
    let connect_ed2k = ini.get("ConnectToED2K").map(|v| v == "1").unwrap_or(true);
    let connect_kad = ini.get("ConnectToKad").map(|v| v == "1").unwrap_or(true);
    let auto_connect = ini.get("AutoConnect").map(|v| v == "1").unwrap_or(true);

    Ok(AppConfig {
        nick,
        incoming_dir,
        temp_dir,
        port,
        udp_port,
        max_upload,
        max_download,
        connect_ed2k,
        connect_kad,
        auto_connect,
        config_dir: config_dir.to_string_lossy().to_string(),
    })
}

/// Save user configuration to amule.conf
#[tauri::command]
pub fn save_config(config: AppConfig) -> Result<(), String> {
    let config_dir = get_amule_config_dir();
    let conf_path = config_dir.join("amule.conf");

    // Ensure incoming & temp directories exist on disk
    let inc_path = PathBuf::from(&config.incoming_dir);
    let temp_path = PathBuf::from(&config.temp_dir);
    let _ = fs::create_dir_all(&inc_path);
    let _ = fs::create_dir_all(&temp_path);

    let content = format!(
r#"# aMule configuration file generated by TauriMule
[eMule]
AppVersion=0.70b
Nick={nick}
QueueSize=50
MaxUpload={max_up}
MaxDownload={max_down}
Port={port}
UDPPort={udp_port}
UDPDisable=0
IncomingDir={incoming}
TempDir={temp}
ConnectToKad={connect_kad}
ConnectToED2K={connect_ed2k}
AutoConnect={auto_connect}
Reconnect=1
MaxSourcesPerFile=400
MaxConnections=500
ServerKeepAliveTimeout=0
SmartIdCheck=1
FilterBadIPs=1
UseCreditSystem=1
SecureIdent=1
AllocateFullFile=0
AddNewFilesPaused=0

[ExternalConnect]
AcceptExternalConnections=1
ECAddress=127.0.0.1
ECPort=4712
ECPassword=5f4dcc3b5aa765d61d8327deb882cf99
RequireEncryption=0
AuthFailureWindowSeconds=60
AuthFailureThreshold=10
AuthLockoutSeconds=300

[WebServer]
Enabled=0

[AmuleApi]
Enabled=0
"#,
        nick = config.nick.trim(),
        max_up = config.max_upload,
        max_down = config.max_download,
        port = config.port,
        udp_port = config.udp_port,
        incoming = config.incoming_dir.trim(),
        temp = config.temp_dir.trim(),
        connect_kad = if config.connect_kad { 1 } else { 0 },
        connect_ed2k = if config.connect_ed2k { 1 } else { 0 },
        auto_connect = if config.auto_connect { 1 } else { 0 },
    );

    fs::write(&conf_path, content)
        .map_err(|e| format!("Failed to write amule.conf: {}", e))?;

    log::info!("Saved amule.conf successfully to {:?}", conf_path);
    Ok(())
}

/// Import configuration, servers, and preferences from eMule
#[tauri::command]
pub fn import_from_emule(custom_path: Option<String>) -> Result<ImportResult, String> {
    let mut candidate_paths = Vec::new();

    if let Some(cp) = custom_path.filter(|p| !p.trim().is_empty()) {
        candidate_paths.push(PathBuf::from(cp));
    }

    if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
        candidate_paths.push(PathBuf::from(&local_appdata).join("eMule").join("config"));
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        candidate_paths.push(PathBuf::from(&appdata).join("eMule").join("config"));
    }
    candidate_paths.push(PathBuf::from(r"C:\Program Files (x86)\eMule\config"));
    candidate_paths.push(PathBuf::from(r"C:\Program Files\eMule\config"));

    let mut found_dir: Option<PathBuf> = None;
    for p in &candidate_paths {
        if p.join("preferences.ini").exists() || p.join("server.met").exists() || p.join("staticservers.dat").exists() {
            found_dir = Some(p.clone());
            break;
        }
    }

    let src_dir = match found_dir {
        Some(d) => d,
        None => {
            return Ok(ImportResult {
                success: false,
                message: "No se encontró ninguna instalación de eMule en las rutas habituales. Puede indicar la carpeta 'config' manualmente.".to_string(),
                servers_count: 0,
                incoming_dir: None,
                temp_dir: None,
            });
        }
    };

    let dest_dir = get_amule_config_dir();
    let _ = fs::create_dir_all(&dest_dir);

    // 1. Copy binary files
    let binary_files = [
        "server.met",
        "nodes.dat",
        "cryptkey.dat",
        "preferences.dat",
        "clients.met",
        "known.met",
        "known2_64.met",
        "staticservers.dat",
        "shareddir.dat",
        "sharedfiles.dat",
        "Category.ini",
    ];

    let mut copied_count = 0;
    for f in &binary_files {
        let src_file = src_dir.join(f);
        if src_file.exists() {
            let dest_file = dest_dir.join(f);
            if fs::copy(&src_file, &dest_file).is_ok() {
                copied_count += 1;
            }
        }
    }

    // 2. Parse preferences.ini
    let pref_ini = src_dir.join("preferences.ini");
    let mut inc_dir: Option<String> = None;
    let mut tmp_dir: Option<String> = None;

    if pref_ini.exists() {
        let props = parse_ini_file(&pref_ini);
        let nick = props.get("Nick").cloned().unwrap_or_else(|| "TauriMule".to_string());
        let port = props.get("Port").and_then(|v| v.parse().ok()).unwrap_or(19644);
        let udp_port = props.get("UDPPort").and_then(|v| v.parse().ok()).unwrap_or(6591);
        let max_up = props.get("MaxUpload").and_then(|v| v.parse().ok()).unwrap_or(800);
        let max_down = props.get("MaxDownload").and_then(|v| v.parse().ok()).unwrap_or(800);
        let incoming = props.get("IncomingDir").cloned().unwrap_or_else(|| get_default_incoming_dir().to_string_lossy().to_string());
        let temp = props.get("TempDir").cloned().unwrap_or_else(|| get_default_temp_dir().to_string_lossy().to_string());

        inc_dir = Some(incoming.clone());
        tmp_dir = Some(temp.clone());

        let _ = save_config(AppConfig {
            nick,
            incoming_dir: incoming,
            temp_dir: temp,
            port,
            udp_port,
            max_upload: max_up,
            max_download: max_down,
            connect_ed2k: true,
            connect_kad: true,
            auto_connect: true,
            config_dir: dest_dir.to_string_lossy().to_string(),
        });
    }

    // Count servers in staticservers.dat or server.met
    let servers_count = count_servers_in_dir(&dest_dir);

    Ok(ImportResult {
        success: true,
        message: format!(
            "Configuración de eMule importada con éxito desde '{:?}'. Se copiaron {} archivos de configuración y {} servidores.",
            src_dir, copied_count, servers_count
        ),
        servers_count,
        incoming_dir: inc_dir,
        temp_dir: tmp_dir,
    })
}

/// Import configuration and data from an existing aMule directory
#[tauri::command]
pub fn import_from_amule(custom_path: Option<String>) -> Result<ImportResult, String> {
    let mut candidate_paths = Vec::new();

    if let Some(cp) = custom_path.filter(|p| !p.trim().is_empty()) {
        candidate_paths.push(PathBuf::from(cp));
    }

    if let Ok(appdata) = std::env::var("APPDATA") {
        candidate_paths.push(PathBuf::from(&appdata).join("aMule"));
    }
    if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
        candidate_paths.push(PathBuf::from(&local_appdata).join("aMule"));
    }
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        candidate_paths.push(PathBuf::from(&userprofile).join(".aMule"));
    }

    let mut found_dir: Option<PathBuf> = None;
    for p in &candidate_paths {
        if p.join("amule.conf").exists() || p.join("server.met").exists() || p.join("staticservers.dat").exists() {
            found_dir = Some(p.clone());
            break;
        }
    }

    let src_dir = match found_dir {
        Some(d) => d,
        None => {
            return Ok(ImportResult {
                success: false,
                message: "No se encontró ningún directorio previo de aMule. Puede seleccionar la ruta de la carpeta manualmente.".to_string(),
                servers_count: 0,
                incoming_dir: None,
                temp_dir: None,
            });
        }
    };

    let dest_dir = get_amule_config_dir();
    let is_same_dir = src_dir.canonicalize().ok() == dest_dir.canonicalize().ok();

    if !is_same_dir {
        // Copy files over
        let amule_files = [
            "amule.conf",
            "server.met",
            "nodes.dat",
            "cryptkey.dat",
            "preferences.dat",
            "clients.met",
            "known.met",
            "known2_64.met",
            "staticservers.dat",
            "shareddir.dat",
            "sharedfiles.dat",
            "Category.ini",
        ];
        for f in &amule_files {
            let s = src_dir.join(f);
            if s.exists() {
                let _ = fs::copy(&s, dest_dir.join(f));
            }
        }
    }

    let current_conf = get_config()?;
    let servers_count = count_servers_in_dir(&dest_dir);

    Ok(ImportResult {
        success: true,
        message: format!(
            "Configuración de aMule cargada exitosamente desde '{:?}'. Detectados {} servidores.",
            src_dir, servers_count
        ),
        servers_count,
        incoming_dir: Some(current_conf.incoming_dir),
        temp_dir: Some(current_conf.temp_dir),
    })
}

/// Helper to count servers in a directory
fn count_servers_in_dir(dir: &Path) -> usize {
    let statics = dir.join("staticservers.dat");
    if statics.exists() {
        if let Ok(c) = fs::read_to_string(&statics) {
            let count = c.lines().filter(|l| !l.trim().is_empty() && !l.trim().starts_with('#')).count();
            if count > 0 {
                return count;
            }
        }
    }
    let server_met = dir.join("server.met");
    if server_met.exists() {
        if let Ok(bytes) = fs::read(&server_met) {
            if bytes.len() >= 5 && (bytes[0] == 0x0E || bytes[0] == 0xE0) {
                let count = u32::from_le_bytes([bytes[1], bytes[2], bytes[3], bytes[4]]) as usize;
                return count;
            }
        }
    }
    0
}

/// Open native Windows folder picker dialog
#[tauri::command]
pub async fn pick_folder(title: String, initial_path: Option<String>) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || {
        let script = format!(
            r#"
Add-Type -AssemblyName System.Windows.Forms
$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = '{desc}'
{init_dir}
$f.ShowNewFolderButton = $true
if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{
    Write-Output $f.SelectedPath
}}
"#,
            desc = title.replace('\'', "''"),
            init_dir = initial_path
                .filter(|p| !p.trim().is_empty())
                .map(|p| format!("$f.SelectedPath = '{}'", p.replace('\'', "''")))
                .unwrap_or_default(),
        );

        let output = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .output();

        match output {
            Ok(out) => {
                let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if path.is_empty() {
                    Ok(None)
                } else {
                    Ok(Some(path))
                }
            }
            Err(e) => Err(format!("Failed to open folder picker: {}", e)),
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Open folder in Windows Explorer
#[tauri::command]
pub fn open_folder(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let _ = fs::create_dir_all(&p);
    open::that(&p).map_err(|e| format!("Failed to open folder: {}", e))
}
