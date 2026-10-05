import { api } from "../lib/tauri-bridge";
import { t } from "../lib/i18n";
import { state } from "../state/store";
import { navigate } from "./router";
import { showToast } from "../ui/dialogs";

// Sequential queue for deep link / browser additions to prevent EC lock contention
let addLinkQueue: Promise<void> = Promise.resolve();

export function enqueueAddEd2kLink(rawLink: string) {
  let link = rawLink.trim();
  try {
    link = decodeURIComponent(link);
  } catch {}
  if (!link || !link.startsWith("ed2k://")) return;

  addLinkQueue = addLinkQueue.then(async () => {
    let retries = 0;
    while (retries < 25) {
      try {
        const res = await api.addEd2kLink(link);
        showToast(`✅ ${t("downloads.linkAddedSuccess")}: ${res.name}`);
        state.downloadFilterQuery = "";
        const filterInput = document.getElementById("input-filter-downloads") as HTMLInputElement | null;
        if (filterInput) filterInput.value = "";
        navigate("downloads");
        return;
      } catch (err: any) {
        const errStr = err ? err.toString() : "";
        if (errStr.includes("ALREADY_COMPLETED|")) {
          const parts = errStr.split("|");
          const fileName = parts[1] || "";
          showToast(`📁 "${fileName}" ya está completado en la carpeta de descargas`, 7000);
          navigate("downloads");
          return;
        }
        if (errStr.includes("ALREADY_QUEUED|")) {
          const parts = errStr.split("|");
          const fileName = parts[1] || "";
          showToast(`ℹ️ "${fileName}" ya está en la cola de descargas`, 5000);
          navigate("downloads");
          return;
        }
        if ((errStr.includes("Not connected") || errStr.includes("EC connection busy")) && retries < 20) {
          retries++;
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }
        console.error("Auto-add ed2k link error:", err);
        showToast(`⚠️ Error al añadir enlace: ${err}`);
        return;
      }
    }
  });
}
