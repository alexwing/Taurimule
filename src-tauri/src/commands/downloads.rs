use std::path::{Path, PathBuf};
use tauri::State;
use crate::AppState;
use crate::ec_client::types::DownloadInfo;

/// Returns the download queue exactly as reported by the daemon (single source of truth).
/// No disk lookups and no name rewriting happen here.
#[tauri::command]
pub async fn get_download_queue(
    state: State<'_, AppState>,
) -> Result<Vec<DownloadInfo>, String> {
    crate::ec_call!(state.ec, |c| c.get_download_queue())
}

/// Returns the last snapshot produced by the backend poller (for initial UI load).
#[tauri::command]
pub fn get_snapshot(state: State<'_, AppState>) -> crate::Snapshot {
    state.snapshot.lock().map(|s| s.clone()).unwrap_or_default()
}

#[tauri::command]
pub async fn download_file(
    state: State<'_, AppState>,
    hash: String,
) -> Result<(), String> {
    crate::ec_call!(state.ec, |c| c.download_search_result(&hash))
}

pub struct ParsedEd2kLink {
    pub name: String,
    pub size: u64,
    pub hash: String,
}

pub fn normalize_ed2k_link(raw: &str) -> Option<String> {
    let trimmed = raw.trim().trim_matches('"').trim_matches('\'').trim();
    // First, decode URL percent-encoding (e.g. %7C -> |, %C3%A9 -> é, %20 -> ' ', etc.)
    let decoded = url_decode(trimmed);
    let prefix = "ed2k://|file|";
    let start_idx = decoded.find(prefix)? + prefix.len();
    let rest = &decoded[start_idx..];
    let parts: Vec<&str> = rest.split('|').collect();
    if parts.len() >= 3 {
        let name = parts[0].trim();
        let size: u64 = parts[1].trim().parse().ok()?;
        let hash = parts[2].trim().to_uppercase();
        if hash.len() == 32 && hash.chars().all(|c| c.is_ascii_hexdigit()) {
            let extra = if parts.len() > 3 {
                let remainder = parts[3..].join("|");
                let clean_rem = remainder.trim_end_matches('/').trim_end_matches('|');
                if clean_rem.is_empty() {
                    String::new()
                } else {
                    format!("|{}", clean_rem)
                }
            } else {
                String::new()
            };
            return Some(format!("ed2k://|file|{}|{}|{}{}|/", name, size, hash, extra));
        }
    }
    None
}

pub fn parse_ed2k_link(link: &str) -> Option<ParsedEd2kLink> {
    let normalized = normalize_ed2k_link(link)?;
    let prefix = "ed2k://|file|";
    let start_idx = normalized.find(prefix)? + prefix.len();
    let rest = &normalized[start_idx..];
    let parts: Vec<&str> = rest.split('|').collect();
    if parts.len() >= 3 {
        let name = parts[0].to_string();
        let size: u64 = parts[1].parse().ok()?;
        let hash = parts[2].to_uppercase();
        return Some(ParsedEd2kLink { name, size, hash });
    }
    None
}

fn pending_info(parsed: ParsedEd2kLink) -> DownloadInfo {
    DownloadInfo {
        hash: parsed.hash,
        name: parsed.name,
        size_total: parsed.size,
        size_done: 0,
        progress: 0.0,
        speed: 0.0,
        sources_total: 0,
        sources_transferring: 0,
        priority: "Normal".to_string(),
        status: "Waiting".to_string(),
        eta_seconds: None,
    }
}

#[derive(serde::Deserialize, serde::Serialize, Clone, Debug)]
pub struct AddEd2kItem {
    pub link: String,
}

