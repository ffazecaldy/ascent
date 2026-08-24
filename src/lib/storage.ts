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
  wellnessLogs: [],
  studySubjects: [],
  badges: [],
});

let cache: DB | null = null;
const listeners = new Set<() => void>();

// --- Snapshot rotante di backup -------------------------------------------
const SNAP_PREFIX = "ascend:db:snap-";
const SNAP_COUNT = 3;
const SNAP_INTERVAL_MS = 60 * 60 * 1000; // max 1 snapshot/ora
// MOTIVAZIONE soglia slim: 3 snapshot integrali di un DB >1.5MB (data-URL
// degli screenshot) triplicherebbero il consumo di quota localStorage fino a
// far scattare il fallback slim di saveDB() su ogni scrittura. Oltre la soglia
// salviamo una copia SENZA screenshot: il recovery resta completo per tutti i
// dati (transazioni, trade, impostazioni); gli screenshot sono cosmetici e in
// caso di recovery dal backup andrebbero comunque persi col reset. Sicuro:
// è la stessa riduzione già usata dal fallback quota di saveDB().
const SNAPSHOT_SLIM_THRESHOLD = 1.5 * 1024 * 1024;

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
    if (cur !== null) {
      if (cur.length > SNAPSHOT_SLIM_THRESHOLD) {
        // DB grosso → copia 'slim' senza screenshot (vedi MOTIVAZIONE sopra).
        try {
          const parsed = JSON.parse(cur) as DB;
          const slim = { ...parsed, trades: parsed.trades.map((t) => ({ ...t, screenshots: [] })) };
          window.localStorage.setItem(`${SNAP_PREFIX}1`, JSON.stringify(slim));
        } catch {
          window.localStorage.setItem(`${SNAP_PREFIX}1`, cur); // fallback: copia integrale
        }
      } else {
        window.localStorage.setItem(`${SNAP_PREFIX}1`, cur);
      }
    }
    window.localStorage.setItem("ascend:snap-at", String(Date.now()));
  } catch {
    // best-effort: mai bloccare un save per lo snapshot
  }
}

/**
 * Valida la shape MINIMA di un DB: version intero + collezioni chiave presenti
 * fin dalla v1 (settings, categories, transactions, accounts, trades).
 * Le collezioni aggiunte dalle migrazioni (es. recurringRules v6) NON sono
 * richieste qui: vengono riempite dal merge con emptyDB + cascata migrate().
 * Serve sia per il main key sia per gli snapshot, così un DB "torchiato" non
 * viene mai recuperato/accettato.
 */
function isValidDBShape(x: unknown): x is DB {
  if (!x || typeof x !== "object") return false;
  const db = x as Partial<DB>;
  return (
    Number.isInteger(db.version) &&
    (db.version as number) >= 1 &&
    !!db.settings &&
    typeof db.settings === "object" &&
    !Array.isArray(db.settings) &&
    Array.isArray(db.categories) &&
    Array.isArray(db.transactions) &&
    Array.isArray(db.accounts) &&
    Array.isArray(db.trades)
  );
}

/**
 * Cascata di migrazioni versione per versione fino a DB_VERSION.
 * Equivalente ai vecchi `if` in loadDB, ma senza early-return: un DB molto
 * vecchio (es. v3) percorre TUTTA la catena in un solo load. Il risultato
 * finale è identico al comportamento storico (v3 → privacy "off", v4 → 
 * sportProfile null, v5 → recurringRules []), version finale = DB_VERSION.
 */
export function migrate(db: DB): DB {
  let out = db;
  while (out.version < DB_VERSION) {
    if (out.version < 4) {
      // v3 e precedenti: la privacy non aveva lo stato "off" (i soldi erano
      // sempre mascherati). Riportiamo a "off": i dati tornano visibili.
      out = { ...out, version: 4, settings: { ...out.settings, privacyMode: "off" } };
    } else if (out.version < 5) {
      // v4 → v5: Sport Zone — sportProfile assente → null (wizard alla prima visita).
      out = { ...out, version: 5, sportProfile: out.sportProfile ?? null };
    } else if (out.version < 6) {
      // v5 → v6: Ricorrenti — nuova collezione `recurringRules` vuota.
      out = { ...out, version: 6, recurringRules: out.recurringRules ?? [] };
    } else if (out.version < 7) {
      // v6 → v7: Benessere — nuova collezione `wellnessLogs` vuota.
      out = { ...out, version: 7, wellnessLogs: out.wellnessLogs ?? [] };
    } else if (out.version < 8) {
      // v7 → v8: Studio — nuova collezione `studySubjects` vuota.
      out = { ...out, version: 8, studySubjects: out.studySubjects ?? [] };
    } else {
      break;
    }
  }
  return out;
}

