// ============================================================
// ASCEND — Pipeline FX
// API free (open.er-api.com, nessuna chiave) → tasso precompilato
// → l'utente lo corregge a mano → viene salvato sulla riga.
// API irraggiungibile = inserimento manuale, MAI un blocco.
// ============================================================

export interface FxQuote {
  from: string;
  to: string;
  rate: number; // 1 unità `from` = `rate` unità `to`
  source: "api" | "manual";
  quotedAt: string;
}

const API_BASE = "https://open.er-api.com/v6/latest";

// Cache di sessione per non martellare l'API
const cache = new Map<string, { rate: number; at: Date }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

async function fetchRates(base: string): Promise<Record<string, number> | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${API_BASE}/${base}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (data.result !== "success" || !data.rates) return null;
    return data.rates;
  } catch {
    return null;
  }
}

/** Quota da→to usando l'API (base = from). Rate = 1 from → x to. */
export async function quoteFx(from: string, to: string): Promise<FxQuote | null> {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) {
    return { from: f, to: t, rate: 1, source: "manual", quotedAt: new Date().toISOString() };
  }
  const key = `${f}/${t}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at.getTime() < CACHE_TTL_MS) {
    return { from: f, to: t, rate: hit.rate, source: "api", quotedAt: new Date().toISOString() };
  }
  const rates = await fetchRates(f);
  const rate = rates?.[t];
  if (!rate) return null;
  cache.set(key, { rate, at: new Date() });
  return { from: f, to: t, rate, source: "api", quotedAt: new Date().toISOString() };
}

/** Converte un importo da `from` a `to` al tasso reale corrente. */
export async function convertAmountFx(
  amount: number,
  from: string,
  to: string
): Promise<{ amount: number; rate: number; source: "api" | "manual" } | null> {
  const q = await quoteFx(from, to);
  if (!q) return null;
  return { amount: amount * q.rate, rate: q.rate, source: q.source };
}

/** Currencies più comuni per i select. */
export const COMMON_CURRENCIES = [
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "JPY",
  "AUD",
  "CAD",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "HUF",
  "CZK",
  "BRL",
  "INR",
];
