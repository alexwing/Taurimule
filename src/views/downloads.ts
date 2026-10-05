import { api, type DownloadInfo, type Snapshot } from "../lib/tauri-bridge";
import { getLogoSvg } from "../lib/logo";
import { showContextMenu, type ContextMenuItem } from "../lib/context-menu";
import { t } from "../lib/i18n";
import { escapeHtml } from "../lib/html";
import { formatSize, formatSpeed, getFileIcon, safeDecode } from "../lib/format";
import {
  sortDownloads,
  renderDownloadSortIcon,
  type SortDirection,
  type DownloadSortColumn,
} from "../lib/sort";
import { state } from "../state/store";
import { renderView } from "../app/router";
import { updateFooter } from "../app/polling";
import { renderHeader } from "../ui/header";
import { confirmDialog, showToast } from "../ui/dialogs";
import { isDaemonActive, updateDaemonControlBar } from "../ui/daemon-control";
import { openAddEd2kModalWithClipboardCheck } from "../ui/ed2k-modal";

// Table sorting state
let downloadSortColumn: DownloadSortColumn = "progress";
let downloadSortDirection: SortDirection = "desc";

// Double-click: only launch completed files (never open folder on incomplete).
// Row state is read from the dataset now, so incremental updates are always honoured.
export async function handleDownloadRowDblClick(el: HTMLElement) {
  const name = safeDecode(el.dataset.name);
  const hash = el.dataset.hash || "";
  if (el.dataset.status === "Complete") {
    try {
      await api.launchFile(name, hash);
      showToast(`🚀 ${t("cleaner.launchSuccess")}`);
    } catch (err) {
      showToast(`⚠️ ${err}`);
    }
  }
}

// Right-click Context Menu (built from the row's current dataset)
export function showDownloadContextMenu(el: HTMLElement, e: MouseEvent) {
  const name = safeDecode(el.dataset.name);
  const hash = el.dataset.hash || "";
  const status = el.dataset.status || "";
  const size = parseInt(el.dataset.size || "0");
  const priority = el.dataset.priority || "Normal";

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
}

function renderDownloadRowActions(d: DownloadInfo): string {
  if (d.status === "Complete") {
    return `
      <button class="btn btn-primary btn-icon" data-action="launch" data-name="${encodeURIComponent(d.name)}" data-hash="${escapeHtml(d.hash)}" title="${t("contextMenu.launch")}">🚀 ${t("cleaner.launchBtn")}</button>
      <button class="btn btn-secondary btn-icon" data-action="show-in-folder" data-name="${encodeURIComponent(d.name)}" data-hash="${escapeHtml(d.hash)}" title="${t("contextMenu.showInFolder")}">📂</button>
      <button class="btn btn-danger btn-icon" data-action="delete" data-hash="${escapeHtml(d.hash)}" title="${t("common.delete")}">🗑</button>
    `;
  }
  return `
    ${
      d.status === "Paused"
        ? `<button class="btn btn-secondary btn-icon" data-action="resume" data-hash="${escapeHtml(d.hash)}" title="${t("common.resume")}">▶</button>`
        : `<button class="btn btn-secondary btn-icon" data-action="pause" data-hash="${escapeHtml(d.hash)}" title="${t("common.pause")}">⏸</button>`
    }
    <button class="btn btn-secondary btn-icon" data-action="request-more-sources" data-hash="${escapeHtml(d.hash)}" title="${t("contextMenu.requestMoreSources")}">🔍</button>
    <button class="btn btn-danger btn-icon" data-action="delete" data-hash="${escapeHtml(d.hash)}" title="${t("common.delete")}">🗑</button>
  `;
}

