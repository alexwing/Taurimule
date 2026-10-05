import { invoke } from '@tauri-apps/api/core';

// Types mirroring Rust structs
export interface DaemonStatus {
  running: boolean;
  pid?: number;
  ec_connected: boolean;
  version?: string;
}

export interface ServerInfo {
  name: string;
  ip: string;
  port: number;
  users: number;
  files: number;
  is_connected: boolean;
}

export interface GlobalStats {
  download_speed: number;
  upload_speed: number;
  ed2k_connected: boolean;
  kad_connected: boolean;
  kad_firewalled: boolean;
  ed2k_id: string;
  total_users: number;
  total_files: number;
}

export interface SearchParams {
  query: string;
  file_type?: string;
  min_size?: number;
  max_size?: number;
  search_type: 'Global' | 'Kad' | 'Local';
}

export interface SearchResult {
  hash: string;
  name: string;
  size: number;
  sources: number;
  complete_sources: number;
  file_type: string;
}

export interface DownloadInfo {
  hash: string;
  name: string;
  size_total: number;
  size_done: number;
  progress: number;
  speed: number;
  sources_total: number;
  sources_transferring: number;
  priority: string;
  status: string;
  eta_seconds?: number;
}

export interface UploadInfo {
  hash: string;
  name: string;
  speed: number;
  client_name: string;
  client_software?: string;
  transferred: number;
}

export interface AppConfig {
  nick: string;
  incoming_dir: string;
  temp_dir: string;
  port: number;
  udp_port: number;
  max_upload: number;
  max_download: number;
  connect_ed2k: boolean;
  connect_kad: boolean;
  auto_connect: boolean;
  config_dir: string;
}

export interface ImportResult {
  success: boolean;
  message: string;
  servers_count: number;
  incoming_dir?: string;
  temp_dir?: string;
}

export interface Snapshot {
  downloads: DownloadInfo[];
  stats: GlobalStats | null;
  uploads: UploadInfo[];
  connected: boolean;
  error?: string | null;
  updated_at: number;
}

export const api = {
  // Daemon lifecycle
  startDaemon: () => invoke<DaemonStatus>('start_daemon'),
  stopDaemon: () => invoke<void>('stop_daemon'),
  getDaemonStatus: () => invoke<DaemonStatus>('get_daemon_status'),
  setTrayIconState: (state: 'connected' | 'downloading' | 'warning' | 'idle') => invoke<void>('set_tray_icon_state', { state }),

  // Servers
  getServerList: () => invoke<ServerInfo[]>('get_server_list'),
  connectServer: (ip: string, port: number) => invoke<void>('connect_server', { ip, port }),
  disconnectServer: () => invoke<void>('disconnect_server'),
  getStats: () => invoke<GlobalStats>('get_stats'),
  addServer: (ip: string, port: number, name: string) => invoke<void>('add_server', { ip, port, name }),
  removeServer: (ip: string, port: number) => invoke<void>('remove_server', { ip, port }),
  updateServersFromUrl: (url: string) => invoke<number>('update_servers_from_url', { url }),
  loadLocalServerMet: (filePath: string) => invoke<number>('load_local_server_met', { filePath }),

  // Kad
  startKad: () => invoke<void>('start_kad'),
  stopKad: () => invoke<void>('stop_kad'),
  bootstrapKad: (url?: string) => invoke<void>('bootstrap_kad', { url }),

  // Search
  startSearch: (params: SearchParams) => invoke<void>('start_search', { params }),
  getSearchResults: () => invoke<SearchResult[]>('get_search_results'),
  stopSearch: () => invoke<void>('stop_search'),

  // Downloads
  getSnapshot: () => invoke<Snapshot>('get_snapshot'),
  getDownloadQueue: () => invoke<DownloadInfo[]>('get_download_queue'),
  downloadFile: (hash: string) => invoke<void>('download_file', { hash }),
  pauseDownload: (hash: string) => invoke<void>('pause_download', { hash }),
  resumeDownload: (hash: string) => invoke<void>('resume_download', { hash }),
  deleteDownload: (hash: string) => invoke<void>('delete_download', { hash }),
  setDownloadPriority: (hash: string, priority: number) => invoke<void>('set_download_priority', { hash, priority }),
  requestMoreSources: (hash: string) => invoke<void>('request_more_sources', { hash }),

  // File Operations (Windows Explorer & Default Player)
  launchFile: (name: string, hash?: string, path?: string) => invoke<void>('launch_file', { name, hash, path }),
  showInFolder: (name?: string, hash?: string, path?: string) => invoke<void>('show_in_folder', { name, hash, path }),
  openDownloadsFolder: () => invoke<void>('open_downloads_folder'),
  addEd2kLink: (link: string) => invoke<DownloadInfo>('add_ed2k_link', { link }),
  addEd2kLinks: (items: AddEd2kItem[]) => invoke<DownloadInfo[]>('add_ed2k_links', { items }),

  // Uploads
  getUploadQueue: () => invoke<UploadInfo[]>('get_upload_queue'),

  // Configuration & Import
  getConfig: () => invoke<AppConfig>('get_config'),
  saveConfig: (config: AppConfig) => invoke<void>('save_config', { config }),
  importFromEmule: (customPath?: string) => invoke<ImportResult>('import_from_emule', { customPath }),
  importFromAmule: (customPath?: string) => invoke<ImportResult>('import_from_amule', { customPath }),
  pickFolder: (title: string, initialPath?: string) => invoke<string | null>('pick_folder', { title, initialPath }),
  openFolder: (path: string) => invoke<void>('open_folder', { path }),

  // Protocol Association
  isEd2kAssociated: () => invoke<boolean>('is_ed2k_associated'),
  registerEd2kAssociation: () => invoke<boolean>('register_ed2k_association'),
  unregisterEd2kAssociation: () => invoke<boolean>('unregister_ed2k_association'),
};

export interface AddEd2kItem {
  link: string;
}


