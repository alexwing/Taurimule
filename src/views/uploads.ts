import { api, type UploadInfo } from "../lib/tauri-bridge";
import { t } from "../lib/i18n";
import { escapeHtml } from "../lib/html";
import { formatSize, formatSpeed, getFileIcon } from "../lib/format";
import { renderHeader } from "../ui/header";

// ═══════════════════════════════════════════════════════════════════
// 4. UPLOADS VIEW (Subidas)
// ═══════════════════════════════════════════════════════════════════

export async function renderUploadsView(): Promise<string> {
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
                      <span class="file-name-text" title="${escapeHtml(u.name)}">${escapeHtml(u.name || t("uploads.sharedFile"))}</span>
                    </div>
                  </td>
                  <td>
                    <div style="font-weight: 500;">${escapeHtml(u.client_name)}</div>
                    ${u.client_software ? `<div style="font-size: 11px; color: var(--text-tertiary); margin-top: 2px;">${escapeHtml(u.client_software)}</div>` : ""}
                  </td>
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
