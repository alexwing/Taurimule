import { api, type AppConfig } from "../lib/tauri-bridge";
import { getLogoSvg } from "../lib/logo";
import { ThemeManager, type ColorScheme } from "../lib/theme";
import { t, I18nManager, type LanguageSetting } from "../lib/i18n";
import { escapeHtml } from "../lib/html";
import { state } from "../state/store";
import { renderView } from "../app/router";
import { renderAppShell } from "../app/shell";
import { renderHeader } from "../ui/header";
import { showToast } from "../ui/dialogs";
import { getLocalizedLogoLabel, updateAppLogo } from "../ui/app-logo";

// ═══════════════════════════════════════════════════════════════════
// 5. SETTINGS VIEW (Configuración e Importación + Apariencia & Idioma)
// ═══════════════════════════════════════════════════════════════════

export async function renderSettingsView(): Promise<string> {
  const currentTheme = ThemeManager.getColorScheme();
  const currentLang = I18nManager.getLanguageSetting();

  let config: AppConfig = {
    nick: "TauriMule-User",
    incoming_dir: "",
    temp_dir: "",
    port: 4662,
    udp_port: 4672,
    max_upload: 0,
    max_download: 0,
    connect_ed2k: true,
    connect_kad: true,
    auto_connect: true,
    config_dir: "",
  };

  try {
    config = await api.getConfig();
  } catch (e) {
    console.warn("Could not load config:", e);
  }

  let isEd2kAssoc = false;
  try {
    isEd2kAssoc = await api.isEd2kAssociated();
  } catch (e) {
    console.warn("Could not check ed2k association:", e);
  }

  return `
    ${renderHeader(t("settings.title"), t("settings.subtitle"), t("nav.settings"))}
    
    <!-- Appearance & Language Configuration Card (Syncdrome style) -->
    <div class="table-container" style="padding: 24px; max-width: 850px; margin-bottom: 20px;">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; margin-bottom: 16px;">
        <div>
          <h3 style="font-size: 16px; font-weight: 700; margin: 0; display: flex; align-items: center; gap: 8px;">
            <span>🎨</span>
            <span>${t("settings.appearanceTitle")}</span>
          </h3>
          <p style="color: var(--text-secondary); font-size: 12px; margin-top: 4px; margin-bottom: 0;">
            ${t("settings.appearanceHint")}
          </p>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px;">
        <!-- Theme Selection -->
        <div class="metric-card" style="padding: 16px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <span style="font-size: 16px;">🌓</span>
            <span style="font-weight: 600; font-size: 13px;">${t("settings.appearance")}</span>
          </div>
          <select id="select-theme" class="settings-select" style="width: 100%;">
            <option value="system" ${currentTheme === "system" ? "selected" : ""}>💻 ${t("settings.themeSystem")}</option>
            <option value="light" ${currentTheme === "light" ? "selected" : ""}>☀️ ${t("settings.themeLight")}</option>
            <option value="dark" ${currentTheme === "dark" ? "selected" : ""}>🌙 ${t("settings.themeDark")}</option>
          </select>
        </div>

        <!-- Language Selection -->
        <div class="metric-card" style="padding: 16px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <span style="font-size: 16px;">🌐</span>
            <span style="font-weight: 600; font-size: 13px;">${t("settings.language")}</span>
          </div>
          <select id="select-language" class="settings-select" style="width: 100%;">
            <option value="system" ${currentLang === "system" ? "selected" : ""}>💻 ${t("settings.themeSystem")}</option>
            <option value="es" ${currentLang === "es" ? "selected" : ""}>🇪🇸 Español</option>
            <option value="en" ${currentLang === "en" ? "selected" : ""}>🇬🇧 English</option>
            <option value="fr" ${currentLang === "fr" ? "selected" : ""}>🇫🇷 Français</option>
            <option value="de" ${currentLang === "de" ? "selected" : ""}>🇩🇪 Deutsch</option>
          </select>
        </div>
      </div>
    </div>

    <!-- eD2k Protocol Association Card -->
    <div class="table-container" style="padding: 24px; max-width: 850px; margin-bottom: 20px;">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; margin-bottom: 16px;">
        <div>
          <h3 style="font-size: 16px; font-weight: 700; margin: 0; display: flex; align-items: center; gap: 8px;">
            <span>🔗</span>
            <span>${t("settings.ed2kAssociationTitle")}</span>
          </h3>
          <p style="color: var(--text-secondary); font-size: 12px; margin-top: 4px; margin-bottom: 0;">
            ${t("settings.ed2kAssociationSubtitle")}
          </p>
        </div>
      </div>

      <div class="metric-card" style="padding: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 22px;">${isEd2kAssoc ? "🟢" : "⚪"}</span>
          <div>
            <div style="font-weight: 600; font-size: 13px; color: var(--text-primary);">
              ${isEd2kAssoc ? t("settings.ed2kAssociated") : t("settings.ed2kNotAssociated")}
            </div>
            <div style="font-size: 11.5px; color: var(--text-secondary); margin-top: 2px;">
              Protocol: <code style="font-family: var(--font-mono);">ed2k://</code> (Windows Registry)
            </div>
          </div>
        </div>

        <div>
          ${
            isEd2kAssoc
              ? `<button class="btn btn-secondary btn-sm" id="btn-unassociate-ed2k" style="font-weight: 600;">✕ ${t("settings.btnUnassociateEd2k")}</button>`
              : `<button class="btn btn-primary btn-sm" id="btn-associate-ed2k" style="font-weight: 600;">🔗 ${t("settings.btnAssociateEd2k")}</button>`
          }
        </div>
      </div>
    </div>

    <!-- Branding & Logo States Showcase Card -->
    <div class="table-container" style="padding: 24px; max-width: 850px; margin-bottom: 20px;">
      <div style="display: flex; gap: 24px; align-items: center; flex-wrap: wrap; margin-bottom: 20px;">
        <div id="settings-logo-preview" style="width: 84px; height: 84px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          ${getLogoSvg(state.currentLogoState, 84, "settings-preview")}
        </div>
        <div style="flex: 1; min-width: 260px;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
            <h3 style="font-size: 17px; font-weight: 700; margin: 0;">${t("settings.logoTitle")}</h3>
            <span class="brand-badge state-${state.currentLogoState}" id="settings-badge">${getLocalizedLogoLabel(state.currentLogoState)}</span>
          </div>
          <p style="color: var(--text-secondary); font-size: 12.5px; line-height: 1.5; margin-bottom: 0;">
            ${t("settings.logoDesc")}
          </p>
        </div>
      </div>

      <div style="border-top: 1px solid var(--border-subtle); padding-top: 16px;">
        <div style="font-size: 11px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">
          ${t("settings.logoGallery")}
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 16px;">
          <div class="metric-card" style="padding: 12px; cursor: pointer; border: 1px solid ${state.currentLogoState === "connected" ? "#60cdff" : "var(--border-subtle)"};" data-test-state="connected">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
              <div style="width: 36px; height: 36px; flex-shrink: 0;">${getLogoSvg("connected", 36, "card-conn")}</div>
              <div>
                <div style="font-weight: 600; font-size: 12px; color: #60cdff;">${t("settings.cardConnectedTitle")}</div>
                <div style="font-size: 10px; color: var(--text-tertiary);">${t("settings.cardConnectedSub")}</div>
              </div>
            </div>
            <button class="btn btn-secondary btn-sm" style="width: 100%;">${t("settings.testBlue")}</button>
          </div>

          <div class="metric-card" style="padding: 12px; cursor: pointer; border: 1px solid ${state.currentLogoState === "downloading" ? "#6ccb5f" : "var(--border-subtle)"};" data-test-state="downloading">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
              <div style="width: 36px; height: 36px; flex-shrink: 0;">${getLogoSvg("downloading", 36, "card-dl")}</div>
              <div>
                <div style="font-weight: 600; font-size: 12px; color: #6ccb5f;">${t("settings.cardDownloadingTitle")}</div>
                <div style="font-size: 10px; color: var(--text-tertiary);">${t("settings.cardDownloadingSub")}</div>
              </div>
            </div>
            <button class="btn btn-secondary btn-sm" style="width: 100%;">${t("settings.testGreen")}</button>
          </div>

          <div class="metric-card" style="padding: 12px; cursor: pointer; border: 1px solid ${state.currentLogoState === "warning" ? "#ffe066" : "var(--border-subtle)"};" data-test-state="warning">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
              <div style="width: 36px; height: 36px; flex-shrink: 0;">${getLogoSvg("warning", 36, "card-warn")}</div>
              <div>
                <div style="font-weight: 600; font-size: 12px; color: #ffe066;">${t("settings.cardWarningTitle")}</div>
                <div style="font-size: 10px; color: var(--text-tertiary);">${t("settings.cardWarningSub")}</div>
              </div>
            </div>
            <button class="btn btn-secondary btn-sm" style="width: 100%;">${t("settings.testAmber")}</button>
          </div>

          <div class="metric-card" style="padding: 12px; cursor: pointer; border: 1px solid ${state.currentLogoState === "idle" ? "#adadad" : "var(--border-subtle)"};" data-test-state="idle">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
              <div style="width: 36px; height: 36px; flex-shrink: 0;">${getLogoSvg("idle", 36, "card-idle")}</div>
              <div>
                <div style="font-weight: 600; font-size: 12px; color: #adadad;">${t("settings.cardIdleTitle")}</div>
                <div style="font-size: 10px; color: var(--text-tertiary);">${t("settings.cardIdleSub")}</div>
              </div>
            </div>
            <button class="btn btn-secondary btn-sm" style="width: 100%;">${t("settings.testGray")}</button>
          </div>
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
          <div id="state-feedback" style="font-size: 12px; color: var(--text-secondary); font-family: var(--font-mono);">
            ${t("settings.currentMode", {
              mode: state.manualLogoOverride
                ? t("settings.modeManual", { state: getLocalizedLogoLabel(state.manualLogoOverride) })
                : t("settings.modeAuto", { state: getLocalizedLogoLabel(state.currentLogoState) }),
            })}
          </div>
          <button class="btn btn-primary" data-test-state="auto">🔄 ${t("settings.resetAuto")}</button>
        </div>
      </div>
    </div>

    <!-- Directories Configuration Card -->
    <div class="table-container" style="padding: 24px; max-width: 850px; margin-bottom: 20px;">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; margin-bottom: 16px;">
        <div>
          <h3 style="font-size: 16px; font-weight: 700; margin: 0; display: flex; align-items: center; gap: 8px;">
            <span>📁</span>
            <span>${t("settings.directoriesTitle")}</span>
          </h3>
          <p style="color: var(--text-secondary); font-size: 12px; margin-top: 4px; margin-bottom: 0;">
            ${t("settings.directoriesDesc")}
          </p>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div>
          <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px; display: block;">
            ${t("settings.incomingDirLabel")}
          </label>
          <div style="display: flex; gap: 8px; align-items: center;">
            <input type="text" id="input-cfg-incoming" class="table-search-input" style="flex: 1; font-family: var(--font-mono); font-size: 12px;" value="${escapeHtml(config.incoming_dir)}" />
            <button class="btn btn-secondary btn-sm" id="btn-browse-incoming" title="${t("settings.browseFolder")}">📁 ${t("settings.browseFolder")}</button>
            <button class="btn btn-secondary btn-sm" id="btn-open-incoming" title="${t("settings.openFolder")}">↗ ${t("settings.openFolder")}</button>
          </div>
        </div>

        <div>
          <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px; display: block;">
            ${t("settings.tempDirLabel")}
          </label>
          <div style="display: flex; gap: 8px; align-items: center;">
            <input type="text" id="input-cfg-temp" class="table-search-input" style="flex: 1; font-family: var(--font-mono); font-size: 12px;" value="${escapeHtml(config.temp_dir)}" />
            <button class="btn btn-secondary btn-sm" id="btn-browse-temp" title="${t("settings.browseFolder")}">📁 ${t("settings.browseFolder")}</button>
            <button class="btn btn-secondary btn-sm" id="btn-open-temp" title="${t("settings.openFolder")}">↗ ${t("settings.openFolder")}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Connection & Network Card -->
    <div class="table-container" style="padding: 24px; max-width: 850px; margin-bottom: 20px;">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; margin-bottom: 16px;">
        <div>
          <h3 style="font-size: 16px; font-weight: 700; margin: 0; display: flex; align-items: center; gap: 8px;">
            <span>🌐</span>
            <span>${t("settings.networkTitle")}</span>
          </h3>
          <p style="color: var(--text-secondary); font-size: 12px; margin-top: 4px; margin-bottom: 0;">
            ${t("settings.networkDesc")}
          </p>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div>
          <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px; display: block;">
            ${t("settings.nickLabel")}
          </label>
          <input type="text" id="input-cfg-nick" class="table-search-input" style="width: 100%; box-sizing: border-box; max-width: 380px;" value="${escapeHtml(config.nick)}" />
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
          <div>
            <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px; display: block;">
              ${t("settings.tcpPortLabel")}
            </label>
            <input type="number" id="input-cfg-port" class="table-search-input" style="width: 100%; box-sizing: border-box;" value="${config.port}" min="1" max="65535" />
          </div>
          <div>
            <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px; display: block;">
              ${t("settings.udpPortLabel")}
            </label>
            <input type="number" id="input-cfg-udpport" class="table-search-input" style="width: 100%; box-sizing: border-box;" value="${config.udp_port}" min="1" max="65535" />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
          <div>
            <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px; display: block;">
              ${t("settings.maxDownloadLabel")} <span style="font-weight: 400; text-transform: none; color: var(--text-tertiary);">(${t("settings.unlimitedHint")})</span>
            </label>
            <input type="number" id="input-cfg-maxdown" class="table-search-input" style="width: 100%; box-sizing: border-box;" value="${config.max_download}" min="0" />
          </div>
          <div>
            <label style="font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px; display: block;">
              ${t("settings.maxUploadLabel")} <span style="font-weight: 400; text-transform: none; color: var(--text-tertiary);">(${t("settings.unlimitedHint")})</span>
            </label>
            <input type="number" id="input-cfg-maxup" class="table-search-input" style="width: 100%; box-sizing: border-box;" value="${config.max_upload}" min="0" />
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 4px;">
          <label class="fluent-switch-container">
            <div class="fluent-switch">
              <input type="checkbox" id="check-cfg-ed2k" class="fluent-switch-input" ${config.connect_ed2k ? "checked" : ""} />
              <span class="fluent-switch-track"><span class="fluent-switch-thumb"></span></span>
            </div>
            <span class="fluent-switch-label">${t("settings.connectEd2kLabel")}</span>
          </label>

          <label class="fluent-switch-container">
            <div class="fluent-switch">
              <input type="checkbox" id="check-cfg-kad" class="fluent-switch-input" ${config.connect_kad ? "checked" : ""} />
              <span class="fluent-switch-track"><span class="fluent-switch-thumb"></span></span>
            </div>
            <span class="fluent-switch-label">${t("settings.connectKadLabel")}</span>
          </label>

          <label class="fluent-switch-container">
            <div class="fluent-switch">
              <input type="checkbox" id="check-cfg-autoconnect" class="fluent-switch-input" ${config.auto_connect ? "checked" : ""} />
              <span class="fluent-switch-track"><span class="fluent-switch-thumb"></span></span>
            </div>
            <span class="fluent-switch-label">${t("settings.autoConnectLabel")}</span>
          </label>
        </div>

        <div style="display: flex; align-items: center; gap: 12px; margin-top: 8px;">
          <button class="btn btn-primary" id="btn-save-config">💾 ${t("settings.saveConfigBtn")}</button>
          <span id="save-config-feedback" style="font-size: 12px; font-weight: 500;"></span>
        </div>
      </div>
    </div>

    <!-- Import Assistant Card -->
    <div class="table-container" style="padding: 24px; max-width: 850px; margin-bottom: 20px;">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; margin-bottom: 16px;">
        <div>
          <h3 style="font-size: 16px; font-weight: 700; margin: 0; display: flex; align-items: center; gap: 8px;">
            <span>📦</span>
            <span>${t("settings.importSectionTitle")}</span>
          </h3>
          <p style="color: var(--text-secondary); font-size: 12px; margin-top: 4px; margin-bottom: 0;">
            ${t("settings.importSectionDesc")}
          </p>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 16px; margin-bottom: 14px;">
        <!-- eMule Import Card -->
        <div class="metric-card" style="padding: 16px; display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">🐴</span>
            <span style="font-weight: 700; font-size: 14px;">${t("settings.importEmuleCardTitle")}</span>
          </div>
          <p style="font-size: 12px; color: var(--text-secondary); margin: 0; line-height: 1.4;">
            ${t("settings.importEmuleCardDesc")}
          </p>
          <button class="btn btn-primary btn-sm" id="btn-import-emule-auto" style="align-self: flex-start; margin-top: 2px;">
            ⚡ ${t("settings.importEmuleAutoBtn")}
          </button>

          <div style="border-top: 1px solid var(--border-subtle); padding-top: 10px; margin-top: 4px;">
            <label style="font-size: 10.5px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 4px; display: block;">
              ${t("settings.customPathLabel")}
            </label>
            <div style="display: flex; gap: 6px;">
              <input type="text" id="input-import-emule-path" class="table-search-input" style="flex: 1; font-size: 11.5px; font-family: var(--font-mono);" placeholder="${t("settings.customPathPlaceholder")}" />
              <button class="btn btn-secondary btn-sm" id="btn-browse-import-emule" title="Examinar carpeta">📁</button>
              <button class="btn btn-secondary btn-sm" id="btn-import-emule-custom">${t("settings.importCustomBtn")}</button>
            </div>
          </div>
        </div>

        <!-- aMule Import Card -->
        <div class="metric-card" style="padding: 16px; display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">⚡</span>
            <span style="font-weight: 700; font-size: 14px;">${t("settings.importAmuleCardTitle")}</span>
          </div>
          <p style="font-size: 12px; color: var(--text-secondary); margin: 0; line-height: 1.4;">
            ${t("settings.importAmuleCardDesc")}
          </p>
          <button class="btn btn-primary btn-sm" id="btn-import-amule-auto" style="align-self: flex-start; margin-top: 2px;">
            ⚡ ${t("settings.importAmuleAutoBtn")}
          </button>

          <div style="border-top: 1px solid var(--border-subtle); padding-top: 10px; margin-top: 4px;">
            <label style="font-size: 10.5px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 4px; display: block;">
              ${t("settings.customPathLabel")}
            </label>
            <div style="display: flex; gap: 6px;">
              <input type="text" id="input-import-amule-path" class="table-search-input" style="flex: 1; font-size: 11.5px; font-family: var(--font-mono);" placeholder="C:\\Users\\...\\.aMule" />
              <button class="btn btn-secondary btn-sm" id="btn-browse-import-amule" title="Examinar carpeta">📁</button>
              <button class="btn btn-secondary btn-sm" id="btn-import-amule-custom">${t("settings.importCustomBtn")}</button>
            </div>
          </div>
        </div>
      </div>

      <div id="import-feedback-box" style="display: none; padding: 10px 14px; border-radius: var(--radius-sm); font-size: 12px; background: var(--bg-card-header); border: 1px solid var(--border-subtle);"></div>
    </div>

    <!-- Active Client Parameters -->
    <div class="table-container" style="padding: 24px; max-width: 850px;">
      <h3 style="margin-bottom: 16px; font-size: 16px;">${t("settings.emuleParamsTitle")}</h3>
      
      <div style="display: grid; grid-template-columns: 200px 1fr; gap: 12px; margin-bottom: 24px; font-size: 13px;">
        <span style="color: var(--text-secondary);">${t("settings.tempDir")}</span>
        <span style="font-family: var(--font-mono);">${escapeHtml(config.temp_dir || "—")}</span>

        <span style="color: var(--text-secondary);">${t("settings.incomingDir")}</span>
        <span style="font-family: var(--font-mono);">${escapeHtml(config.incoming_dir || "—")}</span>

        <span style="color: var(--text-secondary);">${t("settings.tcpPort")}</span>
        <span><strong style="color: #6ccb5f;">${config.port}</strong> (${t("settings.highIdRouter")})</span>

        <span style="color: var(--text-secondary);">${t("settings.udpPort")}</span>
        <span><strong style="color: #6ccb5f;">${config.udp_port}</strong> (${t("settings.noFirewall")})</span>

        <span style="color: var(--text-secondary);">${t("settings.limits")}</span>
        <span>${config.max_download > 0 ? `${config.max_download} KB/s` : "∞"} / ${config.max_upload > 0 ? `${config.max_upload} KB/s` : "∞"}</span>

        <span style="color: var(--text-secondary);">${t("settings.ecPort")}</span>
        <span style="font-family: var(--font-mono);">TCP 4712 (Localhost)</span>
      </div>

      <div style="border-top: 1px solid var(--border-subtle); padding-top: 18px;">
        <h4 style="margin-bottom: 8px;">${t("settings.syncTitle")}</h4>
        <p style="color: var(--text-secondary); margin-bottom: 16px; font-size: 12px;">
          ${t("settings.syncDesc")}
        </p>
        <button class="btn btn-primary" id="btn-sync-emule">
          🔄 ${t("settings.syncButton")}
        </button>
        <span id="sync-feedback" style="margin-left: 12px; font-size: 12px; color: #6ccb5f;"></span>
      </div>
    </div>`;
}

