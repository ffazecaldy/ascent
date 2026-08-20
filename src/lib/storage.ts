// ============================================================
// ASCEND — Storage engine (localStorage, local-first)
// Un unico oggetto DB persistito sotto ascend:db.
// Interfaccia a repository: sostituibile con un adapter Supabase
// dietro le stesse funzioni (loadDB/saveDB/subscribe/useDB) senza
// toccare le pagine.
// ============================================================
"use client";

import { useSyncExternalStore } from "react";
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
  badges: [],
});

let cache: DB | null = null;
const listeners = new Set<() => void>();

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
    }
  } catch {
    cache = emptyDB();
  }
  return cache;
}

export function saveDB(db: DB): void {
  cache = db;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Quota superata (screenshot pesanti): salva comunque le parti essenziali
    try {
      const slim = { ...db, trades: db.trades.map((t) => ({ ...t, screenshots: [] })) };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
    } catch {
      // rinuncia silenziosa
    }
  }
  listeners.forEach((l) => l());
}

export function forceReload(): DB {
  cache = null;
  return loadDB();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): DB {
  return loadDB();
}

/** Hook React: stato globale DB sincronizzato su localStorage. */
export function useDB(): DB {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
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
