// ============================================================
// ASCEND — Custom Goals logic (pure functions, no React)
// Obiettivi personalizzati con check manuale + reminder in Home.
// ============================================================

import type { DB, CustomGoal, CustomGoalCheck } from "./types";

/**
 * Giorni della settimana in cui il goal è dovuto, data una data "yyyy-MM-dd".
 *  - "daily"      → ogni giorno
 *  - "weekdays"   → lun–ven (getDay 1..5)
 *  - "weekly"     → i giorni in goal.weekDays (0=dom … 6=sab)
 */
export function isDueOn(goal: CustomGoal, dayKey: string): boolean {
  if (!goal.active) return false;
  if (goal.dueDate && dayKey > goal.dueDate) return false; // oltre la scadenza → non più dovuto
  const day = new Date(`${dayKey}T00:00:00`).getDay();
  if (goal.frequency === "daily") return true;
  if (goal.frequency === "weekdays") return day >= 1 && day <= 5; // lun–ven
  if (goal.frequency === "weekly") {
    return goal.weekDays && goal.weekDays.length > 0 ? goal.weekDays.includes(day) : false;
  }
  return false;
}

/** Ha il goal un check registrato per il giorno? (un solo record per goal+giorno) */
export function checkedOn(
  checks: CustomGoalCheck[],
  goalId: string,
  dayKey: string
): boolean {
  return checks.some((c) => c.goalId === goalId && c.date === dayKey);
}

/** Obiettivi DOVUTI oggi (per la card Home). */
export function dueToday(db: DB): CustomGoal[] {
  const today = todayKey(db.settings.timezone);
  return db.customGoals
    .filter((g) => isDueOn(g, today))
    .sort((a, b) => (a.color ? 0 : 1) - (b.color ? 0 : 1));
}

/**
 * Streak giorni consecutivi completati partendo da oggi/indietro.
 * Un giorno non-dovuto (isDueOn false) NON rompe lo streak: si "salta".
 */
export function streakOf(
  goal: CustomGoal,
  checks: CustomGoalCheck[],
  todayKey: string
): number {
  let streak = 0;
  let day = todayKey;
  for (;;) {
    if (!isDueOn(goal, day)) {
      // giorno non dovuto → salta indietro di un giorno senza rompere
      day = prevDayKey(day);
      continue;
    }
    if (checkedOn(checks, goal.id, day)) {
      streak++;
      day = prevDayKey(day);
    } else {
      break;
    }
  }
  return streak;
}

/** % completamento su ultimi N giorni (default 30) rispetto ai giorni DOVUTI. */
export function completionRate(
  goal: CustomGoal,
  checks: CustomGoalCheck[],
  todayKey: string,
  days: number = 30
): number {
  let due = 0;
  let done = 0;
  let day = todayKey;
  for (let i = 0; i < days; i++) {
    if (isDueOn(goal, day)) {
      due++;
      if (checkedOn(checks, goal.id, day)) done++;
    }
    day = prevDayKey(day);
  }
  return due > 0 ? Math.round((done / due) * 100) : 0;
}

/** Helper: giorno chiave "yyyy-MM-dd" in timezone (usa window.locale se SSR). */
function todayKey(tz?: string): string {
  if (typeof window === "undefined") return new Date().toISOString().slice(0, 10);
  return todayISOInTZ(tz);
}

function todayISOInTZ(tz?: string): string {
  if (!tz) return new Date().toISOString().slice(0, 10);
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()); // "yyyy-mm-dd"
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function prevDayKey(dayKey: string): string {
  const d = new Date(`${dayKey}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
