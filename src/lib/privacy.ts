// ============================================================
// ASCEND — Privacy mode (due livelli)
// Standard:  maschera le CIFRE monetarie (€2.430 → •••)
// Completa:  maschera anche KPI finanziari (win rate, Disciplina %,
//            +R, percentuali) e neutralizza il calendario P&L.
// In entrambe le modalità le cifre monetarie sono mascherate.
// ============================================================

import type { PrivacyMode } from "./types";

export function maskMoney(): string {
  return "•••";
}

export function maskKpi(): string {
  return "••%";
}

export function maskCompact(): string {
  return "••";
}

/** true se le cifre monetarie vanno mascherate (entrambe le modalità). */
export function moneyMasked(_mode: PrivacyMode): boolean {
  return true;
}

/** true se i KPI/percentuali vanno mascherati (solo "complete"). */
export function kpiMasked(mode: PrivacyMode): boolean {
  return mode === "complete";
}

/** true se il calendario P&L va neutralizzato (solo "complete"). */
export function calendarNeutral(mode: PrivacyMode): boolean {
  return mode === "complete";
}
