// ============================================================
// ASCEND — Milestone helpers (pure functions, no React)
// Giorni rimanenti, urgenza, ordinamento per Home e gestione.
// Date "yyyy-MM-dd" confrontate come stringhe (formato ISO ordina bene).
// ============================================================

import type { Milestone } from "./types";

/** Giorni rimanenti: negativo = scaduta. today e date in "yyyy-MM-dd". */
export function daysLeft(date: string, today: string): number {
  const ms = Date.parse(date + "T00:00:00") - Date.parse(today + "T00:00:00");
  return Math.round(ms / 86_400_000);
}

/** Livello urgenza per badge/colori. */
export function urgencyOf(m: Milestone, today: string): "overdue" | "soon" | "week" | "future" | "done" {
  if (m.done) return "done";
  const d = daysLeft(m.date, today);
  if (d < 0) return "overdue";
  if (d <= 2) return "soon";
  if (d <= 7) return "week";
  return "future";
}

/** Etichetta compatta: "oggi", "domani", "tra Xg", "Xg fa", data breve. */
export function dueLabel(date: string, today: string): string {
  const d = daysLeft(date, today);
  if (d === 0) return "oggi";
  if (d === 1) return "domani";
  if (d > 1 && d <= 30) return `tra ${d}g`;
  if (d < 0 && d >= -30) return `${-d}g fa`;
  const [, mm, dd] = date.split("-");
  return `${dd}/${mm}`;
}

/** Milestone aperte ordinate per data crescente (le scadute prima). */
export function openMilestones(all: Milestone[]): Milestone[] {
  return all
    .filter((m) => !m.done)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** La più urgente (per hero in Home): prima non-done per data. */
export function nextMilestone(all: Milestone[]): Milestone | null {
  const open = openMilestones(all);
  return open.length > 0 ? open[0] : null;
}
