// ============================================================
// ASCEND — Sincronizzazione tracker → DB SEMPRE ATTIVA (app-wide)
// Il polling di /api/since vive QUI (modulo singoletto) e gira dal
// bootstrap dell'app: i campioni finiscono in pcUsageLogs in tempo
// quasi reale (~60s) SENZA che l'utente prema nulla.
// La "registrazione" manuale è solo una sessione misurata: buffer
// dedicato per le stats (durata, app, categorie) mostrate al Ferma.
// Persistenza su localStorage → sopravvive a reload/riavvio.
//
// Keys:
//   ascend:pcRecording     '1'/'0' — sessione manuale attiva
//   ascend:pcSessionStart  epoch ms — inizio sessione in corso
//   ascend:pcTrackerLastTs ISO — ultimo campione importato
// ============================================================
import {
  aggregateSamples,
  categorize,
  fetchTrackerSince,
  TRACKER_POLL_MS,
  TRACKER_SAMPLE_MIN,
  type TrackerSample,
} from "./pc-tracker";
import { loadDB, nowISO, updateDB, uid } from "./storage";

const REC_KEY = "ascend:pcRecording";
const SESSION_KEY = "ascend:pcSessionStart";
const LAST_TS_KEY = "ascend:pcTrackerLastTs";
const SOURCE = "auto";

export interface SessionStats {
  durationMs: number;
  appCount: number;
  productiveMin: number;
  totalMin: number;
  categories: { category: string; minutes: number }[];
  topApp: { exe: string; samples: number } | null;
}

interface RecordState {
  recording: boolean;
  sessionStart: number | null;
  lastSync: string | null;
  appCount: number;
  lastSessionStats: SessionStats | null;
}

const PRODUCTIVE_CATEGORIES: ReadonlySet<string> = new Set(["Dev", "Sviluppo", "Lavoro"]);

// --- stato interno (non reattivo) ---
let recording = false;
let sessionStart: number | null = null;
let lastTs: string | null = null;
let lastSync: string | null = null;
let lastSessionStats: SessionStats | null = null;
let appSet = new Set<string>();
let sessionSamples: TrackerSample[] = [];
let busy = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

const listeners = new Set<() => void>();

// Snapshot CACHATO e immutabile: getRecordState deve restituire lo stesso
// riferimento tra un cambio e l'altro, altrimenti useSyncExternalStore
// vede un "nuovo" oggetto a ogni render e va in loop infinito.
let snap: RecordState = {
  recording: false, sessionStart: null, lastSync: null, appCount: 0, lastSessionStats: null,
};

function refreshSnap() {
  snap = { recording, sessionStart, lastSync, appCount: appSet.size, lastSessionStats };
}

function notify() {
  refreshSnap();
  listeners.forEach((l) => l());
}