#[tauri::command]
pub async fn add_ed2k_links(
    state: State<'_, AppState>,
    items: Vec<AddEd2kItem>,
) -> Result<Vec<DownloadInfo>, String> {
    log::info!("Adding {} eD2k links in batch", items.len());
    let mut results = Vec::new();
    let mut last_err: Option<String> = None;

    for item in items {
        if let Some(normalized) = normalize_ed2k_link(&item.link) {
            if let Some(parsed) = parse_ed2k_link(&normalized) {
                // If already completed on disk, return as Complete info
                if let Some(existing_file) = resolve_download_file(&parsed.name, Some(&parsed.hash), None) {
                    if let Ok(meta) = existing_file.metadata() {
                        if meta.len() == parsed.size {
                            log::info!("Batch item already completed on disk: {:?}", existing_file);
                            results.push(DownloadInfo {
                                hash: parsed.hash,
                                name: parsed.name,
                                size_total: parsed.size,
                                size_done: parsed.size,
                                progress: 1.0,
                                speed: 0.0,
                                sources_total: 0,
                                sources_transferring: 0,
                                priority: "Normal".to_string(),
                                status: "Complete".to_string(),
                                eta_seconds: None,
                            });
                            continue;
                        }
                    }
                }

                match crate::ec_call!(state.ec, |c| c.add_ed2k_link(&normalized)) {
                    Ok(()) => results.push(pending_info(parsed)),
                    Err(e) => last_err = Some(e),
                }
            }
        }
    }

    if results.is_empty() {
        if let Some(e) = last_err {
            return Err(e);
        }
    }
    Ok(results)
}

#[tauri::command]
pub async fn add_ed2k_link(
    state: State<'_, AppState>,
    link: String,
) -> Result<DownloadInfo, String> {
    log::info!("Adding eD2k link: {}", link);

    let lines: Vec<&str> = link
        .lines()
        .map(|l| l.trim())
        .filter(|l| l.contains("ed2k://"))
        .collect();
    if lines.len() > 1 {
        let items: Vec<AddEd2kItem> = lines
            .into_iter()
            .map(|l| AddEd2kItem { link: l.to_string() })
            .collect();
        let list = add_ed2k_links(state, items).await?;
        return list.into_iter().next().ok_or_else(|| "No se pudo añadir ningún enlace".to_string());
    }

    let normalized = normalize_ed2k_link(&link).ok_or_else(|| {
        "El enlace eD2k no tiene un formato válido. Formato esperado: ed2k://|file|nombre|tamaño|hash|/".to_string()
    })?;
    let parsed = parse_ed2k_link(&normalized).unwrap();

    // Check if the file is ALREADY completed on disk in Incoming directory
    if let Some(existing_file) = resolve_download_file(&parsed.name, Some(&parsed.hash), None) {
        if let Ok(meta) = existing_file.metadata() {
            if meta.len() == parsed.size {
                log::info!("File already completed on disk: {:?}", existing_file);
                return Err(format!(
                    "ALREADY_COMPLETED|{}|{}",
                    parsed.name,
                    existing_file.display()
                ));
            }
        }
    }

    // Check if the file is ALREADY in the active download queue
    if let Ok(snap) = state.snapshot.lock() {
        if snap.downloads.iter().any(|d| d.hash.eq_ignore_ascii_case(&parsed.hash)) {
            return Err(format!("ALREADY_QUEUED|{}", parsed.name));
        }
    }

    crate::ec_call!(state.ec, |c| c.add_ed2k_link(&normalized))?;
    Ok(pending_info(parsed))
}

#[tauri::command]
pub async fn pause_download(state: State<'_, AppState>, hash: String) -> Result<(), String> {
    crate::ec_call!(state.ec, |c| c.pause_download(&hash))
}

#[tauri::command]
pub async fn resume_download(state: State<'_, AppState>, hash: String) -> Result<(), String> {
    crate::ec_call!(state.ec, |c| c.resume_download(&hash))
}

#[tauri::command]
pub async fn delete_download(state: State<'_, AppState>, hash: String) -> Result<(), String> {
    crate::ec_call!(state.ec, |c| c.delete_download(&hash))
}

#[tauri::command]
pub async fn set_download_priority(
    state: State<'_, AppState>,
    hash: String,
    priority: u8,
) -> Result<(), String> {
    crate::ec_call!(state.ec, |c| c.set_download_priority(&hash, priority))
}

