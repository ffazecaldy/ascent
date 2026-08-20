// ============================================================
// ASCEND — Export/Backup (spec 7)
// Backup JSON completo + CSV per collezione.
// Nessuna dipendenza: Blob + anchor download + FileReader.
// Tutto gira lato client.
// ============================================================
"use client";

import { loadDB } from "./storage";

export interface CsvOptions {
  /** Separatore di campo (default ";" → compatibilità Excel IT). */
  separator?: string;
  /** Separatore decimale per i numeri esportati (default "," → compatibilità Excel IT). */
  decimalSeparator?: string;
}

/**
 * Converte un numero in stringa CSV: virgola decimale, niente
 * separatori delle migliaia (per restare selezionabile in Excel/Sheets),
 * massimo 6 decimali (niente notazione esponenziale).
 */
export function csvNumber(n: number | null | undefined, decimalSeparator = ","): string {
  if (n == null || !Number.isFinite(n)) return "";
  let s = String(Math.round(n * 1_000_000) / 1_000_000);
  if (decimalSeparator && decimalSeparator !== ".") s = s.replace(".", decimalSeparator);
  return s;
}

function escapeCsv(value: string, separator: string): string {
  const s = String(value ?? "");
  // virgolette se il valore contiene separatore, virgola, virgolette o a-capo
  if (s.includes(separator) || s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * CSV di una collezione.
 * `mapping`: dict colonna → funzione che estrae il valore come STRING.
 * Il separatore è ";" (compatibilità Excel IT); i numeri passano per
 * `csvNumber` nel mapping (virgola decimale) a meno di `options.decimalSeparator`.
 * BOM UTF-8 per apertura corretta in Excel.
 */
export function exportCollectionCsv<T>(
  rows: T[],
  mapping: Record<string, (row: T) => string>,
  options?: CsvOptions
): Blob {
  const separator = options?.separator ?? ";";
  const headers = Object.keys(mapping);
  const lines = [
    headers.join(separator),
    ...rows.map((row) => headers.map((h) => escapeCsv(mapping[h](row), separator)).join(separator)),
  ];
  return new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
}

/** Blob JSON del DB intero (read sincrono da storage). */
export function exportDbBackup(): Blob {
  const db = loadDB();
  return new Blob([JSON.stringify(db, null, 2)], { type: "application/json;charset=utf-8" });
}

/** Trigger download via anchor (nessuna libreria). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
