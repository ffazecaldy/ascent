// ============================================================
// ASCEND — Registrazione tracker live GLOBALE (app-wide)
// Il polling di /api/since e lo stato di registrazione vivono QUI
// (modulo singoletto), NON nel componente della pagina Uso PC:
// navigando tra home/benessere/coach/... la registrazione continua.
// Persistenza su localStorage → sopravvive anche a reload/riavvio.
//
// Keys:
//   ascend:pcRecording     '1'/'0' — registrazione attiva
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
function notify() {
  listeners.forEach((l) => l());
}

export function subscribeRecord(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRecordState(): RecordState {
  return { recording, sessionStart, lastSync, appCount: appSet.size, lastSessionStats };
}

/** Snapshot lato server/prerender: nessuna registrazione attiva.
 *  Richiesto da useSyncExternalStore durante il prerender Next. */
export function getRecordStateServer(): RecordState {
  return { recording: false, sessionStart: null, lastSync: null, appCount: 0, lastSessionStats: null };
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
async function poll() {
  if (busy) return; // evita sovrapposizioni se il fetch dura >20s
  busy = true;
  try {
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
  const catMin = new Map<string, number>();
  const exeCount = new Map<string, number>();
  for (const s of sessionSamples) {
    if (!s?.exe) continue;
    const db = loadDB();
    const userMap = Object.fromEntries(
      db.pcAppCategoryMap.map((m) => [m.appName.toLowerCase(), m.category])
    );
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
  // Base: ultimo ts importato persistito (se di oggi), altrimenti "adesso".
  // Così una sessione interrotta riprende dai campioni del gap senza doppioni.
  let base = nowISO();
  const stored = readStoredLastTs();
  if (stored) {
    const d = new Date(stored);
    if (d.toDateString() === new Date().toDateString()) base = stored;
  }
  lastTs = base;
  sessionStart = Date.now();
  appSet = new Set();
  sessionSamples = [];
  lastSessionStats = null;
  lastSync = null;
  recording = true;
  persist();
  startLoop();
  notify();
}

export function stopRecord(): void {
  if (!recording) return;
  stopLoop();
  recording = false;
  lastSessionStats = computeSessionStats();
  persist();
  notify();
}

/** Al mount dell'app: riprende la registrazione attiva prima di un
 *  reload/chiusura finestra (il tracker nel frattempo ha continuato
 *  a campionare su file; il primo poll recupera il gap). */
export function restoreIfNeeded(): void {
  if (recording) return;
  let wasRecording = false;
  try {
    wasRecording = window.localStorage.getItem(REC_KEY) === "1";
  } catch { /* noop */ }
  if (!wasRecording) return;
  let storedStart = 0;
  try {
    storedStart = Number(window.localStorage.getItem(SESSION_KEY) ?? 0);
  } catch { /* noop */ }
  let base = nowISO();
  const stored = readStoredLastTs();
  if (stored) {
    const d = new Date(stored);
    if (d.toDateString() === new Date().toDateString()) base = stored;
  }
  lastTs = base;
  sessionStart = Number.isFinite(storedStart) && storedStart > 0 ? storedStart : Date.now();
  appSet = new Set();
  sessionSamples = [];
  lastSessionStats = null;
  lastSync = null;
  recording = true;
  persist();
  startLoop();
  notify();
}