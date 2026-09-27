//! Types shared between Rust backend and TypeScript frontend.
//! All structs derive Serialize + Deserialize for Tauri IPC.

use serde::{Deserialize, Serialize};

// ═══════════════════════════════════════════════════════════════════
// Daemon Status
// ═══════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaemonStatus {
    pub running: bool,
    pub pid: Option<u32>,
    pub ec_connected: bool,
    pub version: Option<String>,
}

// ═══════════════════════════════════════════════════════════════════
// Servers & Network
// ═══════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerInfo {
    pub name: String,
    pub ip: String,
    pub port: u16,
    pub users: u32,
    pub files: u32,
    pub is_connected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlobalStats {
    pub download_speed: f64,
    pub upload_speed: f64,
    pub ed2k_connected: bool,
    pub kad_connected: bool,
    pub kad_firewalled: bool,
    pub ed2k_id: String,
    pub total_users: u32,
    pub total_files: u32,
}

impl Default for GlobalStats {
    fn default() -> Self {
        Self {
            download_speed: 0.0,
            upload_speed: 0.0,
            ed2k_connected: false,
            kad_connected: false,
            kad_firewalled: false,
            ed2k_id: "Unknown".to_string(),
            total_users: 0,
            total_files: 0,
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
// Search
// ═══════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchParams {
    pub query: String,
    pub file_type: Option<String>,
    pub min_size: Option<u64>,
    pub max_size: Option<u64>,
    pub search_type: SearchType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SearchType {
    Global,
    Kad,
    Local,
}

impl SearchType {
    pub fn to_ec_value(&self) -> u8 {
        match self {
            SearchType::Local => super::opcodes::EC_SEARCH_LOCAL,
            SearchType::Global => super::opcodes::EC_SEARCH_GLOBAL,
            SearchType::Kad => super::opcodes::EC_SEARCH_KAD,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub hash: String,
    pub name: String,
    pub size: u64,
    pub sources: u32,
    pub complete_sources: u32,
    pub file_type: String,
}

// ═══════════════════════════════════════════════════════════════════
// Downloads
// ═══════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadInfo {
    pub hash: String,
    pub name: String,
    pub size_total: u64,
    pub size_done: u64,
    pub progress: f64,
    pub speed: f64,
    pub sources_total: u32,
    pub sources_transferring: u32,
    pub priority: String,
    pub status: String,
    pub eta_seconds: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DownloadPriority {
    Low = 0,
    Normal = 1,
    High = 2,
    Auto = 3,
}

impl DownloadPriority {
    pub fn from_u8(val: u8) -> Self {
        match val {
            0 => Self::Low,
            1 => Self::Normal,
            2 => Self::High,
            _ => Self::Auto,
        }
    }

    pub fn label(&self) -> &str {
        match self {
            Self::Low => "Low",
            Self::Normal => "Normal",
            Self::High => "High",
            Self::Auto => "Auto",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DownloadStatus {
    Downloading,
    Paused,
    Waiting,
    Completing,
    Complete,
    Error,
    Hashing,
    Stopped,
}

impl DownloadStatus {
    pub fn from_u8(val: u8) -> Self {
        match val {
            0 => Self::Waiting,
            1 => Self::Downloading,
            2 => Self::Paused,
            3 => Self::Error,
            4 => Self::Stopped,
            7 => Self::Completing,
            8 => Self::Complete,
            9 => Self::Hashing,
            _ => Self::Waiting,
        }
    }

    pub fn label(&self) -> &str {
        match self {
            Self::Downloading => "Downloading",
            Self::Paused => "Paused",
            Self::Waiting => "Waiting",
            Self::Completing => "Completing",
            Self::Complete => "Complete",
            Self::Error => "Error",
            Self::Hashing => "Hashing",
            Self::Stopped => "Stopped",
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
// Uploads
// ═══════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadInfo {
    pub hash: String,
    pub name: String,
    pub speed: f64,
    pub client_name: String,
    pub transferred: u64,
}
