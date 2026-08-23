// ============================================================
// ASCEND — Storage engine (localStorage, local-first)
// Un unico oggetto DB persistito sotto ascend:db.
// Interfaccia a repository: sostituibile con un adapter Supabase
// dietro le stesse funzioni (loadDB/saveDB/subscribe/useDB) senza
// toccare le pagine.
// ============================================================
"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { DB } from "./types";
import { DB_VERSION } from "./types";

const STORAGE_KEY = "ascend:db";

const emptyDB = (): DB => ({
  version: DB_VERSION,
  settings: {
    baseCurrency: "EUR",
    timezone: "Europe/Rome",
    weekStart: 1,
    locale: "it-IT",
    privacyMode: "off",
    onboardingDone: false,
    updatedAt: new Date().toISOString(),
  },
  categories: [],
  transactions: [],
  accounts: [],
  trades: [],
  setups: [],
  setupRules: [],
  tradeSetupRules: [],
  firmExpenses: [],
  payouts: [],
  weeklyReviews: [],
  dailyGoals: [],
  weeklyGoals: [],
  pcUsageLogs: [],
  pcAppCategoryMap: [],
  books: [],
  workouts: [],
  studySessions: [],
  savingsGoals: [],
  savingsDeposits: [],
  sportProfile: null,
  recurringRules: [],
  badges: [],
});

let cache: DB | null = null;
const listeners = new Set<() => void>();

// --- Snapshot rotante di backup -------------------------------------------
const SNAP_PREFIX = "ascend:db:snap-";
const SNAP_COUNT = 3;
const SNAP_INTERVAL_MS = 60 * 60 * 1000; // max 1 snapshot/ora

/** Scrive uno snapshot se è passata almeno un'ora dall'ultimo. */
function maybeSnapshot(): void {
  try {
    const last = Number(window.localStorage.getItem("ascend:snap-at") ?? 0);
    if (Date.now() - last < SNAP_INTERVAL_MS) return;
    // ruota: snap-2 → snap-3, snap-1 → snap-2, corrente → snap-1
    for (let i = SNAP_COUNT; i > 1; i--) {
      const prev = window.localStorage.getItem(`${SNAP_PREFIX}${i - 1}`);
      if (prev !== null) window.localStorage.setItem(`${SNAP_PREFIX}${i}`, prev);
      else window.localStorage.removeItem(`${SNAP_PREFIX}${i}`);
    }
    const cur = window.localStorage.getItem(STORAGE_KEY);
    if (cur !== null) window.localStorage.setItem(`${SNAP_PREFIX}1`, cur);
    window.localStorage.setItem("ascend:snap-at", String(Date.now()));
  } catch {
    // best-effort: mai bloccare un save per lo snapshot
  }
}

/** Recupera il DB dallo snapshot più recente valido, o null. */
function recoverFromSnapshot(): DB | null {
  if (typeof window === "undefined") return null;
  for (let i = 1; i <= SNAP_COUNT; i++) {
    const raw = window.localStorage.getItem(`${SNAP_PREFIX}${i}`);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as DB;
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.transactions)) {
        // eslint-disable-next-line no-console
        console.warn("[ascend] DB principale corrotto — recuperato snapshot di backup #" + i);
        return parsed;
      }
    } catch {
      // snapshot corrotto, prova il successivo
    }
  }
  return null;
}


