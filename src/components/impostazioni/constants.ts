// ============================================================
// ASCEND — Impostazioni · costanti condivise (solo questo modulo)
// Non toccare src/lib/*: gli helper necessari al modulo vivono qui.
// ============================================================

/** Fusi IANA suggeriti per il datalist della timezone.
 *  L'utente può digitare liberamente qualsiasi nome IANA (es. "Asia/Dubai"). */
export const TZ_NAMES = [
  "Europe/Rome",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Tokyo",
  "Asia/Singapore",
  "UTC",
];

/** Etichette italiane per week_start (0 = domenica … 6 = sabato). */
export const WEEK_START_LABELS: { value: number; label: string }[] = [
  { value: 0, label: "Domenica" },
  { value: 1, label: "Lunedì" },
  { value: 2, label: "Martedì" },
  { value: 3, label: "Mercoledì" },
  { value: 4, label: "Giovedì" },
  { value: 5, label: "Venerdì" },
  { value: 6, label: "Sabato" },
];

/** Nomi estesi mostrati accanto al codice valuta. */
export const CURRENCY_LABELS: Record<string, string> = {
  EUR: "Euro",
  USD: "Dollaro USA",
  GBP: "Sterlina britannica",
  CHF: "Franco svizzero",
  JPY: "Yen giapponese",
  AUD: "Dollaro australiano",
  CAD: "Dollaro canadese",
  SEK: "Corona svedese",
  NOK: "Corona norvegese",
  DKK: "Corona danese",
  PLN: "Złoty polacco",
  HUF: "Fiorino ungherese",
  CZK: "Corona ceca",
  BRL: "Real brasiliano",
  INR: "Rupia indiana",
};

/** Tipi di categoria con etichette italiane. */
export const CATEGORY_TYPES = [
  { value: "income", label: "Entrata" },
  { value: "expense", label: "Uscita" },
] as const;

/** Palette del color picker "dot grid". */
export const COLOR_PALETTE = [
  "#4C7EFF",
  "#22c55e",
  "#eab308",
  "#f97316",
  "#ef4444",
  "#06b6d4",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#84cc16",
  "#64748b",
  "#0ea5e9",
  "#f59e0b",
  "#a855f7",
  "#10b981",
  "#f43f5e",
];

/** Emoji suggerite rapidamente per le categorie (click per selezionare). */
export const EMOJI_SUGGESTIONS = [
  "💼",
  "📈",
  "🪙",
  "🏠",
  "🍝",
  "🚗",
  "💪",
  "🔁",
  "📦",
  "🛒",
  "☕",
  "🎮",
  "📱",
  "💊",
  "✈️",
  "🎁",
  "💡",
  "🧾",
];
