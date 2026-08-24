// ============================================================
// ASCEND — Client sync (2 PC, LAN)
// Config in localStorage 'ascend:sync' (mai nel DB): url del
// sync-server, token condiviso, auto-sync on/off.
// syncNow(): invia il DB locale al server → il server fonde con
// la sua copia → salva il risultato unificato in locale.
// ============================================================

import { loadDB, updateDB } from "./storage";

export interface SyncConfig {
  url: string;
  token: string;
  auto: boolean;
}

const SYNC_KEY = "ascend:sync";
const LAST_KEY = "ascend:sync:last";

export function defaultSyncConfig(): SyncConfig {
  return { url: "", token: "", auto: false };
}

let cachedCfg: SyncConfig | null = null;
let cachedRaw: string | null = null;

export function readSyncConfig(): SyncConfig {
  if (typeof window === "undefined") return defaultSyncConfig();
  try {
    const raw = window.localStorage.getItem(SYNC_KEY);
    // snapshot stabile per useSyncExternalStore: stesso riferimento
    // finché il valore salvato non cambia davvero
    if (raw === cachedRaw && cachedCfg) return cachedCfg;
    cachedRaw = raw;
    if (!raw) {
      cachedCfg = defaultSyncConfig();
      return cachedCfg;
    }
    const p = JSON.parse(raw) as Partial<SyncConfig>;
    cachedCfg = {
      url: typeof p.url === "string" ? p.url.trim() : "",
      token: typeof p.token === "string" ? p.token : "",
      auto: p.auto === true,
    };
    return cachedCfg;
  } catch {
    return defaultSyncConfig();
  }
}

export function saveSyncConfig(cfg: SyncConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SYNC_KEY, JSON.stringify(cfg));
  } catch {
    /* storage bloccato */
  }
  notify();
}

/** Ultima sincronizzazione riuscita (ISO) o null. */
export function readLastSync(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

function writeLastSync(iso: string): void {
  try {
    window.localStorage.setItem(LAST_KEY, iso);
  } catch {
    /* noop */
  }
}

// --- store minimo (per la pagina Sync) ---
const listeners = new Set<() => void>();
function notify(): void {
  listeners.forEach((l) => l());
}
export function subscribeSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ------------------------------------------------------------
// Azioni
// ------------------------------------------------------------

export type SyncOutcome =
  | { ok: true; added: number; updated: number; mergedAt: string | null }
  | { ok: false; error: string; code?: string };

function errorOf(e: unknown, status?: number): SyncOutcome {
  if (status === 401) return { ok: false, code: "auth", error: "Token non valido — controlla il token sul server e qui." };
  if (status === 404) return { ok: false, code: "404", error: "Il server non espone /api/sync — verificare l'URL (porta corretta?)." };
  if (e instanceof TypeError || (e as { name?: string })?.name === "TypeError" || (e as { message?: string })?.message?.includes("fetch")) {
    return { ok: false, code: "network", error: "Server non raggiungibile — è acceso l'altro PC / run-dev? Verifica l'IP." };
  }
  return { ok: false, code: "unknown", error: e instanceof Error ? e.message : String(e) };
}

/** Verifica la connessione (ping) senza modificare nulla. */
export async function testSyncConnection(url: string, token: string): Promise<SyncOutcome & { dbVersion?: number }> {
  const base = url.replace(/\/+$/, "");
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    const res = await fetch(`${base}/api/ping`, {
      headers: { "x-sync-token": token },
      signal: ctl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return errorOf(null, res.status);
    const data = (await res.json()) as { ok: boolean; dbVersion?: number; mergedAt?: string | null };
    return { ok: true, added: 0, updated: 0, mergedAt: data.mergedAt ?? null, dbVersion: data.dbVersion };
  } catch (e) {
    return errorOf(e);
  }
}

/** Sincronizza ora: push del DB locale → merge sul server → salvataggio unificato. */
export async function syncNow(): Promise<SyncOutcome> {
  const cfg = readSyncConfig();
  if (!cfg.url || !cfg.token) {
    return { ok: false, code: "config", error: "Configura URL e token nella pagina Sync per iniziare." };
  }
  const base = cfg.url.replace(/\/+$/, "");
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    const res = await fetch(`${base}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-sync-token": cfg.token },
      body: JSON.stringify({ db: loadDB() }),
      signal: ctl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return errorOf(null, res.status);
    const data = (await res.json()) as {
      ok: boolean;
      db?: unknown;
      mergedAt?: string | null;
      stats?: { added: number; updated: number };
    };
    if (!data.ok || !data.db) return { ok: false, code: "server", error: "Risposta del server non valida." };
    updateDB(() => data.db as never);
    const now = new Date().toISOString();
    writeLastSync(now);
    return {
      ok: true,
      added: data.stats?.added ?? 0,
      updated: data.stats?.updated ?? 0,
      mergedAt: data.mergedAt ?? now,
    };
  } catch (e) {
    return errorOf(e);
  }
}