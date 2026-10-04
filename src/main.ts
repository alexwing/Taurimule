import "./styles/global.css";
import {
  api,
  type GlobalStats,
  type DownloadInfo,
  type ServerInfo,
  type UploadInfo,
  type DaemonStatus,
  type SearchResult,
  type AppConfig,
  type Snapshot,
} from "./lib/tauri-bridge";
import { getLogoSvg, getLogoDataUri, type LogoState } from "./lib/logo";
import { ThemeManager, type ColorScheme } from "./lib/theme";
import { t, I18nManager, type LanguageSetting } from "./lib/i18n";
import { showContextMenu, type ContextMenuItem } from "./lib/context-menu";
import { listen } from "@tauri-apps/api/event";

type ViewName = "downloads" | "servers" | "search" | "uploads" | "settings";

let currentView: ViewName = "downloads";
let pollInterval: ReturnType<typeof setInterval> | null = null;
let currentDaemonStatus: DaemonStatus | null = null;
let downloadFilterQuery = "";
const savedShowCompleted = localStorage.getItem("taurimule_show_completed");
let showCompletedDownloads = savedShowCompleted !== null ? savedShowCompleted === "true" : false;
let cachedDownloads: DownloadInfo[] = [];
let isAppStartingUp = true;

export interface SearchTab {
  id: string;
  query: string;
  searchType: "Global" | "Kad" | "Local";
  fileType?: string;
  results: SearchResult[];
  isSearching: boolean;
  timestamp: number;
}

export interface SearchHistoryEntry {
  query: string;
  searchType: string;
  fileType?: string;
  timestamp: number;
}

let searchTabs: SearchTab[] = [];
let activeSearchTabId: string | null = null;
let searchHistory: SearchHistoryEntry[] = [];

function loadSearchHistory(): void {
  try {
    const saved = localStorage.getItem("taurimule_search_history");
    if (saved) {
      searchHistory = JSON.parse(saved);
    }
  } catch (e) {
    searchHistory = [];
  }
}

function saveSearchHistory(): void {
  try {
    localStorage.setItem("taurimule_search_history", JSON.stringify(searchHistory.slice(0, 30)));
  } catch (e) {}
}

function addToSearchHistory(query: string, searchType: string, fileType?: string): void {
  const clean = query.trim();
  if (!clean) return;
  searchHistory = searchHistory.filter((item) => item.query.toLowerCase() !== clean.toLowerCase());
  searchHistory.unshift({
    query: clean,
    searchType,
    fileType,
    timestamp: Date.now(),
  });
  saveSearchHistory();
}

function removeFromSearchHistory(query: string): void {
  searchHistory = searchHistory.filter((item) => item.query.toLowerCase() !== query.toLowerCase());
  saveSearchHistory();
}

function clearAllSearchHistory(): void {
  searchHistory = [];
  saveSearchHistory();
}

function getActiveTab(): SearchTab | null {
  if (!activeSearchTabId) {
    return searchTabs.length > 0 ? searchTabs[0] : null;
  }
  return searchTabs.find((t) => t.id === activeSearchTabId) || (searchTabs.length > 0 ? searchTabs[0] : null);
}

function createOrActivateSearchTab(
  query: string,
  searchType: "Global" | "Kad" | "Local",
  fileType?: string
): SearchTab {
  const existing = searchTabs.find(
    (t) => t.query.toLowerCase() === query.trim().toLowerCase()
  );
  if (existing) {
    activeSearchTabId = existing.id;
    existing.searchType = searchType;
    existing.fileType = fileType;
    return existing;
  }

  const newTab: SearchTab = {
    id: `tab_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    query: query.trim(),
    searchType,
    fileType,
    results: [],
    isSearching: true,
    timestamp: Date.now(),
  };
  searchTabs.push(newTab);
  activeSearchTabId = newTab.id;
  return newTab;
}

function closeSearchTab(tabId: string): void {
  const idx = searchTabs.findIndex((t) => t.id === tabId);
  if (idx === -1) return;
  searchTabs.splice(idx, 1);
  if (activeSearchTabId === tabId) {
    if (searchTabs.length > 0) {
      const nextIdx = Math.min(idx, searchTabs.length - 1);
      activeSearchTabId = searchTabs[nextIdx].id;
    } else {
      activeSearchTabId = null;
    }
  }
}

let currentLogoState: LogoState = "connected";
let manualLogoOverride: LogoState | null = null;
let lastStats: GlobalStats | null = null;

// Table sorting state
type SortDirection = "asc" | "desc";
type DownloadSortColumn = "name" | "size" | "progress" | "speed" | "sources";
let downloadSortColumn: DownloadSortColumn = "progress";
let downloadSortDirection: SortDirection = "desc";

type SearchSortColumn = "name" | "size" | "sources" | "file_type";
let searchSortColumn: SearchSortColumn = "sources";
let searchSortDirection: SortDirection = "desc";

// Initialize Theme, i18n & Search History
ThemeManager.initTheme();
I18nManager.initI18n();
loadSearchHistory();

// Listen to language changes to re-render UI
I18nManager.onLanguageChange(() => {
  renderAppShell();
  renderView();
  updateFooter(lastStats);
});

// Global navigation helper
(window as any).navigateToView = (view: ViewName) => navigate(view);

function safeDecode(val?: string): string {
  if (!val) return "";
  try {
    return decodeURIComponent(val);
  } catch {
    try {
      return decodeURI(val);
    } catch {
      return val;
    }
  }
}

function getLocalizedLogoLabel(state: LogoState): string {
  switch (state) {
    case "connected":
      return t("status.connectedHighId");
    case "downloading":
      return t("status.downloading");
    case "warning":
      return t("status.warning");
    case "idle":
      return t("status.idle");
  }
}

function updateAppLogo(state: LogoState) {
  currentLogoState = state;
  const logoEl = document.getElementById("sidebar-logo-container");
  if (logoEl) {
    logoEl.innerHTML = getLogoSvg(state, 28, "sb-logo");
    logoEl.title = `TauriMule: ${getLocalizedLogoLabel(state)}`;
  }

  const brandTag = document.getElementById("brand-status-tag");
  if (brandTag) {
    brandTag.textContent = getLocalizedLogoLabel(state);
    brandTag.className = `brand-badge state-${state}`;
  }

  const settingsPreview = document.getElementById("settings-logo-preview");
  if (settingsPreview) {
    settingsPreview.innerHTML = getLogoSvg(state, 84, "settings-preview");
  }

  const settingsBadge = document.getElementById("settings-badge");
  if (settingsBadge) {
    settingsBadge.textContent = getLocalizedLogoLabel(state);
    settingsBadge.className = `brand-badge state-${state}`;
  }

  const stateFeedback = document.getElementById("state-feedback");
  if (stateFeedback) {
    const modeStr = manualLogoOverride
      ? t("settings.modeManual", { state: getLocalizedLogoLabel(manualLogoOverride) })
      : t("settings.modeAuto", { state: getLocalizedLogoLabel(state) });
    stateFeedback.textContent = t("settings.currentMode", { mode: modeStr });
  }

  // Dynamic Browser Favicon
  let favicon = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (!favicon) {
    favicon = document.createElement("link");
    favicon.rel = "icon";
    document.head.appendChild(favicon);
  }
  favicon.href = getLogoDataUri(state);

  // Sync native OS tray icon
  api.setTrayIconState(state).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════
// Format Helpers
// ═══════════════════════════════════════════════════════════════════

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return "0 B/s";
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
}

function formatSize(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getFileIcon(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".mkv") || lower.endsWith(".mp4") || lower.endsWith(".avi")) return "🎬";
  if (lower.endsWith(".mp3") || lower.endsWith(".flac") || lower.endsWith(".wav")) return "🎵";
  if (lower.endsWith(".zip") || lower.endsWith(".rar") || lower.endsWith(".7z")) return "📦";
  if (lower.endsWith(".iso") || lower.endsWith(".bin") || lower.endsWith(".img")) return "💿";
  if (lower.endsWith(".exe") || lower.endsWith(".msi")) return "💾";
  if (lower.endsWith(".pdf") || lower.endsWith(".txt") || lower.endsWith(".doc")) return "📄";
  return "📁";
}

// ═══════════════════════════════════════════════════════════════════
// Table Sorting Helpers
// ═══════════════════════════════════════════════════════════════════

function sortDownloads(
  items: DownloadInfo[],
  col: DownloadSortColumn,
  dir: SortDirection
): DownloadInfo[] {
  const mult = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    switch (col) {
      case "name":
        return mult * a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
      case "size":
        return mult * (a.size_total - b.size_total);
      case "progress":
        return mult * (a.progress - b.progress);
      case "speed":
        return mult * (a.speed - b.speed);
      case "sources": {
        const scoreA = a.sources_transferring * 100000 + a.sources_total;
        const scoreB = b.sources_transferring * 100000 + b.sources_total;
        return mult * (scoreA - scoreB);
      }
      default:
        return 0;
    }
  });
}

function renderDownloadSortIcon(col: DownloadSortColumn): string {
  if (downloadSortColumn === col) {
    return `<span class="sort-icon">${downloadSortDirection === "asc" ? "▲" : "▼"}</span>`;
  }
  return `<span class="sort-icon sort-icon-muted">⇅</span>`;
}

function sortSearchResults(
  items: SearchResult[],
  col: SearchSortColumn,
  dir: SortDirection
): SearchResult[] {
  const mult = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    switch (col) {
      case "name":
        return mult * a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
      case "size":
        return mult * (a.size - b.size);
      case "sources":
        return mult * (a.sources - b.sources);
      case "file_type":
        return mult * a.file_type.localeCompare(b.file_type);
      default:
        return 0;
    }
  });
}

function renderSearchSortIcon(col: SearchSortColumn): string {
  if (searchSortColumn === col) {
    return `<span class="sort-icon">${searchSortDirection === "asc" ? "▲" : "▼"}</span>`;
  }
  return `<span class="sort-icon sort-icon-muted">⇅</span>`;
}

// ═══════════════════════════════════════════════════════════════════
// Toast & Filename Cleaner Modal Helpers (Syncdrome style)
// ═══════════════════════════════════════════════════════════════════

/**
 * Custom Fluent confirmation dialog (replaces the browser's native confirm()).
 * Resolves true when confirmed, false when cancelled / dismissed.
 */
function confirmDialog(
  message: string,
  opts: { title?: string; confirmLabel?: string; icon?: string; danger?: boolean } = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    document.getElementById("taurimule-confirm-modal")?.remove();
    const danger = opts.danger ?? false;
    const title = opts.title ?? (danger ? t("common.delete") : t("common.confirm"));
    const icon = opts.icon ?? (danger ? "⚠️" : "❔");
    const overlay = document.createElement("div");
    overlay.id = "taurimule-confirm-modal";
    overlay.className = "fluent-modal-overlay";
    overlay.innerHTML = `
      <div class="fluent-modal" role="alertdialog" aria-modal="true" style="max-width: 440px; width: 92%;">
        <div class="fluent-modal-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">${icon}</span>
            <span style="font-weight: 700; font-size: 15px;">${title}</span>
          </div>
          <button class="fluent-modal-close" id="btn-confirm-close">&times;</button>
        </div>
        <div class="fluent-modal-body" style="padding: 20px 22px;">
          <p id="confirm-dialog-msg" style="margin: 0; font-size: 13.5px; line-height: 1.5; color: var(--text-primary); white-space: pre-line; word-break: break-word;"></p>
        </div>
        <div class="fluent-modal-footer">
          <button class="btn btn-secondary" id="btn-confirm-cancel">${t("common.cancel")}</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"}" id="btn-confirm-ok">${opts.confirmLabel ?? t("common.confirm")}</button>
        </div>
      </div>`;
    const msgEl = overlay.querySelector("#confirm-dialog-msg") as HTMLElement;
    if (msgEl) msgEl.textContent = message;
    document.body.appendChild(overlay);

    const finish = (value: boolean) => {
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      resolve(value);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        finish(true);
      }
    };
    document.addEventListener("keydown", onKey, true);
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) finish(false);
    });
    overlay.querySelector("#btn-confirm-close")?.addEventListener("click", () => finish(false));
    overlay.querySelector("#btn-confirm-cancel")?.addEventListener("click", () => finish(false));
    const ok = overlay.querySelector("#btn-confirm-ok") as HTMLButtonElement;
    ok.addEventListener("click", () => finish(true));
    ok.focus();
  });
}

function showToast(message: string, duration = 2600) {
  const existing = document.getElementById("taurimule-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.id = "taurimule-toast";
  toast.className = "fluent-toast";
  toast.innerHTML = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => toast.remove(), 320);
  }, duration);
}



// ═══════════════════════════════════════════════════════════════════
// Add eD2k Link Modal (Parser + Clean Download + Direct Download)
// ═══════════════════════════════════════════════════════════════════

interface ParsedEd2kInfo {
  rawLink: string;
  name: string;
  size: number;
  hash: string;
}

function parseAllEd2kLinks(text: string): ParsedEd2kInfo[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const links: ParsedEd2kInfo[] = [];
  const seenHashes = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/ed2k:\/\/\|file\|([^|]+)\|(\d+)\|([a-fA-F0-9]{32})/);
    if (match) {
      const rawName = match[1];
      const size = parseInt(match[2], 10);
      const hash = match[3].toUpperCase();
      if (seenHashes.has(hash)) continue;
      seenHashes.add(hash);

      let name = rawName;
      try {
        name = decodeURIComponent(rawName);
      } catch {
        name = rawName;
      }
      let rawLink = trimmed;
      if (!rawLink.startsWith("ed2k://")) {
        rawLink = `ed2k://|file|${rawName}|${size}|${hash}|/`;
      } else if (!rawLink.endsWith("|/")) {
        rawLink = rawLink.endsWith("/") ? rawLink : (rawLink.endsWith("|") ? rawLink + "/" : rawLink + "|/");
      }
      links.push({ rawLink, name, size, hash });
    }
  }

  // Also catch multiple links pasted on a single line
  if (links.length <= 1 && text.includes("ed2k://|file|")) {
    const globalRegex = /ed2k:\/\/\|file\|([^|]+)\|(\d+)\|([a-fA-F0-9]{32})[^\r\n]*?\|\//g;
    let m: RegExpExecArray | null;
    const inlineLinks: ParsedEd2kInfo[] = [];
    const inlineSeen = new Set<string>();
    while ((m = globalRegex.exec(text)) !== null) {
      const rawName = m[1];
      const size = parseInt(m[2], 10);
      const hash = m[3].toUpperCase();
      if (inlineSeen.has(hash)) continue;
      inlineSeen.add(hash);
      let name = rawName;
      try {
        name = decodeURIComponent(rawName);
      } catch {
        name = rawName;
      }
      inlineLinks.push({
        rawLink: m[0],
        name,
        size,
        hash,
      });
    }
    if (inlineLinks.length > links.length) {
      return inlineLinks;
    }
  }

  return links;
}

function parseEd2kLink(text: string): ParsedEd2kInfo | null {
  const all = parseAllEd2kLinks(text);
  return all.length > 0 ? all[0] : null;
}

