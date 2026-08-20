// Helpers interni alla sezione Finanze (file posseduto dal subagent Finanze).
// Non tocca src/lib: restano qui i piccoli calcoli di vista.

/** Sposta una month key "yyyy-MM" di `delta` mesi (±). */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Etichetta lunga di un mese, es. "agosto 2026". */
export function monthLabel(month: string, locale = "it-IT"): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });
}

/** Etichetta corta di un mese per gli assi, es. "ago". */
export function shortMonth(month: string, locale = "it-IT"): string {
  const [y, m] = month.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString(locale, { month: "short" });
  return s.replace(".", "").slice(0, 3);
}

/** Ultimi n mesi in ordine cronologico, fino a `month` incluso. */
export function lastMonths(month: string, n: number): string[] {
  const start = shiftMonth(month, -(n - 1));
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(shiftMonth(start, i));
  return out;
}

/** Arrotonda un tasso di cambio a 6 decimali per l'input editabile. */
export function formatRate(r: number): string {
  if (!Number.isFinite(r) || r <= 0) return "";
  return (Math.round(r * 1e6) / 1e6).toString();
}

/** Palette colori proposte per le categorie. */
export const CATEGORY_COLORS = [
  "#4C7EFF",
  "#22c55e",
  "#ef4444",
  "#eab308",
  "#f97316",
  "#06b6d4",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
];
