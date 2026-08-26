// ============================================================
// ASCEND — Salute del PC: aggregazioni dai campioni del tracker
// Sessione = sequenza continua di campioni (gap ≤ GAP_SESSION_MIN).
// Pausa = gap tra sessioni. Notturno = campioni 23:00–07:00 locali.
// Tutto derivato dai jsonl esistenti: nessun dato nuovo salvato.
// ============================================================
import type { TrackerSample } from "./pc-tracker";

export const GAP_SESSION_MIN = 5; // ≤ questo gap = stessa sessione
export const LONG_SESSION_MIN = 90; // sessione lunga (avviso)
const CRITICAL_SESSION_MIN = 120; // sessione che rompe lo streak igiene
export const PAUSE_OK_MIN = 15; // pausa "vera" (stacca la mente)

export interface HealthSession {
  startMs: number;
  endMs: number;
  minutes: number;
}

export interface DayHealth {
  date: string;
  firstUseMs: number | null;
  lastUseMs: number | null;
  totalMinutes: number;
  sessions: HealthSession[];
  longSessions: number; // > LONG_SESSION_MIN
  criticalSessions: number; // > CRITICAL_SESSION_MIN
  longestSessionMin: number;
  pausesMinutes: number[]; // gap tra sessioni
  goodPauses: number; // ≥ PAUSE_OK_MIN
  nightSamples: number; // campioni 23:00–07:00 (≈0.5 min l'uno)
  nightMinutes: number;
}

function parseTs(ts: string): number {
  const t = Date.parse(ts);
  return Number.isFinite(t) ? t : NaN;
}

/** Ora locale (0-23) di un ts ISO. */
export function hourLocal(iso: string): number {
  return new Date(iso).getHours();
}

/** Data-key locale yyyy-MM-dd da un ts ISO. */
export function dateKeyLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Aggrega i campioni di un giorno in sessioni/pause/metriche salute.
 * I campioni devono appartenere tutti allo stesso giorno (il chiamante
 * li filtra con /api/day?date=).
 */
export function aggregateDayHealth(dateKey: string, samples: TrackerSample[]): DayHealth {
  const valid = samples
    .filter((s) => s && typeof s.ts === "string")
    .map((s) => ({ ts: s.ts, t: parseTs(s.ts) }))
    .filter((s) => !Number.isNaN(s.t))
    .sort((a, b) => a.t - b.t);

  const out: DayHealth = {
    date: dateKey,
    firstUseMs: null,
    lastUseMs: null,
    totalMinutes: 0,
    sessions: [],
    longSessions: 0,
    criticalSessions: 0,
    longestSessionMin: 0,
    pausesMinutes: [],
    goodPauses: 0,
    nightSamples: 0,
    nightMinutes: 0,
  };
  if (valid.length === 0) return out;

  out.firstUseMs = valid[0].t;
  out.lastUseMs = valid[valid.length - 1].t;

  // --- sessioni per gap ---
  const GAP_MS = GAP_SESSION_MIN * 60_000;
  let segStart = valid[0].t;
  let prevT = valid[0].t;
  const pushSeg = () => {
    const mins = Math.max(1, Math.round((prevT - segStart) / 60_000));
    out.sessions.push({ startMs: segStart, endMs: prevT, minutes: mins });
  };
  for (let i = 1; i < valid.length; i++) {
    const t = valid[i].t;
    if (t - prevT > GAP_MS) {
      pushSeg();
      out.pausesMinutes.push(Math.round((t - prevT) / 60_000));
      segStart = t;
    }
    prevT = t;
  }
  pushSeg();

  // --- metriche sessioni ---
  for (const s of out.sessions) {
    out.longestSessionMin = Math.max(out.longestSessionMin, s.minutes);
    if (s.minutes > LONG_SESSION_MIN) out.longSessions++;
    if (s.minutes > CRITICAL_SESSION_MIN) out.criticalSessions++;
  }
  for (const p of out.pausesMinutes) {
    if (p >= PAUSE_OK_MIN) out.goodPauses++;
  }

  // totale attivo = somma sessioni (le pause escluse)
  out.totalMinutes = Math.min(1440, out.sessions.reduce((acc, s) => acc + s.minutes, 0));

  // --- uso notturno (23:00–07:00 ora locale), ogni campione ≈ 30s ---
  let night = 0;
  for (const s of valid) {
    const h = hourLocal(s.ts);
    if (h >= 23 || h < 7) night++;
  }
  out.nightSamples = night;
  out.nightMinutes = Math.round(night * 0.5);

  return out;
}

/**
 * Streak "benessere": giorni consecutivi terminati puliti
 * (nessuna sessione >120 min E nessun uso dopo le 23:00).
 * Gli ack sono date-key yyyy-mm-dd salvate dal client.
 */
export function wellnessStreak(ackedDays: string[]): number {
  const set = new Set(ackedDays);
  let streak = 0;
  const d = new Date();
  d.setHours(12); // evita bordi DST/mezzanotte
  for (;;) {
    const key = dateKeyLocal(d.toISOString());
    if (!set.has(key)) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/** Il giorno è "pulito" per lo streak? */
export function isCleanDay(h: DayHealth): boolean {
  return h.criticalSessions === 0 && h.nightMinutes < 15;
}
