import { api, type DaemonStatus } from "../lib/tauri-bridge";
import { t } from "../lib/i18n";
import { escapeHtml } from "../lib/html";
import { state } from "../state/store";
import { showToast } from "./dialogs";

export function isDaemonActive(): boolean {
  return Boolean(state.currentDaemonStatus?.running || state.currentDaemonStatus?.ec_connected);
}

export async function handleToggleDaemon() {
  const btn = document.getElementById("btn-toggle-daemon") as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
  try {
    if (isDaemonActive()) {
      showToast(`⏳ Deteniendo demonio amuled...`);
      await api.stopDaemon();
      state.currentDaemonStatus = {
        running: false,
        pid: undefined,
        ec_connected: false,
        version: undefined,
      };
      updateDaemonControlBar(state.currentDaemonStatus);
      showToast(`⏹ ${t("settings.daemonStopped")}`);
    } else {
      showToast(`⏳ Iniciando demonio amuled...`);
      const newStatus = await api.startDaemon();
      state.currentDaemonStatus = newStatus;
      updateDaemonControlBar(newStatus);
      showToast(`▶ amuled iniciado`);
    }
  } catch (e: any) {
    showToast(`⚠️ Error al controlar demonio: ${e}`);
  } finally {
    if (btn) btn.disabled = false;
  }
}

export function updateDaemonControlBar(status?: DaemonStatus | null) {
  if (status !== undefined) {
    state.currentDaemonStatus = status;
  }
  const isRunning = isDaemonActive();
  const pid = state.currentDaemonStatus?.pid;
  const textLabel = isRunning
    ? `amuled ${pid ? `(PID: ${pid})` : "(activo)"}`
    : t("settings.daemonStopped");
  const btnText = isRunning
    ? `⏹ ${t("settings.stopDaemon")}`
    : `▶ ${t("settings.startDaemon")}`;
  const btnTitle = isRunning
    ? t("settings.stopDaemon")
    : t("settings.startDaemon");

  const controlBars = document.querySelectorAll(".daemon-control-bar");
  controlBars.forEach((bar) => {
    const dot = bar.querySelector(".status-dot");
    const labelSpan = bar.querySelector(".daemon-indicator span:last-child");
    const btn = bar.querySelector("#btn-toggle-daemon") as HTMLButtonElement | null;

    if (!dot || !labelSpan || !btn) {
      bar.innerHTML = `
        <div class="daemon-indicator">
          <span class="status-dot ${isRunning ? "" : "stopped"}"></span>
          <span>${escapeHtml(textLabel)}</span>
        </div>
        <button class="btn ${isRunning ? "btn-secondary" : "btn-primary"} btn-icon" id="btn-toggle-daemon" title="${escapeHtml(btnTitle)}">
          ${escapeHtml(btnText)}
        </button>
      `;
      return;
    }

    if (dot.classList.contains("stopped") === isRunning) {
      if (isRunning) {
        dot.classList.remove("stopped");
      } else {
        dot.classList.add("stopped");
      }
    }

    if (labelSpan.textContent !== textLabel) {
      labelSpan.textContent = textLabel;
    }

    if (btn.getAttribute("title") !== btnTitle || btn.textContent?.trim() !== btnText.trim()) {
      btn.title = btnTitle;
      btn.textContent = btnText;
      if (isRunning) {
        btn.classList.remove("btn-primary");
        btn.classList.add("btn-secondary");
      } else {
        btn.classList.remove("btn-secondary");
        btn.classList.add("btn-primary");
      }
    }
  });
}

export async function refreshDaemonStatus(): Promise<void> {
  try {
    const status = await api.getDaemonStatus();
    state.currentDaemonStatus = status;
  } catch {
    if (!state.lastStats) {
      state.currentDaemonStatus = null;
    }
  }
}