function renderSingleDownloadRow(d: DownloadInfo): string {
  return `
    <tr 
      class="download-row ${d.status === "Complete" ? "completed-row" : ""}" 
      data-hash="${escapeHtml(d.hash)}" 
      data-name="${encodeURIComponent(d.name)}" 
      data-status="${escapeHtml(d.status)}" 
      data-size="${d.size_total}"
      data-priority="${escapeHtml(d.priority)}"
      title="${d.status === "Complete" ? "Doble clic para lanzar | Clic derecho para opciones" : "Clic derecho para opciones"}"
    >
      <td>
        <div class="file-title-cell">
          <span class="file-icon">${getFileIcon(d.name)}</span>
          <div class="file-info-stack">
            <div class="file-name-text" title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</div>
            <div class="file-sub-meta">${t("downloads.hash")}: ${escapeHtml(d.hash.substring(0, 12))}... | ${t("downloads.fileStatus")}: <span class="row-status-val">${escapeHtml(d.status)}</span> | ${t("contextMenu.priority")}: <strong>${escapeHtml(d.priority)}</strong></div>
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
          ${d.status === "Downloading" ? formatSpeed(d.speed) : (d.status === "Complete" ? `✓ ${escapeHtml(d.status)}` : escapeHtml(d.status))}
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
          ${getLogoSvg(state.currentLogoState, 56, "dl-empty")}
        </div>
        ${
          !isDaemonActive()
            ? `
            <h3>⏳ ${t("downloads.connectingDaemonTitle")}</h3>
            <p style="margin-bottom: 12px;">${t("downloads.connectingDaemonSub")}</p>
            <button class="btn btn-primary" id="btn-empty-toggle-daemon" data-action="empty-toggle-daemon">▶ ${t("settings.startDaemon")}</button>
            `
            : `
            <h3>${state.downloadFilterQuery && state.cachedDownloads.length > 0 ? t("downloads.emptyFilterTitle") : t("downloads.emptyQueueTitle")}</h3>
            <p style="margin-bottom: 8px;">${state.downloadFilterQuery && state.cachedDownloads.length > 0 ? t("downloads.emptyFilterHelp") : t("downloads.emptyQueueHelp")}</p>
            <div style="display: flex; gap: 10px; margin-top: 10px; justify-content: center; flex-wrap: wrap;">
              ${state.cachedDownloads.length === 0 ? `
                <button class="btn btn-primary" id="btn-empty-add-ed2k" data-action="empty-add-ed2k">➕ ${t("downloads.addEd2kLink")}</button>
                <button class="btn btn-secondary" id="btn-empty-go-search" data-action="empty-go-search">🔍 ${t("downloads.goToSearch")}</button>
              ` : `
                ${state.downloadFilterQuery ? `
                  <button class="btn btn-secondary" id="btn-empty-clear-filter" data-action="empty-clear-filter">❌ ${t("downloads.clearFilter")}</button>
                ` : ""}
                <button class="btn btn-primary" id="btn-empty-add-ed2k" data-action="empty-add-ed2k">➕ ${t("downloads.addEd2kLink")}</button>
              `}
            </div>
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
      icon.outerHTML = renderDownloadSortIcon(col, downloadSortColumn, downloadSortDirection);
    }
  });
}

function updateDownloadsTableIncremental() {
  const tbody = document.getElementById("downloads-table-body");
  const countLabel = document.getElementById("downloads-count-label");
  if (!tbody) return;

  const filtered = state.cachedDownloads.filter((d) => {
    return state.downloadFilterQuery
      ? d.name.toLowerCase().includes(state.downloadFilterQuery.toLowerCase())
      : true;
  });
  const sorted = sortDownloads(filtered, downloadSortColumn, downloadSortDirection);

  if (countLabel) {
    countLabel.textContent = t("downloads.transferringFiles", { count: sorted.length });
  }

  if (sorted.length === 0) {
    // Only rewrite the empty state when its content changes: a snapshot arrives every
    // second, and replacing the DOM each time would swallow clicks on its buttons.
    // The buttons carry data-action attributes handled by the delegated click listener.
    const emptyHtml = renderDownloadsTableRows([]);
    if (tbody.dataset.emptyHtml !== emptyHtml) {
      tbody.innerHTML = emptyHtml;
      tbody.dataset.emptyHtml = emptyHtml;
    }
    return;
  }

  // Clear empty state if present
  if (tbody.querySelector(".empty-state-logo-card")) {
    tbody.innerHTML = "";
    delete tbody.dataset.emptyHtml;
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

      // Keep every field the delegated handlers read from the dataset up to date
      const encodedName = encodeURIComponent(d.name);
      if (row.dataset.name !== encodedName) row.dataset.name = encodedName;
      const sizeStr = String(d.size_total);
      if (row.dataset.size !== sizeStr) row.dataset.size = sizeStr;

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
        }
      }

      tbody.appendChild(row);
    } else {
      const tempWrapper = document.createElement("tbody");
      tempWrapper.innerHTML = renderSingleDownloadRow(d);
      const newRow = tempWrapper.firstElementChild as HTMLElement;
      if (newRow) {
        tbody.appendChild(newRow);
        existingRows.set(d.hash, newRow);
      }
    }
  });
}

