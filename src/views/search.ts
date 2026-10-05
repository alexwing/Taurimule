import { api, type SearchResult } from "../lib/tauri-bridge";
import { showContextMenu, type ContextMenuItem } from "../lib/context-menu";
import { t } from "../lib/i18n";
import { escapeHtml } from "../lib/html";
import { formatSize, getFileIcon, safeDecode } from "../lib/format";
import {
  sortSearchResults,
  renderSearchSortIcon,
  type SortDirection,
  type SearchSortColumn,
} from "../lib/sort";
import { state } from "../state/store";
import { navigate, renderView } from "../app/router";
import { renderHeader } from "../ui/header";
import { showToast } from "../ui/dialogs";
import { showAddEd2kModal } from "../ui/ed2k-modal";

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

let searchHistory: SearchHistoryEntry[] = [];

// Search table sorting state
let searchSortColumn: SearchSortColumn = "sources";
let searchSortDirection: SortDirection = "desc";

export function loadSearchHistory(): void {
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
  if (!state.activeSearchTabId) {
    return state.searchTabs.length > 0 ? state.searchTabs[0] : null;
  }
  return state.searchTabs.find((t) => t.id === state.activeSearchTabId) || (state.searchTabs.length > 0 ? state.searchTabs[0] : null);
}

function createOrActivateSearchTab(
  query: string,
  searchType: "Global" | "Kad" | "Local",
  fileType?: string
): SearchTab {
  const existing = state.searchTabs.find(
    (t) => t.query.toLowerCase() === query.trim().toLowerCase()
  );
  if (existing) {
    state.activeSearchTabId = existing.id;
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
  state.searchTabs.push(newTab);
  state.activeSearchTabId = newTab.id;
  return newTab;
}

function closeSearchTab(tabId: string): void {
  const idx = state.searchTabs.findIndex((t) => t.id === tabId);
  if (idx === -1) return;
  state.searchTabs.splice(idx, 1);
  if (state.activeSearchTabId === tabId) {
    if (state.searchTabs.length > 0) {
      const nextIdx = Math.min(idx, state.searchTabs.length - 1);
      state.activeSearchTabId = state.searchTabs[nextIdx].id;
    } else {
      state.activeSearchTabId = null;
    }
  }
}

// ── Search launching & result polling ──
// aMule only runs one search at a time, so a single generation counter is enough:
// every launch/stop bumps it and any polling loop from an older generation exits
// without touching the tabs.
const SEARCH_POLL_FIRST_MS = 350;
const SEARCH_POLL_INTERVAL_MS = 1000;
const SEARCH_POLL_MAX_MS = 30000;
let searchGeneration = 0;
let searchingTabId: string | null = null;

/** Invalidates the running polling loop (if any) and clears its tab's spinner. */
function stopSearchPolling(): void {
  searchGeneration++;
  const tab = searchingTabId ? state.searchTabs.find((x) => x.id === searchingTabId) : undefined;
  if (tab) tab.isSearching = false;
  searchingTabId = null;
}

function searchResultsSignature(results: SearchResult[]): string {
  return results.map((r) => `${r.hash}:${r.sources}`).join("|");
}

/** Re-renders the search view keeping whatever the user is typing in the form. */
async function refreshSearchView(generation: number): Promise<void> {
  const queryInput = document.getElementById("search-query") as HTMLInputElement | null;
  const typeSelect = document.getElementById("search-type") as HTMLSelectElement | null;
  const fileSelect = document.getElementById("search-filetype") as HTMLSelectElement | null;
  const form = queryInput
    ? {
        query: queryInput.value,
        focused: document.activeElement === queryInput,
        start: queryInput.selectionStart,
        end: queryInput.selectionEnd,
        type: typeSelect?.value,
        fileType: fileSelect?.value,
      }
    : null;

  await renderView();

  if (!form || generation !== searchGeneration || state.currentView !== "search") return;
  const newQuery = document.getElementById("search-query") as HTMLInputElement | null;
  if (!newQuery) return;
  newQuery.value = form.query;
  const newType = document.getElementById("search-type") as HTMLSelectElement | null;
  const newFile = document.getElementById("search-filetype") as HTMLSelectElement | null;
  if (newType && form.type !== undefined) newType.value = form.type;
  if (newFile && form.fileType !== undefined) newFile.value = form.fileType;
  if (form.focused) {
    newQuery.focus();
    if (form.start !== null && form.end !== null) newQuery.setSelectionRange(form.start, form.end);
  }
}

async function pollSearchResults(generation: number, tabId: string): Promise<void> {
  const isVisible = () => state.currentView === "search" && state.activeSearchTabId === tabId;
  const startedAt = Date.now();
  let delay = SEARCH_POLL_FIRST_MS;
  let lastSignature = searchResultsSignature(state.searchTabs.find((x) => x.id === tabId)?.results ?? []);

  while (Date.now() - startedAt < SEARCH_POLL_MAX_MS) {
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
    delay = SEARCH_POLL_INTERVAL_MS;
    if (generation !== searchGeneration) return;

    let results: SearchResult[] | null = null;
    try {
      results = await api.getSearchResults();
    } catch {
      // Transient IPC failure: keep polling until the time budget runs out
    }
    if (generation !== searchGeneration) return;

    const tab = state.searchTabs.find((x) => x.id === tabId);
    if (!tab) {
      searchingTabId = null;
      return;
    }
    if (results) {
      tab.results = results;
      const signature = searchResultsSignature(results);
      if (signature !== lastSignature) {
        lastSignature = signature;
        if (isVisible()) void refreshSearchView(generation);
      }
    }
  }

  const tab = state.searchTabs.find((x) => x.id === tabId);
  if (tab) tab.isSearching = false;
  searchingTabId = null;
  if (isVisible()) void refreshSearchView(generation);
}

export async function launchSearch(
  query: string,
  searchType: SearchTab["searchType"],
  fileType?: string
): Promise<void> {
  addToSearchHistory(query, searchType, fileType);
  stopSearchPolling();
  const generation = searchGeneration;
  const tab = createOrActivateSearchTab(query, searchType, fileType);
  tab.isSearching = true;
  searchingTabId = tab.id;
  renderView();

  try {
    await api.startSearch({ query, search_type: searchType, file_type: fileType });
  } catch {
    if (generation === searchGeneration) {
      tab.isSearching = false;
      searchingTabId = null;
      if (state.currentView === "search" && state.activeSearchTabId === tab.id) {
        renderView();
      }
    }
    return;
  }
  if (generation !== searchGeneration) return;
  void pollSearchResults(generation, tab.id);
}

// ═══════════════════════════════════════════════════════════════════
// 3. SEARCH VIEW (Búsqueda)
// ═══════════════════════════════════════════════════════════════════

function renderSearchResultsTable(results: SearchResult[], query: string): string {
  if (results.length === 0) {
    return `
      <div class="table-container">
        <div style="padding: 40px; text-align: center; color: var(--text-tertiary);">
          ${escapeHtml(t("search.noResults", { query }))}
        </div>
      </div>`;
  }

  const sorted = sortSearchResults(results, searchSortColumn, searchSortDirection);

  return `
    <div class="table-container">
      <div class="table-toolbar">
        <div style="font-weight: 600; font-size: 13px;">
          ${escapeHtml(t("search.resultsCount", { count: sorted.length, query }))}
        </div>
      </div>
      <table class="fluent-table">
        <thead>
          <tr>
            <th class="sortable-th ${searchSortColumn === "name" ? "sorted-" + searchSortDirection : ""}" data-sort-search="name" style="width: 52%;" title="Ordenar por Nombre">
              <div class="th-content">
                <span>${t("downloads.fileName")}</span>
                ${renderSearchSortIcon("name", searchSortColumn, searchSortDirection)}
              </div>
            </th>
            <th class="sortable-th ${searchSortColumn === "size" ? "sorted-" + searchSortDirection : ""}" data-sort-search="size" style="width: 12%;" title="Ordenar por Tamaño">
              <div class="th-content">
                <span>${t("downloads.fileSize")}</span>
                ${renderSearchSortIcon("size", searchSortColumn, searchSortDirection)}
              </div>
            </th>
            <th class="sortable-th ${searchSortColumn === "sources" ? "sorted-" + searchSortDirection : ""}" data-sort-search="sources" style="width: 10%;" title="Ordenar por Fuentes">
              <div class="th-content">
                <span>${t("downloads.fileSources")}</span>
                ${renderSearchSortIcon("sources", searchSortColumn, searchSortDirection)}
              </div>
            </th>
            <th class="sortable-th ${searchSortColumn === "file_type" ? "sorted-" + searchSortDirection : ""}" data-sort-search="file_type" style="width: 12%;" title="Ordenar por Tipo">
              <div class="th-content">
                <span>${t("downloads.fileType")}</span>
                ${renderSearchSortIcon("file_type", searchSortColumn, searchSortDirection)}
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
              data-hash="${escapeHtml(r.hash)}" 
              data-name="${encodeURIComponent(r.name)}" 
              data-size="${r.size}"
              title="Clic derecho para opciones de descarga"
            >
              <td>
                <div class="file-title-cell">
                  <span class="file-icon">${getFileIcon(r.name)}</span>
                  <span class="file-name-text" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</span>
                </div>
              </td>
              <td>${formatSize(r.size)}</td>
              <td>${r.sources}</td>
              <td>${escapeHtml(r.file_type)}</td>
              <td style="text-align: right; white-space: nowrap;">
                <button class="btn btn-primary btn-icon" data-action="download" data-hash="${escapeHtml(r.hash)}">⬇ ${t("search.downloadAction")}</button>
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

export function renderSearchView(): string {
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
              <div class="history-chip" title="${escapeHtml(item.query)}">
                <span class="history-chip-text" data-action="run-history-query" data-query="${encodeURIComponent(item.query)}">
                  🔍 ${escapeHtml(item.query)}
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
    state.searchTabs.length > 0
      ? `
    <div class="search-tabs-container">
      <div class="search-tabs-scroll">
        ${state.searchTabs
          .map(
            (tab) => `
          <div 
            class="search-tab ${tab.id === state.activeSearchTabId ? "active" : ""}" 
            data-tab-id="${tab.id}"
            title="${escapeHtml(tab.query)} (${tab.results.length} resultados)"
          >
            <span class="search-tab-icon ${tab.isSearching ? "spinning" : ""}">${tab.isSearching ? "🔄" : "🔍"}</span>
            <span class="search-tab-title">${escapeHtml(tab.query)}</span>
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
            <div style="font-weight: 500;">${t("search.searching")} "${escapeHtml(activeTab.query)}"...</div>
          </div>
        </div>`;
    } else if (activeTab.results.length > 0) {
      resultsAreaHtml = renderSearchResultsTable(activeTab.results, activeTab.query);
    } else if (!activeTab.isSearching) {
      resultsAreaHtml = `
        <div class="table-container">
          <div style="padding: 40px; text-align: center; color: var(--text-tertiary);">
            <div style="font-size: 24px; margin-bottom: 8px;">📂</div>
            <div>${escapeHtml(t("search.noResults", { query: activeTab.query }))}</div>
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
          value="${escapeHtml(currentQuery)}"
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

export function attachSearchListeners() {
  // Search tab selection
  document.querySelectorAll(".search-tab").forEach((tabEl) => {
    tabEl.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains("search-tab-close")) return;
      const tabId = (tabEl as HTMLElement).dataset.tabId;
      if (tabId && tabId !== state.activeSearchTabId) {
        state.activeSearchTabId = tabId;
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

    const searchType = (document.getElementById("search-type") as HTMLSelectElement)?.value as SearchTab["searchType"] || "Global";
    const fileType = (document.getElementById("search-filetype") as HTMLSelectElement)?.value || undefined;

    await launchSearch(query, searchType, fileType);
  });

  document.getElementById("btn-stop-search")?.addEventListener("click", async () => {
    try {
      await api.stopSearch();
      stopSearchPolling();
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
}
