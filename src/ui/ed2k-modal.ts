import { api } from "../lib/tauri-bridge";
import { t } from "../lib/i18n";
import { escapeHtml } from "../lib/html";
import { formatSize, getFileIcon } from "../lib/format";
import { parseAllEd2kLinks, parseEd2kLink } from "../lib/ed2k";
import { state } from "../state/store";
import { navigate } from "../app/router";
import { showToast } from "./dialogs";

let ed2kModalAbort: AbortController | null = null;

export function showAddEd2kModal(initialText = "") {
  // Replacing an open modal must also release its keydown listener
  ed2kModalAbort?.abort();
  document.getElementById("taurimule-ed2k-modal")?.remove();

  // One controller per opening: every close path aborts it
  const ac = new AbortController();
  ed2kModalAbort = ac;
  const closeModal = () => {
    ac.abort();
    if (ed2kModalAbort === ac) ed2kModalAbort = null;
    modalOverlay.remove();
  };

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
            ${escapeHtml(parsed.name)}
          </div>

          <div style="font-size: 10.5px; font-family: var(--font-mono); color: var(--text-tertiary);">
            Hash: <strong>${escapeHtml(parsed.hash)}</strong>
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
                    <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
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
            >${escapeHtml(currentLinkText)}</textarea>
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

    closeBtn?.addEventListener("click", closeModal);
    cancelBtn?.addEventListener("click", closeModal);

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
        closeModal();
        if (parsedList.length === 1) {
          const item = parsedList[0];
          showToast(`⬇ Añadiendo descarga eD2k...`);
          try {
            const res = await api.addEd2kLink(item.rawLink);
            showToast(`✅ ${t("downloads.linkAddedSuccess")}: ${res.name}`);
          } catch (err: any) {
            const errStr = err ? err.toString() : "";
            if (errStr.includes("ALREADY_COMPLETED|")) {
              const parts = errStr.split("|");
              const fileName = parts[1] || "";
              showToast(`📁 "${fileName}" ya está completado en la carpeta de descargas`, 7000);
            } else if (errStr.includes("ALREADY_QUEUED|")) {
              const parts = errStr.split("|");
              const fileName = parts[1] || "";
              showToast(`ℹ️ "${fileName}" ya está en la cola de descargas`, 5000);
            } else {
              showToast(`⚠️ Error al añadir enlace: ${err}`);
            }
          }
        } else {
          showToast(`⬇ ${t("downloads.batchAdding", { count: parsedList.length })}`);
          const batchItems = parsedList.map((item) => ({ link: item.rawLink }));
          try {
            const added = await api.addEd2kLinks(batchItems);
            showToast(`✅ ${t("downloads.batchAddedSuccess", { count: added.length })}`);
          } catch (err: any) {
            showToast(`⚠️ Error en lote: ${err}`);
          }
        }
        state.downloadFilterQuery = "";
        const filterInput = document.getElementById("input-filter-downloads") as HTMLInputElement | null;
        if (filterInput) filterInput.value = "";
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

  window.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    },
    { signal: ac.signal }
  );

  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
  });
}

export async function openAddEd2kModalWithClipboardCheck() {
  let initial = "";
  try {
    let text = await navigator.clipboard.readText();
    try {
      text = decodeURIComponent(text);
    } catch {}
    if (text && (text.includes("ed2k://|file|") || text.includes("ed2k://%7Cfile%7C") || text.includes("ed2k://%7cfile%7c"))) {
      initial = text.trim();
    }
  } catch {}
  showAddEd2kModal(initial);
}

(window as any).showAddEd2kModal = showAddEd2kModal;
(window as any).openAddEd2kModalWithClipboardCheck = openAddEd2kModalWithClipboardCheck;
(window as any).parseEd2kLink = parseEd2kLink;
(window as any).parseAllEd2kLinks = parseAllEd2kLinks;
