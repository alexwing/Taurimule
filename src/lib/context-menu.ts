// TauriMule Context Menu Component — Inspired by Syncdrome's FileContextMenu.tsx
// Features clamped window positioning, submenus, keyboard navigation, and automatic dismissal.

export interface ContextMenuEntry {
  label: string;
  icon?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick?: () => void;
  children?: ContextMenuEntry[];
}

export type ContextMenuItem = ContextMenuEntry | "divider";

let activeCleanup: (() => void) | null = null;
let activeSubmenuEl: HTMLElement | null = null;

export function clampMenuPosition(x: number, y: number, menuWidth = 220, menuHeight = 280) {
  const maxX = window.innerWidth - menuWidth - 8;
  const maxY = window.innerHeight - menuHeight - 8;
  return {
    x: Math.max(8, Math.min(x, maxX)),
    y: Math.max(8, Math.min(y, maxY)),
  };
}

export function closeSubmenu() {
  if (activeSubmenuEl) {
    activeSubmenuEl.remove();
    activeSubmenuEl = null;
  }
}

export function closeContextMenu() {
  closeSubmenu();
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }
  const el = document.getElementById("taurimule-context-menu");
  if (el) el.remove();
  document.querySelectorAll(".fluent-submenu").forEach((sub) => sub.remove());
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
      const hasChildren = item.children && item.children.length > 0;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `ctx-item ${item.danger ? "danger" : ""} ${hasChildren ? "has-submenu" : ""}`;
      if (item.disabled) btn.disabled = true;

      btn.innerHTML = `
        <span class="ctx-icon">${item.icon || ""}</span>
        <span class="ctx-label">${item.label}</span>
        ${hasChildren ? '<span class="ctx-arrow" style="margin-left: auto; font-size: 10px; opacity: 0.7;">▶</span>' : ""}
      `;

      if (hasChildren) {
        btn.addEventListener("mouseenter", () => {
          closeSubmenu();
          const rect = btn.getBoundingClientRect();
          const subWidth = 190;
          const subHeight = (item.children?.length || 0) * 34 + 16;

          let subX = rect.right + 2;
          let subY = rect.top - 4;

          if (subX + subWidth > window.innerWidth - 8) {
            subX = Math.max(8, rect.left - subWidth - 2);
          }
          if (subY + subHeight > window.innerHeight - 8) {
            subY = Math.max(8, window.innerHeight - subHeight - 8);
          }

          const subMenu = document.createElement("div");
          subMenu.className = "fluent-context-menu fluent-submenu";
          subMenu.style.left = `${subX}px`;
          subMenu.style.top = `${subY}px`;
          subMenu.style.minWidth = `${subWidth}px`;

          item.children?.forEach((child) => {
            const subBtn = document.createElement("button");
            subBtn.type = "button";
            subBtn.className = `ctx-item ${child.danger ? "danger" : ""}`;
            if (child.disabled) subBtn.disabled = true;

            subBtn.innerHTML = `
              <span class="ctx-icon">${child.icon || ""}</span>
              <span class="ctx-label">${child.label}</span>
            `;

            subBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              closeContextMenu();
              if (!child.disabled && child.onClick) {
                child.onClick();
              }
            });

            subMenu.appendChild(subBtn);
          });

          document.body.appendChild(subMenu);
          activeSubmenuEl = subMenu;
        });
      } else {
        btn.addEventListener("mouseenter", () => {
          closeSubmenu();
        });

        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          closeContextMenu();
          if (!item.disabled && item.onClick) {
            item.onClick();
          }
        });
      }

      menu.appendChild(btn);
    }
  });

  document.body.appendChild(menu);

  // Auto-dismiss handlers
  const handleOutsideClick = (e: MouseEvent) => {
    const target = e.target as Node;
    const inMenu = menu.contains(target);
    const inSub = activeSubmenuEl && activeSubmenuEl.contains(target);
    if (!inMenu && !inSub) {
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