export function loadDB(): DB {
  if (cache) return cache;
  if (typeof window === "undefined") return emptyDB();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cache = emptyDB();
    } else {
      const parsed = JSON.parse(raw) as DB;
      cache = { ...emptyDB(), ...parsed, settings: { ...emptyDB().settings, ...parsed.settings } };
      // Migrazione: da v3 in giù la privacy non aveva lo stato "off" (i soldi erano
      // sempre mascherati). Con l'introduzione di "off", qui riportiamo a "off"
      // così i dati tornano visibili (l'utente può riattivare standard/completa dal toggle).
      if ((parsed.version ?? 0) < 4) {
        cache = { ...cache, version: DB_VERSION, settings: { ...cache.settings, privacyMode: "off" } };
        saveDB(cache);
        return cache;
      }
      // Migrazione v4→v5: Sport Zone. Le DB esistenti non hanno `sportProfile`:
      // lo inizializziamo a null (il wizard di prima configurazione si attiverà
      // alla prima visita di /sport). Nessun dato utente viene toccato.
      if ((parsed.version ?? 0) < 5) {
        cache = { ...cache, version: DB_VERSION, sportProfile: cache.sportProfile ?? null };
        saveDB(cache);
        return cache;
      }
      // Migrazione v5→v6: Ricorrenti. Nuova collezione `recurringRules` vuota.
      if ((parsed.version ?? 0) < 6) {
        cache = { ...cache, version: DB_VERSION, recurringRules: cache.recurringRules ?? [] };
        saveDB(cache);
        return cache;
      }
    }
  } catch {
    // DB principale corrotto/illeggibile: prova gli snapshot prima di azzerare.
    const recovered = recoverFromSnapshot();
    cache = recovered ? { ...emptyDB(), ...recovered, settings: { ...emptyDB().settings, ...recovered.settings } } : emptyDB();
  }
  return cache;
}

export function saveDB(db: DB): void {
  cache = db;
  if (typeof window === "undefined") return;
  try {
    // Snapshot rotante di sicurezza: massimo una copia/ora, 3 copie totali.
    // Protegge da corruption/quota: se il JSON principale si corrompe,
    // loadDB() può recuperare lo snapshot più recente invece di azzerare.
    maybeSnapshot();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Quota superata (screenshot pesanti/legacy): salva le parti essenziali
    // MA avvisa l'utente: gli screenshot NON sono persistiti.
    try {
      const slim = { ...db, trades: db.trades.map((t) => ({ ...t, screenshots: [] })) };
      const hadShots = db.trades.some((t) => (t.screenshots?.length ?? 0) > 0);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
      if (hadShots) {
        // eslint-disable-next-line no-console
        console.warn(
          "[ascend] Quota localStorage superata: gli screenshot dei trade non sono stati salvati. Riduci le dimensioni o esporta un backup."
        );
      }
    } catch {
      // rinuncia silenziosa (ultimo baluardo)
    }
  }
  listeners.forEach((l) => l());
}

// Multi-tab / multi-window: quando un ALTRO tab scrive su localStorage,
// ricarichiamo la cache e notifichiamo i subscriber → tutti i tab in sync.
let storageBound = false;
function bindStorageListener() {
  if (storageBound || typeof window === "undefined") return;
  storageBound = true;
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY || e.newValue == null) return;
    try {
      const parsed = JSON.parse(e.newValue) as DB;
      cache = { ...emptyDB(), ...parsed, settings: { ...emptyDB().settings, ...parsed.settings } };
    } catch {
      return;
    }
    listeners.forEach((l) => l());
  });
}
bindStorageListener();

export function forceReload(): DB {
  cache = null;
  return loadDB();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): DB {
  // lato client: dopo hydration, dati reali da localStorage
  return hydrated ? loadDB() : SERVER_DB;
}

function getServerSnapshot(): DB {
  return SERVER_DB;
}

/**
 * Snapshot server: DEVE essere stabile e identico al primo render client.
 * loadDB() lato client leggerebbe localStorage (dati reali) mentre il server
 * ha renderizzato emptyDB() → hydration mismatch su streak/nav/etc.
 * Con questo gate il primo paint client usa emptyDB, poi l'effetto di mount
 * forza il re-render con i dati reali.
 */
const SERVER_DB = emptyDB();
let hydrated = false;

export function markHydrated(): void {
  if (!hydrated) {
    hydrated = true;
    listeners.forEach((l) => l());
  }
}

/** Hook React: stato globale DB sincronizzato su localStorage. */
export function useDB(): DB {
  const db = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // dopo il primo render client, sblocca i dati reali (1 volta)
  useEffect(() => {
    markHydrated();
  }, []);
  return db;
}

export function updateDB(mutator: (db: DB) => DB): DB {
  const next = mutator(loadDB());
  saveDB(next);
  return next;
}

// --- helpers -------------------------------------------------

export function uid(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
  );
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [...list, item];
  const copy = [...list];
  copy[idx] = item;
  return copy;
}

export function removeById<T extends { id: string }>(list: T[], id: string): T[] {
  return list.filter((x) => x.id !== id);
}