#[tauri::command]
pub async fn request_more_sources(state: State<'_, AppState>, hash: String) -> Result<(), String> {
    crate::ec_call!(state.ec, |c| c.request_more_sources(&hash))
}

// ═══════════════════════════════════════════════════════════════════
// Helper: Resolve download location on disk
// ═══════════════════════════════════════════════════════════════════

pub fn url_decode(s: &str) -> String {
    let mut result = Vec::new();
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                result.push(b);
                i += 3;
                continue;
            }
        }
        result.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&result).to_string()
}

fn normalize_for_search(s: &str) -> String {
    let lower = s.to_lowercase();
    let without_ext = lower
        .strip_suffix(".mkv")
        .or_else(|| lower.strip_suffix(".avi"))
        .or_else(|| lower.strip_suffix(".mp4"))
        .or_else(|| lower.strip_suffix(".wmv"))
        .or_else(|| lower.strip_suffix(".m4v"))
        .or_else(|| lower.strip_suffix(".part"))
        .unwrap_or(&lower);

    let mut cleaned = String::new();
    for c in without_ext.chars() {
        if c == '.' || c == '_' || c == '-' || c == '+' || c == '(' || c == ')' || c == '[' || c == ']' {
            cleaned.push(' ');
        } else {
            cleaned.push(c);
        }
    }
    cleaned.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn resolve_download_file(name: &str, hash: Option<&str>, path: Option<&str>) -> Option<PathBuf> {
    if let Some(custom) = path.filter(|p| !p.is_empty()) {
        let p = PathBuf::from(custom);
        if p.exists() {
            return Some(p);
        }
    }

    let decoded_name = url_decode(name);
    let mut search_dirs = Vec::new();

    // 1. From active configuration (amule.conf)
    if let Ok(config) = super::config::get_config() {
        let inc = PathBuf::from(&config.incoming_dir);
        if inc.exists() {
            search_dirs.push(inc);
        }
        let tmp = PathBuf::from(&config.temp_dir);
        if tmp.exists() {
            search_dirs.push(tmp);
        }
    }

    // 2. Standard user downloads directories
    let def_inc = super::config::get_default_incoming_dir();
    if def_inc.exists() && !search_dirs.contains(&def_inc) {
        search_dirs.push(def_inc);
    }
    let def_tmp = super::config::get_default_temp_dir();
    if def_tmp.exists() && !search_dirs.contains(&def_tmp) {
        search_dirs.push(def_tmp);
    }

    // 3. Fallbacks for eMule / legacy paths if they exist
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        let emule_inc = PathBuf::from(&userprofile).join("Downloads").join("eMule").join("Incoming");
        if emule_inc.exists() && !search_dirs.contains(&emule_inc) {
            search_dirs.push(emule_inc);
        }
        let emule_tmp = PathBuf::from(&userprofile).join("Downloads").join("eMule").join("Temp");
        if emule_tmp.exists() && !search_dirs.contains(&emule_tmp) {
            search_dirs.push(emule_tmp);
        }
    }
    let legacy_backup = PathBuf::from(r"D:\Backup\Pendiente");
    if legacy_backup.exists() && !search_dirs.contains(&legacy_backup) {
        search_dirs.push(legacy_backup);
    }

    let norm_query = normalize_for_search(&decoded_name);
    let query_words: Vec<&str> = norm_query.split_whitespace().filter(|w| w.len() >= 3).collect();

    for dir in &search_dirs {
        if !dir.exists() {
            continue;
        }

        // 1. Direct file check with original and decoded name
        for candidate_name in &[name, decoded_name.as_str()] {
            let direct = dir.join(candidate_name);
            if direct.exists() && direct.is_file() {
                return Some(direct);
            }

            // Direct check with common extensions
            for ext in &[".mkv", ".avi", ".mp4", ".wmv", ".m4v"] {
                let with_ext = dir.join(format!("{}{}", candidate_name, ext));
                if with_ext.exists() && with_ext.is_file() {
                    return Some(with_ext);
                }
            }
        }

        // 2. Scan directory (and 1 level of subdirectories)
        let mut candidates: Vec<PathBuf> = Vec::new();
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file() {
                    candidates.push(p);
                } else if p.is_dir() {
                    if let Ok(sub_entries) = std::fs::read_dir(&p) {
                        for sub in sub_entries.flatten() {
                            let sub_p = sub.path();
                            if sub_p.is_file() {
                                candidates.push(sub_p);
                            }
                        }
                    }
                }
            }
        }

        // 3. Exact case-insensitive match (both with original and decoded name)
        for p in &candidates {
            if let Some(fname) = p.file_name().and_then(|f| f.to_str()) {
                if fname.eq_ignore_ascii_case(name) || fname.eq_ignore_ascii_case(&decoded_name) {
                    return Some(p.clone());
                }
            }
        }

        // 4. Try hash match if provided
        if let Some(target_hash) = hash.filter(|h| !h.is_empty()) {
            for p in &candidates {
                if let Some(fname) = p.file_name().and_then(|f| f.to_str()) {
                    let mut calc_hash = [0u8; 16];
                    for (i, b) in fname.bytes().enumerate() {
                        calc_hash[i % 16] = calc_hash[i % 16].wrapping_add(b);
                    }
                    let hex: String = calc_hash.iter().map(|b| format!("{:02X}", b)).collect();
                    if hex.eq_ignore_ascii_case(target_hash) {
                        return Some(p.clone());
                    }
                }
            }
        }

        // 5. Try normalized match (comparing without extensions and special chars)
        if !norm_query.is_empty() {
            for p in &candidates {
                if let Some(fname) = p.file_name().and_then(|f| f.to_str()) {
                    let norm_cand = normalize_for_search(fname);
                    if norm_cand == norm_query
                        || norm_cand.starts_with(&norm_query)
                        || norm_query.starts_with(&norm_cand)
                        || norm_cand.contains(&norm_query)
                        || norm_query.contains(&norm_cand)
                    {
                        return Some(p.clone());
                    }
                }
            }
        }

        // 6. Word-based fuzzy match: if all significant words (length >= 3) match
        if query_words.len() >= 2 {
            for p in &candidates {
                if let Some(fname) = p.file_name().and_then(|f| f.to_str()) {
                    let cand_lower = fname.to_lowercase();
                    if query_words.iter().all(|w| cand_lower.contains(w)) {
                        return Some(p.clone());
                    }
                }
            }
        }
    }

    None
}

