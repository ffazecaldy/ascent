// ============================================================
// ASCEND — Privacy mode
// Standard: maschera le cifre monetarie (€2.430 → •••)
// Completa: maschera anche KPI finanziari (win rate %, Disciplina %,
//           +R) e neutralizza il calendario P&L.
// Niente verde/rosso per il P&L quando "complete" è attivo.
// ============================================================

import type { PrivacyMode } from "./types";

export function maskMoney(): string {
  return "•••";
}

export function maskKpi(): string {
  return "••%";
}

export function maskShort(): string {
  return "••";
}

/** Il valore monetario mascherabile o il valore reale. */
export function applyPrivacyMoney<T>(mode: PrivacyMode, real: () => T, masked: () => string): string {
  return mode === "standard" || mode === "complete" ? masked() : String(real());
}

/** KPI (win rate, Disciplina %, +R, percentuali) — mascherati solo in "complete". */
export function applyPrivacyKpi(mode: PrivacyMode, masked: string): boolean {
  return mode === "complete";
}

export function formatWithPrivacyMoney(
  mode: PrivacyMode,
  amount: number,
  currency: string,
  locale: string
): string {
  if (mode !== "off") return maskMoney();
  const { formatMoney } = require("./format");
  return formatMoney(amount, currency, locale);
}