function showAddEd2kModal(initialText = "") {
  document.getElementById("taurimule-ed2k-modal")?.remove();

  let currentLinkText = initialText.trim();

  const modalOverlay = document.createElement("div");
  modalOverlay.id = "taurimule-ed2k-modal";
  modalOverlay.className = "fluent-modal-overlay";

  const renderModalContent = () => {
    const parsedList = parseAllEd2kLinks(currentLinkText);
    const isBatch = parsedList.length > 1;
    const totalBytes = parsedList.reduce((acc, x) => acc + x.size, 0);

    let bodyContentHtml = "";

    if (parsedList.length === 1) {
      const parsed = parsedList[0];
      bodyContentHtml = `
        <div style="background: var(--bg-card-header); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 14px; display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 18px;">${getFileIcon(parsed.name)}</span>
              <span style="font-weight: 600; font-size: 12.5px; color: var(--text-primary);">${t("downloads.parsedInfoTitle")}</span>
            </div>
            <span class="metric-badge badge-primary">${formatSize(parsed.size)}</span>
          </div>

          <div style="font-family: var(--font-mono); font-size: 11.5px; color: var(--text-secondary); background: var(--bg-input); padding: 6px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); word-break: break-all;">
            ${parsed.name}
          </div>

          <div style="font-size: 10.5px; font-family: var(--font-mono); color: var(--text-tertiary);">
            Hash: <strong>${parsed.hash}</strong>
          </div>
        </div>`;
    } else if (isBatch) {
      bodyContentHtml = `
        <div style="background: var(--bg-card-header); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 14px; display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 18px;">📦</span>
              <span style="font-weight: 600; font-size: 13px; color: var(--text-primary);">
                ${t("downloads.batchDetected", { count: parsedList.length })}
              </span>
            </div>
            <span class="metric-badge badge-primary" style="font-size: 11.5px; font-weight: 600;">
              ${t("downloads.totalBatchSize")}: ${formatSize(totalBytes)}
            </span>
          </div>

          <div style="max-height: 270px; overflow-y: auto; padding-right: 4px; display: flex; flex-direction: column; gap: 8px;">
            ${parsedList
              .map((item, idx) => `
                <div style="background: var(--bg-input); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 8px 10px; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                  <div style="display: flex; align-items: center; gap: 6px; overflow: hidden;">
                    <span class="metric-badge badge-secondary" style="font-family: var(--font-mono); font-size: 10px; padding: 1px 5px;">#${idx + 1}</span>
                    <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.name}">${item.name}</span>
                  </div>
                  <span style="font-family: var(--font-mono); font-size: 10.5px; color: var(--text-secondary); flex-shrink: 0;">${formatSize(item.size)}</span>
                </div>`)
              .join("")}
          </div>
        </div>`;
    } else if (currentLinkText.length > 5) {
      bodyContentHtml = `
        <div style="padding: 10px 14px; border-radius: var(--radius-sm); background: rgba(248, 81, 73, 0.1); border: 1px solid rgba(248, 81, 73, 0.25); color: var(--danger); font-size: 12px;">
          ⚠️ ${t("downloads.invalidLinkError")}
        </div>`;
    }

    modalOverlay.innerHTML = `
      <div class="fluent-modal-content" style="max-width: ${isBatch ? 680 : 620}px;">
        <div class="modal-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">${isBatch ? "📦" : "🔗"}</span>
            <div>
              <h3>${t("downloads.addLinkModalTitle")}</h3>
              <div style="font-size: 11px; color: var(--text-tertiary);">${t("downloads.addLinkModalSubtitle")}</div>
            </div>
          </div>
          <button class="btn btn-secondary btn-icon" id="btn-ed2k-close" style="padding: 2px 8px; font-size: 14px;">✕</button>
        </div>

        <div class="modal-body">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">
                ${t("downloads.linkInputLabel")}
              </label>
              <button class="btn btn-secondary btn-sm" id="btn-ed2k-paste-clipboard" style="font-size: 11px; padding: 3px 8px;">
                📋 ${t("downloads.pasteFromClipboard")}
              </button>
            </div>
            <textarea 
              id="input-ed2k-textarea" 
              class="search-main-input" 
              rows="${isBatch ? 4 : 3}" 
              placeholder="ed2k://|file|nombre|tamaño|hash|/" 
              style="width: 100%; box-sizing: border-box; font-family: var(--font-mono); font-size: 11px; resize: vertical; line-height: 1.4;"
            >${currentLinkText}</textarea>
          </div>

          ${bodyContentHtml}
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" id="btn-ed2k-cancel">${t("common.cancel")}</button>
          ${
            parsedList.length > 0
              ? `
              <button class="btn btn-primary" id="btn-ed2k-download">
                ⬇ ${isBatch ? t("downloads.batchAdding", { count: parsedList.length }) : t("downloads.addEd2kLink")}
              </button>
              `
              : ""
          }
        </div>
      </div>
    `;

    // Event attachments
    const closeBtn = modalOverlay.querySelector("#btn-ed2k-close");
    const cancelBtn = modalOverlay.querySelector("#btn-ed2k-cancel");
    const pasteBtn = modalOverlay.querySelector("#btn-ed2k-paste-clipboard");
    const textarea = modalOverlay.querySelector("#input-ed2k-textarea") as HTMLTextAreaElement | null;
    const downloadBtn = modalOverlay.querySelector("#btn-ed2k-download");

    closeBtn?.addEventListener("click", () => modalOverlay.remove());
    cancelBtn?.addEventListener("click", () => modalOverlay.remove());

    pasteBtn?.addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          currentLinkText = text.trim();
          renderModalContent();
        }
      } catch (err) {
        showToast("⚠️ No se pudo leer el portapapeles: " + err);
      }
    });

    textarea?.addEventListener("input", (e) => {
      currentLinkText = (e.target as HTMLTextAreaElement).value;
      renderModalContent();
      const newTextarea = modalOverlay.querySelector("#input-ed2k-textarea") as HTMLTextAreaElement | null;
      if (newTextarea) {
        newTextarea.focus();
        newTextarea.selectionStart = newTextarea.selectionEnd = newTextarea.value.length;
      }
    });

    downloadBtn?.addEventListener("click", async () => {
      if (parsedList.length === 0) return;
      try {
        modalOverlay.remove();
        if (parsedList.length === 1) {
          const item = parsedList[0];
          showToast(`⬇ Añadiendo descarga eD2k...`);
          const res = await api.addEd2kLink(item.rawLink);
          showToast(`✅ ${t("downloads.linkAddedSuccess")}: ${res.name}`);
        } else {
          showToast(`⬇ ${t("downloads.batchAdding", { count: parsedList.length })}`);
          const batchItems = parsedList.map((item) => ({ link: item.rawLink }));
          await api.addEd2kLinks(batchItems);
          showToast(`✅ ${t("downloads.batchAddedSuccess", { count: batchItems.length })}`);
        }
        navigate("downloads");
      } catch (err) {
        showToast(`⚠️ Error al añadir enlaces: ${err}`);
      }
    });
  };

  renderModalContent();
  document.body.appendChild(modalOverlay);

  const ta = modalOverlay.querySelector("#input-ed2k-textarea") as HTMLTextAreaElement | null;
  if (ta) {
    ta.focus();
    if (currentLinkText) {
      ta.select();
    }
  }

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      modalOverlay.remove();
      window.removeEventListener("keydown", handleKeydown);
    }
  };
  window.addEventListener("keydown", handleKeydown);

  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) {
      modalOverlay.remove();
      window.removeEventListener("keydown", handleKeydown);
    }
  });
}

async function openAddEd2kModalWithClipboardCheck() {
  let initial = "";
  try {
    const text = await navigator.clipboard.readText();
    if (text && text.includes("ed2k://|file|")) {
      initial = text.trim();
    }
  } catch {}
  showAddEd2kModal(initial);
}

(window as any).showAddEd2kModal = showAddEd2kModal;
(window as any).openAddEd2kModalWithClipboardCheck = openAddEd2kModalWithClipboardCheck;
(window as any).parseEd2kLink = parseEd2kLink;
(window as any).parseAllEd2kLinks = parseAllEd2kLinks;

function showAddServerModal() {
  document.getElementById("taurimule-add-server-modal")?.remove();

  const modalOverlay = document.createElement("div");
  modalOverlay.id = "taurimule-add-server-modal";
  modalOverlay.className = "fluent-modal-overlay";

  modalOverlay.innerHTML = `
    <div class="fluent-modal" style="max-width: 480px; width: 92%;">
      <div class="fluent-modal-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 18px;">🌐</span>
          <span style="font-weight: 700; font-size: 15px;">${t("servers.addServerModalTitle")}</span>
        </div>
        <button class="fluent-modal-close" id="btn-close-add-server-modal">&times;</button>
      </div>

      <div class="fluent-modal-body" style="display: flex; flex-direction: column; gap: 14px; padding: 18px 20px;">
        <div>
          <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 4px; display: block;">
            ${t("servers.serverIpLabel")} *
          </label>
          <input type="text" id="modal-server-ip" class="table-search-input" style="width: 100%; box-sizing: border-box;" placeholder="176.123.5.89" required />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 12px;">
          <div>
            <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 4px; display: block;">
              ${t("servers.serverPortLabel")} *
            </label>
            <input type="number" id="modal-server-port" class="table-search-input" style="width: 100%; box-sizing: border-box;" value="4661" min="1" max="65535" required />
          </div>
          <div>
            <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 4px; display: block;">
              ${t("servers.serverNameLabel")}
            </label>
            <input type="text" id="modal-server-name" class="table-search-input" style="width: 100%; box-sizing: border-box;" placeholder="eMule Security" />
          </div>
        </div>

        <div id="modal-server-feedback" style="font-size: 12px; color: var(--danger); min-height: 16px;"></div>
      </div>

      <div class="fluent-modal-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding: 12px 20px;">
        <button class="btn btn-secondary" id="btn-cancel-add-server">${t("common.cancel")}</button>
        <button class="btn btn-primary" id="btn-submit-add-server">➕ ${t("servers.addServerBtn")}</button>
      </div>
    </div>
  `;

  document.body.appendChild(modalOverlay);

  const closeModal = () => modalOverlay.remove();
  modalOverlay.querySelector("#btn-close-add-server-modal")?.addEventListener("click", closeModal);
  modalOverlay.querySelector("#btn-cancel-add-server")?.addEventListener("click", closeModal);

  modalOverlay.querySelector("#btn-submit-add-server")?.addEventListener("click", async () => {
    const ipInput = modalOverlay.querySelector("#modal-server-ip") as HTMLInputElement;
    const portInput = modalOverlay.querySelector("#modal-server-port") as HTMLInputElement;
    const nameInput = modalOverlay.querySelector("#modal-server-name") as HTMLInputElement;
    const feedback = modalOverlay.querySelector("#modal-server-feedback") as HTMLElement;

    const ip = ipInput.value.trim();
    const port = parseInt(portInput.value.trim(), 10);
    const name = nameInput.value.trim() || ip;

    if (!ip || isNaN(port) || port < 1 || port > 65535) {
      if (feedback) feedback.textContent = "Por favor, introduce una dirección IP y un puerto válidos (1-65535).";
      return;
    }

    try {
      await api.addServer(ip, port, name);
      closeModal();
      showToast(`🌐 ${t("servers.serverAddedSuccess")}`);
      renderView();
    } catch (e) {
      if (feedback) feedback.textContent = `Error: ${e}`;
    }
  });

  setTimeout(() => {
    (modalOverlay.querySelector("#modal-server-ip") as HTMLInputElement)?.focus();
  }, 50);
}