/** Clear the downloads name filter and redraw the table (used by the empty-state button). */
export function clearDownloadsFilter() {
  state.downloadFilterQuery = "";
  const filterInput = document.getElementById("input-filter-downloads") as HTMLInputElement | null;
  if (filterInput) filterInput.value = "";
  updateDownloadsTableIncremental();
}

export function applySnapshotToDownloadsView(snap?: Snapshot) {
  if (snap) {
    if (snap.downloads) state.cachedDownloads = snap.downloads;
    if (snap.stats) {
      state.lastStats = snap.stats;
      updateFooter(snap.stats);
    }
    if (snap.connected) {
      if (!state.currentDaemonStatus || !state.currentDaemonStatus.running || !state.currentDaemonStatus.ec_connected) {
        state.currentDaemonStatus = {
          running: true,
          ec_connected: true,
          pid: state.currentDaemonStatus?.pid,
          version: state.currentDaemonStatus?.version,
        };
        if (!state.currentDaemonStatus.pid) {
          api.getDaemonStatus().then((st) => {
            if (st) {
              state.currentDaemonStatus = st;
              updateDaemonControlBar(st);
            }
          }).catch(() => {});
        }
      }
    }
  }

  updateDaemonControlBar();

  const badgeEl = document.getElementById("badge-dl-count");
  if (badgeEl) badgeEl.textContent = state.cachedDownloads.length.toString();

  const stats = snap?.stats || state.lastStats;
  if (stats) {
    const speedVal = document.getElementById("dl-metric-speed-val");
    if (speedVal) speedVal.textContent = `▼ ${formatSpeed(stats.download_speed)}`;

    const ulVal = document.getElementById("dl-metric-upload-val");
    if (ulVal) ulVal.textContent = `▲ ${formatSpeed(stats.upload_speed)}`;

    const ed2kVal = document.getElementById("dl-metric-ed2k-val");
    if (ed2kVal) {
      const ed2kText = stats.ed2k_connected
        ? (stats.ed2k_id === "High" ? `🟢 ${t("servers.highIdActive")}` : `🟡 ${t("servers.lowIdActive")}`)
        : "🔴 Off";
      ed2kVal.innerHTML = `eD2k: ${ed2kText}`;
    }

    const kadVal = document.getElementById("dl-metric-kad-val");
    if (kadVal) kadVal.textContent = `Kad: ${stats.kad_connected ? (stats.kad_firewalled ? `🟡 ${t("servers.kadFirewalled")}` : `🟢 ${t("servers.kadOpen")}`) : "🔴 Off"}`;

    const netBadge = document.getElementById("dl-metric-net-badge");
    if (netBadge) {
      netBadge.className = `metric-badge ${stats.ed2k_connected ? (stats.ed2k_id === "High" ? "badge-success" : "badge-warning") : "badge-warning"}`;
      netBadge.textContent = stats.ed2k_id === "High" ? "High ID" : stats.ed2k_id === "Low" ? "Low ID" : stats.ed2k_id;
    }
  }

  const totalBadge = document.getElementById("dl-metric-total-badge");
  if (totalBadge) totalBadge.textContent = `${state.cachedDownloads.length} ${t("downloads.totalBadge")}`;

  const pendingVal = document.getElementById("dl-metric-pending-val");
  if (pendingVal) pendingVal.textContent = state.cachedDownloads.length.toString();

  const countsSub = document.getElementById("dl-metric-counts-sub");
  if (countsSub) {
    countsSub.textContent = `${state.cachedDownloads.length} ${t("downloads.totalCountLabel")}`;
  }

  updateDownloadsTableIncremental();
}

