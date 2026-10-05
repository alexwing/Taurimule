import { api } from "../lib/tauri-bridge";
import { getLogoSvg, getLogoDataUri, type LogoState } from "../lib/logo";
import { t } from "../lib/i18n";
import { state } from "../state/store";

export function getLocalizedLogoLabel(state: LogoState): string {
  switch (state) {
    case "connected":
      return t("status.connectedHighId");
    case "downloading":
      return t("status.downloading");
    case "warning":
      return t("status.warning");
    case "idle":
      return t("status.idle");
  }
}

export function updateAppLogo(logoState: LogoState) {
  state.currentLogoState = logoState;
  const logoEl = document.getElementById("sidebar-logo-container");
  if (logoEl) {
    logoEl.innerHTML = getLogoSvg(logoState, 28, "sb-logo");
    logoEl.title = `TauriMule: ${getLocalizedLogoLabel(logoState)}`;
  }

  const brandTag = document.getElementById("brand-status-tag");
  if (brandTag) {
    brandTag.textContent = getLocalizedLogoLabel(logoState);
    brandTag.className = `brand-badge state-${logoState}`;
  }

  const settingsPreview = document.getElementById("settings-logo-preview");
  if (settingsPreview) {
    settingsPreview.innerHTML = getLogoSvg(logoState, 84, "settings-preview");
  }

  const settingsBadge = document.getElementById("settings-badge");
  if (settingsBadge) {
    settingsBadge.textContent = getLocalizedLogoLabel(logoState);
    settingsBadge.className = `brand-badge state-${logoState}`;
  }

  const stateFeedback = document.getElementById("state-feedback");
  if (stateFeedback) {
    const modeStr = state.manualLogoOverride
      ? t("settings.modeManual", { state: getLocalizedLogoLabel(state.manualLogoOverride) })
      : t("settings.modeAuto", { state: getLocalizedLogoLabel(logoState) });
    stateFeedback.textContent = t("settings.currentMode", { mode: modeStr });
  }

  // Dynamic Browser Favicon
  let favicon = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (!favicon) {
    favicon = document.createElement("link");
    favicon.rel = "icon";
    document.head.appendChild(favicon);
  }
  favicon.href = getLogoDataUri(logoState);

  // Sync native OS tray icon
  api.setTrayIconState(logoState).catch(() => {});
}
