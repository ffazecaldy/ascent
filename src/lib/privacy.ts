// ============================================================
// ASCEND — Privacy mode (tre livelli)
// off:       nessun mascheramento (uso normale quotidiano)
// standard:  maschera le CIFRE monetarie (€2.430 → •••)
// completa:  maschera anche KPI finanziari (win rate, Disciplina %,
//            +R, percentuali) e neutralizza il calendario P&L.
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

/** true se le cifre monetarie vanno mascherate (standard o completa). */
export function moneyMasked(mode: PrivacyMode): boolean {
  return mode !== "off";
}

/** true se i KPI/percentuali vanno mascherati (solo "complete"). */
export function kpiMasked(mode: PrivacyMode): boolean {
  return mode === "complete";
}

/** true se il calendario P&L va neutralizzato (solo "complete"). */
export function calendarNeutral(mode: PrivacyMode): boolean {
  return mode === "complete";
}

/** Etichette per il toggle/seléttore. */
export const PRIVACY_LABELS: Record<PrivacyMode, string> = {
  off: "Off — tutto visibile",
  standard: "Standard — cifre nascoste",
  complete: "Completa — cifre + KPI + calendario",
};

export const PRIVACY_ORDER: PrivacyMode[] = ["off", "standard", "complete"];
