import { api } from "../lib/tauri-bridge";
import { getLogoSvg } from "../lib/logo";
import { t } from "../lib/i18n";
import { state } from "../state/store";
import { renderView } from "./router";
import { updateFooter } from "./polling";
import { updateDaemonControlBar } from "../ui/daemon-control";

// Create & mount the startup splash overlay and poll amuled until the EC link is up
export function mountStartupSplash() {
  // Create & mount the startup splash overlay
  const splashEl = document.createElement("div");
  splashEl.id = "taurimule-startup-splash";
  splashEl.className = "startup-splash-overlay";
  splashEl.innerHTML = `
    <div class="startup-splash-card">
      <div class="splash-logo-container">
        <div class="splash-pulse-ring"></div>
        ${getLogoSvg(state.currentLogoState, 68, "splash-logo")}
      </div>
      <div class="splash-title">${t("splash.title")}</div>
      <div class="splash-subtitle">${t("splash.subtitle")}</div>
      <div class="splash-progress-track">
        <div class="splash-progress-bar"></div>
      </div>
      <div class="splash-status-text" id="splash-status">${t("splash.stepDaemon")}</div>
      <div class="splash-timeout-actions" id="splash-timeout-actions">
        <button class="btn btn-primary btn-sm" id="btn-splash-retry">🔄 ${t("splash.retry")}</button>
        <button class="btn btn-secondary btn-sm" id="btn-splash-continue">${t("splash.continueAnyway")}</button>
      </div>
    </div>
  `;
  document.body.appendChild(splashEl);

  const statusEl = splashEl.querySelector("#splash-status") as HTMLElement | null;
  const timeoutActions = splashEl.querySelector("#splash-timeout-actions") as HTMLElement | null;

  let splashDismissed = false;
  let splashPolling = false;

  const dismissSplash = () => {
    if (splashDismissed) return;
    splashDismissed = true;
    state.isAppStartingUp = false;
    splashEl.classList.add("fade-out");
    setTimeout(() => {
      splashEl.remove();
      updateDaemonControlBar();
    }, 450);
    renderView();
  };

  let checkAttempts = 0;
  const maxFastAttempts = 40; // ~10 seconds

  // Fast polling loop to connect to amuled EC protocol. Each check is awaited
  // before the next one is scheduled, so slow IPC calls never overlap.
  async function splashPollLoop() {
    if (splashDismissed) {
      splashPolling = false;
      return;
    }
    checkAttempts++;
    try {
      const status = await api.getDaemonStatus();
      if (splashDismissed) {
        splashPolling = false;
        return;
      }
      state.currentDaemonStatus = status;
      updateDaemonControlBar(status);

      if (status.running && !status.ec_connected) {
        if (statusEl) statusEl.textContent = t("splash.stepEc");
      }

      if (status.ec_connected) {
        if (statusEl) statusEl.textContent = t("splash.stepSync");

        // Preload snapshot before removing splash
        try {
          const snap = await api.getSnapshot();
          if (snap) {
            state.cachedDownloads = snap.downloads || [];
            if (snap.stats) {
              state.lastStats = snap.stats;
              updateFooter(snap.stats);
            }
            const badgeEl = document.getElementById("badge-dl-count");
            if (badgeEl) badgeEl.textContent = state.cachedDownloads.length.toString();
          }
        } catch (e) {
          console.warn("Initial snapshot load error:", e);
        }

        updateDaemonControlBar(status);

        if (statusEl) statusEl.textContent = t("splash.stepReady");
        splashPolling = false;
        setTimeout(() => {
          dismissSplash();
        }, 350);
        return;
      }
    } catch (e) {
      console.warn("Daemon check error:", e);
    }

    if (splashDismissed) {
      splashPolling = false;
      return;
    }

    if (checkAttempts >= maxFastAttempts) {
      splashPolling = false;
      if (statusEl) statusEl.textContent = t("splash.timeout");
      if (timeoutActions) timeoutActions.style.display = "flex";
      return;
    }

    setTimeout(splashPollLoop, 250);
  }

  const startSplashPolling = () => {
    if (splashPolling || splashDismissed) return;
    splashPolling = true;
    void splashPollLoop();
  };

  splashEl.querySelector("#btn-splash-retry")?.addEventListener("click", async () => {
    if (timeoutActions) timeoutActions.style.display = "none";
    if (statusEl) statusEl.textContent = t("splash.stepDaemon");
    try {
      await api.startDaemon();
    } catch {}
    checkAttempts = 0;
    startSplashPolling();
  });

  splashEl.querySelector("#btn-splash-continue")?.addEventListener("click", () => {
    dismissSplash();
  });

  startSplashPolling();
}
