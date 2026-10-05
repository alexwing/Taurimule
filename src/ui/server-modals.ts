import { api } from "../lib/tauri-bridge";
import { t } from "../lib/i18n";
import { renderView } from "../app/router";
import { showToast } from "./dialogs";

export function showAddServerModal() {
  document.getElementById("taurimule-add-server-modal")?.remove();

  const modalOverlay = document.createElement("div");
  modalOverlay.id = "taurimule-add-server-modal";
  modalOverlay.className = "fluent-modal-overlay";

  modalOverlay.innerHTML = `
    <div class="fluent-modal" style="max-width: 480px; width: 92%;">
      <div class="fluent-modal-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 18px;">🌐</span>
          <span style="font-weight: 700; font-size: 15px;">${t("servers.addServerModalTitle")}</span>
        </div>
        <button class="fluent-modal-close" id="btn-close-add-server-modal">&times;</button>
      </div>

      <div class="fluent-modal-body" style="display: flex; flex-direction: column; gap: 14px; padding: 18px 20px;">
        <div>
          <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 4px; display: block;">
            ${t("servers.serverIpLabel")} *
          </label>
          <input type="text" id="modal-server-ip" class="table-search-input" style="width: 100%; box-sizing: border-box;" placeholder="176.123.5.89" required />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 12px;">
          <div>
            <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 4px; display: block;">
              ${t("servers.serverPortLabel")} *
            </label>
            <input type="number" id="modal-server-port" class="table-search-input" style="width: 100%; box-sizing: border-box;" value="4661" min="1" max="65535" required />
          </div>
          <div>
            <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 4px; display: block;">
              ${t("servers.serverNameLabel")}
            </label>
            <input type="text" id="modal-server-name" class="table-search-input" style="width: 100%; box-sizing: border-box;" placeholder="eMule Security" />
          </div>
        </div>

        <div id="modal-server-feedback" style="font-size: 12px; color: var(--danger); min-height: 16px;"></div>
      </div>

      <div class="fluent-modal-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding: 12px 20px;">
        <button class="btn btn-secondary" id="btn-cancel-add-server">${t("common.cancel")}</button>
        <button class="btn btn-primary" id="btn-submit-add-server">➕ ${t("servers.addServerBtn")}</button>
      </div>
    </div>
  `;

  document.body.appendChild(modalOverlay);

  const closeModal = () => modalOverlay.remove();
  modalOverlay.querySelector("#btn-close-add-server-modal")?.addEventListener("click", closeModal);
  modalOverlay.querySelector("#btn-cancel-add-server")?.addEventListener("click", closeModal);

  modalOverlay.querySelector("#btn-submit-add-server")?.addEventListener("click", async () => {
    const ipInput = modalOverlay.querySelector("#modal-server-ip") as HTMLInputElement;
    const portInput = modalOverlay.querySelector("#modal-server-port") as HTMLInputElement;
    const nameInput = modalOverlay.querySelector("#modal-server-name") as HTMLInputElement;
    const feedback = modalOverlay.querySelector("#modal-server-feedback") as HTMLElement;

    const ip = ipInput.value.trim();
    const port = parseInt(portInput.value.trim(), 10);
    const name = nameInput.value.trim() || ip;

    if (!ip || isNaN(port) || port < 1 || port > 65535) {
      if (feedback) feedback.textContent = "Por favor, introduce una dirección IP y un puerto válidos (1-65535).";
      return;
    }

    try {
      await api.addServer(ip, port, name);
      closeModal();
      showToast(`🌐 ${t("servers.serverAddedSuccess")}`);
      renderView();
    } catch (e) {
      if (feedback) feedback.textContent = `Error: ${e}`;
    }
  });

  setTimeout(() => {
    (modalOverlay.querySelector("#modal-server-ip") as HTMLInputElement)?.focus();
  }, 50);
}

export function showUpdateServerMetModal() {
  document.getElementById("taurimule-update-servermet-modal")?.remove();

  const modalOverlay = document.createElement("div");
  modalOverlay.id = "taurimule-update-servermet-modal";
  modalOverlay.className = "fluent-modal-overlay";

  modalOverlay.innerHTML = `
    <div class="fluent-modal" style="max-width: 520px; width: 92%;">
      <div class="fluent-modal-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 18px;">🔄</span>
          <span style="font-weight: 700; font-size: 15px;">${t("servers.updateServerMetTitle")}</span>
        </div>
        <button class="fluent-modal-close" id="btn-close-servermet-modal">&times;</button>
      </div>

      <div class="fluent-modal-body" style="display: flex; flex-direction: column; gap: 14px; padding: 18px 20px;">
        <p style="font-size: 12.5px; color: var(--text-secondary); margin: 0;">
          Introduce la URL de una lista de servidores server.met o pulsa una de las fuentes públicas recomendadas.
        </p>

        <div>
          <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px; display: block;">
            ${t("servers.popularUrlsLabel")}
          </label>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-sm preset-url-btn" data-url="http://www.gruk.org/server.met">Gruk.org</button>
            <button class="btn btn-secondary btn-sm preset-url-btn" data-url="http://edk.peerates.net/servers.met">Peerates.net</button>
            <button class="btn btn-secondary btn-sm preset-url-btn" data-url="http://emuling.gitlab.io/server.met">eMuling</button>
          </div>
        </div>

        <div>
          <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 4px; display: block;">
            ${t("servers.serverMetUrlLabel")}
          </label>
          <input type="url" id="modal-servermet-url" class="table-search-input" style="width: 100%; box-sizing: border-box; font-family: var(--font-mono); font-size: 12px;" value="http://www.gruk.org/server.met" required />
        </div>

        <div id="modal-servermet-feedback" style="font-size: 12px; color: var(--text-secondary); min-height: 16px;"></div>
      </div>

      <div class="fluent-modal-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding: 12px 20px;">
        <button class="btn btn-secondary" id="btn-cancel-servermet">${t("common.cancel")}</button>
        <button class="btn btn-primary" id="btn-submit-servermet">🌐 ${t("servers.updateServerMetBtn")}</button>
      </div>
    </div>
  `;

  document.body.appendChild(modalOverlay);

  const closeModal = () => modalOverlay.remove();
  modalOverlay.querySelector("#btn-close-servermet-modal")?.addEventListener("click", closeModal);
  modalOverlay.querySelector("#btn-cancel-servermet")?.addEventListener("click", closeModal);

  modalOverlay.querySelectorAll(".preset-url-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const url = (e.currentTarget as HTMLElement).dataset.url;
      const input = modalOverlay.querySelector("#modal-servermet-url") as HTMLInputElement;
      if (input && url) input.value = url;
    });
  });

  modalOverlay.querySelector("#btn-submit-servermet")?.addEventListener("click", async () => {
    const input = modalOverlay.querySelector("#modal-servermet-url") as HTMLInputElement;
    const feedback = modalOverlay.querySelector("#modal-servermet-feedback") as HTMLElement;
    const submitBtn = modalOverlay.querySelector("#btn-submit-servermet") as HTMLButtonElement;
    const url = input.value.trim();

    if (!url) return;

    if (feedback) feedback.textContent = "Descargando y actualizando lista de servidores...";
    if (submitBtn) submitBtn.disabled = true;

    try {
      const count = await api.updateServersFromUrl(url);
      closeModal();
      showToast(t("servers.serversUpdatedSuccess", { count: count.toString() }));
      renderView();
    } catch (e) {
      if (feedback) feedback.textContent = `Error: ${e}`;
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}
