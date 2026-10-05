import type { DaemonStatus, DownloadInfo, GlobalStats } from "../lib/tauri-bridge";
import type { LogoState } from "../lib/logo";
import type { SearchTab } from "../views/search";

export type ViewName = "downloads" | "servers" | "search" | "uploads" | "settings";

interface AppState {
  currentView: ViewName;
  currentDaemonStatus: DaemonStatus | null;
  downloadFilterQuery: string;
  cachedDownloads: DownloadInfo[];
  isAppStartingUp: boolean;
  lastStats: GlobalStats | null;
  currentLogoState: LogoState;
  manualLogoOverride: LogoState | null;
  searchTabs: SearchTab[];
  activeSearchTabId: string | null;
}

// State read or written by more than one module. Module-private state stays local.
export const state: AppState = {
  currentView: "downloads",
  currentDaemonStatus: null,
  downloadFilterQuery: "",
  cachedDownloads: [],
  isAppStartingUp: true,
  lastStats: null,
  currentLogoState: "connected",
  manualLogoOverride: null,
  searchTabs: [],
  activeSearchTabId: null,
};
