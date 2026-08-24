// ============================================================
// ASCEND — Benessere: helper puri su db.wellnessLogs.
// Una riga per giorno (upsert): sonno (ore+qualità), umore, peso.
// Solo sonno e peso attivano l'Activity Streak (l'umore da solo no).
// ============================================================

import type { DB, WellnessLog } from "./types";
import { addDaysKey } from "./dates";

/** Log di un giorno specifico (o null). */
export function logForDay(db: DB, dayKey: string): WellnessLog | undefined {
  return db.wellnessLogs.find((w) => w.date === dayKey);
}

/** Log ordinati dal più recente (data, poi createdAt desc). */
export function logsSorted(db: DB): WellnessLog[] {
  return [...db.wellnessLogs].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
  );
}

/** Ultimo peso registrato: { value, dayKey } o null. */
export function lastWeight(db: DB): { value: number; dayKey: string } | null {
  for (const w of logsSorted(db)) {
    if (w.weightKg != null && Number.isFinite(w.weightKg)) return { value: w.weightKg, dayKey: w.date };
  }
  return null;
}

/**
 * Media di un campo sui giorni con dato nell'intervallo
 * [today-(n-1), today]. Se nessun dato → null. Arrotonda a 1 decimale.
 */
function avgField(
  db: DB,
  field: "sleepHours" | "mood",
  n: number,
  today: string
): number | null {
  const start = addDaysKey(today, -(n - 1));
  let sum = 0;
  let count = 0;
  for (const w of db.wellnessLogs) {
    if (w.date < start || w.date > today) continue;
    const v = w[field];
    if (v == null || !Number.isFinite(Number(v))) continue;
    sum += Number(v);
    count++;
  }
  return count > 0 ? Math.round((sum / count) * 10) / 10 : null;
}

/** Media ore di sonno degli ultimi n giorni (solo giorni con dato). */
export function avgSleep(db: DB, n: number, today: string): number | null {
  return avgField(db, "sleepHours", n, today);
}

/** Media umore (1-5) degli ultimi n giorni (solo giorni con dato). */
export function avgMood(db: DB, n: number, today: string): number | null {
  return avgField(db, "mood", n, today);
}

/** Sonno della notte precedente (ieri). Comodo per la routine mattutina. */
export function sleepOn(db: DB, dayKey: string): number | null {
  const w = logForDay(db, dayKey);
  return w && w.sleepHours != null ? w.sleepHours : null;
}

/**
 * Quanti giorni hanno almeno un dato (sonno/umore/peso) in un intervallo.
 * Usato per il contributo "giorni d'ascesa" e per la mini-card home.
 */
export function daysLogged(db: DB, n: number, today: string): number {
  const start = addDaysKey(today, -(n - 1));
  let count = 0;
  for (const w of db.wellnessLogs) {
    if (w.date < start || w.date > today) continue;
    const has = w.sleepHours != null || w.mood != null || w.weightKg != null;
    if (has) count++;
  }
  return count;
}

/** Variazione peso: ultimo registrato vs il più vicino di almeno 6 giorni prima. */
export function weightDelta(db: DB): { delta: number | null; prev: number | null } {
  const sorted = logsSorted(db).filter((w) => w.weightKg != null && Number.isFinite(w.weightKg));
  if (sorted.length === 0) return { delta: null, prev: null };
  const last = sorted[0];
  const prev = sorted.find((w) => w.date <= addDaysKey(last.date, -6));
  if (!prev) return { delta: null, prev: null };
  return { delta: Math.round((last.weightKg! - prev.weightKg!) * 100) / 100, prev: prev.weightKg! };
}

/** Numero totale di giorni registrati in assoluto. */
export function totalLoggedDays(db: DB): number {
  return db.wellnessLogs.length;
}

/** Percentuale di notti nella fascia consigliata (7-9h) sugli ultimi n giorni con dato. */
export function sleepInRangePct(db: DB, n: number, today: string): number | null {
  const start = addDaysKey(today, -(n - 1));
  let ok = 0;
  let count = 0;
  for (const w of db.wellnessLogs) {
    if (w.date < start || w.date > today) continue;
    if (w.sleepHours == null || !Number.isFinite(w.sleepHours)) continue;
    count++;
    if (w.sleepHours >= 7 && w.sleepHours <= 9) ok++;
  }
  return count > 0 ? Math.round((ok / count) * 100) : null;
}