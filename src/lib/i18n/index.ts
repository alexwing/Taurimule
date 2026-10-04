import en from "./en";
import es from "./es";
import fr from "./fr";
import de from "./de";

type Stringify<T> = {
  [K in keyof T]: T[K] extends string ? string : Stringify<T[K]>;
};
export type Dict = Stringify<typeof en>;

export type Language = "en" | "es" | "fr" | "de";
export type LanguageSetting = "system" | Language;

export const SUPPORTED_LANGUAGES: Language[] = ["en", "es", "fr", "de"];
export const DEFAULT_LANGUAGE: Language = "en";

export const dictionaries: Record<Language, Dict> = {
  en: en as Dict,
  es: es as Dict,
  fr: fr as Dict,
  de: de as Dict,
};

const STORAGE_KEY = "taurimule_language_key";

let currentSetting: LanguageSetting = "system";
let resolvedLang: Language = "en";
let changeListeners: Array<(lang: Language, setting: LanguageSetting) => void> = [];

export const getLanguageSetting = (): LanguageSetting => {
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "system" || (saved && SUPPORTED_LANGUAGES.includes(saved as Language))) {
      return saved as LanguageSetting;
    }
  }
  return "system";
};

export const resolveLanguage = (setting: string | undefined | null): Language => {
  if (setting && SUPPORTED_LANGUAGES.includes(setting as Language)) {
    return setting as Language;
  }
  // "system" -> check browser language
  const nav =
    typeof navigator !== "undefined"
      ? (navigator.language || "").slice(0, 2).toLowerCase()
      : "";
  if (SUPPORTED_LANGUAGES.includes(nav as Language)) {
    return nav as Language;
  }
  return DEFAULT_LANGUAGE;
};

export const getCurrentLanguage = (): Language => {
  return resolvedLang;
};

const lookup = (dict: Dict, path: string): string | undefined => {
  let node: unknown = dict;
  for (const part of path.split(".")) {
    if (node && typeof node === "object" && part in (node as object)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === "string" ? node : undefined;
};

export const t = (key: string, vars?: Record<string, string | number>): string => {
  const currentDict = dictionaries[resolvedLang] || dictionaries[DEFAULT_LANGUAGE];
  const raw =
    lookup(currentDict, key) ??
    lookup(dictionaries[DEFAULT_LANGUAGE], key) ??
    key;

  if (!vars) return raw;
  return raw.replace(/\{{2,3}(\w+)\}{2,3}/g, (_, name) =>
    name in vars ? String(vars[name]) : `{{${name}}}`
  );
};

export const setLanguage = (setting: LanguageSetting, persist = true): void => {
  currentSetting = setting;
  if (persist && typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, setting);
  }
  resolvedLang = resolveLanguage(setting);

  if (typeof document !== "undefined") {
    document.documentElement.lang = resolvedLang;
  }

  changeListeners.forEach((fn) => fn(resolvedLang, currentSetting));
};

export const onLanguageChange = (callback: (lang: Language, setting: LanguageSetting) => void): (() => void) => {
  changeListeners.push(callback);
  return () => {
    changeListeners = changeListeners.filter((fn) => fn !== callback);
  };
};

export const initI18n = (): void => {
  const initial = getLanguageSetting();
  setLanguage(initial, false);
};

export const I18nManager = {
  getLanguageSetting,
  getCurrentLanguage,
  setLanguage,
  resolveLanguage,
  t,
  initI18n,
  onLanguageChange,
};
