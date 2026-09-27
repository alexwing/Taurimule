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
  transferred: number;
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

  // Search
  startSearch: (params: SearchParams) => invoke<void>('start_search', { params }),
  getSearchResults: () => invoke<SearchResult[]>('get_search_results'),
  stopSearch: () => invoke<void>('stop_search'),

  // Downloads
  getDownloadQueue: () => invoke<DownloadInfo[]>('get_download_queue'),
  downloadFile: (hash: string) => invoke<void>('download_file', { hash }),
  pauseDownload: (hash: string) => invoke<void>('pause_download', { hash }),
  resumeDownload: (hash: string) => invoke<void>('resume_download', { hash }),
  deleteDownload: (hash: string) => invoke<void>('delete_download', { hash }),
  setDownloadPriority: (hash: string, priority: number) => invoke<void>('set_download_priority', { hash, priority }),

  // File Operations (Windows Explorer & Default Player)
  launchFile: (name: string, hash?: string, path?: string) => invoke<void>('launch_file', { name, hash, path }),
  showInFolder: (name?: string, hash?: string, path?: string) => invoke<void>('show_in_folder', { name, hash, path }),
  renameFile: (hash: string, newName: string, oldName?: string) => invoke<string>('rename_file', { hash, newName, oldName }),
  addEd2kLink: (link: string, cleanName?: string) => invoke<DownloadInfo>('add_ed2k_link', { link, cleanName }),
  addEd2kLinks: (items: AddEd2kItem[]) => invoke<DownloadInfo[]>('add_ed2k_links', { items }),

  // Uploads
  getUploadQueue: () => invoke<UploadInfo[]>('get_upload_queue'),
};

export interface AddEd2kItem {
  link: string;
  clean_name?: string;
}


