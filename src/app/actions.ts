import { api } from "../lib/tauri-bridge";
import { t } from "../lib/i18n";
import { safeDecode } from "../lib/format";
import { state } from "../state/store";
import { navigate, renderView } from "./router";
import { launchSearch, type SearchTab } from "../views/search";
import { handleDownloadRowDblClick, showDownloadContextMenu, clearDownloadsFilter } from "../views/downloads";
import { openAddEd2kModalWithClipboardCheck } from "../ui/ed2k-modal";
import { handleToggleDaemon } from "../ui/daemon-control";
import { confirmDialog, showToast } from "../ui/dialogs";

// Called from the delegated click handler: everything is read from the element's
// dataset at click time, never from values captured when the row was rendered.
async function handleAction(target: HTMLElement) {
  const action = target.dataset.action;
  const hash = target.dataset.hash;
  try {
    switch (action) {
      case "run-history-query": {
        const query = decodeURIComponent(target.dataset.query || "");
        if (!query) break;

        const existingTab = state.searchTabs.find((t) => t.query.toLowerCase() === query.toLowerCase());
        if (existingTab) {
          state.activeSearchTabId = existingTab.id;
          renderView();
          break;
        }

        const searchType = (document.getElementById("search-type") as HTMLSelectElement)?.value as SearchTab["searchType"] || "Global";
        const fileType = (document.getElementById("search-filetype") as HTMLSelectElement)?.value || undefined;
        await launchSearch(query, searchType, fileType);
        break;
      }
      // Downloads empty-state buttons (rendered by renderDownloadsTableRows([]))
      case "empty-go-search":
        navigate("search");
        break;
      case "empty-add-ed2k":
        await openAddEd2kModalWithClipboardCheck();
        break;
      case "empty-clear-filter":
        clearDownloadsFilter();
        break;
      case "empty-toggle-daemon":
        await handleToggleDaemon();
        break;
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

// One listener per event type, attached exactly once at boot. #app is the stable
// ancestor (renderAppShell() recreates #content), so these survive any re-render
// and the persistent downloads DOM never accumulates handlers.
let contentDelegationInstalled = false;

export function setupContentDelegation() {
  if (contentDelegationInstalled) return;
  const root = document.getElementById("app");
  if (!root) return;
  contentDelegationInstalled = true;

  const targetOf = (e: Event): Element | null => {
    const el = e.target instanceof Element ? e.target : null;
    return el && el.closest("#content") ? el : null;
  };

  root.addEventListener("click", (e) => {
    const el = targetOf(e);
    if (!el) return;

    if (el.closest("[data-nav]")) {
      navigate("downloads");
      return;
    }
    if (el.closest("#btn-toggle-daemon")) {
      void handleToggleDaemon();
      return;
    }
    const actionEl = el.closest<HTMLElement>("[data-action]");
    if (actionEl) {
      void handleAction(actionEl);
    }
  });

  root.addEventListener("dblclick", (e) => {
    const row = targetOf(e)?.closest<HTMLElement>("tr.download-row");
    if (!row) return;
    e.preventDefault();
    void handleDownloadRowDblClick(row);
  });

  root.addEventListener("contextmenu", (e) => {
    const row = targetOf(e)?.closest<HTMLElement>("tr.download-row");
    if (!row) return;
    e.preventDefault();
    e.stopPropagation();
    showDownloadContextMenu(row, e);
  });
}