// ═══════════════════════════════════════════════════════════════════
// Shell Launcher (Uses open crate / ShellExecuteW for default media player)
// ═══════════════════════════════════════════════════════════════════

#[cfg(windows)]
fn open_with_default_app(target: &Path) -> Result<(), String> {
    let path_str = target.to_string_lossy().to_string();
    log::info!("Opening video file with default system player: {}", path_str);

    // 1. Native Win32 ShellExecute via open crate (shellexecute-on-windows)
    if open::that(target).is_ok() {
        log::info!("open::that succeeded for {}", path_str);
        return Ok(());
    }

    // 2. Direct spawn of PotPlayer 64-bit if installed
    let potplayer_path = Path::new(r"C:\Program Files\DAUM\PotPlayer\PotPlayerMini64.exe");
    if potplayer_path.exists() {
        if std::process::Command::new(potplayer_path).arg(target).spawn().is_ok() {
            log::info!("PotPlayerMini64 spawned directly for {}", path_str);
            return Ok(());
        }
    }

    // 3. Fallback to cmd /C start "" "<path>"
    let cmd_res = std::process::Command::new("cmd")
        .args(["/C", "start", "", &path_str])
        .spawn();

    if let Err(e) = cmd_res {
        return Err(format!("Error abriendo archivo '{}': {}", path_str, e));
    }

    Ok(())
}

