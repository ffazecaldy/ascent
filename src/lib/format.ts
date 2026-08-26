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

/** Compact per KPI header, es. 14 → "14 gg".
 *  Formato durata "smart": <60 min → "45 min"; ≥1h → "2h 40m" (minuti
 *  arrotondati a 5; se i minuti fanno 0 → "2h"). */
export function minutiToOre(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "0 min";
  if (min < 60) {
    const m = Math.max(1, Math.round(min));
    return `${m} min`;
  }
  // Il resto arrotondato a multipli di 5 può dare 60 (es. resti ≥ 57.5):
  // riporta il riporto nelle ore, mai "8h 60m".
  let h = Math.floor(min / 60);
  let m = Math.round((min % 60) / 5) * 5;
  if (m >= 60) {
    h += 1;
    m = 0;
  }
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
