// TauriMule Context Menu Component — Inspired by Syncdrome's FileContextMenu.tsx
// Features clamped window positioning, keyboard navigation, and automatic dismissal.

export interface ContextMenuEntry {
  label: string;
  icon?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}

export type ContextMenuItem = ContextMenuEntry | "divider";

let activeCleanup: (() => void) | null = null;

export function clampMenuPosition(x: number, y: number, menuWidth = 220, menuHeight = 280) {
  const maxX = window.innerWidth - menuWidth - 8;
  const maxY = window.innerHeight - menuHeight - 8;
  return {
    x: Math.max(8, Math.min(x, maxX)),
    y: Math.max(8, Math.min(y, maxY)),
  };
}

export function closeContextMenu() {
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }
  const el = document.getElementById("taurimule-context-menu");
  if (el) el.remove();
}

export function showContextMenu(rawX: number, rawY: number, items: ContextMenuItem[]) {
  closeContextMenu();

  const estimatedHeight = items.length * 34 + 16;
  const { x, y } = clampMenuPosition(rawX, rawY, 230, estimatedHeight);

  const menu = document.createElement("div");
  menu.id = "taurimule-context-menu";
  menu.className = "fluent-context-menu";
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  items.forEach((item) => {
    if (item === "divider") {
      const divider = document.createElement("div");
      divider.className = "ctx-divider";
      menu.appendChild(divider);
    } else {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `ctx-item ${item.danger ? "danger" : ""}`;
      if (item.disabled) btn.disabled = true;

      btn.innerHTML = `
        <span class="ctx-icon">${item.icon || ""}</span>
        <span class="ctx-label">${item.label}</span>
      `;

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeContextMenu();
        if (!item.disabled) {
          item.onClick();
        }
      });

      menu.appendChild(btn);
    }
  });

  document.body.appendChild(menu);

  // Auto-dismiss handlers
  const handleOutsideClick = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) {
      closeContextMenu();
    }
  };

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      closeContextMenu();
    }
  };

  const handleScroll = () => {
    closeContextMenu();
  };

  setTimeout(() => {
    window.addEventListener("click", handleOutsideClick);
    window.addEventListener("contextmenu", handleOutsideClick);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("keydown", handleKey);
  }, 10);

  activeCleanup = () => {
    window.removeEventListener("click", handleOutsideClick);
    window.removeEventListener("contextmenu", handleOutsideClick);
    window.removeEventListener("scroll", handleScroll, true);
    window.removeEventListener("keydown", handleKey);
  };
}
