// ============================================================
// ASCEND — Calendario del mercato (Nasdaq futures / CME).
// Il mercato è chiuso sabato e domenica; il weekend rollover
// (posizioni detenute da venerdì) ricade sul lunedì mattina.
// Festività USA incluse (calcolo anno-based, niente tabella da
// mantenere): New Year, MLK Day, Washington's Birthday, Good
// Friday, Memorial Day, Juneteenth, July 4th, Labor Day,
// Thanksgiving, Christmas + chiusure anticipate (1pm ET) del
// 3 luglio e del giorno dopo Thanksgiving. Nota: le chiusure
// anticipate restano "aperte" (si tradano fino alle 13).
// ============================================================

import { addDaysKey, dateKey, daysInMonth, parseDateKey } from "@/lib/dates";

/** Giorno della settimana (0=dom … 6=sab) di un day key "yyyy-MM-dd".
 *  Le 12:00 locali evitano l'ambiguità DST sulla mezzanotte. */
function dayOfWeek(dk: string): number {
  const { y, m, d } = parseDateKey(dk);
  return new Date(y, m - 1, d, 12).getDay();
}

/** N-esimo giorno della settimana nel mese (nth=1..5): es. 3° lunedì di gennaio. */
function nthWeekdayOfMonth(y: number, m: number, dow: number, nth: number): string {
  const first = new Date(y, m - 1, 1, 12);
  const shift = (dow - first.getDay() + 7) % 7;
  return dateKey(y, m, 1 + shift + (nth - 1) * 7);
}

/** Ultimo giorno della settimana nel mese: es. ultimo lunedì di maggio. */
function lastWeekdayOfMonth(y: number, m: number, dow: number): string {
  const dim = daysInMonth(y, m);
  const last = new Date(y, m - 1, dim, 12);
  const back = (last.getDay() - dow + 7) % 7;
  return dateKey(y, m, dim - back);
}

/** Pasqua (algoritmo di Gauss) → day key. Serve per il Venerdì Santo. */
function easter(y: number): string {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return dateKey(y, month, day);
}

/** Festività NYSE/CME (mercato CHIUSO tutto il giorno), year-based. */
export function usMarketHolidays(year: number): Set<string> {
  const e = easter(year);
  const goodFriday = addDaysKey(e, -2);
  // Juneteenth/July 4/Natale: se cadono sabato → venerdì prima; domenica → lunedì dopo.
  const observed = (m: number, d: number): string => {
    const { y } = parseDateKey(dateKey(year, m, d));
    const dow = new Date(y, m - 1, d, 12).getDay();
    if (dow === 0) return dateKey(year, m, d + 1); // domenica → lunedì
    if (dow === 6) return dateKey(year, m, d - 1); // sabato → venerdì
    return dateKey(year, m, d);
  };
  return new Set([
    observed(1, 1), // New Year's Day
    nthWeekdayOfMonth(year, 1, 1, 3), // MLK Day — 3° lunedì di gennaio
    nthWeekdayOfMonth(year, 2, 1, 3), // Washington's Birthday — 3° lunedì di febbraio
    goodFriday, // Good Friday
    lastWeekdayOfMonth(year, 5, 1), // Memorial Day — ultimo lunedì di maggio
    observed(6, 19), // Juneteenth
    observed(7, 4), // Independence Day
    nthWeekdayOfMonth(year, 9, 1, 1), // Labor Day — 1° lunedì di settembre
    nthWeekdayOfMonth(year, 11, 4, 4), // Thanksgiving — 4° giovedì di novembre
    observed(12, 25), // Christmas
  ]);
}

/** Chiusure ANTICIPATE (aperto solo fino alle 13 ET): 3 luglio e post-Thanksgiving. */
export function earlyCloses(year: number): Set<string> {
  const thanksgiving = nthWeekdayOfMonth(year, 11, 4, 4);
  return new Set([dateKey(year, 7, 3), addDaysKey(thanksgiving, 1)]);
}

/** true se il day key cade lunedì-venerdì E non è festività USA. */
export function isMarketOpen(dk: string): boolean {
  if (!isWeekday(dk)) return false;
  const { y } = parseDateKey(dk);
  return !usMarketHolidays(y).has(dk);
}

function isWeekday(dk: string): boolean {
  const dow = dayOfWeek(dk); // 0=dom
  return dow >= 1 && dow <= 5;
}

/** true se il giorno è di mercato ma con chiusura anticipata (13 ET). */
export function isEarlyClose(dk: string): boolean {
  if (!isMarketOpen(dk)) return false;
  const { y } = parseDateKey(dk);
  return earlyCloses(y).has(dk);
}

/** Primo giorno di mercato successivo a `dk` (salta weekend e festività USA). */
export function nextMarketDay(dk: string): string {
  let cur = addDaysKey(dk, 1);
  while (!isMarketOpen(cur)) cur = addDaysKey(cur, 1);
  return cur;
}

/** Ultimo giorno di mercato precedente a `dk` (speculare, salta weekend/festività). */
export function prevMarketDay(dk: string): string {
  let cur = addDaysKey(dk, -1);
  while (!isMarketOpen(cur)) cur = addDaysKey(cur, -1);
  return cur;
}

/** Numero di giorni di mercato effettivi (lun-ven meno festività USA) nel mese "yyyy-MM". */
export function marketDaysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  let count = 0;
  for (let d = 1; d <= daysInMonth(y, m); d++) {
    const dk = dateKey(y, m, d);
    if (isMarketOpen(dk)) count++;
  }
  return count;
}
