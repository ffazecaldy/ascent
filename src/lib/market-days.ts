// ============================================================
// ASCEND — Calendario del mercato (Nasdaq futures / CME).
// Il mercato è chiuso sabato e domenica; il weekend rollover
// (posizioni detenute da venerdì) ricade sul lunedì mattina.
// Semplificazione voluta: NON considera le festività nazionali
// USA (New Year, July 4, Thanksgiving, Natale, ecc.) — quei
// giorni risultano "aperti" anche se il mercato è chiuso.
// ============================================================

import { addDaysKey, dateKey, daysInMonth, parseDateKey } from "@/lib/dates";

/** Giorno della settimana (0=dom … 6=sab) di un day key "yyyy-MM-dd".
 *  Le 12:00 locali evitano l'ambiguità DST sulla mezzanotte. */
function dayOfWeek(dk: string): number {
  const { y, m, d } = parseDateKey(dk);
  return new Date(y, m - 1, d, 12).getDay();
}

/** true se il day key cade lunedì-venerdì (giorno di mercato), false sabato/domenica. */
export function isMarketOpen(dk: string): boolean {
  const dow = dayOfWeek(dk); // 0=dom
  return dow >= 1 && dow <= 5;
}

/** Primo giorno di mercato successivo a `dk` (salta il weekend).
 *  Nota: ignora le festività nazionali USA per semplicità. */
export function nextMarketDay(dk: string): string {
  let cur = addDaysKey(dk, 1);
  while (!isMarketOpen(cur)) cur = addDaysKey(cur, 1);
  return cur;
}

/** Ultimo giorno di mercato precedente a `dk` (speculare, salta il weekend).
 *  Nota: ignora le festività nazionali USA per semplicità. */
export function prevMarketDay(dk: string): string {
  let cur = addDaysKey(dk, -1);
  while (!isMarketOpen(cur)) cur = addDaysKey(cur, -1);
  return cur;
}

/** Numero di giorni di mercato (lun-ven) nel mese "yyyy-MM". */
export function marketDaysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  let count = 0;
  for (let d = 1; d <= daysInMonth(y, m); d++) {
    if (isMarketOpen(dateKey(y, m, d))) count++;
  }
  return count;
}
