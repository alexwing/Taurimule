// TauriMule Theme Manager — Inspired by Syncdrome (WinUI / Fluent UI)
// Manages light, dark, and system color schemes, persists choice in localStorage,
// and dynamically updates document.documentElement[data-theme] and body classes.

const STORAGE_KEY = "taurimule_theme_key";

export type ColorScheme = "dark" | "light" | "system";

let mediaListenerAttached = false;
let listeners: Array<(scheme: ColorScheme, isDark: boolean) => void> = [];

export const getColorScheme = (): ColorScheme => {
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem(STORAGE_KEY) as ColorScheme | null;
    if (saved === "dark" || saved === "light" || saved === "system") {
      return saved;
    }
  }
  return "system";
};

export const getSystemPrefersDark = (): boolean => {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return true; // Default fallback to dark
};

export const isEffectiveDark = (): boolean => {
  const scheme = getColorScheme();
  if (scheme === "dark") return true;
  if (scheme === "light") return false;
  return getSystemPrefersDark();
};

export const applyTheme = (scheme: ColorScheme, persist = true): void => {
  if (persist && typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, scheme);
  }

  const dark = scheme === "dark" ? true : scheme === "light" ? false : getSystemPrefersDark();

  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    document.documentElement.setAttribute("data-color-scheme", scheme);

    if (dark) {
      document.body.classList.add("dark-theme");
      document.body.classList.remove("light-theme");
    } else {
      document.body.classList.add("light-theme");
      document.body.classList.remove("dark-theme");
    }
  }

  // Notify registered callbacks
  listeners.forEach((fn) => fn(scheme, dark));
};

export const onThemeChange = (callback: (scheme: ColorScheme, isDark: boolean) => void): (() => void) => {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((fn) => fn !== callback);
  };
};

export const initTheme = (): void => {
  const initialScheme = getColorScheme();
  applyTheme(initialScheme, false);

  if (!mediaListenerAttached && typeof window !== "undefined" && window.matchMedia) {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (getColorScheme() === "system") {
        applyTheme("system", false);
      }
    };
    if (media.addEventListener) {
      media.addEventListener("change", handler);
    } else if ((media as any).addListener) {
      (media as any).addListener(handler);
    }
    mediaListenerAttached = true;
  }
};

export const ThemeManager = {
  getColorScheme,
  setColorScheme: applyTheme,
  isEffectiveDark,
  initTheme,
  onThemeChange,
};