function showUpdateServerMetModal() {
  document.getElementById("taurimule-update-servermet-modal")?.remove();

  const modalOverlay = document.createElement("div");
  modalOverlay.id = "taurimule-update-servermet-modal";
  modalOverlay.className = "fluent-modal-overlay";

  modalOverlay.innerHTML = `
    <div class="fluent-modal" style="max-width: 520px; width: 92%;">
      <div class="fluent-modal-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 18px;">🔄</span>
          <span style="font-weight: 700; font-size: 15px;">${t("servers.updateServerMetTitle")}</span>
        </div>
        <button class="fluent-modal-close" id="btn-close-servermet-modal">&times;</button>
      </div>

      <div class="fluent-modal-body" style="display: flex; flex-direction: column; gap: 14px; padding: 18px 20px;">
        <p style="font-size: 12.5px; color: var(--text-secondary); margin: 0;">
          Introduce la URL de una lista de servidores server.met o pulsa una de las fuentes públicas recomendadas.
        </p>

        <div>
          <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px; display: block;">
            ${t("servers.popularUrlsLabel")}
          </label>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-sm preset-url-btn" data-url="http://www.gruk.org/server.met">Gruk.org</button>
            <button class="btn btn-secondary btn-sm preset-url-btn" data-url="http://edk.peerates.net/servers.met">Peerates.net</button>
            <button class="btn btn-secondary btn-sm preset-url-btn" data-url="http://emuling.gitlab.io/server.met">eMuling</button>
          </div>
        </div>

        <div>
          <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 4px; display: block;">
            ${t("servers.serverMetUrlLabel")}
          </label>
          <input type="url" id="modal-servermet-url" class="table-search-input" style="width: 100%; box-sizing: border-box; font-family: var(--font-mono); font-size: 12px;" value="http://www.gruk.org/server.met" required />
        </div>

        <div id="modal-servermet-feedback" style="font-size: 12px; color: var(--text-secondary); min-height: 16px;"></div>
      </div>

      <div class="fluent-modal-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding: 12px 20px;">
        <button class="btn btn-secondary" id="btn-cancel-servermet">${t("common.cancel")}</button>
        <button class="btn btn-primary" id="btn-submit-servermet">🌐 ${t("servers.updateServerMetBtn")}</button>
      </div>
    </div>
  `;

  document.body.appendChild(modalOverlay);

  const closeModal = () => modalOverlay.remove();
  modalOverlay.querySelector("#btn-close-servermet-modal")?.addEventListener("click", closeModal);
  modalOverlay.querySelector("#btn-cancel-servermet")?.addEventListener("click", closeModal);

  modalOverlay.querySelectorAll(".preset-url-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const url = (e.currentTarget as HTMLElement).dataset.url;
      const input = modalOverlay.querySelector("#modal-servermet-url") as HTMLInputElement;
      if (input && url) input.value = url;
    });
  });

  modalOverlay.querySelector("#btn-submit-servermet")?.addEventListener("click", async () => {
    const input = modalOverlay.querySelector("#modal-servermet-url") as HTMLInputElement;
    const feedback = modalOverlay.querySelector("#modal-servermet-feedback") as HTMLElement;
    const submitBtn = modalOverlay.querySelector("#btn-submit-servermet") as HTMLButtonElement;
    const url = input.value.trim();

    if (!url) return;

    if (feedback) feedback.textContent = "Descargando y actualizando lista de servidores...";
    if (submitBtn) submitBtn.disabled = true;

    try {
      const count = await api.updateServersFromUrl(url);
      closeModal();
      showToast(t("servers.serversUpdatedSuccess", { count: count.toString() }));
      renderView();
    } catch (e) {
      if (feedback) feedback.textContent = `Error: ${e}`;
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}


// ═══════════════════════════════════════════════════════════════════
// SPA Router & Navigation
// ═══════════════════════════════════════════════════════════════════

function navigate(view: ViewName) {
  currentView = view;
  document.querySelectorAll(".nav-item").forEach((el) => el.classList.remove("active"));
  document.querySelector(`[data-view="${view}"]`)?.classList.add("active");
  renderView();
  startPolling();
}

async function renderView() {
  const content = document.getElementById("content");
  if (!content) return;

  const activeEl = document.activeElement as HTMLInputElement | null;
  const isFilterFocused = activeEl?.id === "input-filter-downloads";
  const filterSelStart = isFilterFocused ? activeEl?.selectionStart : null;
  const filterSelEnd = isFilterFocused ? activeEl?.selectionEnd : null;

  // Refresh daemon status
  try {
    currentDaemonStatus = await api.getDaemonStatus();
  } catch {
    currentDaemonStatus = null;
  }

  switch (currentView) {
    case "downloads": {
      const container = document.getElementById("downloads-view-container");
      if (!container) {
        content.innerHTML = renderDownloadsViewShell();
        attachDownloadsToolbarListeners();
      }
      applySnapshotToDownloadsView();
      break;
    }
    case "servers":
      content.innerHTML = await renderServersView();
      break;
    case "search":
      content.innerHTML = renderSearchView();
      break;
    case "uploads":
      content.innerHTML = await renderUploadsView();
      break;
    case "settings":
      content.innerHTML = await renderSettingsView();
      break;
  }

  attachEventListeners();

  if (isFilterFocused) {
    const newFilter = document.getElementById("input-filter-downloads") as HTMLInputElement | null;
    if (newFilter) {
      newFilter.focus();
      if (filterSelStart !== null && filterSelEnd !== null) {
        newFilter.setSelectionRange(filterSelStart, filterSelEnd);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Common Header Component
// ═══════════════════════════════════════════════════════════════════

function renderHeader(title: string, subtitle: string, breadcrumb: string): string {
  const isRunning = currentDaemonStatus?.running ?? false;
  const pid = currentDaemonStatus?.pid;

  return `
    <div class="breadcrumb">
      <span class="breadcrumb-link" data-nav="downloads">${t("common.home")}</span>
      <span class="breadcrumb-separator">/</span>
      <span class="breadcrumb-current">${breadcrumb}</span>
    </div>
    <div class="view-header-container">
      <div>
        <h1 class="view-title">${title}</h1>
        <p class="view-subtitle">${subtitle}</p>
      </div>
      <div class="daemon-control-bar">
        <div class="daemon-indicator">
          <span class="status-dot ${isRunning ? "" : "stopped"}"></span>
          <span>${isRunning ? `amuled ${pid ? `(PID: ${pid})` : ""}` : t("settings.daemonStopped")}</span>
        </div>
        ${
          isRunning
            ? `<button class="btn btn-secondary btn-icon" id="btn-toggle-daemon" title="${t("settings.stopDaemon")}">⏹ ${t("settings.stopDaemon")}</button>`
            : `<button class="btn btn-primary btn-icon" id="btn-toggle-daemon" title="${t("settings.startDaemon")}">▶ ${t("settings.startDaemon")}</button>`
        }
      </div>
    </div>`;
}

async function handleActionClick(e: Event) {
  e.stopPropagation();
  const target = e.currentTarget as HTMLElement;
  const action = target.dataset.action;
  const hash = target.dataset.hash;
  try {
    switch (action) {
      case "download":
        await api.downloadFile(hash!);
        navigate("downloads");
        break;
      case "launch": {
        const rawName = safeDecode(target.dataset.name);
        const fileHash = target.dataset.hash || hash || "";
        if (rawName || fileHash) {
          try {
            await api.launchFile(rawName, fileHash);
            showToast(`🚀 ${t("cleaner.launchSuccess")}`);
          } catch (err) {
            showToast(`⚠️ ${err}`);
          }
        }
        break;
      }
      case "show-in-folder": {
        const rawName = safeDecode(target.dataset.name);
        const fileHash = target.dataset.hash || hash || "";
        await api.showInFolder(rawName, fileHash);
        break;
      }
      case "request-more-sources":
        if (hash) {
          try {
            await api.requestMoreSources(hash);
            showToast(`🔍 ${t("contextMenu.requestMoreSourcesSuccess")}`);
          } catch (err) {
            showToast(`⚠️ ${err}`);
          }
        }
        break;
      case "pause":
        await api.pauseDownload(hash!);
        renderView();
        break;
      case "resume":
        await api.resumeDownload(hash!);
        renderView();
        break;
      case "delete":
        if (await confirmDialog(t("downloads.confirmDelete"), { confirmLabel: t("common.delete"), danger: true, icon: "🗑️" })) {
          await api.deleteDownload(hash!);
          renderView();
        }
        break;
      case "connect-server":
        await api.connectServer(target.dataset.ip!, parseInt(target.dataset.port!));
        renderView();
        break;
      case "disconnect-server":
        await api.disconnectServer();
        renderView();
        break;
      case "remove-server": {
        const ip = target.dataset.ip;
        const port = parseInt(target.dataset.port || "0", 10);
        if (ip && port) {
          if (await confirmDialog(t("servers.confirmRemoveServer"), { title: t("servers.removeServer"), confirmLabel: t("common.delete"), danger: true, icon: "🗑️" })) {
            try {
              await api.removeServer(ip, port);
              showToast(`🗑️ ${t("servers.serverRemovedSuccess")}`);
              renderView();
            } catch (err) {
              showToast(`⚠️ Error: ${err}`);
            }
          }
        }
        break;
      }
    }
  } catch (err) {
    console.error("Action error:", action, err);
  }
}

function attachDownloadRowInteractions(el: HTMLElement) {
  const name = safeDecode(el.dataset.name);
  const hash = el.dataset.hash || "";
  const status = el.dataset.status || "";
  const size = parseInt(el.dataset.size || "0");
  const priority = el.dataset.priority || "Normal";

  // Double-click: only launch completed files (never open folder on incomplete)
  el.addEventListener("dblclick", async (e) => {
    e.preventDefault();
    if (status === "Complete") {
      try {
        await api.launchFile(name, hash);
        showToast(`🚀 ${t("cleaner.launchSuccess")}`);
      } catch (err) {
        showToast(`⚠️ ${err}`);
      }
    }
  });

  // Right-click Context Menu
  el.addEventListener("contextmenu", (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const items: ContextMenuItem[] = status === "Complete"
      ? [
          {
            label: t("contextMenu.launch"),
            icon: "🚀",
            onClick: async () => {
              try {
                await api.launchFile(name, hash);
                showToast(`🚀 ${t("cleaner.launchSuccess")}`);
              } catch (err) {
                showToast(`⚠️ ${err}`);
              }
            },
          },
          {
            label: t("contextMenu.showInFolder"),
            icon: "📂",
            onClick: async () => {
              await api.showInFolder(name, hash);
            },
          },
          "divider",
          {
            label: t("contextMenu.copyEd2k"),
            icon: "📋",
            onClick: async () => {
              const ed2kLink = `ed2k://|file|${name}|${size}|${hash}|/`;
              try {
                await navigator.clipboard.writeText(ed2kLink);
                showToast(`📋 ${t("cleaner.copied")}`);
              } catch {
                showToast(ed2kLink);
              }
            },
          },
          {
            label: t("contextMenu.copyHash"),
            icon: "🔑",
            onClick: async () => {
              try {
                await navigator.clipboard.writeText(hash);
                showToast(`🔑 Hash copiado`);
              } catch {
                showToast(hash);
              }
            },
          },
          "divider",
          {
            label: t("contextMenu.delete"),
            icon: "🗑️",
            danger: true,
            onClick: async () => {
              if (await confirmDialog(t("downloads.confirmDelete"), { confirmLabel: t("common.delete"), danger: true, icon: "🗑️" })) {
                await api.deleteDownload(hash);
                renderView();
              }
            },
          },
        ]
      : [
          status === "Paused"
            ? {
                label: t("contextMenu.resume"),
                icon: "▶️",
                onClick: async () => {
                  await api.resumeDownload(hash);
                  renderView();
                },
              }
            : {
                label: t("contextMenu.pause"),
                icon: "⏸️",
                onClick: async () => {
                  await api.pauseDownload(hash);
                  renderView();
                },
              },
          {
            label: t("contextMenu.requestMoreSources"),
            icon: "🔍",
            onClick: async () => {
              try {
                await api.requestMoreSources(hash);
                showToast(`🔍 ${t("contextMenu.requestMoreSourcesSuccess")}`);
              } catch (err) {
                showToast(`⚠️ ${err}`);
              }
            },
          },
          {
            label: t("contextMenu.priority"),
            icon: "⚡",
            children: [
              {
                label: `${t("contextMenu.priorityAuto")} ${priority.toLowerCase() === "auto" ? "✓" : ""}`,
                icon: "🔄",
                onClick: async () => {
                  await api.setDownloadPriority(hash, 3);
                  showToast(t("contextMenu.prioritySet", { prio: t("contextMenu.priorityAuto") }));
                  await renderView();
                },
              },
              {
                label: `${t("contextMenu.priorityHigh")} ${priority.toLowerCase() === "high" ? "✓" : ""}`,
                icon: "🔺",
                onClick: async () => {
                  await api.setDownloadPriority(hash, 2);
                  showToast(t("contextMenu.prioritySet", { prio: t("contextMenu.priorityHigh") }));
                  await renderView();
                },
              },
              {
                label: `${t("contextMenu.priorityNormal")} ${priority.toLowerCase() === "normal" ? "✓" : ""}`,
                icon: "➖",
                onClick: async () => {
                  await api.setDownloadPriority(hash, 1);
                  showToast(t("contextMenu.prioritySet", { prio: t("contextMenu.priorityNormal") }));
                  await renderView();
                },
              },
              {
                label: `${t("contextMenu.priorityLow")} ${priority.toLowerCase() === "low" ? "✓" : ""}`,
                icon: "🔻",
                onClick: async () => {
                  await api.setDownloadPriority(hash, 0);
                  showToast(t("contextMenu.prioritySet", { prio: t("contextMenu.priorityLow") }));
                  await renderView();
                },
              },
            ],
          },
          "divider",
          {
            label: t("contextMenu.copyEd2k"),
            icon: "📋",
            onClick: async () => {
              const ed2kLink = `ed2k://|file|${name}|${size}|${hash}|/`;
              try {
                await navigator.clipboard.writeText(ed2kLink);
                showToast(`📋 ${t("cleaner.copied")}`);
              } catch {
                showToast(ed2kLink);
              }
            },
          },
          {
            label: t("contextMenu.copyHash"),
            icon: "🔑",
            onClick: async () => {
              try {
                await navigator.clipboard.writeText(hash);
                showToast(`🔑 Hash copiado`);
              } catch {
                showToast(hash);
              }
            },
          },
          "divider",
          {
            label: t("contextMenu.delete"),
            icon: "🗑️",
            danger: true,
            onClick: async () => {
              if (await confirmDialog(t("downloads.confirmDelete"), { confirmLabel: t("common.delete"), danger: true, icon: "🗑️" })) {
                await api.deleteDownload(hash);
                renderView();
              }
            },
          },
        ];

    showContextMenu(e.clientX, e.clientY, items);
  });
}

function renderDownloadRowActions(d: DownloadInfo): string {
  if (d.status === "Complete") {
    return `
      <button class="btn btn-primary btn-icon" data-action="launch" data-name="${encodeURIComponent(d.name)}" data-hash="${d.hash}" title="${t("contextMenu.launch")}">🚀 ${t("cleaner.launchBtn")}</button>
      <button class="btn btn-secondary btn-icon" data-action="show-in-folder" data-name="${encodeURIComponent(d.name)}" data-hash="${d.hash}" title="${t("contextMenu.showInFolder")}">📂</button>
      <button class="btn btn-danger btn-icon" data-action="delete" data-hash="${d.hash}" title="${t("common.delete")}">🗑</button>
    `;
  }
  return `
    ${
      d.status === "Paused"
        ? `<button class="btn btn-secondary btn-icon" data-action="resume" data-hash="${d.hash}" title="${t("common.resume")}">▶</button>`
        : `<button class="btn btn-secondary btn-icon" data-action="pause" data-hash="${d.hash}" title="${t("common.pause")}">⏸</button>`
    }
    <button class="btn btn-secondary btn-icon" data-action="request-more-sources" data-hash="${d.hash}" title="${t("contextMenu.requestMoreSources")}">🔍</button>
    <button class="btn btn-danger btn-icon" data-action="delete" data-hash="${d.hash}" title="${t("common.delete")}">🗑</button>
  `;
}

function renderSingleDownloadRow(d: DownloadInfo): string {
  return `
    <tr 
      class="download-row ${d.status === "Complete" ? "completed-row" : ""}" 
      data-hash="${d.hash}" 
      data-name="${encodeURIComponent(d.name)}" 
      data-status="${d.status}" 
      data-size="${d.size_total}"
      data-priority="${d.priority}"
      title="${d.status === "Complete" ? "Doble clic para lanzar | Clic derecho para opciones" : "Clic derecho para opciones"}"
    >
      <td>
        <div class="file-title-cell">
          <span class="file-icon">${getFileIcon(d.name)}</span>
          <div class="file-info-stack">
            <div class="file-name-text" title="${d.name}">${d.name}</div>
            <div class="file-sub-meta">${t("downloads.hash")}: ${d.hash.substring(0, 12)}... | ${t("downloads.fileStatus")}: <span class="row-status-val">${d.status}</span> | ${t("contextMenu.priority")}: <strong>${d.priority}</strong></div>
          </div>
        </div>
      </td>
      <td>
        <div style="font-weight: 500;">${formatSize(d.size_total)}</div>
        <div class="cell-size-done" style="font-size: 11px; color: var(--text-tertiary);">${formatSize(d.size_done)}</div>
      </td>
      <td>
        <div class="fluent-progress-track">
          <div class="fluent-progress-fill ${d.status === "Complete" ? "completed" : ""}" style="width: ${(d.progress * 100).toFixed(1)}%;"></div>
        </div>
        <div class="fluent-progress-text">${(d.progress * 100).toFixed(1)}%</div>
      </td>
      <td>
        <span class="cell-speed" style="font-family: var(--font-mono); color: ${d.speed > 0 ? "var(--primary)" : (d.status === "Complete" ? "var(--success)" : "var(--text-tertiary)")}">
          ${d.status === "Downloading" ? formatSpeed(d.speed) : (d.status === "Complete" ? `✓ ${d.status}` : d.status)}
        </span>
      </td>
      <td class="cell-sources">
        ${d.status === "Complete" ? "100%" : `${d.sources_transferring}/${d.sources_total}`}
      </td>
      <td class="cell-actions" style="text-align: right; white-space: nowrap;">
        ${renderDownloadRowActions(d)}
      </td>
    </tr>`;
}

function renderDownloadsTableRows(items: DownloadInfo[]): string {
  if (items.length === 0) {
    return `<tr><td colspan="6" style="text-align: center; padding: 36px 20px;">
      <div class="empty-state-logo-card">
        <div style="width: 56px; height: 56px; display: flex; align-items: center; justify-content: center;">
          ${getLogoSvg(currentLogoState, 56, "dl-empty")}
        </div>
        ${
          !currentDaemonStatus?.ec_connected
            ? `
            <h3>⏳ ${t("downloads.connectingDaemonTitle")}</h3>
            <p style="margin-bottom: 12px;">${t("downloads.connectingDaemonSub")}</p>
            <button class="btn btn-primary" id="btn-toggle-daemon">▶ ${t("settings.startDaemon")}</button>
            `
            : `
            <h3>${(downloadFilterQuery || !showCompletedDownloads) && cachedDownloads.length > 0 ? t("downloads.emptyFilterTitle") : t("downloads.emptyQueueTitle")}</h3>
            <p style="margin-bottom: 8px;">${(downloadFilterQuery || !showCompletedDownloads) && cachedDownloads.length > 0 ? t("downloads.emptyFilterHelp") : t("downloads.emptyQueueHelp")}</p>
            ${cachedDownloads.length === 0 ? `
              <div style="display: flex; gap: 10px; margin-top: 10px; justify-content: center;">
                <button class="btn btn-primary" id="btn-empty-add-ed2k">➕ ${t("downloads.addEd2kLink")}</button>
                <button class="btn btn-secondary" onclick="window.navigateToView('search')">🔍 ${t("downloads.goToSearch")}</button>
              </div>
            ` : ""}
            `
        }
      </div>
     </td></tr>`;
  }

  return items.map(renderSingleDownloadRow).join("");
}

function updateDownloadSortHeaderIcons() {
  document.querySelectorAll("[data-sort-dl]").forEach((th) => {
    const col = (th as HTMLElement).dataset.sortDl as DownloadSortColumn;
    th.className = `sortable-th ${downloadSortColumn === col ? "sorted-" + downloadSortDirection : ""}`;
    const icon = th.querySelector(".sort-icon");
    if (icon) {
      icon.outerHTML = renderDownloadSortIcon(col);
    }
  });
}

function updateDownloadsTableIncremental() {
  const tbody = document.getElementById("downloads-table-body");
  const countLabel = document.getElementById("downloads-count-label");
  if (!tbody) return;

  const filtered = cachedDownloads.filter((d) => {
    const matchesFilter = downloadFilterQuery
      ? d.name.toLowerCase().includes(downloadFilterQuery.toLowerCase())
      : true;
    const matchesCompleted = showCompletedDownloads ? true : d.status !== "Complete";
    return matchesFilter && matchesCompleted;
  });
  const sorted = sortDownloads(filtered, downloadSortColumn, downloadSortDirection);

  if (countLabel) {
    countLabel.textContent = t("downloads.transferringFiles", { count: sorted.length });
  }

  if (sorted.length === 0) {
    tbody.innerHTML = renderDownloadsTableRows([]);
    tbody.querySelector("#btn-empty-add-ed2k")?.addEventListener("click", () => openAddEd2kModalWithClipboardCheck());
    tbody.querySelector("#btn-toggle-daemon")?.addEventListener("click", async () => {
      try {
        if (currentDaemonStatus?.running) await api.stopDaemon();
        else await api.startDaemon();
      } catch (e) {
        console.error("Failed to toggle daemon:", e);
      }
    });
    return;
  }

  // Clear empty state if present
  if (tbody.querySelector(".empty-state-logo-card")) {
    tbody.innerHTML = "";
  }

  // Track existing rows by hash
  const existingRows = new Map<string, HTMLElement>();
  tbody.querySelectorAll<HTMLElement>("tr.download-row").forEach((row) => {
    const h = row.dataset.hash;
    if (h) existingRows.set(h, row);
  });

  const sortedHashes = new Set(sorted.map((d) => d.hash));

  // Remove rows no longer present
  existingRows.forEach((row, h) => {
    if (!sortedHashes.has(h)) {
      row.remove();
      existingRows.delete(h);
    }
  });

  // Update in place or append in sorted order
  sorted.forEach((d) => {
    let row = existingRows.get(d.hash);
    if (row) {
      const fill = row.querySelector(".fluent-progress-fill") as HTMLElement | null;
      if (fill) {
        fill.style.width = `${(d.progress * 100).toFixed(1)}%`;
        if (d.status === "Complete") fill.classList.add("completed");
        else fill.classList.remove("completed");
      }

      const pct = row.querySelector(".fluent-progress-text");
      if (pct) pct.textContent = `${(d.progress * 100).toFixed(1)}%`;

      const sizeDone = row.querySelector(".cell-size-done");
      if (sizeDone) sizeDone.textContent = formatSize(d.size_done);

      const speed = row.querySelector(".cell-speed") as HTMLElement | null;
      if (speed) {
        speed.textContent = d.status === "Downloading" ? formatSpeed(d.speed) : (d.status === "Complete" ? `✓ ${d.status}` : d.status);
        speed.style.color = d.speed > 0 ? "var(--primary)" : (d.status === "Complete" ? "var(--success)" : "var(--text-tertiary)");
      }

      const sources = row.querySelector(".cell-sources");
      if (sources) {
        sources.textContent = d.status === "Complete" ? "100%" : `${d.sources_transferring}/${d.sources_total}`;
      }

      if (row.dataset.status !== d.status || row.dataset.priority !== d.priority) {
        row.dataset.status = d.status;
        row.dataset.priority = d.priority;
        if (d.status === "Complete") row.classList.add("completed-row");
        else row.classList.remove("completed-row");

        const statusVal = row.querySelector(".row-status-val");
        if (statusVal) statusVal.textContent = d.status;

        const actionsCell = row.querySelector(".cell-actions");
        if (actionsCell) {
          actionsCell.innerHTML = renderDownloadRowActions(d);
          actionsCell.querySelectorAll("[data-action]").forEach((btn) => btn.addEventListener("click", handleActionClick));
        }
      }

      tbody.appendChild(row);
    } else {
      const tempWrapper = document.createElement("tbody");
      tempWrapper.innerHTML = renderSingleDownloadRow(d);
      const newRow = tempWrapper.firstElementChild as HTMLElement;
      if (newRow) {
        newRow.querySelectorAll("[data-action]").forEach((btn) => btn.addEventListener("click", handleActionClick));
        attachDownloadRowInteractions(newRow);
        tbody.appendChild(newRow);
        existingRows.set(d.hash, newRow);
      }
    }
  });
}

function applySnapshotToDownloadsView(snap?: Snapshot) {
  if (snap) {
    if (snap.downloads) cachedDownloads = snap.downloads;
    if (snap.stats) {
      lastStats = snap.stats;
      updateFooter(snap.stats);
    }
  }

  const badgeEl = document.getElementById("badge-dl-count");
  if (badgeEl) badgeEl.textContent = cachedDownloads.length.toString();

  const completedCount = cachedDownloads.filter((d) => d.status === "Complete").length;
  const pendingCount = cachedDownloads.length - completedCount;

  const stats = snap?.stats || lastStats;
  if (stats) {
    const speedVal = document.getElementById("dl-metric-speed-val");
    if (speedVal) speedVal.textContent = `▼ ${formatSpeed(stats.download_speed)}`;

    const ulVal = document.getElementById("dl-metric-upload-val");
    if (ulVal) ulVal.textContent = `▲ ${formatSpeed(stats.upload_speed)}`;

    const ed2kVal = document.getElementById("dl-metric-ed2k-val");
    if (ed2kVal) ed2kVal.innerHTML = `eD2k: ${stats.ed2k_connected ? `🟢 ${t("servers.highIdActive")}` : "🔴 Off"}`;

    const kadVal = document.getElementById("dl-metric-kad-val");
    if (kadVal) kadVal.textContent = `Kad: ${stats.kad_connected ? (stats.kad_firewalled ? `🟡 ${t("servers.kadFirewalled")}` : `🟢 ${t("servers.kadOpen")}`) : "🔴 Off"}`;

    const netBadge = document.getElementById("dl-metric-net-badge");
    if (netBadge) {
      netBadge.className = `metric-badge ${stats.ed2k_connected ? "badge-success" : "badge-warning"}`;
      netBadge.textContent = stats.ed2k_id;
    }
  }

  const totalBadge = document.getElementById("dl-metric-total-badge");
  if (totalBadge) totalBadge.textContent = `${cachedDownloads.length} ${t("downloads.totalBadge")}`;

  const pendingVal = document.getElementById("dl-metric-pending-val");
  if (pendingVal) pendingVal.textContent = pendingCount.toString();

  const countsSub = document.getElementById("dl-metric-counts-sub");
  if (countsSub) {
    countsSub.textContent = `${completedCount > 0 ? `✓ ${completedCount} ${t("downloads.completedCountLabel")} • ` : ""}${cachedDownloads.length} ${t("downloads.totalCountLabel")}`;
  }

  const showCompletedLabel = document.querySelector(".compact-switch .fluent-switch-label");
  if (showCompletedLabel) {
    showCompletedLabel.textContent = `${t("downloads.showCompleted")}${completedCount > 0 ? ` (${completedCount})` : ""}`;
  }

  updateDownloadsTableIncremental();
}

function renderDownloadsViewShell(): string {
  const stats = lastStats || {
    download_speed: 0,
    upload_speed: 0,
    ed2k_connected: false,
    kad_connected: false,
    kad_firewalled: false,
    ed2k_id: "Unknown",
    total_users: 0,
    total_files: 0,
  };

  const completedCount = cachedDownloads.filter((d) => d.status === "Complete").length;
  const pendingCount = cachedDownloads.length - completedCount;

  const metricsHtml = `
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-header">
          <span class="metric-label">${t("downloads.liveDownload")}</span>
          <span class="metric-badge badge-primary">${t("status.p2p")}</span>
        </div>
        <div class="metric-value" id="dl-metric-speed-val">▼ ${formatSpeed(stats.download_speed)}</div>
        <div class="metric-subtext">${t("downloads.downloadSpeedSub")}</div>
      </div>
      <div class="metric-card">
        <div class="metric-header">
          <span class="metric-label">${t("downloads.liveUpload")}</span>
          <span class="metric-badge badge-warning">${t("status.sharing")}</span>
        </div>
        <div class="metric-value" id="dl-metric-upload-val">▲ ${formatSpeed(stats.upload_speed)}</div>
        <div class="metric-subtext">${t("downloads.uploadSpeedSub")}</div>
      </div>
      <div class="metric-card">
        <div class="metric-header">
          <span class="metric-label">${t("downloads.queueFiles")}</span>
          <span class="metric-badge badge-primary" id="dl-metric-total-badge">${cachedDownloads.length} ${t("downloads.totalBadge")}</span>
        </div>
        <div class="metric-value" style="display: flex; align-items: baseline; gap: 6px;">
          <span id="dl-metric-pending-val">${pendingCount}</span>
          <span style="font-size: 13px; font-weight: 500; color: var(--text-secondary); text-transform: lowercase;">${t("downloads.pendingLabel")}</span>
        </div>
        <div class="metric-subtext" id="dl-metric-counts-sub">
          ${completedCount > 0 ? `✓ ${completedCount} ${t("downloads.completedCountLabel")} • ` : ""}${cachedDownloads.length} ${t("downloads.totalCountLabel")}
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-header">
          <span class="metric-label">${t("downloads.connectedNetworks")}</span>
          <span class="metric-badge ${stats.ed2k_connected ? "badge-success" : "badge-warning"}" id="dl-metric-net-badge">${stats.ed2k_id}</span>
        </div>
        <div class="metric-value" style="font-size: 15px;" id="dl-metric-ed2k-val">
          eD2k: ${stats.ed2k_connected ? `🟢 ${t("servers.highIdActive")}` : "🔴 Off"}
        </div>
        <div class="metric-subtext" id="dl-metric-kad-val">Kad: ${stats.kad_connected ? (stats.kad_firewalled ? `🟡 ${t("servers.kadFirewalled")}` : `🟢 ${t("servers.kadOpen")}`) : "🔴 Off"}</div>
      </div>
    </div>`;

  const tableHtml = `
    <div class="table-container">
      <div class="table-toolbar downloads-toolbar">
        <div id="downloads-count-label" class="downloads-toolbar-count">${t("downloads.transferringFiles", { count: cachedDownloads.length })}</div>
        <div class="downloads-toolbar-actions">
          <label class="fluent-switch-container compact-switch" title="${t("downloads.showCompletedDesc")}">
            <span class="fluent-switch-label">${t("downloads.showCompleted")}${completedCount > 0 ? ` (${completedCount})` : ""}</span>
            <div class="fluent-switch">
              <input 
                type="checkbox" 
                id="check-show-completed" 
                class="fluent-switch-input" 
                ${showCompletedDownloads ? "checked" : ""} 
              />
              <span class="fluent-switch-track">
                <span class="fluent-switch-thumb"></span>
              </span>
            </div>
          </label>
          <button id="btn-open-downloads-folder" class="btn btn-secondary btn-compact btn-compact-icon" title="${t("downloads.openFolderTitle")}">
            <span style="font-size: 14px;">📁</span>
          </button>
          <button id="btn-refresh-downloads" class="btn btn-secondary btn-compact" title="${t("downloads.refreshTitle")}">
            <span class="refresh-icon">🔄</span> <span>${t("downloads.refresh")}</span>
          </button>
          <button id="btn-add-ed2k" class="btn btn-secondary btn-compact btn-compact-icon" title="${t("downloads.addEd2kLinkTitle")}">
            <span style="font-size: 14px;">🔗</span>
          </button>
          <input 
            type="text" 
            id="input-filter-downloads" 
            placeholder="${t("downloads.filterPlaceholderShort")}" 
            title="${t("downloads.filterPlaceholder")}"
            class="table-search-input table-search-input-compact" 
            value="${downloadFilterQuery}" 
          />
        </div>
      </div>
      <table class="fluent-table">
        <thead>
          <tr>
            <th class="sortable-th ${downloadSortColumn === "name" ? "sorted-" + downloadSortDirection : ""}" data-sort-dl="name" style="width: 44%;" title="Ordenar por Nombre">
              <div class="th-content">
                <span>${t("downloads.fileName")}</span>
                ${renderDownloadSortIcon("name")}
              </div>
            </th>
            <th class="sortable-th ${downloadSortColumn === "size" ? "sorted-" + downloadSortDirection : ""}" data-sort-dl="size" style="width: 10%;" title="Ordenar por Tamaño">
              <div class="th-content">
                <span>${t("downloads.fileSize")}</span>
                ${renderDownloadSortIcon("size")}
              </div>
            </th>
            <th class="sortable-th ${downloadSortColumn === "progress" ? "sorted-" + downloadSortDirection : ""}" data-sort-dl="progress" style="width: 17%;" title="Ordenar por Progreso">
              <div class="th-content">
                <span>${t("downloads.fileProgress")}</span>
                ${renderDownloadSortIcon("progress")}
              </div>
            </th>
            <th class="sortable-th ${downloadSortColumn === "speed" ? "sorted-" + downloadSortDirection : ""}" data-sort-dl="speed" style="width: 10%;" title="Ordenar por Velocidad">
              <div class="th-content">
                <span>${t("downloads.fileSpeed")}</span>
                ${renderDownloadSortIcon("speed")}
              </div>
            </th>
            <th class="sortable-th ${downloadSortColumn === "sources" ? "sorted-" + downloadSortDirection : ""}" data-sort-dl="sources" style="width: 7%;" title="Ordenar por Fuentes">
              <div class="th-content">
                <span>${t("downloads.fileSources")}</span>
                ${renderDownloadSortIcon("sources")}
              </div>
            </th>
            <th style="width: 12%; text-align: right;">${t("downloads.actions")}</th>
          </tr>
        </thead>
        <tbody id="downloads-table-body">
        </tbody>
      </table>
    </div>`;

  return `
    <div id="downloads-view-container">
      ${renderHeader(t("downloads.title"), t("downloads.subtitle"), t("nav.downloads"))}
      ${metricsHtml}
      ${tableHtml}
    </div>`;
}

function attachDownloadsToolbarListeners() {
  document.getElementById("check-show-completed")?.addEventListener("change", (e) => {
    showCompletedDownloads = (e.target as HTMLInputElement).checked;
    localStorage.setItem("taurimule_show_completed", showCompletedDownloads ? "true" : "false");
    updateDownloadsTableIncremental();
  });

  const filterInput = document.getElementById("input-filter-downloads") as HTMLInputElement | null;
  if (filterInput) {
    filterInput.addEventListener("input", (e) => {
      downloadFilterQuery = (e.target as HTMLInputElement).value;
      updateDownloadsTableIncremental();
    });
  }

  document.getElementById("btn-open-downloads-folder")?.addEventListener("click", async () => {
    try {
      await api.openDownloadsFolder();
    } catch (err) {
      showToast(`⚠️ Error: ${err}`);
    }
  });

  document.getElementById("btn-refresh-downloads")?.addEventListener("click", async () => {
    const btn = document.getElementById("btn-refresh-downloads");
    const icon = btn?.querySelector(".refresh-icon");
    if (icon) icon.classList.add("spin");
    try {
      const snap = await api.getSnapshot();
      if (snap) {
        applySnapshotToDownloadsView(snap);
      }
      showToast(`🔄 ${t("downloads.refreshed")}`);
    } catch (err) {
      console.error("Refresh error:", err);
    } finally {
      if (icon) {
        setTimeout(() => icon.classList.remove("spin"), 500);
      }
    }
  });

  document.getElementById("btn-add-ed2k")?.addEventListener("click", () => openAddEd2kModalWithClipboardCheck());

  document.querySelectorAll("[data-sort-dl]").forEach((th) => {
    th.addEventListener("click", (e) => {
      const col = (e.currentTarget as HTMLElement).dataset.sortDl as DownloadSortColumn;
      if (!col) return;
      if (downloadSortColumn === col) {
        downloadSortDirection = downloadSortDirection === "asc" ? "desc" : "asc";
      } else {
        downloadSortColumn = col;
        downloadSortDirection = col === "name" ? "asc" : "desc";
      }
      updateDownloadSortHeaderIcons();
      updateDownloadsTableIncremental();
    });
  });
}

// ═══════════════════════════════════════════════════════════════════
// 2. SERVERS VIEW (Servidores eD2K)
// ═══════════════════════════════════════════════════════════════════

async function renderServersView(): Promise<string> {
  let servers: ServerInfo[] = [];
  let stats: GlobalStats | null = null;
  try {
    servers = await api.getServerList();
  } catch (e) {
    servers = [];
  }
  try {
    stats = await api.getStats();
  } catch (e) {
    stats = null;
  }

  const networkOverviewHtml = `
    <div class="metrics-grid" style="margin-bottom: 20px;">
      <div class="metric-card" style="display: flex; flex-direction: row; align-items: center; gap: 14px;">
        <div style="width: 44px; height: 44px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          ${getLogoSvg(currentLogoState, 42, "srv-avatar")}
        </div>
        <div>
          <div class="metric-label">${t("servers.identity")}</div>
          <div class="metric-value" style="font-size: 15px;">${stats ? stats.ed2k_id : t("status.disconnectedFromDaemon")}</div>
          <div class="metric-hint" style="color: ${stats?.ed2k_connected ? "var(--success)" : "var(--text-tertiary)"}; font-weight: 500;">
            ${stats?.ed2k_connected ? `🟢 ${t("servers.highIdActive")}` : `🔴 ${t("servers.waitingConnection")}`}
          </div>
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-header">
          <span class="metric-label">${t("servers.kadNetwork")}</span>
          <span class="metric-badge ${stats?.kad_connected ? (stats?.kad_firewalled ? "badge-warning" : "badge-success") : "badge-secondary"}">
            ${stats?.kad_connected ? (stats?.kad_firewalled ? t("servers.kadFirewalled") : t("servers.kadOpen")) : t("servers.kadDisconnected")}
          </span>
        </div>
        <div class="metric-value" style="font-size: 15px;">
          ${stats?.kad_connected ? (stats?.kad_firewalled ? `🟡 ${t("servers.kadFirewalled")}` : `🟢 ${t("servers.kadOpen")}`) : `🔴 ${t("servers.kadDisconnected")}`}
        </div>
        <div class="metric-subtext">${t("servers.udpPort")}: 6591</div>
      </div>
      <div class="metric-card">
        <div class="metric-header">
          <span class="metric-label">${t("servers.globalUsers")}</span>
          <span class="metric-badge badge-primary">eD2k + Kad</span>
        </div>
        <div class="metric-value" style="font-size: 15px;">${stats ? stats.total_users.toLocaleString() : "0"}</div>
        <div class="metric-subtext">${t("servers.filesIndexed", { count: stats ? stats.total_files.toLocaleString() : "0" })}</div>
      </div>
    </div>`;

  const tableHtml = `
    <div class="table-container">
      <div class="table-toolbar" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div style="font-weight: 600; font-size: 13px;">${t("servers.availableServers", { count: servers.length })}</div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button class="btn btn-secondary btn-icon" id="btn-show-add-server">➕ ${t("servers.addServer")}</button>
          <button class="btn btn-secondary btn-icon" id="btn-show-update-servermet">🌐 ${t("servers.updateServerMet")}</button>
          <button class="btn btn-primary btn-icon" id="btn-refresh-servers">🔄 ${t("servers.refreshServers")}</button>
        </div>
      </div>
      <table class="fluent-table">
        <thead>
          <tr>
            <th>${t("servers.serverName")}</th>
            <th>${t("servers.ipPort")}</th>
            <th>${t("servers.users")}</th>
            <th>${t("servers.files")}</th>
            <th style="text-align: right;">${t("servers.connection")}</th>
          </tr>
        </thead>
        <tbody>
          ${
            servers.length === 0
              ? `<tr><td colspan="5" style="text-align: center; padding: 40px; color: var(--text-tertiary);">${t("servers.noServers")}</td></tr>`
              : servers
                  .map(
                    (s) => `
                <tr class="${s.is_connected ? "active-row" : ""} server-row" data-ip="${s.ip}" data-port="${s.port}" data-name="${encodeURIComponent(s.name)}" data-connected="${s.is_connected}">
                  <td>
                    <div style="font-weight: 600; display: flex; align-items: center; gap: 8px;">
                      <span class="status-dot ${s.is_connected ? "" : "stopped"}"></span>
                      ${s.name}
                    </div>
                  </td>
                  <td style="font-family: var(--font-mono);">${s.ip}:${s.port}</td>
                  <td>${s.users.toLocaleString()}</td>
                  <td>${s.files.toLocaleString()}</td>
                  <td style="text-align: right; white-space: nowrap;">
                    <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
                      ${
                        s.is_connected
                          ? `<button class="btn btn-secondary btn-sm btn-icon" data-action="disconnect-server">${t("common.disconnect")}</button>`
                          : `<button class="btn btn-primary btn-sm btn-icon" data-action="connect-server" data-ip="${s.ip}" data-port="${s.port}">${t("common.connect")}</button>`
                      }
                      <button class="btn btn-danger btn-sm btn-icon" data-action="remove-server" data-ip="${s.ip}" data-port="${s.port}" title="${t("servers.removeServer")}">🗑️</button>
                    </div>
                  </td>
                </tr>`
                  )
                  .join("")
          }
        </tbody>
      </table>
    </div>`;

  return `
    ${renderHeader(t("servers.title"), t("servers.subtitle"), t("nav.servers"))}
    ${networkOverviewHtml}
    ${tableHtml}`;
}

// ═══════════════════════════════════════════════════════════════════
// 3. SEARCH VIEW (Búsqueda)
// ═══════════════════════════════════════════════════════════════════

function renderSearchResultsTable(results: SearchResult[], query: string): string {
  if (results.length === 0) {
    return `
      <div class="table-container">
        <div style="padding: 40px; text-align: center; color: var(--text-tertiary);">
          ${t("search.noResults", { query })}
        </div>
      </div>`;
  }

  const sorted = sortSearchResults(results, searchSortColumn, searchSortDirection);

  return `
    <div class="table-container">
      <div class="table-toolbar">
        <div style="font-weight: 600; font-size: 13px;">
          ${t("search.resultsCount", { count: sorted.length, query })}
        </div>
      </div>
      <table class="fluent-table">
        <thead>
          <tr>
            <th class="sortable-th ${searchSortColumn === "name" ? "sorted-" + searchSortDirection : ""}" data-sort-search="name" style="width: 52%;" title="Ordenar por Nombre">
              <div class="th-content">
                <span>${t("downloads.fileName")}</span>
                ${renderSearchSortIcon("name")}
              </div>
            </th>
            <th class="sortable-th ${searchSortColumn === "size" ? "sorted-" + searchSortDirection : ""}" data-sort-search="size" style="width: 12%;" title="Ordenar por Tamaño">
              <div class="th-content">
                <span>${t("downloads.fileSize")}</span>
                ${renderSearchSortIcon("size")}
              </div>
            </th>
            <th class="sortable-th ${searchSortColumn === "sources" ? "sorted-" + searchSortDirection : ""}" data-sort-search="sources" style="width: 10%;" title="Ordenar por Fuentes">
              <div class="th-content">
                <span>${t("downloads.fileSources")}</span>
                ${renderSearchSortIcon("sources")}
              </div>
            </th>
            <th class="sortable-th ${searchSortColumn === "file_type" ? "sorted-" + searchSortDirection : ""}" data-sort-search="file_type" style="width: 12%;" title="Ordenar por Tipo">
              <div class="th-content">
                <span>${t("downloads.fileType")}</span>
                ${renderSearchSortIcon("file_type")}
              </div>
            </th>
            <th style="width: 14%; text-align: right;">${t("downloads.actions")}</th>
          </tr>
        </thead>
        <tbody>
          ${sorted
            .map(
              (r) => `
            <tr 
              class="search-result-row" 
              data-hash="${r.hash}" 
              data-name="${encodeURIComponent(r.name)}" 
              data-size="${r.size}"
              title="Clic derecho para opciones de descarga"
            >
              <td>
                <div class="file-title-cell">
                  <span class="file-icon">${getFileIcon(r.name)}</span>
                  <span class="file-name-text" title="${r.name}">${r.name}</span>
                </div>
              </td>
              <td>${formatSize(r.size)}</td>
              <td>${r.sources}</td>
              <td>${r.file_type}</td>
              <td style="text-align: right; white-space: nowrap;">
                <button class="btn btn-primary btn-icon" data-action="download" data-hash="${r.hash}">⬇ ${t("search.downloadAction")}</button>
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

function renderSearchView(): string {
  const activeTab = getActiveTab();
  const currentQuery = activeTab ? activeTab.query : "";
  const currentSearchType = activeTab ? activeTab.searchType : "Global";
  const currentFileType = activeTab ? (activeTab.fileType || "") : "";

  // 1. History chips HTML
  const historyHtml = `
    <div class="search-history-container">
      <div class="search-history-header">
        <span class="search-history-title">⏱️ ${t("search.recentSearches")}</span>
        ${
          searchHistory.length > 0
            ? `<button type="button" class="btn-clear-all-history" id="btn-clear-all-history" title="${t("search.clearHistory")}">
                 🗑️ ${t("search.clearHistory")}
               </button>`
            : ""
        }
      </div>
      <div class="search-history-chips">
        ${
          searchHistory.length === 0
            ? `<span class="search-history-empty">${t("search.noHistory")}</span>`
            : searchHistory
                .map(
                  (item) => `
              <div class="history-chip" title="${item.query}">
                <span class="history-chip-text" data-action="run-history-query" data-query="${encodeURIComponent(item.query)}">
                  🔍 ${item.query}
                </span>
                <button 
                  type="button" 
                  class="history-chip-delete" 
                  data-delete-history="${encodeURIComponent(item.query)}" 
                  title="${t("search.deleteSearch")}"
                >
                  ✕
                </button>
              </div>`
                )
                .join("")
        }
      </div>
    </div>`;

  // 2. Tabs Bar HTML
  const tabsHtml =
    searchTabs.length > 0
      ? `
    <div class="search-tabs-container">
      <div class="search-tabs-scroll">
        ${searchTabs
          .map(
            (tab) => `
          <div 
            class="search-tab ${tab.id === activeSearchTabId ? "active" : ""}" 
            data-tab-id="${tab.id}"
            title="${tab.query} (${tab.results.length} resultados)"
          >
            <span class="search-tab-icon ${tab.isSearching ? "spinning" : ""}">${tab.isSearching ? "🔄" : "🔍"}</span>
            <span class="search-tab-title">${tab.query}</span>
            <span class="search-tab-badge ${tab.results.length > 0 ? "has-results" : ""}">${tab.isSearching ? "..." : tab.results.length}</span>
            <button class="search-tab-close" data-close-tab="${tab.id}" title="${t("search.closeTab")}">✕</button>
          </div>`
          )
          .join("")}
      </div>
      <button class="search-tab-new-btn" id="btn-new-search-tab" title="${t("search.newTab")}">➕ ${t("search.newTab")}</button>
    </div>`
      : "";

  // 3. Results Area HTML
  let resultsAreaHtml = "";
  if (activeTab) {
    if (activeTab.isSearching && activeTab.results.length === 0) {
      resultsAreaHtml = `
        <div class="table-container">
          <div style="padding: 40px; text-align: center; color: var(--accent);">
            <div style="font-size: 28px; margin-bottom: 12px; animation: spinTab 1.5s linear infinite; display: inline-block;">🔍</div>
            <div style="font-weight: 500;">${t("search.searching")} "${activeTab.query}"...</div>
          </div>
        </div>`;
    } else if (activeTab.results.length > 0) {
      resultsAreaHtml = renderSearchResultsTable(activeTab.results, activeTab.query);
    } else if (!activeTab.isSearching) {
      resultsAreaHtml = `
        <div class="table-container">
          <div style="padding: 40px; text-align: center; color: var(--text-tertiary);">
            <div style="font-size: 24px; margin-bottom: 8px;">📂</div>
            <div>${t("search.noResults", { query: activeTab.query })}</div>
          </div>
        </div>`;
    }
  } else {
    resultsAreaHtml = `
      <div class="table-container">
        <div style="padding: 40px; text-align: center; color: var(--text-tertiary);">
          <div style="font-size: 24px; margin-bottom: 8px;">🌐</div>
          <div>${t("search.searchPrompt")}</div>
        </div>
      </div>`;
  }

  return `
    ${renderHeader(t("search.title"), t("search.subtitle"), t("nav.search"))}
    <div class="search-hero">
      <form id="search-form" class="search-input-group">
        <input 
          type="text" 
          id="search-query" 
          placeholder="${t("search.queryPlaceholder")}" 
          class="search-main-input" 
          value="${currentQuery}"
          required 
        />
        <select id="search-type" class="search-select-box">
          <option value="Global" ${currentSearchType === "Global" ? "selected" : ""}>${t("search.typeGlobal")}</option>
          <option value="Kad" ${currentSearchType === "Kad" ? "selected" : ""}>${t("search.typeKad")}</option>
          <option value="Local" ${currentSearchType === "Local" ? "selected" : ""}>${t("search.typeLocal")}</option>
        </select>
        <select id="search-filetype" class="search-select-box">
          <option value="" ${currentFileType === "" ? "selected" : ""}>${t("search.typeAny")}</option>
          <option value="Video" ${currentFileType === "Video" ? "selected" : ""}>${t("search.typeVideo")}</option>
          <option value="Audio" ${currentFileType === "Audio" ? "selected" : ""}>${t("search.typeAudio")}</option>
          <option value="Archive" ${currentFileType === "Archive" ? "selected" : ""}>${t("search.typeArchive")}</option>
          <option value="Program" ${currentFileType === "Program" ? "selected" : ""}>${t("search.typeProgram")}</option>
          <option value="Doc" ${currentFileType === "Doc" ? "selected" : ""}>${t("search.typeDoc")}</option>
        </select>
        <button type="submit" class="btn btn-primary">🔍 ${t("search.searchButton")}</button>
        <button type="button" id="btn-stop-search" class="btn btn-secondary">${t("search.stopButton")}</button>
      </form>
      ${historyHtml}
    </div>
    ${tabsHtml}
    <div id="search-results-area">
      ${resultsAreaHtml}
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════
// 4. UPLOADS VIEW (Subidas)
// ═══════════════════════════════════════════════════════════════════

async function renderUploadsView(): Promise<string> {
  let uploads: UploadInfo[] = [];
  try {
    uploads = await api.getUploadQueue();
  } catch (e) {
    uploads = [];
  }

  const tableHtml = `
    <div class="table-container">
      <div class="table-toolbar">
        <div style="font-weight: 600; font-size: 13px;">${t("uploads.clientsUploading", { count: uploads.length })}</div>
      </div>
      <table class="fluent-table">
        <thead>
          <tr>
            <th>${t("uploads.sharedFile")}</th>
            <th>${t("uploads.remoteClient")}</th>
            <th>${t("uploads.uploadSpeed")}</th>
            <th>${t("uploads.totalTransferred")}</th>
          </tr>
        </thead>
        <tbody>
          ${
            uploads.length === 0
              ? `<tr><td colspan="4" style="text-align: center; padding: 40px; color: var(--text-tertiary);">${t("uploads.noUploads")}</td></tr>`
              : uploads
                  .map(
                    (u) => `
                <tr>
                  <td>
                    <div class="file-title-cell">
                      <span class="file-icon">${getFileIcon(u.name)}</span>
                      <span class="file-name-text">${u.name}</span>
                    </div>
                  </td>
                  <td>${u.client_name}</td>
                  <td style="font-family: var(--font-mono); color: var(--warning);">▲ ${formatSpeed(u.speed)}</td>
                  <td>${formatSize(u.transferred)}</td>
                </tr>`
                  )
                  .join("")
          }
        </tbody>
      </table>
    </div>`;

  return `
    ${renderHeader(t("uploads.title"), t("uploads.subtitle"), t("nav.uploads"))}
    ${tableHtml}`;
}

// ═══════════════════════════════════════════════════════════════════
// 5. SETTINGS VIEW (Configuración e Importación + Apariencia & Idioma)
// ═══════════════════════════════════════════════════════════════════

async function renderSettingsView(): Promise<string> {
  const currentTheme = ThemeManager.getColorScheme();
  const currentLang = I18nManager.getLanguageSetting();

  let config: AppConfig = {
    nick: "TauriMule-User",
    incoming_dir: "",
    temp_dir: "",
    port: 4662,
    udp_port: 4672,
    max_upload: 0,
    max_download: 0,
    connect_ed2k: true,
    connect_kad: true,
    auto_connect: true,
    config_dir: "",
  };

  try {
    config = await api.getConfig();
  } catch (e) {
    console.warn("Could not load config:", e);
  }

  let isEd2kAssoc = false;
  try {
    isEd2kAssoc = await api.isEd2kAssociated();
  } catch (e) {
    console.warn("Could not check ed2k association:", e);
  }

  return `
    ${renderHeader(t("settings.title"), t("settings.subtitle"), t("nav.settings"))}
    
    <!-- Appearance & Language Configuration Card (Syncdrome style) -->
    <div class="table-container" style="padding: 24px; max-width: 850px; margin-bottom: 20px;">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; margin-bottom: 16px;">
        <div>
          <h3 style="font-size: 16px; font-weight: 700; margin: 0; display: flex; align-items: center; gap: 8px;">
            <span>🎨</span>
            <span>${t("settings.appearanceTitle")}</span>
          </h3>
          <p style="color: var(--text-secondary); font-size: 12px; margin-top: 4px; margin-bottom: 0;">
            ${t("settings.appearanceHint")}
          </p>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px;">
        <!-- Theme Selection -->
        <div class="metric-card" style="padding: 16px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <span style="font-size: 16px;">🌓</span>
            <span style="font-weight: 600; font-size: 13px;">${t("settings.appearance")}</span>
          </div>
          <select id="select-theme" class="settings-select" style="width: 100%;">
            <option value="system" ${currentTheme === "system" ? "selected" : ""}>💻 ${t("settings.themeSystem")}</option>
            <option value="light" ${currentTheme === "light" ? "selected" : ""}>☀️ ${t("settings.themeLight")}</option>
            <option value="dark" ${currentTheme === "dark" ? "selected" : ""}>🌙 ${t("settings.themeDark")}</option>
          </select>
        </div>

        <!-- Language Selection -->
        <div class="metric-card" style="padding: 16px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <span style="font-size: 16px;">🌐</span>
            <span style="font-weight: 600; font-size: 13px;">${t("settings.language")}</span>
          </div>
          <select id="select-language" class="settings-select" style="width: 100%;">
            <option value="system" ${currentLang === "system" ? "selected" : ""}>💻 ${t("settings.themeSystem")}</option>
            <option value="es" ${currentLang === "es" ? "selected" : ""}>🇪🇸 Español</option>
            <option value="en" ${currentLang === "en" ? "selected" : ""}>🇬🇧 English</option>
            <option value="fr" ${currentLang === "fr" ? "selected" : ""}>🇫🇷 Français</option>
            <option value="de" ${currentLang === "de" ? "selected" : ""}>🇩🇪 Deutsch</option>
          </select>
        </div>
      </div>
    </div>

    <!-- eD2k Protocol Association Card -->
    <div class="table-container" style="padding: 24px; max-width: 850px; margin-bottom: 20px;">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; margin-bottom: 16px;">
        <div>
          <h3 style="font-size: 16px; font-weight: 700; margin: 0; display: flex; align-items: center; gap: 8px;">
            <span>🔗</span>
            <span>${t("settings.ed2kAssociationTitle")}</span>
          </h3>
          <p style="color: var(--text-secondary); font-size: 12px; margin-top: 4px; margin-bottom: 0;">
            ${t("settings.ed2kAssociationSubtitle")}
          </p>
        </div>
      </div>

      <div class="metric-card" style="padding: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 22px;">${isEd2kAssoc ? "🟢" : "⚪"}</span>
          <div>
            <div style="font-weight: 600; font-size: 13px; color: var(--text-primary);">
              ${isEd2kAssoc ? t("settings.ed2kAssociated") : t("settings.ed2kNotAssociated")}
            </div>
            <div style="font-size: 11.5px; color: var(--text-secondary); margin-top: 2px;">
              Protocol: <code style="font-family: var(--font-mono);">ed2k://</code> (Windows Registry)
            </div>
          </div>
        </div>

        <div>
          ${
            isEd2kAssoc
              ? `<button class="btn btn-secondary btn-sm" id="btn-unassociate-ed2k" style="font-weight: 600;">✕ ${t("settings.btnUnassociateEd2k")}</button>`
              : `<button class="btn btn-primary btn-sm" id="btn-associate-ed2k" style="font-weight: 600;">🔗 ${t("settings.btnAssociateEd2k")}</button>`
          }
        </div>
      </div>
    </div>

    <!-- Branding & Logo States Showcase Card -->
    <div class="table-container" style="padding: 24px; max-width: 850px; margin-bottom: 20px;">
      <div style="display: flex; gap: 24px; align-items: center; flex-wrap: wrap; margin-bottom: 20px;">
        <div id="settings-logo-preview" style="width: 84px; height: 84px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          ${getLogoSvg(currentLogoState, 84, "settings-preview")}
        </div>
        <div style="flex: 1; min-width: 260px;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
            <h3 style="font-size: 17px; font-weight: 700; margin: 0;">${t("settings.logoTitle")}</h3>
            <span class="brand-badge state-${currentLogoState}" id="settings-badge">${getLocalizedLogoLabel(currentLogoState)}</span>
          </div>
          <p style="color: var(--text-secondary); font-size: 12.5px; line-height: 1.5; margin-bottom: 0;">
            ${t("settings.logoDesc")}
          </p>
        </div>
      </div>

      <div style="border-top: 1px solid var(--border-subtle); padding-top: 16px;">
        <div style="font-size: 11px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">
          ${t("settings.logoGallery")}
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 16px;">
          <div class="metric-card" style="padding: 12px; cursor: pointer; border: 1px solid ${currentLogoState === "connected" ? "#60cdff" : "var(--border-subtle)"};" data-test-state="connected">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
              <div style="width: 36px; height: 36px; flex-shrink: 0;">${getLogoSvg("connected", 36, "card-conn")}</div>
              <div>
                <div style="font-weight: 600; font-size: 12px; color: #60cdff;">${t("settings.cardConnectedTitle")}</div>
                <div style="font-size: 10px; color: var(--text-tertiary);">${t("settings.cardConnectedSub")}</div>
              </div>
            </div>
            <button class="btn btn-secondary btn-sm" style="width: 100%;">${t("settings.testBlue")}</button>
          </div>

          <div class="metric-card" style="padding: 12px; cursor: pointer; border: 1px solid ${currentLogoState === "downloading" ? "#6ccb5f" : "var(--border-subtle)"};" data-test-state="downloading">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
              <div style="width: 36px; height: 36px; flex-shrink: 0;">${getLogoSvg("downloading", 36, "card-dl")}</div>
              <div>
                <div style="font-weight: 600; font-size: 12px; color: #6ccb5f;">${t("settings.cardDownloadingTitle")}</div>
                <div style="font-size: 10px; color: var(--text-tertiary);">${t("settings.cardDownloadingSub")}</div>
              </div>
            </div>
            <button class="btn btn-secondary btn-sm" style="width: 100%;">${t("settings.testGreen")}</button>
          </div>

          <div class="metric-card" style="padding: 12px; cursor: pointer; border: 1px solid ${currentLogoState === "warning" ? "#ffe066" : "var(--border-subtle)"};" data-test-state="warning">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
              <div style="width: 36px; height: 36px; flex-shrink: 0;">${getLogoSvg("warning", 36, "card-warn")}</div>
              <div>
                <div style="font-weight: 600; font-size: 12px; color: #ffe066;">${t("settings.cardWarningTitle")}</div>
                <div style="font-size: 10px; color: var(--text-tertiary);">${t("settings.cardWarningSub")}</div>
              </div>
            </div>
            <button class="btn btn-secondary btn-sm" style="width: 100%;">${t("settings.testAmber")}</button>
          </div>

          <div class="metric-card" style="padding: 12px; cursor: pointer; border: 1px solid ${currentLogoState === "idle" ? "#adadad" : "var(--border-subtle)"};" data-test-state="idle">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
              <div style="width: 36px; height: 36px; flex-shrink: 0;">${getLogoSvg("idle", 36, "card-idle")}</div>
              <div>
                <div style="font-weight: 600; font-size: 12px; color: #adadad;">${t("settings.cardIdleTitle")}</div>
                <div style="font-size: 10px; color: var(--text-tertiary);">${t("settings.cardIdleSub")}</div>
              </div>
            </div>
            <button class="btn btn-secondary btn-sm" style="width: 100%;">${t("settings.testGray")}</button>
          </div>
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
          <div id="state-feedback" style="font-size: 12px; color: var(--text-secondary); font-family: var(--font-mono);">
            ${t("settings.currentMode", {
              mode: manualLogoOverride
                ? t("settings.modeManual", { state: getLocalizedLogoLabel(manualLogoOverride) })
                : t("settings.modeAuto", { state: getLocalizedLogoLabel(currentLogoState) }),
            })}
          </div>
          <button class="btn btn-primary" data-test-state="auto">🔄 ${t("settings.resetAuto")}</button>
        </div>
      </div>
    </div>

    <!-- Directories Configuration Card -->
    <div class="table-container" style="padding: 24px; max-width: 850px; margin-bottom: 20px;">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; margin-bottom: 16px;">
        <div>
          <h3 style="font-size: 16px; font-weight: 700; margin: 0; display: flex; align-items: center; gap: 8px;">
            <span>📁</span>
            <span>${t("settings.directoriesTitle")}</span>
          </h3>
          <p style="color: var(--text-secondary); font-size: 12px; margin-top: 4px; margin-bottom: 0;">
            ${t("settings.directoriesDesc")}
          </p>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div>
          <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px; display: block;">
            ${t("settings.incomingDirLabel")}
          </label>
          <div style="display: flex; gap: 8px; align-items: center;">
            <input type="text" id="input-cfg-incoming" class="table-search-input" style="flex: 1; font-family: var(--font-mono); font-size: 12px;" value="${config.incoming_dir}" />
            <button class="btn btn-secondary btn-sm" id="btn-browse-incoming" title="${t("settings.browseFolder")}">📁 ${t("settings.browseFolder")}</button>
            <button class="btn btn-secondary btn-sm" id="btn-open-incoming" title="${t("settings.openFolder")}">↗ ${t("settings.openFolder")}</button>
          </div>
        </div>

        <div>
          <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px; display: block;">
            ${t("settings.tempDirLabel")}
          </label>
          <div style="display: flex; gap: 8px; align-items: center;">
            <input type="text" id="input-cfg-temp" class="table-search-input" style="flex: 1; font-family: var(--font-mono); font-size: 12px;" value="${config.temp_dir}" />
            <button class="btn btn-secondary btn-sm" id="btn-browse-temp" title="${t("settings.browseFolder")}">📁 ${t("settings.browseFolder")}</button>
            <button class="btn btn-secondary btn-sm" id="btn-open-temp" title="${t("settings.openFolder")}">↗ ${t("settings.openFolder")}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Connection & Network Card -->
    <div class="table-container" style="padding: 24px; max-width: 850px; margin-bottom: 20px;">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; margin-bottom: 16px;">
        <div>
          <h3 style="font-size: 16px; font-weight: 700; margin: 0; display: flex; align-items: center; gap: 8px;">
            <span>🌐</span>
            <span>${t("settings.networkTitle")}</span>
          </h3>
          <p style="color: var(--text-secondary); font-size: 12px; margin-top: 4px; margin-bottom: 0;">
            ${t("settings.networkDesc")}
          </p>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div>
          <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px; display: block;">
            ${t("settings.nickLabel")}
          </label>
          <input type="text" id="input-cfg-nick" class="table-search-input" style="width: 100%; box-sizing: border-box; max-width: 380px;" value="${config.nick}" />
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
          <div>
            <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px; display: block;">
              ${t("settings.tcpPortLabel")}
            </label>
            <input type="number" id="input-cfg-port" class="table-search-input" style="width: 100%; box-sizing: border-box;" value="${config.port}" min="1" max="65535" />
          </div>
          <div>
            <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px; display: block;">
              ${t("settings.udpPortLabel")}
            </label>
            <input type="number" id="input-cfg-udpport" class="table-search-input" style="width: 100%; box-sizing: border-box;" value="${config.udp_port}" min="1" max="65535" />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
          <div>
            <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px; display: block;">
              ${t("settings.maxDownloadLabel")} <span style="font-weight: 400; text-transform: none; color: var(--text-tertiary);">(${t("settings.unlimitedHint")})</span>
            </label>
            <input type="number" id="input-cfg-maxdown" class="table-search-input" style="width: 100%; box-sizing: border-box;" value="${config.max_download}" min="0" />
          </div>
          <div>
            <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px; display: block;">
              ${t("settings.maxUploadLabel")} <span style="font-weight: 400; text-transform: none; color: var(--text-tertiary);">(${t("settings.unlimitedHint")})</span>
            </label>
            <input type="number" id="input-cfg-maxup" class="table-search-input" style="width: 100%; box-sizing: border-box;" value="${config.max_upload}" min="0" />
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 4px;">
          <label class="fluent-switch-container">
            <div class="fluent-switch">
              <input type="checkbox" id="check-cfg-ed2k" class="fluent-switch-input" ${config.connect_ed2k ? "checked" : ""} />
              <span class="fluent-switch-track"><span class="fluent-switch-thumb"></span></span>
            </div>
            <span class="fluent-switch-label">${t("settings.connectEd2kLabel")}</span>
          </label>

          <label class="fluent-switch-container">
            <div class="fluent-switch">
              <input type="checkbox" id="check-cfg-kad" class="fluent-switch-input" ${config.connect_kad ? "checked" : ""} />
              <span class="fluent-switch-track"><span class="fluent-switch-thumb"></span></span>
            </div>
            <span class="fluent-switch-label">${t("settings.connectKadLabel")}</span>
          </label>

          <label class="fluent-switch-container">
            <div class="fluent-switch">
              <input type="checkbox" id="check-cfg-autoconnect" class="fluent-switch-input" ${config.auto_connect ? "checked" : ""} />
              <span class="fluent-switch-track"><span class="fluent-switch-thumb"></span></span>
            </div>
            <span class="fluent-switch-label">${t("settings.autoConnectLabel")}</span>
          </label>
        </div>

        <div style="display: flex; align-items: center; gap: 12px; margin-top: 8px;">
          <button class="btn btn-primary" id="btn-save-config">💾 ${t("settings.saveConfigBtn")}</button>
          <span id="save-config-feedback" style="font-size: 12px; font-weight: 500;"></span>
        </div>
      </div>
    </div>

    <!-- Import Assistant Card -->
    <div class="table-container" style="padding: 24px; max-width: 850px; margin-bottom: 20px;">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; margin-bottom: 16px;">
        <div>
          <h3 style="font-size: 16px; font-weight: 700; margin: 0; display: flex; align-items: center; gap: 8px;">
            <span>📦</span>
            <span>${t("settings.importSectionTitle")}</span>
          </h3>
          <p style="color: var(--text-secondary); font-size: 12px; margin-top: 4px; margin-bottom: 0;">
            ${t("settings.importSectionDesc")}
          </p>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 16px; margin-bottom: 14px;">
        <!-- eMule Import Card -->
        <div class="metric-card" style="padding: 16px; display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">🐴</span>
            <span style="font-weight: 700; font-size: 14px;">${t("settings.importEmuleCardTitle")}</span>
          </div>
          <p style="font-size: 12px; color: var(--text-secondary); margin: 0; line-height: 1.4;">
            ${t("settings.importEmuleCardDesc")}
          </p>
          <button class="btn btn-primary btn-sm" id="btn-import-emule-auto" style="align-self: flex-start; margin-top: 2px;">
            ⚡ ${t("settings.importEmuleAutoBtn")}
          </button>

          <div style="border-top: 1px solid var(--border-subtle); padding-top: 10px; margin-top: 4px;">
            <label style="font-size: 10.5px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 4px; display: block;">
              ${t("settings.customPathLabel")}
            </label>
            <div style="display: flex; gap: 6px;">
              <input type="text" id="input-import-emule-path" class="table-search-input" style="flex: 1; font-size: 11.5px; font-family: var(--font-mono);" placeholder="${t("settings.customPathPlaceholder")}" />
              <button class="btn btn-secondary btn-sm" id="btn-browse-import-emule" title="Examinar carpeta">📁</button>
              <button class="btn btn-secondary btn-sm" id="btn-import-emule-custom">${t("settings.importCustomBtn")}</button>
            </div>
          </div>
        </div>

        <!-- aMule Import Card -->
        <div class="metric-card" style="padding: 16px; display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">⚡</span>
            <span style="font-weight: 700; font-size: 14px;">${t("settings.importAmuleCardTitle")}</span>
          </div>
          <p style="font-size: 12px; color: var(--text-secondary); margin: 0; line-height: 1.4;">
            ${t("settings.importAmuleCardDesc")}
          </p>
          <button class="btn btn-primary btn-sm" id="btn-import-amule-auto" style="align-self: flex-start; margin-top: 2px;">
            ⚡ ${t("settings.importAmuleAutoBtn")}
          </button>

          <div style="border-top: 1px solid var(--border-subtle); padding-top: 10px; margin-top: 4px;">
            <label style="font-size: 10.5px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 4px; display: block;">
              ${t("settings.customPathLabel")}
            </label>
            <div style="display: flex; gap: 6px;">
              <input type="text" id="input-import-amule-path" class="table-search-input" style="flex: 1; font-size: 11.5px; font-family: var(--font-mono);" placeholder="C:\\Users\\...\\.aMule" />
              <button class="btn btn-secondary btn-sm" id="btn-browse-import-amule" title="Examinar carpeta">📁</button>
              <button class="btn btn-secondary btn-sm" id="btn-import-amule-custom">${t("settings.importCustomBtn")}</button>
            </div>
          </div>
        </div>
      </div>

      <div id="import-feedback-box" style="display: none; padding: 10px 14px; border-radius: var(--radius-sm); font-size: 12px; background: var(--bg-card-header); border: 1px solid var(--border-subtle);"></div>
    </div>

    <!-- Active Client Parameters -->
    <div class="table-container" style="padding: 24px; max-width: 850px;">
      <h3 style="margin-bottom: 16px; font-size: 16px;">${t("settings.emuleParamsTitle")}</h3>
      
      <div style="display: grid; grid-template-columns: 200px 1fr; gap: 12px; margin-bottom: 24px; font-size: 13px;">
        <span style="color: var(--text-secondary);">${t("settings.tempDir")}</span>
        <span style="font-family: var(--font-mono);">${config.temp_dir || "—"}</span>

        <span style="color: var(--text-secondary);">${t("settings.incomingDir")}</span>
        <span style="font-family: var(--font-mono);">${config.incoming_dir || "—"}</span>

        <span style="color: var(--text-secondary);">${t("settings.tcpPort")}</span>
        <span><strong style="color: #6ccb5f;">${config.port}</strong> (${t("settings.highIdRouter")})</span>

        <span style="color: var(--text-secondary);">${t("settings.udpPort")}</span>
        <span><strong style="color: #6ccb5f;">${config.udp_port}</strong> (${t("settings.noFirewall")})</span>

        <span style="color: var(--text-secondary);">${t("settings.limits")}</span>
        <span>${config.max_download > 0 ? `${config.max_download} KB/s` : "∞"} / ${config.max_upload > 0 ? `${config.max_upload} KB/s` : "∞"}</span>

        <span style="color: var(--text-secondary);">${t("settings.ecPort")}</span>
        <span style="font-family: var(--font-mono);">TCP 4712 (Localhost)</span>
      </div>

      <div style="border-top: 1px solid var(--border-subtle); padding-top: 18px;">
        <h4 style="margin-bottom: 8px;">${t("settings.syncTitle")}</h4>
        <p style="color: var(--text-secondary); margin-bottom: 16px; font-size: 12px;">
          ${t("settings.syncDesc")}
        </p>
        <button class="btn btn-primary" id="btn-sync-emule">
          🔄 ${t("settings.syncButton")}
        </button>
        <span id="sync-feedback" style="margin-left: 12px; font-size: 12px; color: #6ccb5f;"></span>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════
// Event Listeners & Interaction
// ═══════════════════════════════════════════════════════════════════

function attachEventListeners() {
  // Breadcrumb navigation
  document.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => navigate("downloads"));
  });


  // Toggle daemon (start/stop)
  document.getElementById("btn-toggle-daemon")?.addEventListener("click", async () => {
    try {
      if (currentDaemonStatus?.running) {
        await api.stopDaemon();
      } else {
        await api.startDaemon();
      }
      setTimeout(() => renderView(), 800);
    } catch (e) {
      console.error("Failed to toggle daemon:", e);
    }
  });

  // Settings: Browse & Open Incoming Folder
  document.getElementById("btn-browse-incoming")?.addEventListener("click", async () => {
    const input = document.getElementById("input-cfg-incoming") as HTMLInputElement;
    const current = input ? input.value : "";
    try {
      const selected = await api.pickFolder(t("settings.incomingDirLabel"), current);
      if (selected && input) {
        input.value = selected;
      }
    } catch (err) {
      console.error("Browse incoming error:", err);
    }
  });

  document.getElementById("btn-open-incoming")?.addEventListener("click", async () => {
    const input = document.getElementById("input-cfg-incoming") as HTMLInputElement;
    if (input && input.value) {
      await api.openFolder(input.value);
    }
  });

  // Settings: Browse & Open Temp Folder
  document.getElementById("btn-browse-temp")?.addEventListener("click", async () => {
    const input = document.getElementById("input-cfg-temp") as HTMLInputElement;
    const current = input ? input.value : "";
    try {
      const selected = await api.pickFolder(t("settings.tempDirLabel"), current);
      if (selected && input) {
        input.value = selected;
      }
    } catch (err) {
      console.error("Browse temp error:", err);
    }
  });

  document.getElementById("btn-open-temp")?.addEventListener("click", async () => {
    const input = document.getElementById("input-cfg-temp") as HTMLInputElement;
    if (input && input.value) {
      await api.openFolder(input.value);
    }
  });

  // Settings: Save Configuration
  document.getElementById("btn-save-config")?.addEventListener("click", async () => {
    const nick = (document.getElementById("input-cfg-nick") as HTMLInputElement)?.value.trim() || "TauriMule-User";
    const incoming = (document.getElementById("input-cfg-incoming") as HTMLInputElement)?.value.trim() || "";
    const temp = (document.getElementById("input-cfg-temp") as HTMLInputElement)?.value.trim() || "";
    const port = parseInt((document.getElementById("input-cfg-port") as HTMLInputElement)?.value || "4662", 10);
    const udpPort = parseInt((document.getElementById("input-cfg-udpport") as HTMLInputElement)?.value || "4672", 10);
    const maxDown = parseInt((document.getElementById("input-cfg-maxdown") as HTMLInputElement)?.value || "0", 10);
    const maxUp = parseInt((document.getElementById("input-cfg-maxup") as HTMLInputElement)?.value || "0", 10);
    const connectEd2k = (document.getElementById("check-cfg-ed2k") as HTMLInputElement)?.checked ?? true;
    const connectKad = (document.getElementById("check-cfg-kad") as HTMLInputElement)?.checked ?? true;
    const autoConnect = (document.getElementById("check-cfg-autoconnect") as HTMLInputElement)?.checked ?? true;
    const feedback = document.getElementById("save-config-feedback");

    const newConfig: AppConfig = {
      nick,
      incoming_dir: incoming,
      temp_dir: temp,
      port: isNaN(port) ? 4662 : port,
      udp_port: isNaN(udpPort) ? 4672 : udpPort,
      max_download: isNaN(maxDown) ? 0 : maxDown,
      max_upload: isNaN(maxUp) ? 0 : maxUp,
      connect_ed2k: connectEd2k,
      connect_kad: connectKad,
      auto_connect: autoConnect,
      config_dir: "",
    };

    try {
      await api.saveConfig(newConfig);
      showToast(`✅ ${t("settings.configSavedSuccess")}`);
      if (feedback) {
        feedback.style.color = "var(--success)";
        feedback.textContent = `✓ ${t("settings.configSavedSuccess")}`;
        setTimeout(() => { if (feedback) feedback.textContent = ""; }, 4000);
      }
    } catch (err) {
      showToast(`⚠️ Error al guardar: ${err}`);
      if (feedback) {
        feedback.style.color = "var(--danger)";
        feedback.textContent = `⚠️ Error: ${err}`;
      }
    }
  });

  // Settings: Import eMule Auto
  document.getElementById("btn-import-emule-auto")?.addEventListener("click", async () => {
    const box = document.getElementById("import-feedback-box");
    if (box) {
      box.style.display = "block";
      box.style.color = "var(--text-primary)";
      box.textContent = "Buscando instalación de eMule en Windows e importando datos...";
    }
    try {
      const res = await api.importFromEmule();
      if (res.success) {
        showToast(`✅ ${res.message}`);
        if (box) {
          box.style.color = "var(--success)";
          box.textContent = `✅ ${res.message} (${res.servers_count} servidores importados). Recargando configuración...`;
        }
        setTimeout(() => renderView(), 1200);
      } else {
        if (box) {
          box.style.color = "var(--danger)";
          box.textContent = `⚠️ ${res.message}`;
        }
      }
    } catch (err) {
      if (box) {
        box.style.color = "var(--danger)";
        box.textContent = `⚠️ Error: ${err}`;
      }
    }
  });

  // Settings: Browse eMule Custom Path
  document.getElementById("btn-browse-import-emule")?.addEventListener("click", async () => {
    const input = document.getElementById("input-import-emule-path") as HTMLInputElement;
    try {
      const sel = await api.pickFolder("Seleccionar carpeta de configuración de eMule", input?.value);
      if (sel && input) input.value = sel;
    } catch (e) {
      console.error(e);
    }
  });

  // Settings: Import eMule Custom
  document.getElementById("btn-import-emule-custom")?.addEventListener("click", async () => {
    const path = (document.getElementById("input-import-emule-path") as HTMLInputElement)?.value.trim();
    const box = document.getElementById("import-feedback-box");
    if (!path) {
      if (box) {
        box.style.display = "block";
        box.style.color = "var(--warning)";
        box.textContent = "Por favor, selecciona o escribe una ruta válida.";
      }
      return;
    }
    if (box) {
      box.style.display = "block";
      box.style.color = "var(--text-primary)";
      box.textContent = `Importando desde ${path}...`;
    }
    try {
      const res = await api.importFromEmule(path);
      if (res.success) {
        showToast(`✅ ${res.message}`);
        if (box) {
          box.style.color = "var(--success)";
          box.textContent = `✅ ${res.message} (${res.servers_count} servidores). Recargando configuración...`;
        }
        setTimeout(() => renderView(), 1200);
      } else {
        if (box) {
          box.style.color = "var(--danger)";
          box.textContent = `⚠️ ${res.message}`;
        }
      }
    } catch (err) {
      if (box) {
        box.style.color = "var(--danger)";
        box.textContent = `⚠️ Error: ${err}`;
      }
    }
  });

  // Settings: Import aMule Auto
  document.getElementById("btn-import-amule-auto")?.addEventListener("click", async () => {
    const box = document.getElementById("import-feedback-box");
    if (box) {
      box.style.display = "block";
      box.style.color = "var(--text-primary)";
      box.textContent = "Buscando configuración previa de aMule e importando datos...";
    }
    try {
      const res = await api.importFromAmule();
      if (res.success) {
        showToast(`✅ ${res.message}`);
        if (box) {
          box.style.color = "var(--success)";
          box.textContent = `✅ ${res.message} (${res.servers_count} servidores importados). Recargando configuración...`;
        }
        setTimeout(() => renderView(), 1200);
      } else {
        if (box) {
          box.style.color = "var(--danger)";
          box.textContent = `⚠️ ${res.message}`;
        }
      }
    } catch (err) {
      if (box) {
        box.style.color = "var(--danger)";
        box.textContent = `⚠️ Error: ${err}`;
      }
    }
  });

  // Settings: Browse aMule Custom Path
  document.getElementById("btn-browse-import-amule")?.addEventListener("click", async () => {
    const input = document.getElementById("input-import-amule-path") as HTMLInputElement;
    try {
      const sel = await api.pickFolder("Seleccionar carpeta de configuración de aMule", input?.value);
      if (sel && input) input.value = sel;
    } catch (e) {
      console.error(e);
    }
  });

  // Settings: Import aMule Custom
  document.getElementById("btn-import-amule-custom")?.addEventListener("click", async () => {
    const path = (document.getElementById("input-import-amule-path") as HTMLInputElement)?.value.trim();
    const box = document.getElementById("import-feedback-box");
    if (!path) {
      if (box) {
        box.style.display = "block";
        box.style.color = "var(--warning)";
        box.textContent = "Por favor, selecciona o escribe una ruta válida.";
      }
      return;
    }
    if (box) {
      box.style.display = "block";
      box.style.color = "var(--text-primary)";
      box.textContent = `Importando desde ${path}...`;
    }
    try {
      const res = await api.importFromAmule(path);
      if (res.success) {
        showToast(`✅ ${res.message}`);
        if (box) {
          box.style.color = "var(--success)";
          box.textContent = `✅ ${res.message} (${res.servers_count} servidores). Recargando configuración...`;
        }
        setTimeout(() => renderView(), 1200);
      } else {
        if (box) {
          box.style.color = "var(--danger)";
          box.textContent = `⚠️ ${res.message}`;
        }
      }
    } catch (err) {
      if (box) {
        box.style.color = "var(--danger)";
        box.textContent = `⚠️ Error: ${err}`;
      }
    }
  });

  // Re-import eMule button (sync card)
  document.getElementById("btn-sync-emule")?.addEventListener("click", async () => {
    const feedback = document.getElementById("sync-feedback");
    if (feedback) {
      feedback.style.color = "var(--text-primary)";
      feedback.textContent = t("settings.syncing");
    }
    try {
      const res = await api.importFromEmule();
      if (feedback) {
        feedback.style.color = res.success ? "var(--success)" : "var(--danger)";
        feedback.textContent = res.success ? `✓ ${res.message}` : `⚠️ ${res.message}`;
      }
      setTimeout(() => renderView(), 1200);
    } catch (err) {
      if (feedback) {
        feedback.style.color = "var(--danger)";
        feedback.textContent = `⚠️ Error: ${err}`;
      }
    }
  });

  // eD2k Association Buttons
  document.getElementById("btn-associate-ed2k")?.addEventListener("click", async () => {
    try {
      await api.registerEd2kAssociation();
      showToast(`🔗 ${t("settings.ed2kAssociatedSuccess")}`);
      await renderView();
    } catch (err) {
      showToast(`⚠️ ${err}`);
    }
  });

  document.getElementById("btn-unassociate-ed2k")?.addEventListener("click", async () => {
    try {
      await api.unregisterEd2kAssociation();
      showToast(`ℹ️ ${t("settings.ed2kUnassociatedSuccess")}`);
      await renderView();
    } catch (err) {
      showToast(`⚠️ ${err}`);
    }
  });

  // Theme select in Settings
  document.getElementById("select-theme")?.addEventListener("change", (e) => {
    const val = (e.target as HTMLSelectElement).value as ColorScheme;
    ThemeManager.setColorScheme(val);
    renderAppShell();
    renderView();
  });

  // Language select in Settings
  document.getElementById("select-language")?.addEventListener("change", (e) => {
    const val = (e.target as HTMLSelectElement).value as LanguageSetting;
    I18nManager.setLanguage(val);
  });

  // State tester buttons (logo showcase)
  document.querySelectorAll("[data-test-state]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const state = (e.currentTarget as HTMLElement).dataset.testState;
      if (state === "auto") {
        manualLogoOverride = null;
      } else if (state === "connected" || state === "downloading" || state === "warning" || state === "idle") {
        manualLogoOverride = state;
        updateAppLogo(state);
      }
      renderView();
    });
  });


  // Refresh & Manage servers
  document.getElementById("btn-refresh-servers")?.addEventListener("click", () => renderView());
  document.getElementById("btn-show-add-server")?.addEventListener("click", () => showAddServerModal());
  document.getElementById("btn-show-update-servermet")?.addEventListener("click", () => showUpdateServerMetModal());

  // Search tab selection
  document.querySelectorAll(".search-tab").forEach((tabEl) => {
    tabEl.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains("search-tab-close")) return;
      const tabId = (tabEl as HTMLElement).dataset.tabId;
      if (tabId && tabId !== activeSearchTabId) {
        activeSearchTabId = tabId;
        renderView();
      }
    });
  });

  // Search tab close button
  document.querySelectorAll("[data-close-tab]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const tabId = (btn as HTMLElement).dataset.closeTab;
      if (tabId) {
        closeSearchTab(tabId);
        renderView();
      }
    });
  });

  // Search new tab button
  document.getElementById("btn-new-search-tab")?.addEventListener("click", () => {
    const input = document.getElementById("search-query") as HTMLInputElement;
    if (input) {
      input.value = "";
      input.focus();
    }
  });

  // Delete individual search from memory
  document.querySelectorAll("[data-delete-history]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const q = decodeURIComponent((btn as HTMLElement).dataset.deleteHistory || "");
      if (q) {
        removeFromSearchHistory(q);
        renderView();
      }
    });
  });

  // Clear all search history
  document.getElementById("btn-clear-all-history")?.addEventListener("click", () => {
    clearAllSearchHistory();
    renderView();
  });

  // Click history chip text to execute search / switch to tab
  document.querySelectorAll("[data-action='run-history-query']").forEach((chipText) => {
    chipText.addEventListener("click", async (e) => {
      e.stopPropagation();
      const query = decodeURIComponent((chipText as HTMLElement).dataset.query || "");
      if (!query) return;

      const existingTab = searchTabs.find((t) => t.query.toLowerCase() === query.toLowerCase());
      if (existingTab) {
        activeSearchTabId = existingTab.id;
        renderView();
        return;
      }

      const searchType = (document.getElementById("search-type") as HTMLSelectElement)?.value as any || "Global";
      const fileType = (document.getElementById("search-filetype") as HTMLSelectElement)?.value || undefined;
      addToSearchHistory(query, searchType, fileType);
      const tab = createOrActivateSearchTab(query, searchType, fileType);
      tab.isSearching = true;
      renderView();

      try {
        await api.startSearch({ query, search_type: searchType, file_type: fileType });
        const fetchResults = async () => {
          try {
            const results = await api.getSearchResults();
            tab.results = results;
            tab.isSearching = false;
            if (currentView === "search" && activeSearchTabId === tab.id) {
              renderView();
            }
          } catch {
            tab.isSearching = false;
            if (currentView === "search" && activeSearchTabId === tab.id) {
              renderView();
            }
          }
        };
        setTimeout(fetchResults, 350);
        setTimeout(fetchResults, 900);
        setTimeout(fetchResults, 2000);
      } catch (err) {
        tab.isSearching = false;
        renderView();
      }
    });
  });

  // Sortable column headers in Search Results
  document.querySelectorAll("[data-sort-search]").forEach((th) => {
    th.addEventListener("click", (e) => {
      const col = (e.currentTarget as HTMLElement).dataset.sortSearch as SearchSortColumn;
      if (!col) return;
      if (searchSortColumn === col) {
        searchSortDirection = searchSortDirection === "asc" ? "desc" : "asc";
      } else {
        searchSortColumn = col;
        searchSortDirection = col === "name" || col === "file_type" ? "asc" : "desc";
      }
      renderView();
    });
  });

  // Search form submit
  document.getElementById("search-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const queryInput = document.getElementById("search-query") as HTMLInputElement;
    const query = queryInput ? queryInput.value.trim() : "";
    if (!query) return;

    // Detect if query is an eD2k link
    if (query.startsWith("ed2k://") || query.includes("ed2k://|file|")) {
      showAddEd2kModal(query);
      return;
    }

    const searchType = (document.getElementById("search-type") as HTMLSelectElement)?.value as any || "Global";
    const fileType = (document.getElementById("search-filetype") as HTMLSelectElement)?.value || undefined;

    addToSearchHistory(query, searchType, fileType);
    const tab = createOrActivateSearchTab(query, searchType, fileType);
    tab.isSearching = true;
    renderView();

    try {
      await api.startSearch({ query, search_type: searchType, file_type: fileType });

      // Poll search results at 350ms, 900ms, and 2000ms
      const fetchResults = async () => {
        try {
          const results = await api.getSearchResults();
          tab.results = results;
          tab.isSearching = false;
          if (currentView === "search" && activeSearchTabId === tab.id) {
            renderView();
          }
        } catch (err) {
          tab.isSearching = false;
          if (currentView === "search" && activeSearchTabId === tab.id) {
            renderView();
          }
        }
      };

      setTimeout(fetchResults, 350);
      setTimeout(fetchResults, 900);
      setTimeout(fetchResults, 2000);
    } catch (err) {
      tab.isSearching = false;
      if (currentView === "search" && activeSearchTabId === tab.id) {
        renderView();
      }
    }
  });

  document.getElementById("btn-stop-search")?.addEventListener("click", async () => {
    try {
      await api.stopSearch();
      const activeTab = getActiveTab();
      if (activeTab) {
        activeTab.isSearching = false;
      }
      showToast("⏹ Búsqueda detenida");
      renderView();
    } catch (e) {
      console.warn("Stop search error:", e);
    }
  });

  // Action Delegation
  document.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", handleActionClick);
  });

  // Right-click & Double-click on Download Rows (Syncdrome Context Menu)
  document.querySelectorAll(".download-row").forEach((row) => {
    attachDownloadRowInteractions(row as HTMLElement);
  });

  // Right-click on Search Results rows
  document.querySelectorAll(".search-result-row").forEach((row) => {
    const el = row as HTMLElement;
    const name = safeDecode(el.dataset.name);
    const hash = el.dataset.hash || "";
    const size = parseInt(el.dataset.size || "0");

    el.addEventListener("contextmenu", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const items: ContextMenuItem[] = [
        {
          label: `⬇ ${t("search.downloadAction")}`,
          icon: "⬇️",
          onClick: async () => {
            await api.downloadFile(hash);
            navigate("downloads");
          },
        },
        "divider",
        {
          label: t("contextMenu.copyEd2k"),
          icon: "📋",
          onClick: async () => {
            const ed2kLink = `ed2k://|file|${name}|${size}|${hash}|/`;
            try {
              await navigator.clipboard.writeText(ed2kLink);
              showToast(`📋 ${t("cleaner.copied")}`);
            } catch {
              showToast(ed2kLink);
            }
          },
        },
        {
          label: t("contextMenu.copyHash"),
          icon: "🔑",
          onClick: async () => {
            try {
              await navigator.clipboard.writeText(hash);
              showToast(`🔑 Hash copiado`);
            } catch {
              showToast(hash);
            }
          },
        },
      ];

      showContextMenu(e.clientX, e.clientY, items);
    });
  });

  // Right-click on Servers rows (Context menu)
  document.querySelectorAll(".server-row").forEach((row) => {
    const el = row as HTMLElement;
    const ip = el.dataset.ip || "";
    const port = parseInt(el.dataset.port || "0", 10);
    const isConnected = el.dataset.connected === "true";

    el.addEventListener("contextmenu", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const items: ContextMenuItem[] = [
        {
          label: isConnected ? t("common.disconnect") : t("common.connect"),
          icon: isConnected ? "⏹" : "⚡",
          onClick: async () => {
            if (isConnected) {
              await api.disconnectServer();
            } else {
              await api.connectServer(ip, port);
            }
            renderView();
          },
        },
        "divider",
        {
          label: `${t("servers.serverIpLabel")}: ${ip}:${port}`,
          icon: "📋",
          onClick: async () => {
            const addr = `${ip}:${port}`;
            try {
              await navigator.clipboard.writeText(addr);
              showToast(`📋 Copiado: ${addr}`);
            } catch {
              showToast(addr);
            }
          },
        },
        "divider",
        {
          label: t("servers.removeServer"),
          icon: "🗑️",
          danger: true,
          onClick: async () => {
            if (await confirmDialog(t("servers.confirmRemoveServer"), { title: t("servers.removeServer"), confirmLabel: t("common.delete"), danger: true, icon: "🗑️" })) {
              try {
                await api.removeServer(ip, port);
                showToast(`🗑️ ${t("servers.serverRemovedSuccess")}`);
                renderView();
              } catch (err) {
                showToast(`⚠️ Error: ${err}`);
              }
            }
          },
        },
      ];

      showContextMenu(e.clientX, e.clientY, items);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════
// Status Bar & Polling
// ═══════════════════════════════════════════════════════════════════

function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(() => {
    // Only refresh if not typing to avoid losing focus
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.id === "input-filter-downloads" || activeEl.id === "search-query")) {
      return;
    }
    // Never re-render whole view if on Search, Settings, or Downloads to prevent wiping user UI!
    if (currentView === "search" || currentView === "settings" || currentView === "downloads") {
      return;
    }
    renderView();
  }, 3000);
}