export function attachSettingsListeners() {
  // Settings: Browse & Open Incoming Folder
  document.getElementById("btn-browse-incoming")?.addEventListener("click", async () => {
    const input = document.getElementById("input-cfg-incoming") as HTMLInputElement;
    const current = input ? input.value : "";
    try {
      const selected = await api.pickFolder(t("settings.incomingDirLabel"), current);
      if (selected && input) {
        input.value = selected;
      }
    } catch (err) {
      console.error("Browse incoming error:", err);
    }
  });

  document.getElementById("btn-open-incoming")?.addEventListener("click", async () => {
    const input = document.getElementById("input-cfg-incoming") as HTMLInputElement;
    if (input && input.value) {
      await api.openFolder(input.value);
    }
  });

  // Settings: Browse & Open Temp Folder
  document.getElementById("btn-browse-temp")?.addEventListener("click", async () => {
    const input = document.getElementById("input-cfg-temp") as HTMLInputElement;
    const current = input ? input.value : "";
    try {
      const selected = await api.pickFolder(t("settings.tempDirLabel"), current);
      if (selected && input) {
        input.value = selected;
      }
    } catch (err) {
      console.error("Browse temp error:", err);
    }
  });

  document.getElementById("btn-open-temp")?.addEventListener("click", async () => {
    const input = document.getElementById("input-cfg-temp") as HTMLInputElement;
    if (input && input.value) {
      await api.openFolder(input.value);
    }
  });

  // Settings: Save Configuration
  document.getElementById("btn-save-config")?.addEventListener("click", async () => {
    const nick = (document.getElementById("input-cfg-nick") as HTMLInputElement)?.value.trim() || "TauriMule-User";
    const incoming = (document.getElementById("input-cfg-incoming") as HTMLInputElement)?.value.trim() || "";
    const temp = (document.getElementById("input-cfg-temp") as HTMLInputElement)?.value.trim() || "";
    const port = parseInt((document.getElementById("input-cfg-port") as HTMLInputElement)?.value || "4662", 10);
    const udpPort = parseInt((document.getElementById("input-cfg-udpport") as HTMLInputElement)?.value || "4672", 10);
    const maxDown = parseInt((document.getElementById("input-cfg-maxdown") as HTMLInputElement)?.value || "0", 10);
    const maxUp = parseInt((document.getElementById("input-cfg-maxup") as HTMLInputElement)?.value || "0", 10);
    const connectEd2k = (document.getElementById("check-cfg-ed2k") as HTMLInputElement)?.checked ?? true;
    const connectKad = (document.getElementById("check-cfg-kad") as HTMLInputElement)?.checked ?? true;
    const autoConnect = (document.getElementById("check-cfg-autoconnect") as HTMLInputElement)?.checked ?? true;
    const feedback = document.getElementById("save-config-feedback");

    const newConfig: AppConfig = {
      nick,
      incoming_dir: incoming,
      temp_dir: temp,
      port: isNaN(port) ? 4662 : port,
      udp_port: isNaN(udpPort) ? 4672 : udpPort,
      max_download: isNaN(maxDown) ? 0 : maxDown,
      max_upload: isNaN(maxUp) ? 0 : maxUp,
      connect_ed2k: connectEd2k,
      connect_kad: connectKad,
      auto_connect: autoConnect,
      config_dir: "",
    };

    try {
      await api.saveConfig(newConfig);
      showToast(`✅ ${t("settings.configSavedSuccess")}`);
      if (feedback) {
        feedback.style.color = "var(--success)";
        feedback.textContent = `✓ ${t("settings.configSavedSuccess")}`;
        setTimeout(() => { if (feedback) feedback.textContent = ""; }, 4000);
      }
    } catch (err) {
      showToast(`⚠️ Error al guardar: ${err}`);
      if (feedback) {
        feedback.style.color = "var(--danger)";
        feedback.textContent = `⚠️ Error: ${err}`;
      }
    }
  });

  // Settings: Import eMule Auto
  document.getElementById("btn-import-emule-auto")?.addEventListener("click", async () => {
    const box = document.getElementById("import-feedback-box");
    if (box) {
      box.style.display = "block";
      box.style.color = "var(--text-primary)";
      box.textContent = "Buscando instalación de eMule en Windows e importando datos...";
    }
    try {
      const res = await api.importFromEmule();
      if (res.success) {
        showToast(`✅ ${res.message}`);
        if (box) {
          box.style.color = "var(--success)";
          box.textContent = `✅ ${res.message} (${res.servers_count} servidores importados). Recargando configuración...`;
        }
        setTimeout(() => renderView(), 1200);
      } else {
        if (box) {
          box.style.color = "var(--danger)";
          box.textContent = `⚠️ ${res.message}`;
        }
      }
    } catch (err) {
      if (box) {
        box.style.color = "var(--danger)";
        box.textContent = `⚠️ Error: ${err}`;
      }
    }
  });

  // Settings: Browse eMule Custom Path
  document.getElementById("btn-browse-import-emule")?.addEventListener("click", async () => {
    const input = document.getElementById("input-import-emule-path") as HTMLInputElement;
    try {
      const sel = await api.pickFolder("Seleccionar carpeta de configuración de eMule", input?.value);
      if (sel && input) input.value = sel;
    } catch (e) {
      console.error(e);
    }
  });

  // Settings: Import eMule Custom
  document.getElementById("btn-import-emule-custom")?.addEventListener("click", async () => {
    const path = (document.getElementById("input-import-emule-path") as HTMLInputElement)?.value.trim();
    const box = document.getElementById("import-feedback-box");
    if (!path) {
      if (box) {
        box.style.display = "block";
        box.style.color = "var(--warning)";
        box.textContent = "Por favor, selecciona o escribe una ruta válida.";
      }
      return;
    }
    if (box) {
      box.style.display = "block";
      box.style.color = "var(--text-primary)";
      box.textContent = `Importando desde ${path}...`;
    }
    try {
      const res = await api.importFromEmule(path);
      if (res.success) {
        showToast(`✅ ${res.message}`);
        if (box) {
          box.style.color = "var(--success)";
          box.textContent = `✅ ${res.message} (${res.servers_count} servidores). Recargando configuración...`;
        }
        setTimeout(() => renderView(), 1200);
      } else {
        if (box) {
          box.style.color = "var(--danger)";
          box.textContent = `⚠️ ${res.message}`;
        }
      }
    } catch (err) {
      if (box) {
        box.style.color = "var(--danger)";
        box.textContent = `⚠️ Error: ${err}`;
      }
    }
  });

  // Settings: Import aMule Auto
  document.getElementById("btn-import-amule-auto")?.addEventListener("click", async () => {
    const box = document.getElementById("import-feedback-box");
    if (box) {
      box.style.display = "block";
      box.style.color = "var(--text-primary)";
      box.textContent = "Buscando configuración previa de aMule e importando datos...";
    }
    try {
      const res = await api.importFromAmule();
      if (res.success) {
        showToast(`✅ ${res.message}`);
        if (box) {
          box.style.color = "var(--success)";
          box.textContent = `✅ ${res.message} (${res.servers_count} servidores importados). Recargando configuración...`;
        }
        setTimeout(() => renderView(), 1200);
      } else {
        if (box) {
          box.style.color = "var(--danger)";
          box.textContent = `⚠️ ${res.message}`;
        }
      }
    } catch (err) {
      if (box) {
        box.style.color = "var(--danger)";
        box.textContent = `⚠️ Error: ${err}`;
      }
    }
  });

  // Settings: Browse aMule Custom Path
  document.getElementById("btn-browse-import-amule")?.addEventListener("click", async () => {
    const input = document.getElementById("input-import-amule-path") as HTMLInputElement;
    try {
      const sel = await api.pickFolder("Seleccionar carpeta de configuración de aMule", input?.value);
      if (sel && input) input.value = sel;
    } catch (e) {
      console.error(e);
    }
  });

  // Settings: Import aMule Custom
  document.getElementById("btn-import-amule-custom")?.addEventListener("click", async () => {
    const path = (document.getElementById("input-import-amule-path") as HTMLInputElement)?.value.trim();
    const box = document.getElementById("import-feedback-box");
    if (!path) {
      if (box) {
        box.style.display = "block";
        box.style.color = "var(--warning)";
        box.textContent = "Por favor, selecciona o escribe una ruta válida.";
      }
      return;
    }
    if (box) {
      box.style.display = "block";
      box.style.color = "var(--text-primary)";
      box.textContent = `Importando desde ${path}...`;
    }
    try {
      const res = await api.importFromAmule(path);
      if (res.success) {
        showToast(`✅ ${res.message}`);
        if (box) {
          box.style.color = "var(--success)";
          box.textContent = `✅ ${res.message} (${res.servers_count} servidores). Recargando configuración...`;
        }
        setTimeout(() => renderView(), 1200);
      } else {
        if (box) {
          box.style.color = "var(--danger)";
          box.textContent = `⚠️ ${res.message}`;
        }
      }
    } catch (err) {
      if (box) {
        box.style.color = "var(--danger)";
        box.textContent = `⚠️ Error: ${err}`;
      }
    }
  });

  // Re-import eMule button (sync card)
  document.getElementById("btn-sync-emule")?.addEventListener("click", async () => {
    const feedback = document.getElementById("sync-feedback");
    if (feedback) {
      feedback.style.color = "var(--text-primary)";
      feedback.textContent = t("settings.syncing");
    }
    try {
      const res = await api.importFromEmule();
      if (feedback) {
        feedback.style.color = res.success ? "var(--success)" : "var(--danger)";
        feedback.textContent = res.success ? `✓ ${res.message}` : `⚠️ ${res.message}`;
      }
      setTimeout(() => renderView(), 1200);
    } catch (err) {
      if (feedback) {
        feedback.style.color = "var(--danger)";
        feedback.textContent = `⚠️ Error: ${err}`;
      }
    }
  });

  // eD2k Association Buttons
  document.getElementById("btn-associate-ed2k")?.addEventListener("click", async () => {
    try {
      await api.registerEd2kAssociation();
      showToast(`🔗 ${t("settings.ed2kAssociatedSuccess")}`);
      await renderView();
    } catch (err) {
      showToast(`⚠️ ${err}`);
    }
  });

  document.getElementById("btn-unassociate-ed2k")?.addEventListener("click", async () => {
    try {
      await api.unregisterEd2kAssociation();
      showToast(`ℹ️ ${t("settings.ed2kUnassociatedSuccess")}`);
      await renderView();
    } catch (err) {
      showToast(`⚠️ ${err}`);
    }
  });

  // Theme select in Settings
  document.getElementById("select-theme")?.addEventListener("change", (e) => {
    const val = (e.target as HTMLSelectElement).value as ColorScheme;
    ThemeManager.setColorScheme(val);
    renderAppShell();
    renderView();
  });

  // Language select in Settings
  document.getElementById("select-language")?.addEventListener("change", (e) => {
    const val = (e.target as HTMLSelectElement).value as LanguageSetting;
    I18nManager.setLanguage(val);
  });

  // State tester buttons (logo showcase)
  document.querySelectorAll("[data-test-state]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const testState = (e.currentTarget as HTMLElement).dataset.testState;
      if (testState === "auto") {
        state.manualLogoOverride = null;
      } else if (testState === "connected" || testState === "downloading" || testState === "warning" || testState === "idle") {
        state.manualLogoOverride = testState;
        updateAppLogo(testState);
      }
      renderView();
    });
  });
}