#[tauri::command]
pub fn launch_file(
    name: String,
    hash: Option<String>,
    path: Option<String>,
) -> Result<(), String> {
    log::info!("launch_file invoked with name: '{}', hash: {:?}", name, hash);

    #[cfg(windows)]
    {
        if let Some(target) = resolve_download_file(&name, hash.as_deref(), path.as_deref()) {
            log::info!("Found target file on disk: {:?}", target);
            open_with_default_app(&target)
        } else {
            log::warn!("File '{}' not found on disk in any monitored directory", name);
            Err(format!(
                "El archivo '{}' no se encuentra en el disco todavía. Puede que aún esté descargándose.",
                name
            ))
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (name, hash, path);
        Err("Unsupported on this OS".into())
    }
}

#[tauri::command]
pub fn open_downloads_folder() -> Result<(), String> {
    let folder = if let Ok(config) = super::config::get_config() {
        PathBuf::from(config.incoming_dir)
    } else {
        super::config::get_default_incoming_dir()
    };
    let _ = std::fs::create_dir_all(&folder);
    #[cfg(windows)]
    {
        open::that(&folder).map_err(|e| format!("Failed to open downloads folder: {}", e))
    }
    #[cfg(not(windows))]
    {
        open::that(&folder).map_err(|e| format!("Failed to open downloads folder: {}", e))
    }
}

#[tauri::command]
pub fn show_in_folder(
    name: Option<String>,
    hash: Option<String>,
    path: Option<String>,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::process::Command;

        let resolved = name.as_deref().and_then(|n| resolve_download_file(n, hash.as_deref(), path.as_deref()));

        if let Some(p) = resolved {
            Command::new("explorer")
                .arg(format!("/select,{}", p.to_string_lossy()))
                .spawn()
                .map_err(|e| format!("Failed to open explorer: {}", e))?;
            return Ok(());
        }

        let default_incoming = if let Ok(config) = super::config::get_config() {
            PathBuf::from(config.incoming_dir)
        } else {
            super::config::get_default_incoming_dir()
        };
        let _ = std::fs::create_dir_all(&default_incoming);
        Command::new("explorer")
            .arg(default_incoming.to_string_lossy().to_string())
            .spawn()
            .map_err(|e| format!("Failed to open incoming folder: {}", e))?;

        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = (name, hash, path);
        Err("Unsupported on this OS".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_user_ed2k_link() {
        let link = "ed2k://|file|La.Maquina.del.Tiempo.(2002).(Spanish.English.Subs).Micro4K.2160p.SDR.x265-AC3.by.CHINAKO.(hispashare.org).mkv|5140940403|82DA87D26CB94CB4EB2D84600907A33E|/";
        let parsed = parse_ed2k_link(link).expect("Should parse ed2k link");
        assert_eq!(parsed.name, "La.Maquina.del.Tiempo.(2002).(Spanish.English.Subs).Micro4K.2160p.SDR.x265-AC3.by.CHINAKO.(hispashare.org).mkv");
        assert_eq!(parsed.size, 5140940403);
        assert_eq!(parsed.hash, "82DA87D26CB94CB4EB2D84600907A33E");
    }

    #[test]
    fn test_parse_batch_ed2k_links() {
        let batch = "ed2k://|file|Stuart.no.Consigue.Salvar.el.Universo.1x03.Spoiler..Bert.es.mago.(Spa-Eng-Sub).HDrip.1080.HEVC.10b-AC3.by.nara.(hispamula).mkv|514437917|E93D45E00304694BB9C0CFF7297A5DF6|/
ed2k://|file|Stuart.no.Consigue.Salvar.el.Universo.1x04.Spoiler..Stuart.hace.una.cartera.(Spa-Eng-Sub).HDrip.1080.HEVC.10b-AC3.by.nara..mkv|713941028|7D80BD9821A803A042C52706B7B0C58B|/
ed2k://|file|Stuart.no.Consigue.Salvar.el.Universo.1x05.Spoiler.Bert.se.casa.(Spa-Eng-Sub).HDrip.1080.HEVC.10b-AC3.by.nara.(hispamula).mkv|812295778|51A7FBAA33B92A36905FCEBD61E89CF8|/
ed2k://|file|Stuart.no.Consigue.Salvar.el.Universo.1x06.Spoiler.El.maíz.está.delicioso.(Spa-Eng-Sub).HDrip.1080.HEVC.10b-.mkv|658791927|8D92602CC366729F9AD867563A352B48|/
ed2k://|file|Stuart.no.Consigue.Salvar.el.Universo.1x07.Spoiler..Los.Dexys.Midnight.Runners.van.a.cobrar.derechos.de.autor.(Spa-Eng-Sub.mkv|498625337|E466E058D572BB9BBE5C2BEE651CE655|/
ed2k://|file|Stuart.no.Consigue.Salvar.el.Universo.1x08.Spoiler..Estamos.tan.perdidos.como.vosotros.(Spa-Eng-Sub).HDrip.1080.HEVC.10b-A.mkv|669180906|6015C56264A4D007A79802FD72C77717|/
ed2k://|file|Stuart.no.Consigue.Salvar.el.Universo.1x09.Spoiler..No.hemos.conseguido.a.Linterna.Verde.(Spa-Eng-Sub).HDrip.1080.HEVC.10b.mkv|607267882|6B7DE0269A0B060133FB30A083AB4646|/
ed2k://|file|Stuart.no.Consigue.Salvar.el.Universo.1x10.Spoiler..Grabado.con.público.en.directo.(Spa-Eng-Sub).HDrip.1080.HEVC.10.mkv|512714244|721FDA738E46B20B02A0B4EBE0D45EEC|/";

        let lines: Vec<&str> = batch.lines().filter(|l| l.contains("ed2k://|file|")).collect();
        assert_eq!(lines.len(), 8);

        let parsed: Vec<_> = lines.into_iter().filter_map(parse_ed2k_link).collect();
        assert_eq!(parsed.len(), 8);
        assert_eq!(parsed[0].hash, "E93D45E00304694BB9C0CFF7297A5DF6");
        assert_eq!(parsed[7].hash, "721FDA738E46B20B02A0B4EBE0D45EEC");
    }

    #[test]
    fn test_parse_user_materia_oscura_link() {
        let link = "ed2k://|file|Materia.oscura.2x05.Ama.y.sé.amado.(Spanish.English.Subs).WEBRip.1080p.x265-EAC3.Atmos.by.Legan.mkv|1491350391|C5B40A1B4A6EC5B6455B4C36B71573A1|/";
        let parsed = parse_ed2k_link(link).expect("Should parse materia oscura link");
        assert_eq!(parsed.name, "Materia.oscura.2x05.Ama.y.sé.amado.(Spanish.English.Subs).WEBRip.1080p.x265-EAC3.Atmos.by.Legan.mkv");
        assert_eq!(parsed.size, 1491350391);
        assert_eq!(parsed.hash, "C5B40A1B4A6EC5B6455B4C36B71573A1");
    }

    #[test]
    fn test_parse_browser_encoded_ed2k_link() {
        let link = "ed2k://%7Cfile%7CMateria.oscura.2x05.Ama.y.s%C3%A9.amado.(Spanish.English.Subs).WEBRip.1080p.x265-EAC3.Atmos.by.Legan.mkv%7C1491350391%7CC5B40A1B4A6EC5B6455B4C36B71573A1%7C/";
        let parsed = parse_ed2k_link(link).expect("Should parse browser-encoded ed2k link");
        assert_eq!(parsed.name, "Materia.oscura.2x05.Ama.y.sé.amado.(Spanish.English.Subs).WEBRip.1080p.x265-EAC3.Atmos.by.Legan.mkv");
        assert_eq!(parsed.size, 1491350391);
        assert_eq!(parsed.hash, "C5B40A1B4A6EC5B6455B4C36B71573A1");
    }
}

