// ============================================================
// ASCEND — Confini temporali. La timezone di UserSettings è
// l'unica fonte di verità (mai inferita dal browser a ogni sessione,
// mai UTC server). Ogni account di trading ha il proprio confine
// (trading_day_timezone + trading_day_rollover_time).
// ============================================================

import type { TradingAccount } from "./types";

export interface YMD {
  y: number;
  m: number; // 1-12
  d: number;
}

export function dateKey(y: number, m: number, d: number): string {
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

export function parseDateKey(key: string): YMD {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

/** Parte locale di una data ISO in una timezone IANA. */
function partsInTZ(iso: string, timeZone: string): { y: number; m: number; d: number } {
  const dt = new Date(iso);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const p = fmt.formatToParts(dt);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "0";
  return { y: Number(get("year")), m: Number(get("month")), d: Number(get("day")) };
}

function timePartsInTZ(iso: string, timeZone: string): { h: number; min: number } {
  const dt = new Date(iso);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const p = fmt.formatToParts(dt);
  let h = Number(p.find((x) => x.type === "hour")?.value ?? 0);
  const min = Number(p.find((x) => x.type === "minute")?.value ?? 0);
  if (h === 24) h = 0;
  return { h, min };
}

/** "Oggi" nella timezone utente → "yyyy-MM-dd" */
export function todayKey(settingsTimezone: string): string {
  const { y, m, d } = partsInTZ(new Date().toISOString(), settingsTimezone);
  return dateKey(y, m, d);
}

export function nowISOInTZ(): string {
  return new Date().toISOString(); // istante assoluto; la resa locale avviene ovunque via tz
}

/** Converte un ISO datetime in un day key "yyyy-MM-dd" nella timezone data. */
export function isoToDayKey(iso: string, timeZone: string): string {
  const { y, m, d } = partsInTZ(iso, timeZone);
  return dateKey(y, m, d);
}

/** Day key di oggi in una data timezone qualsiasi. */
export function dayKeyNow(tz: string): string {
  return isoToDayKey(new Date().toISOString(), tz);
}

/** yyyy-MM-dd locale (timezone del browser) di una data passata come Date o ISO. */
export function localDayKey(iso: string): string {
  const dt = new Date(iso);
  return dateKey(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

/** Sposta un day key di N giorni (±). */
export function addDaysKey(key: string, n: number): string {
  const { y, m, d } = parseDateKey(key);
  const dt = new Date(y, m - 1, d + n);
  return dateKey(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

export function monthKeyOf(key: string): string {
  const { y, m } = parseDateKey(key);
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Inizio settimana (day key) del giorno `key`, con settimana che parte da weekStart (0=dom,1=lun...). */
export function weekStartKey(key: string, weekStart: number): string {
  const { y, m, d } = parseDateKey(key);
  const dow = new Date(y, m - 1, d).getDay(); // 0=dom
  const diff = (dow - weekStart + 7) % 7;
  return addDaysKey(key, -diff);
}

export function weekOf(key: string, weekStart: number): string {
  const ws = weekStartKey(key, weekStart);
  return `${ws}|${ws.slice(5)}`; // riutilizza semplicemente l'inizio settimana
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Converte un ISO datetime in un trading day key secondo il confine dell'account.
 *  Trading day: inizia a `rollover HH:MM` nel fuso dell'account, finisce al rollover successivo.
 *  Es. rollover 17:00 America/Chicago → il trading day che contiene le 12:00 di mar 5 è quello
 *  di mar 5 (dalle 17:00 di lun 4); le 18:00 di mar 5 appartengono al trading day di mer 6.
 *  Se l'account non dichiara una timezone di trading, si usa il fallback della timezone
 *  impostata nelle settings (parametro opzionale; default "UTC" per compatibilità coi
 *  chiamanti storici).
 */
export function tradingDayKey(
  iso: string,
  account: TradingAccount,
  settingsTimezone: string = "UTC"
): string {
  const tz = account.tradingDayTimezone || settingsTimezone || "UTC";
  // Data SENZA ora (es. import "2026-08-24"): è già un day key dichiarato —
  // niente conversione di timezone né rollover (altrimenti scivolerebbe al
  // giorno prima/mezzanotte UTC).
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const { y, m, d } = partsInTZ(iso, tz);
  const { h, min } = timePartsInTZ(iso, tz);
  const roll = timeToMinutes(account.tradingDayRolloverTime || "00:00");
  const nowMin = h * 60 + min;
    // Sessione col rollover attivo: la fascia [roll …) è del trading day SUCCESSIVO
    // (doc: "le 18:00 di mar 5 appartengono al trading day di mer 6").
    // Con rollover non impostato ("00:00") nessun confine: il giorno è quello del fuso.
  if (roll > 0 && nowMin >= roll) {
      const dt = new Date(y, m - 1, d + 1);
      return dateKey(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
    }
    return dateKey(y, m, d);
  }

/** Range di day key per una month key "yyyy-MM". */
export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = dateKey(y, m, 1);
  const end = dateKey(y, m, daysInMonth(y, m));
  return { start, end };
}

export function labelDayKey(key: string, locale: string = "it-IT"): string {
  const { y, m, d } = parseDateKey(key);
  return new Date(y, m - 1, d).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
