// ============================================================
// ASCEND — Zona Studio · costanti, palette e helper condivisi
// Materie preset, emoji, colori (palette gradient accent),
// durata leggibile, etichette giorno, minuti ultimi 7 giorni.
// ============================================================

import type { StudySession } from "@/lib/types";
import { addDaysKey, parseDateKey } from "@/lib/dates";
import type { IconName } from "@/components/ui/Icon";

export const SUBJECT_PRESETS = [
  "Matematica",
  "Trading/Educazione finanziaria",
  "Inglese",
  "Programmazione",
  "Fisica",
  "Altro",
];

export const SUBJECT_ICON: Record<string, IconName> = {
  Matematica: "compass",
  "Trading/Educazione finanziaria": "chart-line",
  Inglese: "book-open",
  Programmazione: "monitor",
  Fisica: "zap",
  Altro: "book",
};

// Palette "gradient": sequenza che va dall'accento blu al ciano/al verde —
// coerente col design system, assegnata in modo stabile a ogni materia.
export const SUBJECT_PALETTE = [
  "#4C7EFF", // blu accento
  "#8A6BFF", // viola (accent-2)
  "#2FD4FF", // ciano (accent-3)
  "#2ddf9e", // menta
  "#f0b429", // ambra
  "#ec4899", // rosa
  "#06b6d4", // ciano scuro
  "#f97316", // arancio
];

/** Colore stabile per materia (preset mappati in ordine, custom via hash). */
export function subjectColor(subject: string): string {
  const idx = SUBJECT_PRESETS.indexOf(subject);
  if (idx !== -1) return SUBJECT_PALETTE[idx % SUBJECT_PALETTE.length];
  let h = 0;
  for (const c of subject) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SUBJECT_PALETTE[h % SUBJECT_PALETTE.length];
}

/** Gradiente leggero per chip/badge di materia. */
export function subjectGradient(subject: string): string {
  const base = subjectColor(subject);
  return `linear-gradient(135deg, ${base}2e, ${base}14)`;
}

export function subjectIcon(subject: string): IconName {
  return SUBJECT_ICON[subject] ?? "book";
}

/** Durata leggibile: 45 → "45m", 60 → "1h", 90 → "1h 30m", 120 → "2h". */
export function fmtDur(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Etichetta corta del giorno ("Lun") per un day key, nella locale utente. */
export function weekdayShort(key: string, locale: string): string {
  const { y, m, d } = parseDateKey(key);
  const wd = new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: "short" });
  return wd.charAt(0).toUpperCase() + wd.slice(1);
}

/** Minuti di studio per ciascuno degli ultimi 7 giorni (oggi incluso). */
export function last7Minutes(
  sessions: StudySession[],
  today: string,
  locale: string
): { key: string; x: string; y: number }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const dk = addDaysKey(today, i - 6);
    const y = sessions.filter((s) => s.date === dk).reduce((acc, s) => acc + (s.minutes || 0), 0);
    return { key: dk, x: weekdayShort(dk, locale), y };
  });
}