export function renderDownloadsViewShell(): string {
  const stats = state.lastStats || {
    download_speed: 0,
    upload_speed: 0,
    ed2k_connected: false,
    kad_connected: false,
    kad_firewalled: false,
    ed2k_id: "Unknown",
    total_users: 0,
    total_files: 0,
  };

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
          <span class="metric-badge badge-primary" id="dl-metric-total-badge">${state.cachedDownloads.length} ${t("downloads.totalBadge")}</span>
        </div>
        <div class="metric-value" style="display: flex; align-items: baseline; gap: 6px;">
          <span id="dl-metric-pending-val">${state.cachedDownloads.length}</span>
          <span style="font-size: 13px; font-weight: 500; color: var(--text-secondary); text-transform: lowercase;">${t("downloads.pendingLabel")}</span>
        </div>
        <div class="metric-subtext" id="dl-metric-counts-sub">
          ${state.cachedDownloads.length} ${t("downloads.totalCountLabel")}
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-header">
          <span class="metric-label">${t("downloads.connectedNetworks")}</span>
          <span class="metric-badge ${stats.ed2k_connected ? (stats.ed2k_id === "High" ? "badge-success" : "badge-warning") : "badge-warning"}" id="dl-metric-net-badge">${stats.ed2k_id === "High" ? "High ID" : stats.ed2k_id === "Low" ? "Low ID" : escapeHtml(stats.ed2k_id)}</span>
        </div>
        <div class="metric-value" style="font-size: 15px;" id="dl-metric-ed2k-val">
          eD2k: ${stats.ed2k_connected ? (stats.ed2k_id === "High" ? `🟢 ${t("servers.highIdActive")}` : `🟡 ${t("servers.lowIdActive")}`) : "🔴 Off"}
        </div>
        <div class="metric-subtext" id="dl-metric-kad-val">Kad: ${stats.kad_connected ? (stats.kad_firewalled ? `🟡 ${t("servers.kadFirewalled")}` : `🟢 ${t("servers.kadOpen")}`) : "🔴 Off"}</div>
      </div>
    </div>`;

  const tableHtml = `
    <div class="table-container">
      <div class="table-toolbar downloads-toolbar">
        <div id="downloads-count-label" class="downloads-toolbar-count">${t("downloads.transferringFiles", { count: state.cachedDownloads.length })}</div>
        <div class="downloads-toolbar-actions">
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
            value="${escapeHtml(state.downloadFilterQuery)}" 
          />
        </div>
      </div>
      <table class="fluent-table">
        <thead>
          <tr>
            <th class="sortable-th ${downloadSortColumn === "name" ? "sorted-" + downloadSortDirection : ""}" data-sort-dl="name" style="width: 44%;" title="Ordenar por Nombre">
              <div class="th-content">
                <span>${t("downloads.fileName")}</span>
                ${renderDownloadSortIcon("name", downloadSortColumn, downloadSortDirection)}
              </div>
            </th>
            <th class="sortable-th ${downloadSortColumn === "size" ? "sorted-" + downloadSortDirection : ""}" data-sort-dl="size" style="width: 10%;" title="Ordenar por Tamaño">
              <div class="th-content">
                <span>${t("downloads.fileSize")}</span>
                ${renderDownloadSortIcon("size", downloadSortColumn, downloadSortDirection)}
              </div>
            </th>
            <th class="sortable-th ${downloadSortColumn === "progress" ? "sorted-" + downloadSortDirection : ""}" data-sort-dl="progress" style="width: 17%;" title="Ordenar por Progreso">
              <div class="th-content">
                <span>${t("downloads.fileProgress")}</span>
                ${renderDownloadSortIcon("progress", downloadSortColumn, downloadSortDirection)}
              </div>
            </th>
            <th class="sortable-th ${downloadSortColumn === "speed" ? "sorted-" + downloadSortDirection : ""}" data-sort-dl="speed" style="width: 10%;" title="Ordenar por Velocidad">
              <div class="th-content">
                <span>${t("downloads.fileSpeed")}</span>
                ${renderDownloadSortIcon("speed", downloadSortColumn, downloadSortDirection)}
              </div>
            </th>
            <th class="sortable-th ${downloadSortColumn === "sources" ? "sorted-" + downloadSortDirection : ""}" data-sort-dl="sources" style="width: 7%;" title="Ordenar por Fuentes">
              <div class="th-content">
                <span>${t("downloads.fileSources")}</span>
                ${renderDownloadSortIcon("sources", downloadSortColumn, downloadSortDirection)}
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

export function attachDownloadsToolbarListeners() {
  const filterInput = document.getElementById("input-filter-downloads") as HTMLInputElement | null;
  if (filterInput) {
    filterInput.addEventListener("input", (e) => {
      state.downloadFilterQuery = (e.target as HTMLInputElement).value;
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
