import { state, type ViewName } from "../state/store";
import { startPolling } from "./polling";
import { refreshDaemonStatus, updateDaemonControlBar } from "../ui/daemon-control";
import {
  renderDownloadsViewShell,
  attachDownloadsToolbarListeners,
  applySnapshotToDownloadsView,
} from "../views/downloads";
import { loadServersViewData, renderServersView, attachServersListeners, type ServersViewData } from "../views/servers";
import { renderSearchView, attachSearchListeners } from "../views/search";
import { renderUploadsView } from "../views/uploads";
import { renderSettingsView, attachSettingsListeners } from "../views/settings";

let renderSeq = 0;

// ═══════════════════════════════════════════════════════════════════
// SPA Router & Navigation
// ═══════════════════════════════════════════════════════════════════

export function navigate(view: ViewName) {
  state.currentView = view;
  document.querySelectorAll(".nav-item").forEach((el) => el.classList.remove("active"));
  document.querySelector(`[data-view="${view}"]`)?.classList.add("active");
  renderView();
  startPolling();
}

export async function renderView() {
  const content = document.getElementById("content");
  if (!content) return;

  // Only the latest call may touch the DOM: after every await, a stale call bails out
  const seq = ++renderSeq;
  const view = state.currentView;

  const activeEl = document.activeElement as HTMLInputElement | null;
  const isFilterFocused = activeEl?.id === "input-filter-downloads";
  const filterSelStart = isFilterFocused ? activeEl?.selectionStart : null;
  const filterSelEnd = isFilterFocused ? activeEl?.selectionEnd : null;

  // Refresh daemon status (in parallel with the servers data, which needs it too)
  let serversData: ServersViewData | null = null;
  if (view === "servers") {
    [, serversData] = await Promise.all([refreshDaemonStatus(), loadServersViewData()]);
  } else {
    await refreshDaemonStatus();
  }
  if (seq !== renderSeq) return;

  switch (view) {
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
      content.innerHTML = renderServersView(serversData!);
      attachServersListeners();
      break;
    case "search":
      content.innerHTML = renderSearchView();
      attachSearchListeners();
      break;
    case "uploads": {
      const html = await renderUploadsView();
      if (seq !== renderSeq) return;
      content.innerHTML = html;
      break;
    }
    case "settings": {
      const html = await renderSettingsView();
      if (seq !== renderSeq) return;
      content.innerHTML = html;
      attachSettingsListeners();
      break;
    }
  }

  updateDaemonControlBar();

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
