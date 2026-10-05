import type { GlobalStats } from "../lib/tauri-bridge";
import type { LogoState } from "../lib/logo";
import { t } from "../lib/i18n";
import { escapeHtml } from "../lib/html";
import { formatSpeed } from "../lib/format";
import { state } from "../state/store";
import { renderView } from "./router";
import { updateAppLogo } from "../ui/app-logo";

let pollTimer: ReturnType<typeof setTimeout> | null = null;
let pollInFlight = false;

// ═══════════════════════════════════════════════════════════════════
// Status Bar & Polling
// ═══════════════════════════════════════════════════════════════════

function schedulePoll() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(pollTick, 3000);
}

async function pollTick() {
  pollTimer = null;
  // A previous refresh is still waiting on IPC: skip this round
  if (pollInFlight) {
    schedulePoll();
    return;
  }
  pollInFlight = true;
  try {
    // Only refresh if not typing to avoid losing focus
    const activeEl = document.activeElement;
    const isTyping = activeEl && (activeEl.id === "input-filter-downloads" || activeEl.id === "search-query");
    // Never re-render whole view if on Search, Settings, or Downloads to prevent wiping user UI!
    // (search results are refreshed by pollSearchResults)
    const isStaticView = state.currentView === "search" || state.currentView === "settings" || state.currentView === "downloads";
    if (!isTyping && !isStaticView) {
      await renderView();
    }
  } catch (e) {
    console.warn("Poll error:", e);
  } finally {
    pollInFlight = false;
    schedulePoll();
  }
}

export function startPolling() {
  schedulePoll();
}

export function updateFooter(stats: GlobalStats | null) {
  state.lastStats = stats;
  const el = document.getElementById("status-bar");
  if (!el) return;
  if (!stats) {
    el.innerHTML = `<span>${state.isAppStartingUp ? `⏳ ${t("status.startingDaemon")}` : t("status.disconnectedFromDaemon")}</span>`;
    if (!state.manualLogoOverride && state.currentLogoState !== "idle") {
      updateAppLogo("idle");
    }
    return;
  }

  // Dynamic logo state update based on real network & download conditions
  if (!state.manualLogoOverride) {
    let nextState: LogoState = "idle";
    if (stats.download_speed > 1024) {
      nextState = "downloading";
    } else if (stats.kad_firewalled) {
      nextState = "warning";
    } else if (stats.ed2k_connected || stats.kad_connected) {
      nextState = "connected";
    }
    if (nextState !== state.currentLogoState) {
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
      <div class="footer-item">eD2k: ${escapeHtml(ed2kStatus)}</div>
      <span class="footer-sep">|</span>
      <div class="footer-item">Kad: ${kadStatus}</div>
    </div>`;
}
