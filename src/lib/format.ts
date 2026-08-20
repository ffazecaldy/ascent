// ============================================================
// ASCEND — Formattazione (numeri smart, money, percentuali, R)
// Convenzione utente: €1.5k / €1.563 / €563,92
// ============================================================

const CURRENCY_SYMBOL: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  CHF: "CHF",
  JPY: "¥",
};

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOL[code.toUpperCase()] ?? code.toUpperCase() + " ";
}

/** Semplice formattazione smart di una cifra monetaria. */
export function formatMoney(
  amount: number,
  currency: string = "EUR",
  locale: string = "it-IT"
): string {
  const sign = amount < 0 ? "−" : "";
  const abs = Math.abs(amount);
  const sym = currencySymbol(currency);

  if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toLocaleString(locale, { maximumFractionDigits: 2 })}M`;
  if (abs >= 10_000) return `${sign}${sym}${(abs / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })}k`;
  if (abs >= 1000) {
    const s = abs.toLocaleString(locale, { maximumFractionDigits: 0 });
    return `${sign}${sym}${s}`;
  }
  // cifre sotto 1000: 2 decimali con virgola se servono
  const hasDecimals = Math.round(abs * 100) % 100 !== 0;
  const s = abs.toLocaleString(locale, {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `${sign}${sym}${s}`;
}

export function formatNumber(n: number, locale: string = "it-IT"): string {
  return n.toLocaleString(locale, { maximumFractionDigits: 2 });
}

export function formatPercent(n: number, digits = 1): string {
  // n es. 63.4 → "63,4%"
  return (
    n.toLocaleString("it-IT", { maximumFractionDigits: digits, minimumFractionDigits: 0 }) + "%"
  );
}

export function formatR(r: number): string {
  const sign = r > 0 ? "+" : r < 0 ? "−" : "";
  return `${sign}${Math.abs(r).toLocaleString("it-IT", { maximumFractionDigits: 2 })}R`;
}

export function formatSignedMoney(
  amount: number,
  currency: string = "EUR",
  locale: string = "it-IT"
): string {
  const s = formatMoney(Math.abs(amount), currency, locale);
  const sign = amount > 0 ? "+" : amount < 0 ? "−" : "";
  return `${sign}${s}`;
}

export function smartShort(n: number): string {
  // per numeri "senza unità": 1500 → "1.500", 0 pub dif
  return n.toLocaleString("it-IT", { maximumFractionDigits: 1 });
}

/** Compact per KPI header, es. 14 → "14 gg", 3.5h */
export function minutiToOre(min: number): string {
  const h = min / 60;
  return h.toLocaleString("it-IT", { maximumFractionDigits: 1 }) + "h";
}
