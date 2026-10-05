import { t } from "../lib/i18n";
import { escapeHtml } from "../lib/html";
import { state } from "../state/store";
import { isDaemonActive } from "./daemon-control";

export function renderHeader(title: string, subtitle: string, breadcrumb: string): string {
  const isRunning = isDaemonActive();
  const pid = state.currentDaemonStatus?.pid;

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
          <span>${isRunning ? `amuled ${pid ? `(PID: ${escapeHtml(pid)})` : "(activo)"}` : t("settings.daemonStopped")}</span>
        </div>
        <button class="btn ${isRunning ? "btn-secondary" : "btn-primary"} btn-icon" id="btn-toggle-daemon" title="${isRunning ? t("settings.stopDaemon") : t("settings.startDaemon")}">
          ${isRunning ? `⏹ ${t("settings.stopDaemon")}` : `▶ ${t("settings.startDaemon")}`}
        </button>
      </div>
    </div>`;
}
