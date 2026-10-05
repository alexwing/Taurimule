import { api, type GlobalStats, type ServerInfo } from "../lib/tauri-bridge";
import { getLogoSvg } from "../lib/logo";
import { showContextMenu, type ContextMenuItem } from "../lib/context-menu";
import { t } from "../lib/i18n";
import { escapeHtml } from "../lib/html";
import { state } from "../state/store";
import { renderView } from "../app/router";
import { renderHeader } from "../ui/header";
import { confirmDialog, showToast } from "../ui/dialogs";
import { showAddServerModal, showUpdateServerMetModal } from "../ui/server-modals";

export interface ServersViewData {
  servers: ServerInfo[];
  stats: GlobalStats | null;
}

export async function loadServersViewData(): Promise<ServersViewData> {
  const [servers, stats] = await Promise.all([
    api.getServerList().catch((): ServerInfo[] => []),
    api.getStats().catch((): GlobalStats | null => null),
  ]);
  return { servers, stats };
}

export function renderServersView({ servers, stats }: ServersViewData): string {

  const networkOverviewHtml = `
    <div class="metrics-grid" style="margin-bottom: 20px;">
      <div class="metric-card" style="display: flex; flex-direction: row; align-items: center; gap: 14px;">
        <div style="width: 44px; height: 44px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          ${getLogoSvg(state.currentLogoState, 42, "srv-avatar")}
        </div>
        <div>
          <div class="metric-label">${t("servers.identity")}</div>
          <div class="metric-value" style="font-size: 15px;">${stats ? (stats.ed2k_id === "High" ? "High ID" : stats.ed2k_id === "Low" ? "Low ID" : escapeHtml(stats.ed2k_id)) : t("status.disconnectedFromDaemon")}</div>
          <div class="metric-hint" style="color: ${stats?.ed2k_connected ? (stats.ed2k_id === "High" ? "var(--success)" : "var(--warning)") : "var(--text-tertiary)"}; font-weight: 500;">
            ${stats?.ed2k_connected ? (stats.ed2k_id === "High" ? `🟢 ${t("servers.highIdActive")}` : `🟡 ${t("servers.lowIdActive")}`) : `🔴 ${t("servers.waitingConnection")}`}
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
        <div class="metric-subtext" style="display: flex; align-items: center; justify-content: space-between; margin-top: 6px;">
          <span>${t("servers.udpPort")}: 6591</span>
          <div style="display: flex; gap: 6px;">
            ${stats?.kad_connected ? `
              <button class="btn btn-secondary btn-sm" id="btn-kad-toggle" style="padding: 2px 8px; font-size: 11px;" title="${t("servers.disconnectKad")}">⏹ ${t("servers.disconnectKad")}</button>
            ` : `
              <button class="btn btn-primary btn-sm" id="btn-kad-toggle" style="padding: 2px 8px; font-size: 11px;" title="${t("servers.connectKad")}">▶ ${t("servers.connectKad")}</button>
            `}
            <button class="btn btn-secondary btn-sm" id="btn-kad-bootstrap" style="padding: 2px 8px; font-size: 11px;" title="${t("servers.bootstrapKad")}">🔄 nodes.dat</button>
          </div>
        </div>
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
                <tr class="${s.is_connected ? "active-row" : ""} server-row" data-ip="${escapeHtml(s.ip)}" data-port="${s.port}" data-name="${encodeURIComponent(s.name)}" data-connected="${s.is_connected}">
                  <td>
                    <div style="font-weight: 600; display: flex; align-items: center; gap: 8px;">
                      <span class="status-dot ${s.is_connected ? "" : "stopped"}"></span>
                      ${escapeHtml(s.name)}
                    </div>
                  </td>
                  <td style="font-family: var(--font-mono);">${escapeHtml(s.ip)}:${s.port}</td>
                  <td>${s.users.toLocaleString()}</td>
                  <td>${s.files.toLocaleString()}</td>
                  <td style="text-align: right; white-space: nowrap;">
                    <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
                      ${
                        s.is_connected
                          ? `<button class="btn btn-secondary btn-sm btn-icon" data-action="disconnect-server">${t("common.disconnect")}</button>`
                          : `<button class="btn btn-primary btn-sm btn-icon" data-action="connect-server" data-ip="${escapeHtml(s.ip)}" data-port="${s.port}">${t("common.connect")}</button>`
                      }
                      <button class="btn btn-danger btn-sm btn-icon" data-action="remove-server" data-ip="${escapeHtml(s.ip)}" data-port="${s.port}" title="${t("servers.removeServer")}">🗑️</button>
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

export function attachServersListeners() {
  // Refresh & Manage servers
  document.getElementById("btn-refresh-servers")?.addEventListener("click", () => renderView());
  document.getElementById("btn-show-add-server")?.addEventListener("click", () => showAddServerModal());
  document.getElementById("btn-show-update-servermet")?.addEventListener("click", () => showUpdateServerMetModal());

  // Kad Network controls
  document.getElementById("btn-kad-toggle")?.addEventListener("click", async () => {
    try {
      if (state.lastStats?.kad_connected) {
        await api.stopKad();
        showToast(t("servers.kadDisconnected"));
      } else {
        await api.startKad();
        showToast(t("servers.connectKad"));
      }
      setTimeout(() => renderView(), 800);
    } catch (e: any) {
      showToast(`❌ Error: ${e?.message || e}`);
    }
  });

  document.getElementById("btn-kad-bootstrap")?.addEventListener("click", async () => {
    try {
      await api.bootstrapKad();
      showToast(`🔄 ${t("servers.bootstrapKadSuccess")}`);
      setTimeout(() => renderView(), 1500);
    } catch (e: any) {
      showToast(`❌ Error: ${e?.message || e}`);
    }
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
