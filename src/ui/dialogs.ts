import { t } from "../lib/i18n";
import { escapeHtml } from "../lib/html";

/**
 * Custom Fluent confirmation dialog (replaces the browser's native confirm()).
 * Resolves true when confirmed, false when cancelled / dismissed.
 */
export function confirmDialog(
  message: string,
  opts: { title?: string; confirmLabel?: string; icon?: string; danger?: boolean } = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    document.getElementById("taurimule-confirm-modal")?.remove();
    const danger = opts.danger ?? false;
    const title = opts.title ?? (danger ? t("common.delete") : t("common.confirm"));
    const icon = opts.icon ?? (danger ? "⚠️" : "❔");
    const overlay = document.createElement("div");
    overlay.id = "taurimule-confirm-modal";
    overlay.className = "fluent-modal-overlay";
    overlay.innerHTML = `
      <div class="fluent-modal" role="alertdialog" aria-modal="true" style="max-width: 440px; width: 92%;">
        <div class="fluent-modal-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">${icon}</span>
            <span style="font-weight: 700; font-size: 15px;">${escapeHtml(title)}</span>
          </div>
          <button class="fluent-modal-close" id="btn-confirm-close">&times;</button>
        </div>
        <div class="fluent-modal-body" style="padding: 20px 22px;">
          <p id="confirm-dialog-msg" style="margin: 0; font-size: 13.5px; line-height: 1.5; color: var(--text-primary); white-space: pre-line; word-break: break-word;"></p>
        </div>
        <div class="fluent-modal-footer">
          <button class="btn btn-secondary" id="btn-confirm-cancel">${t("common.cancel")}</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"}" id="btn-confirm-ok">${escapeHtml(opts.confirmLabel ?? t("common.confirm"))}</button>
        </div>
      </div>`;
    const msgEl = overlay.querySelector("#confirm-dialog-msg") as HTMLElement;
    if (msgEl) msgEl.textContent = message;
    document.body.appendChild(overlay);

    const finish = (value: boolean) => {
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      resolve(value);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        finish(true);
      }
    };
    document.addEventListener("keydown", onKey, true);
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) finish(false);
    });
    overlay.querySelector("#btn-confirm-close")?.addEventListener("click", () => finish(false));
    overlay.querySelector("#btn-confirm-cancel")?.addEventListener("click", () => finish(false));
    const ok = overlay.querySelector("#btn-confirm-ok") as HTMLButtonElement;
    ok.addEventListener("click", () => finish(true));
    ok.focus();
  });
}

export function showToast(message: string, duration = 2600) {
  const existing = document.getElementById("taurimule-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.id = "taurimule-toast";
  toast.className = "fluent-toast";
  toast.innerHTML = escapeHtml(message);
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => toast.remove(), 320);
  }, duration);
}