export function subscribeRecord(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRecordState(): RecordState {
  return snap;
}

/** Snapshot lato server/prerender: nessuna registrazione attiva.
 *  Richiesto da useSyncExternalStore durante il prerender Next.
 *  Anche questo deve essere un riferimento STABILE. */
const SERVER_SNAP: RecordState = {
  recording: false, sessionStart: null, lastSync: null, appCount: 0, lastSessionStats: null,
};

export function getRecordStateServer(): RecordState {
  return SERVER_SNAP;
}

function persist() {
  try {
    window.localStorage.setItem(REC_KEY, recording ? "1" : "0");
    if (recording && sessionStart !== null) {
      window.localStorage.setItem(SESSION_KEY, String(sessionStart));
    } else {
      window.localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    /* storage bloccato: stato solo in memoria */
  }
}

function readStoredLastTs(): string | null {
  try {
    const raw = window.localStorage.getItem(LAST_TS_KEY);
    if (raw && !Number.isNaN(Date.parse(raw))) return raw;
  } catch { /* noop */ }
  return null;
}

function persistLastTs(ts: string) {
  try {
    window.localStorage.setItem(LAST_TS_KEY, ts);
  } catch { /* noop */ }
}

// --- import campioni → pcUsageLogs (upsert giorno|categoria, source auto) ---
function importSamples(samples: TrackerSample[]): number {
  if (samples.length === 0) return 0;
  const db = loadDB();
  const userMap = Object.fromEntries(
    db.pcAppCategoryMap.map((m) => [m.appName.toLowerCase(), m.category])
  );
  const aggregated = aggregateSamples(samples, userMap);
  let inserted = 0;
  updateDB((d) => {
    const next = { ...d, pcUsageLogs: [...d.pcUsageLogs] };
    for (const [key, minutes] of Object.entries(aggregated)) {
      if (minutes <= 0) continue;
      const [date, category] = key.split("|");
      if (!date || !category) continue;
      const idx = next.pcUsageLogs.findIndex((l) => l.date === date && l.categoryId === category);
      if (idx >= 0) {
        const cur = next.pcUsageLogs[idx];
        next.pcUsageLogs[idx] = { ...cur, minutes: Math.round((cur.minutes + minutes) * 10) / 10 };
      } else {
        next.pcUsageLogs.push({
          id: uid(), date, categoryId: category, minutes, source: SOURCE, createdAt: nowISO(),
        });
        inserted++;
      }
    }
    return next;
  });
  return inserted;
}

// --- un ciclo di polling /api/since ---
/**
 * MUTUA ESCLUSIONE TRA TAB: con più finestre/tabelle di Ascend aperte ognuna
 * esegue il proprio polling col proprio watermark in memoria → gli stessi
 * campioni venivano importati DUE VOLTE (minuti gonfiati oltre il tempo reale
 * di accensione del PC). Il Web Lock serializza il ciclo a livello di profilo
 * browser: chi prende il lock rilegge PRIMA il watermark condiviso da
 * localStorage, quindi i campioni già importati da un altro tab vengono
 * saltati. Browser senza Web Locks (fallback): comportamento precedente.
 */
type LockManagerLike = {
  request: <T>(name: string, cb: () => Promise<T>) => Promise<T>;
};
function runExclusive(fn: () => Promise<void>): Promise<void> {
  const locks = (navigator as unknown as { locks?: LockManagerLike }).locks;
  if (locks) return locks.request("ascend-pc-record", fn);
  return fn();
}

/** Watermark condiviso (localStorage) SOLO se è di oggi. */
function todaysSharedLastTs(): string | null {
  const stored = readStoredLastTs();
  if (stored && new Date(stored).toDateString() === new Date().toDateString()) return stored;
  return null;
}

async function pollBody(): Promise<void> {
  // Un altro tab potrebbe aver già importato fin qui: avanza il nostro
  // watermark al valore condiviso SENZA ri-importare quei campioni.
  const shared = todaysSharedLastTs();
  if (shared && (!lastTs || Date.parse(shared) > Date.parse(lastTs))) {
    lastTs = shared;
  }
  const since = await fetchTrackerSince(lastTs ?? nowISO());
  if (!since || !Array.isArray(since.samples) || since.samples.length === 0) return;

  // Il server filtra già per ts; qui protezione anti-doppioni con
  // confronto NUMERICO (i formati dei ts possono essere misti).
  const base = lastTs;
  const baseMs = base ? Date.parse(base) : NaN;
  const fresh = base
    ? since.samples.filter((s) => {
          if (!s || typeof s.ts !== "string") return false;
          const t = Date.parse(s.ts);
          return Number.isFinite(t) && (!Number.isFinite(baseMs) || t > baseMs);
        })
    : since.samples;
  if (fresh.length === 0) return;

  importSamples(fresh);

  const maxTs = fresh.reduce((a, b) => {
    const ta = Date.parse(a);
    const tb = Date.parse(b.ts);
    if (!Number.isFinite(ta)) return b.ts;
    if (!Number.isFinite(tb)) return a;
    return tb > ta ? b.ts : a;
  }, base ?? "");
  lastTs = maxTs;
  persistLastTs(maxTs);
  lastSync = maxTs;

  for (const s of fresh) {
    if (s.exe) appSet.add(s.exe);
  }
  sessionSamples.push(...fresh);
  notify();
}

async function poll() {
  if (busy) return; // evita sovrapposizioni se il fetch dura >20s
  busy = true;
  try {
    await runExclusive(pollBody);
  } finally {
    busy = false;
  }
}

function startLoop() {
  if (pollTimer) return;
  void poll();
  pollTimer = setInterval(() => void poll(), TRACKER_POLL_MS);
}

function stopLoop() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// --- calcolo stats sessione (stessa spec di TrackerLive) ---
function computeSessionStats(): SessionStats {
  const startMs = sessionStart ?? Date.now();
  const durationMs = Date.now() - startMs;
  // DEDUP a slot di 30s (stessa regola dell'aggregatore e di /api/worktoday):
  // nel buffer convivono i tick del poller e gli eventi dell'hook a cambio
  // finestra — senza dedup ogni alt-tab gonfia i minuti della sessione.
  const SLOT_MS = 30_000;
  const lastInSlot = new Map<number, TrackerSample>();
  for (const s of sessionSamples) {
    if (!s?.exe) continue;
    const t = Date.parse(s.ts);
    if (!Number.isFinite(t)) continue;
    const slot = Math.floor(t / SLOT_MS);
    const cur = lastInSlot.get(slot);
    if (!cur || Date.parse(s.ts) >= Date.parse(cur.ts)) lastInSlot.set(slot, s);
  }
  const db2 = loadDB();
  const userMap = Object.fromEntries(
    db2.pcAppCategoryMap.map((m) => [m.appName.toLowerCase(), m.category])
  );
  const catMin = new Map<string, number>();
  const exeCount = new Map<string, number>();
  for (const s of lastInSlot.values()) {
    if (!s?.exe) continue;
    const cat = categorize(s.exe, s.title ?? "", userMap);
    catMin.set(cat, (catMin.get(cat) ?? 0) + TRACKER_SAMPLE_MIN);
    exeCount.set(s.exe, (exeCount.get(s.exe) ?? 0) + 1);
  }
  const categories = [...catMin.entries()]
    .map(([category, minutes]) => ({ category, minutes: Math.round(minutes * 10) / 10 }))
    .sort((a, b) => b.minutes - a.minutes);
  const totalMin = categories.reduce((s, c) => s + c.minutes, 0);
  const productiveMin = categories
    .filter((c) => PRODUCTIVE_CATEGORIES.has(c.category))
    .reduce((s, c) => s + c.minutes, 0);
  const topAppEntry = [...exeCount.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    durationMs,
    appCount: exeCount.size,
    productiveMin,
    totalMin,
    categories: categories.slice(0, 3),
    topApp: topAppEntry ? { exe: topAppEntry[0], samples: topAppEntry[1] } : null,
  };
}

// --- API pubbliche ---
export function startRecord(): void {
  if (recording) return;
  // La sessione manuale parte dal "subito": i campioni da ora in poi
  // vanno nel buffer sessione. Il loop globale è già attivo e continua
  // a importare nel DB per TUTTI (sempre).
  sessionStart = Date.now();
  appSet = new Set();
  sessionSamples = [];
  lastSessionStats = null;
  lastSync = null;
  recording = true;
  persist();
  startLoop(); // idempotente: se già gira, non fa nulla
  notify();
}

export function stopRecord(): void {
  if (!recording) return;
  // NON ferma il loop globale: il tracking automatico prosegue.
  recording = false;
  lastSessionStats = computeSessionStats();
  persist();
  notify();
}

/** Al mount dell'app: avvia SEMPRE il polling automatico; se c'era una
 *  sessione manuale attiva prima di reload/chiusura, la riprende
 *  (il tracker nel frattempo ha campionato su file: il primo poll
 *  recupera tutto il gap senza doppioni). */
export function restoreIfNeeded(): void {
  let wasRecording = false;
  try {
    wasRecording = window.localStorage.getItem(REC_KEY) === "1";
  } catch { /* noop */ }
  if (wasRecording && !recording) {
    let storedStart = 0;
    try {
      storedStart = Number(window.localStorage.getItem(SESSION_KEY) ?? 0);
    } catch { /* noop */ }
    sessionStart = Number.isFinite(storedStart) && storedStart > 0 ? storedStart : Date.now();
    appSet = new Set();
    sessionSamples = [];
    lastSessionStats = null;
    recording = true;
    persist();
  }
  // base = ultimo ts importato (di oggi) o "adesso" → il primo poll
  // recupera i campioni del gap dall'ultimo avvio dell'app.
  let base = nowISO();
  const stored = readStoredLastTs();
  if (stored) {
    const d = new Date(stored);
    if (d.toDateString() === new Date().toDateString()) base = stored;
  }
  lastTs = base;
  lastSync = null;
  startLoop(); // SEMPRE: il tracker alimenta Uso PC anche senza registrazione
  notify();
}