function updateFooter(stats: GlobalStats | null) {
  lastStats = stats;
  const el = document.getElementById("status-bar");
  if (!el) return;
  if (!stats) {
    el.innerHTML = `<span>${isAppStartingUp ? `⏳ ${t("status.startingDaemon")}` : t("status.disconnectedFromDaemon")}</span>`;
    if (!manualLogoOverride && currentLogoState !== "idle") {
      updateAppLogo("idle");
    }
    return;
  }

  // Dynamic logo state update based on real network & download conditions
  if (!manualLogoOverride) {
    let nextState: LogoState = "idle";
    if (stats.download_speed > 1024) {
      nextState = "downloading";
    } else if (stats.kad_firewalled) {
      nextState = "warning";
    } else if (stats.ed2k_connected || stats.kad_connected) {
      nextState = "connected";
    }
    if (nextState !== currentLogoState) {
      updateAppLogo(nextState);
    }
  }

  const ed2kStatus = stats.ed2k_connected
    ? `🟢 ${t("common.connect")} (${stats.ed2k_id})`
    : `🔴 ${t("common.disconnect")} (${stats.ed2k_id})`;

  const kadStatus = stats.kad_connected
    ? (stats.kad_firewalled ? `🟡 ${t("servers.kadFirewalled")}` : `🟢 ${t("servers.kadOpen")}`)
    : `🔴 ${t("servers.kadDisconnected")}`;

  el.innerHTML = `
    <div class="footer-metrics">
      <div class="footer-item">▼ <strong>${formatSpeed(stats.download_speed)}</strong></div>
      <div class="footer-item">▲ <strong>${formatSpeed(stats.upload_speed)}</strong></div>
      <span class="footer-sep">|</span>
      <div class="footer-item">eD2k: ${ed2kStatus}</div>
      <span class="footer-sep">|</span>
      <div class="footer-item">Kad: ${kadStatus}</div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════
// App Shell Initialization
// ═══════════════════════════════════════════════════════════════════

function renderAppShell() {
  const currentTheme = ThemeManager.getColorScheme();
  const isDark = ThemeManager.isEffectiveDark();
  const themeIcon = currentTheme === "system" ? "💻" : (isDark ? "🌙" : "☀️");
  const themeLabel =
    currentTheme === "system"
      ? t("settings.themeSystem")
      : isDark
      ? t("settings.themeDark")
      : t("settings.themeLight");

  document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
    <div class="app-shell">
      <nav class="sidebar">
        <div class="sidebar-header" style="cursor: pointer; gap: 10px;" title="TauriMule: ${t("settings.title")}" onclick="window.navigateToView('settings')">
          <div id="sidebar-logo-container" style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; flex-shrink: 0;">
            ${getLogoSvg(currentLogoState, 28, "sb-logo")}
          </div>
          <div class="sidebar-brand-text" style="display: flex; flex-direction: column; line-height: 1.15; overflow: hidden;">
            <span style="font-weight: 700; font-size: 14px; letter-spacing: -0.3px; color: var(--text-primary);">TauriMule</span>
            <span id="brand-status-tag" class="brand-badge state-${currentLogoState}">${getLocalizedLogoLabel(currentLogoState)}</span>
          </div>
        </div>

        <div class="nav-section-title">${t("nav.navigation")}</div>
        <div class="nav-item ${currentView === "downloads" ? "active" : ""}" data-view="downloads">
          <span class="nav-icon">⬇️</span>
          <span>${t("nav.downloads")}</span>
          <span class="nav-badge" id="badge-dl-count">${cachedDownloads.length}</span>
        </div>
        <div class="nav-item ${currentView === "servers" ? "active" : ""}" data-view="servers">
          <span class="nav-icon">🌐</span>
          <span>${t("nav.servers")}</span>
        </div>
        <div class="nav-item ${currentView === "search" ? "active" : ""}" data-view="search">
          <span class="nav-icon">🔍</span>
          <span>${t("nav.search")}</span>
        </div>
        <div class="nav-item ${currentView === "uploads" ? "active" : ""}" data-view="uploads">
          <span class="nav-icon">⬆️</span>
          <span>${t("nav.uploads")}</span>
        </div>

        <div class="nav-section-title" style="margin-top: 14px;">${t("nav.preferences")}</div>
        <div class="nav-item ${currentView === "settings" ? "active" : ""}" data-view="settings">
          <span class="nav-icon">⚙️</span>
          <span>${t("nav.settings")}</span>
        </div>

        <div class="sidebar-spacer"></div>

        <div class="sidebar-footer" style="display: flex; flex-direction: column; gap: 8px;">
          <button class="sidebar-theme-btn" id="btn-quick-theme" title="${t("settings.appearance")}: ${themeLabel}">
            <span>${themeIcon}</span>
            <span style="flex: 1; text-align: left;">${themeLabel}</span>
          </button>
          <div>TauriMule ${t("nav.version")}</div>
        </div>
      </nav>

      <main class="main-content">
        <div id="content"></div>
      </main>

      <footer class="status-footer" id="status-bar">
        <span>${t("status.startingDaemon")}</span>
      </footer>
    </div>`;

  // Navigation clicks
  document.querySelectorAll(".nav-item").forEach((el) => {
    el.addEventListener("click", () => navigate(el.getAttribute("data-view") as ViewName));
  });

  // Quick theme toggle click (cycles dark -> light -> system)
  document.getElementById("btn-quick-theme")?.addEventListener("click", () => {
    const scheme = ThemeManager.getColorScheme();
    let next: ColorScheme = "dark";
    if (scheme === "dark") next = "light";
    else if (scheme === "light") next = "system";
    else next = "dark";
    ThemeManager.setColorScheme(next);
    renderAppShell();
    renderView();
  });
}

