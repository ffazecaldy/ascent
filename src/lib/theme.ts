// ============================================================
// ASCEND — Sistema temi (client-only, FUORI dal DB)
// Il tema vive sull'attributo <html data-theme="..."> e viene
// persistito in localStorage sotto 'ascend:theme'.
// Nessun tocco a types.ts / storage.ts: il tema non entra nel DB.
//
// CSS: i token sono definiti in globals.css sotto :root (default,
// palette myfundedbook) e duplicati sotto [data-theme='black'].
// ============================================================

export type ThemeName = "default" | "black";

export const THEME_STORAGE_KEY = "ascend:theme";

const VALID_THEMES: readonly string[] = ["default", "black"];

function isThemeName(v: unknown): v is ThemeName {
  return typeof v === "string" && VALID_THEMES.includes(v);
}

/**
 * Legge il tema salvato da localStorage ('ascend:theme').
 * SSR-safe: ritorna sempre "default" lato server o se il valore
 * non è valido. Fallback consapevole: il tema di default esiste
 * già in :root, quindi nessun flash gestibile qui.
 */
export function readTheme(): ThemeName {
  if (typeof window === "undefined") return "default";
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeName(raw) ? raw : "default";
  } catch {
    return "default"; // storage bloccato (privacy mode): tema default
  }
}

/**
 * Applica il tema al documento settando/rimuovendo l'attributo
 * data-theme su <html>. Per "default" rimuove l'attributo così
 * il DOM resta pulito come nell'output SSR.
 */
export function applyTheme(theme: ThemeName): void {
  if (typeof document === "undefined") return;
  if (theme === "black") {
    document.documentElement.dataset.theme = "black";
  } else {
    delete document.documentElement.dataset.theme;
  }
}

/** Persiste la scelta in localStorage. Mai nel DB. */
export function saveTheme(theme: ThemeName): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    notifyThemeListeners();
  } catch {
    // Quota piena o storage bloccato: il tema resta attivo solo per la sessione.
  }
}

// ------------------------------------------------------------
// Sottoscrizione minima per useSyncExternalStore (ThemePicker):
// notifica i listener quando il tema cambia (stesso tab via
// saveTheme, altri tab via evento 'storage').
// ------------------------------------------------------------
const listeners = new Set<() => void>();

function notifyThemeListeners(): void {
  listeners.forEach((l) => l());
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Applica + persiste in una chiamata (uso dai picker). */
export function setTheme(theme: ThemeName): void {
  applyTheme(theme);
  saveTheme(theme);
}
