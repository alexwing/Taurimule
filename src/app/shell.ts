import { getLogoSvg } from "../lib/logo";
import { ThemeManager, type ColorScheme } from "../lib/theme";
import { t } from "../lib/i18n";
import { state, type ViewName } from "../state/store";
import { navigate, renderView } from "./router";
import { getLocalizedLogoLabel } from "../ui/app-logo";

// ═══════════════════════════════════════════════════════════════════
// App Shell Initialization
// ═══════════════════════════════════════════════════════════════════

export function renderAppShell() {
  const currentTheme = ThemeManager.getColorScheme();
  const isDark = ThemeManager.isEffectiveDark();
  const themeIcon = currentTheme === "system" ? "💻" : (isDark ? "🌙" : "☀️");
  const themeLabel =
    currentTheme === "system"
      ? t("settings.themeSystem")
      : isDark
      ? t("settings.themeDark")
      : t("settings.themeLight");

  document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
    <div class="app-shell">
      <nav class="sidebar">
        <div class="sidebar-header" id="sidebar-header-settings" style="cursor: pointer; gap: 10px;" title="TauriMule: ${t("settings.title")}">
          <div id="sidebar-logo-container" style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; flex-shrink: 0;">
            ${getLogoSvg(state.currentLogoState, 28, "sb-logo")}
          </div>
          <div class="sidebar-brand-text" style="display: flex; flex-direction: column; line-height: 1.15; overflow: hidden;">
            <span style="font-weight: 700; font-size: 14px; letter-spacing: -0.3px; color: var(--text-primary);">TauriMule</span>
            <span id="brand-status-tag" class="brand-badge state-${state.currentLogoState}">${getLocalizedLogoLabel(state.currentLogoState)}</span>
          </div>
        </div>

        <div class="nav-section-title">${t("nav.navigation")}</div>
        <div class="nav-item ${state.currentView === "downloads" ? "active" : ""}" data-view="downloads">
          <span class="nav-icon">⬇️</span>
          <span>${t("nav.downloads")}</span>
          <span class="nav-badge" id="badge-dl-count">${state.cachedDownloads.length}</span>
        </div>
        <div class="nav-item ${state.currentView === "servers" ? "active" : ""}" data-view="servers">
          <span class="nav-icon">🌐</span>
          <span>${t("nav.servers")}</span>
        </div>
        <div class="nav-item ${state.currentView === "search" ? "active" : ""}" data-view="search">
          <span class="nav-icon">🔍</span>
          <span>${t("nav.search")}</span>
        </div>
        <div class="nav-item ${state.currentView === "uploads" ? "active" : ""}" data-view="uploads">
          <span class="nav-icon">⬆️</span>
          <span>${t("nav.uploads")}</span>
        </div>

        <div class="nav-section-title" style="margin-top: 14px;">${t("nav.preferences")}</div>
        <div class="nav-item ${state.currentView === "settings" ? "active" : ""}" data-view="settings">
          <span class="nav-icon">⚙️</span>
          <span>${t("nav.settings")}</span>
        </div>

        <div class="sidebar-spacer"></div>

        <div class="sidebar-footer" style="display: flex; flex-direction: column; gap: 8px;">
          <button class="sidebar-theme-btn" id="btn-quick-theme" title="${t("settings.appearance")}: ${themeLabel}">
            <span>${themeIcon}</span>
            <span style="flex: 1; text-align: left;">${themeLabel}</span>
          </button>
          <div>TauriMule ${t("nav.version")}</div>
        </div>
      </nav>

      <main class="main-content">
        <div id="content"></div>
      </main>

      <footer class="status-footer" id="status-bar">
        <span>${t("status.startingDaemon")}</span>
      </footer>
    </div>`;

  // Navigation clicks
  document.getElementById("sidebar-header-settings")?.addEventListener("click", () => navigate("settings"));
  document.querySelectorAll(".nav-item").forEach((el) => {
    el.addEventListener("click", () => navigate(el.getAttribute("data-view") as ViewName));
  });

  // Quick theme toggle click (cycles dark -> light -> system)
  document.getElementById("btn-quick-theme")?.addEventListener("click", () => {
    const scheme = ThemeManager.getColorScheme();
    let next: ColorScheme = "dark";
    if (scheme === "dark") next = "light";
    else if (scheme === "light") next = "system";
    else next = "dark";
    ThemeManager.setColorScheme(next);
    renderAppShell();
    renderView();
  });
}