// ═══════════════════════════════════════════════════════════════════
// Application Boot & Startup Screen (Ventana de Espere del Motor aMule)
// ═══════════════════════════════════════════════════════════════════

async function bootApplication() {
  renderAppShell();

  // Create & mount the startup splash overlay
  const splashEl = document.createElement("div");
  splashEl.id = "taurimule-startup-splash";
  splashEl.className = "startup-splash-overlay";
  splashEl.innerHTML = `
    <div class="startup-splash-card">
      <div class="splash-logo-container">
        <div class="splash-pulse-ring"></div>
        ${getLogoSvg(currentLogoState, 68, "splash-logo")}
      </div>
      <div class="splash-title">${t("splash.title")}</div>
      <div class="splash-subtitle">${t("splash.subtitle")}</div>
      <div class="splash-progress-track">
        <div class="splash-progress-bar"></div>
      </div>
      <div class="splash-status-text" id="splash-status">${t("splash.stepDaemon")}</div>
      <div class="splash-timeout-actions" id="splash-timeout-actions">
        <button class="btn btn-primary btn-sm" id="btn-splash-retry">🔄 ${t("splash.retry")}</button>
        <button class="btn btn-secondary btn-sm" id="btn-splash-continue">${t("splash.continueAnyway")}</button>
      </div>
    </div>
  `;
  document.body.appendChild(splashEl);

  const statusEl = splashEl.querySelector("#splash-status") as HTMLElement | null;
  const timeoutActions = splashEl.querySelector("#splash-timeout-actions") as HTMLElement | null;

  const dismissSplash = () => {
    isAppStartingUp = false;
    splashEl.classList.add("fade-out");
    setTimeout(() => {
      splashEl.remove();
    }, 450);
    renderView();
  };

  let checkAttempts = 0;
  const maxFastAttempts = 40; // ~10 seconds

  splashEl.querySelector("#btn-splash-retry")?.addEventListener("click", async () => {
    if (timeoutActions) timeoutActions.style.display = "none";
    if (statusEl) statusEl.textContent = t("splash.stepDaemon");
    try {
      await api.startDaemon();
    } catch {}
    checkAttempts = 0;
  });

  splashEl.querySelector("#btn-splash-continue")?.addEventListener("click", () => {
    dismissSplash();
  });

  // Fast polling loop to connect to amuled EC protocol
  const startupTimer = setInterval(async () => {
    checkAttempts++;
    try {
      const status = await api.getDaemonStatus();
      currentDaemonStatus = status;

      if (status.running && !status.ec_connected) {
        if (statusEl) statusEl.textContent = t("splash.stepEc");
      }

      if (status.ec_connected) {
        clearInterval(startupTimer);
        if (statusEl) statusEl.textContent = t("splash.stepSync");

        // Preload snapshot before removing splash
        try {
          const snap = await api.getSnapshot();
          if (snap) {
            cachedDownloads = snap.downloads || [];
            if (snap.stats) {
              lastStats = snap.stats;
              updateFooter(snap.stats);
            }
            const badgeEl = document.getElementById("badge-dl-count");
            if (badgeEl) badgeEl.textContent = cachedDownloads.length.toString();
          }
        } catch (e) {
          console.warn("Initial snapshot load error:", e);
        }

        if (statusEl) statusEl.textContent = t("splash.stepReady");
        setTimeout(() => {
          dismissSplash();
        }, 350);
        return;
      }
    } catch (e) {
      console.warn("Daemon check error:", e);
    }

    if (checkAttempts >= maxFastAttempts) {
      clearInterval(startupTimer);
      if (statusEl) statusEl.textContent = t("splash.timeout");
      if (timeoutActions) timeoutActions.style.display = "flex";
    }
  }, 250);

  // Render downloads view in background
  navigate("downloads");
}

