// ============================================================
// ASCEND — Sport Zone · metadati discipline
// Preset del wizard, mapping icone SVG e colori stabili.
// Condiviso da SportSetupWizard / SportReminderCard / pagina /sport.
// ============================================================

import type { IconName } from "@/components/ui/Icon";

export interface SportPreset {
  name: string;
  icon: IconName;
  /** colore hex per badge/accanti — palette coerente col tema */
  color: string;
}

/** Preset multipli dello step 1 del wizard + "Altro" (campo libero). */
export const SPORT_PRESETS: SportPreset[] = [
  { name: "Palestra", icon: "dumbbell", color: "#4C7EFF" },
  { name: "Calistenia", icon: "activity", color: "#8A6BFF" },
  { name: "Corsa", icon: "run", color: "#2FD4FF" },
  { name: "Ciclismo", icon: "zap", color: "#22c55e" },
  { name: "Nuoto", icon: "activity", color: "#06b6d4" },
  { name: "Calcio", icon: "target", color: "#f0b429" },
  { name: "Tennis", icon: "target", color: "#ec4899" },
  { name: "Boxe", icon: "flame", color: "#f97316" },
  { name: "Yoga", icon: "heart", color: "#a78bfa" },
  { name: "Escursionismo", icon: "compass", color: "#34d399" },
];

/** Icona per una disciplina: preset noto → sua icona, altrimenti fallback. */
export function sportIconFor(name: string): IconName {
  const p = SPORT_PRESETS.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
  if (p) return p.icon;
  return "dumbbell";
}

/** Colore stabile per una disciplina (hash semplice, come per i tipi workout). */
const FALLBACK_COLORS = ["#4C7EFF", "#8A6BFF", "#2FD4FF", "#22c55e", "#f0b429", "#ec4899", "#06b6d4", "#f97316"];

export function sportColorFor(name: string): string {
  const p = SPORT_PRESETS.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
  if (p) return p.color;
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FALLBACK_COLORS[h % FALLBACK_COLORS.length];
}

/** Etichette brevi dei giorni in ordine getDay(): 0=Dom..6=Sab. */
export const WEEKDAY_LABELS = ["D", "L", "M", "M", "G", "V", "S"] as const;

/** Etichetta lunga (per tooltip/aria): "Domenica".. "Sabato". */
export const WEEKDAY_LONG = [
  "Domenica",
  "Lunedì",
  "Martedì",
  "Mercoledì",
  "Giovedì",
  "Venerdì",
  "Sabato",
] as const;

/**
 * Giorni in ordine calendario Lun→Dom (utile per la UI).
 * Ritorna le coppie [getDay index, label breve].
 */
export function weekdayOrder(): { dow: number; label: string; long: string }[] {
  // lunedì=1..sabato=6, domenica=0
  return [1, 2, 3, 4, 5, 6, 0].map((dow) => ({
    dow,
    label: WEEKDAY_LABELS[dow],
    long: WEEKDAY_LONG[dow],
  }));
}
