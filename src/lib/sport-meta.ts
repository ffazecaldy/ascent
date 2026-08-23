// ============================================================
// ASCEND — Sport Zone · helper condivisi durata / ore↔minuti
// UNICA implementazione di fmtDur + conversioni ore ↔ minuti.
// Condivisa da SportSetupWizard / pagina /sport / SportReminderCard
// così i valori mostrati restano sempre coerenti col profilo salvato.
// ============================================================

/** Durata leggibile: 45 → "45m", 60 → "1h", 90 → "1h 30m", 120 → "2h". */
export function fmtDur(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Ore frazionarie (slider step 0.5) → minuti interi: 2.5 → 150. */
export function hoursToMinutes(h: number): number {
  return Math.round(h * 60);
}

/** Minuti → etichetta ore con 1 decimale: 150 → "2.5h", 120 → "2h". */
export function minutesToHoursLabel(min: number): string {
  const h = Math.round((min / 60) * 10) / 10;
  return `${h}h`;
}