// Initial boot
bootApplication();

// Global paste listener: if user pastes an eD2k link anywhere in the app
window.addEventListener("paste", (e: ClipboardEvent) => {
  const activeEl = document.activeElement;
  if (activeEl?.id === "input-ed2k-textarea") {
    return;
  }
  const pasted = e.clipboardData?.getData("text") || "";
  if (pasted.includes("ed2k://|file|")) {
    e.preventDefault();
    showAddEd2kModal(pasted.trim());
  }
});

// Sequential queue for deep link / browser additions to prevent EC lock contention
let addLinkQueue: Promise<void> = Promise.resolve();

function enqueueAddEd2kLink(rawLink: string) {
  const link = rawLink.trim();
  if (!link || !link.startsWith("ed2k://")) return;

  addLinkQueue = addLinkQueue.then(async () => {
    let retries = 0;
    while (retries < 25) {
      try {
        const res = await api.addEd2kLink(link);
        showToast(`✅ ${t("downloads.linkAddedSuccess")}: ${res.name}`);
        return;
      } catch (err: any) {
        const errStr = err ? err.toString() : "";
        if ((errStr.includes("Not connected") || errStr.includes("EC connection busy")) && retries < 20) {
          retries++;
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }
        console.error("Auto-add ed2k link error:", err);
        showToast(`⚠️ Error al añadir enlace: ${err}`);
        return;
      }
    }
  });
}

// Deep link listener: catch ed2k:// links launched from browser / protocol handler — add directly without prompting!
listen<string>("ed2k-link-received", (event) => {
  const link = event.payload;
  if (link && link.startsWith("ed2k://")) {
    enqueueAddEd2kLink(link);
  }
});

// Real-time backend poller event listeners
listen<Snapshot>("downloads-updated", (event) => {
  const snap = event.payload;
  if (!snap) return;
  cachedDownloads = snap.downloads || [];
  if (snap.stats) {
    lastStats = snap.stats;
    updateFooter(snap.stats);
  }
  const badgeEl = document.getElementById("badge-dl-count");
  if (badgeEl) badgeEl.textContent = cachedDownloads.length.toString();

  if (currentView === "downloads") {
    applySnapshotToDownloadsView(snap);
  }
});

listen<{ connected: boolean; error: string | null }>("daemon-status", (event) => {
  if (!event.payload.connected) {
    updateFooter(null);
  }
});

// Deshabilitar globalmente el menú contextual nativo del navegador (Back, Forward, Reload, Inspect, etc.)
window.addEventListener("contextmenu", (e: MouseEvent) => {
  e.preventDefault();
});
