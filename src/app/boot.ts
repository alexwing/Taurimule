import { listen } from "@tauri-apps/api/event";
import { api, type Snapshot } from "../lib/tauri-bridge";
import { I18nManager } from "../lib/i18n";
import { state } from "../state/store";
import { navigate, renderView } from "./router";
import { updateFooter } from "./polling";
import { renderAppShell } from "./shell";
import { setupContentDelegation } from "./actions";
import { mountStartupSplash } from "./splash";
import { enqueueAddEd2kLink } from "./ed2k-links";
import { loadSearchHistory } from "../views/search";
import { applySnapshotToDownloadsView } from "../views/downloads";
import { updateDaemonControlBar } from "../ui/daemon-control";
import { showAddEd2kModal } from "../ui/ed2k-modal";

// ═══════════════════════════════════════════════════════════════════
// Application Boot & Startup Screen (Ventana de Espere del Motor aMule)
// ═══════════════════════════════════════════════════════════════════

export async function bootApplication() {
  loadSearchHistory();

  // Listen to language changes to re-render UI
  I18nManager.onLanguageChange(() => {
    renderAppShell();
    renderView();
    updateFooter(state.lastStats);
  });

  renderAppShell();
  setupContentDelegation();

  mountStartupSplash();

  // Render downloads view in background
  navigate("downloads");

  // Global paste listener: if user pastes an eD2k link anywhere in the app
  window.addEventListener("paste", (e: ClipboardEvent) => {
    const activeEl = document.activeElement;
    if (activeEl?.id === "input-ed2k-textarea") {
      return;
    }
    let pasted = e.clipboardData?.getData("text") || "";
    try {
      pasted = decodeURIComponent(pasted);
    } catch {}
    if (pasted.includes("ed2k://|file|") || pasted.includes("ed2k://%7Cfile%7C") || pasted.includes("ed2k://%7cfile%7c")) {
      e.preventDefault();
      showAddEd2kModal(pasted.trim());
    }
  });

  // Deep link listener: catch ed2k:// links launched from browser / protocol handler — add directly without prompting!
  listen<string>("ed2k-link-received", (event) => {
    let link = event.payload;
    try {
      link = decodeURIComponent(link);
    } catch {}
    if (link && link.startsWith("ed2k://")) {
      enqueueAddEd2kLink(link);
    }
  });

  // Real-time backend poller event listeners
  listen<Snapshot>("downloads-updated", (event) => {
    const snap = event.payload;
    if (!snap) return;
    state.cachedDownloads = snap.downloads || [];
    if (snap.stats) {
      state.lastStats = snap.stats;
      updateFooter(snap.stats);
    }
    const badgeEl = document.getElementById("badge-dl-count");
    if (badgeEl) badgeEl.textContent = state.cachedDownloads.length.toString();

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

    updateDaemonControlBar();

    if (state.currentView === "downloads") {
      applySnapshotToDownloadsView(snap);
    }
  });

  listen<{ connected: boolean; error: string | null }>("daemon-status", (event) => {
    if (state.currentDaemonStatus) {
      state.currentDaemonStatus.ec_connected = event.payload.connected;
      state.currentDaemonStatus.running = event.payload.connected;
    } else {
      state.currentDaemonStatus = {
        running: event.payload.connected,
        ec_connected: event.payload.connected,
        pid: undefined,
        version: undefined,
      };
    }
    if (!event.payload.connected) {
      updateFooter(null);
    } else if (!state.currentDaemonStatus.pid) {
      api.getDaemonStatus().then((st) => {
        if (st) {
          state.currentDaemonStatus = st;
          updateDaemonControlBar(st);
        }
      }).catch(() => {});
    }
    updateDaemonControlBar(state.currentDaemonStatus);
  });

  // Deshabilitar globalmente el menú contextual nativo del navegador (Back, Forward, Reload, Inspect, etc.)
  window.addEventListener("contextmenu", (e: MouseEvent) => {
    e.preventDefault();
  });
}