/** Recupera il DB dallo snapshot più recente valido (shape minima), o null. */
function recoverFromSnapshot(): DB | null {
  if (typeof window === "undefined") return null;
  for (let i = 1; i <= SNAP_COUNT; i++) {
    const raw = window.localStorage.getItem(`${SNAP_PREFIX}${i}`);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as DB;
      if (isValidDBShape(parsed)) {
         
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
          if (!isValidDBShape(parsed)) throw new Error("ascend: shape DB non valida");
          cache = { ...emptyDB(), ...parsed, settings: { ...emptyDB().settings, ...parsed.settings } };
          // Cascata migrazioni (v3→…→DB_VERSION). Se qualcosa è cambiato,
          // persistiamo subito il DB migrato (comportamento storico).
          const versionBefore = cache.version;
          cache = migrate(cache);
          if (cache.version !== versionBefore) saveDB(cache);
        }
      } catch {
        // DB principale corrotto/illeggibile: prova gli snapshot prima di azzerare.
        const recovered = recoverFromSnapshot();
        if (recovered) {
          cache = migrate({
            ...emptyDB(),
            ...recovered,
            settings: { ...emptyDB().settings, ...recovered.settings },
          });
          // SELF-HEAL: riscrive il main key col DB riparato (version bump a
          // DB_VERSION + migrazioni applicate) così il prossimo load non ripete
          // recovery+migrazione e gli altri tab vedono subito il DB sano.
          try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
          } catch {
            // quota piena: il recovery resta comunque attivo in cache;
            // il prossimo saveDB() riscriverà il main key.
          }
        } else {
          cache = emptyDB();
        }
      }
      return cache;
    }

export function saveDB(db: DB): void {
  const deduped = dedupeCollections(db);
  cache = deduped;
  if (typeof window === "undefined") return;
  try {
    // Snapshot rotante di sicurezza: massimo una copia/ora, 3 copie totali.
    // Protegge da corruption/quota: se il JSON principale si corrompe,
    // loadDB() può recuperare lo snapshot più recente invece di azzerare.
    maybeSnapshot();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
  } catch {
    // Quota superata (screenshot pesanti/legacy): salva le parti essenziali
    // MA avvisa l'utente: gli screenshot NON sono persistiti.
    try {
      const slim = { ...deduped, trades: deduped.trades.map((t) => ({ ...t, screenshots: [] })) };
      const hadShots = deduped.trades.some((t) => (t.screenshots?.length ?? 0) > 0);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
      if (hadShots) {
         
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

/**
 * Purga TOTALE dello storage Ascend: rimuove il DB principale, gli snapshot
 * di backup e ogni chiave accessoria (ack banner rischio, timer studio, ecc.)
 * e invalida la cache interna. Dopo la chiamata l'app è come per un visitatore
 * al primo avvio: la prossima loadDB() semina lo stato vuoto e riparte
 * dall'onboarding. Da usare PRIMA di updateDB(() => seedDB()).
 */
export function purgeAscendStorage(): void {
  cache = null;
  if (typeof window === "undefined") return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && (k === STORAGE_KEY || k.startsWith(SNAP_PREFIX) || k.startsWith("ascend:"))) {
        doomed.push(k);
      }
    }
    doomed.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* localStorage indisponibile: la cache invalidata basta per il flusso */
  }
  // Anche i blob degli allegati (IndexedDB 'ascend-files'): reset davvero totale.
  try {
    if (typeof indexedDB !== "undefined") {
      indexedDB.deleteDatabase("ascend-files");
    }
  } catch {
    /* best effort: se IDB è bloccato il reset procede comunque */
  }
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
  const next = dedupeCollections(mutator(loadDB()));
  saveDB(next);
  return next;
}

// --- helpers -------------------------------------------------

/**
 * Deduplica una collezione per `id` tenendo la PRIMA occorrenza (l'ordine
 * esistente è preservato). MOTIVAZIONE multi-tab: due tab che calcolano la
 * stessa riga (es. la transazione ricorrente del mese) nella finestra tra la
 * lettura della cache e lo storage event scriverebbero due copie identiche;
 * deduplicando all'atto del salvataggio collassano in una. Gli elementi senza
 * `id` stringa (es. Badge, che ha `key`) non vengono toccati.
 */
function dedupeById<T>(list: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of list) {
    const id = (item as { id?: unknown } | null)?.id;
    const key = typeof id === "string" ? id : `__noid__${out.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Applica dedupeById a tutte le collezioni del DB. Idempotente: su DB senza
 * doppioni restituisce i riferimenti invariati a livello di riga, quindi non
 * invalida re-render né reference memoizzate per i singoli array.
 */
function dedupeCollections(db: DB): DB {
  return {
    ...db,
    categories: dedupeById(db.categories),
    transactions: dedupeById(db.transactions),
    accounts: dedupeById(db.accounts),
    trades: dedupeById(db.trades),
    setups: dedupeById(db.setups),
    setupRules: dedupeById(db.setupRules),
    tradeSetupRules: dedupeById(db.tradeSetupRules),
    firmExpenses: dedupeById(db.firmExpenses),
    payouts: dedupeById(db.payouts),
    weeklyReviews: dedupeById(db.weeklyReviews),
    dailyGoals: dedupeById(db.dailyGoals),
    weeklyGoals: dedupeById(db.weeklyGoals),
    pcUsageLogs: dedupeById(db.pcUsageLogs),
    pcAppCategoryMap: dedupeById(db.pcAppCategoryMap),
    books: dedupeById(db.books),
    workouts: dedupeById(db.workouts),
    studySessions: dedupeById(db.studySessions),
    savingsGoals: dedupeById(db.savingsGoals),
    savingsDeposits: dedupeById(db.savingsDeposits),
    recurringRules: dedupeById(db.recurringRules),
    badges: dedupeById(db.badges),
  };
}

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
