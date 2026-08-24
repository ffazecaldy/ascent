// ============================================================
// ASCEND — Import storico trade da CSV (spec v3 §4.3 · subagent 8)
// Parser compatibile con export Edgewonk / Tradervue / myfundedbook /
// TradingView / stampa piattaforma generica.
// Colle intestazione riconosciute case-insensitive con match fuzzy
// include() (separatori ; , o tab). Mai bloccare le righe valide:
// le righe problematiche vengono scartate con warning/errore.
// Multiplier/ContractSize (colonna opzionale) e defaultMultiplier: per i
// futures P/L e R = (exit-entry)*size*moltiplicatore (es. NQ=20, ES=50;
// default 1 per azioni/forex).
// ============================================================

import type { TradeDirection } from "./types";

export interface ImportCsvOptions {
  separator?: "auto" | ";" | "," | "\t";
  hasHeader?: boolean;
  defaultMultiplier?: number; // moltiplicatore contrattuale quando la colonna Multiplier manca (futures; default 1)
}

export interface ParseRowIssue {
  rowIndex: number; // 1-based (riga dati, escluso header)
  line: number; // riga fisica nel file
  message: string;
  severity: "error" | "warning";
}

export interface ParseMeta {
  separator: string;
  columnCount: number;
  columns: string[]; // intestazioni (o posizioni se senza header)
  recognized: string[]; // normalizzate, riconosciute
  unknown: string[]; // non riconosciute (formato non supportato)
}

export interface ParsedTradeRow {
  rowIndex: number;
  line: number;
  instrument?: string;
  direction?: TradeDirection;
  entry?: number | null;
  exit?: number | null;
  stop?: number | null;
  target?: number | null;
  size?: number | null;
  multiplier?: number | null; // moltiplicatore contrattuale applicato (default 1)
  resultNative?: number | null; // valuta nativa account
  resultR?: number | null;
  rEstimated: boolean; // R stimato (colonna R assente)
  pnlComputed: boolean; // P/L derivato da entry/exit (colonna assente/illeggibile)
  openDate?: string; // ISO
  closeDate?: string; // ISO
  notes?: string;
  setup?: string;
  dedupKey: string; // closeDate(minuto)|strumento|P/L nativo — per re-import
  duplicate: boolean; // duplicato di un'altra riga dello stesso file
  issues: ParseRowIssue[];
}

export interface ParseResult {
  meta: ParseMeta;
  rows: ParsedTradeRow[]; // righe valide pronte per l'import
  errors: ParseRowIssue[]; // errori (righe scartate)
  skipped: number;
  valid: number;
  duplicateCount: number; // righe duplicate nel file (non bloccanti)
  multiLineNoteCount: number; // righe fisiche unite (note multilinea), conservate
}

// ------------------------------------------------------------
// Normalizzazione
// ------------------------------------------------------------
const norm = (h: string): string => h.toLowerCase().replace(/[^a-z0-9]/g, "");

type Slot =
  | "closeDT"
  | "openDT"
  | "closeDate"
  | "openDate"
  | "closeTime"
  | "openTime"
  | "target"
  | "stop"
  | "exit"
  | "entry"
  | "size"
  | "multiplier"
  | "resultR"
  | "result"
  | "instrument"
  | "direction"
  | "setup"
  | "notes";

// Ordine di valutazione (priorità): i match specifici prima di quelli generici.
const SLOT_TESTS: [Slot, (h: string) => boolean][] = [
  ["closeDT", (h) => (h.includes("exitdatetime") || h.includes("closedatetime"))],
  ["openDT", (h) => (h.includes("datetime") || h.includes("dateandtime") || h.includes("timestamp")) && !h.includes("exit") && !h.includes("close")],
  ["closeDate", (h) => h.includes("closedate") || h.includes("dateclose") || h.includes("exitdate") || h.includes("dateexit") || h.includes("enddate") || h.includes("dateend") || h.includes("dateclosed") || h.includes("dateexited")],
  ["openDate", (h) => h === "date" || h.includes("opendate") || h.includes("dateopen") || h.includes("entrydate") || h.includes("dateentry") || h.includes("startdate") || h.includes("datestart") || h.includes("tradedate") || h.includes("executiondate") || h.includes("dateexecuted") || h.includes("dateopened") || h.includes("openingdate")],
  ["closeTime", (h) => h.includes("closetime") || h.includes("timeclose") || h.includes("exittime") || h.includes("timeexit") || h.includes("endtime") || h.includes("closedtime")],
  ["openTime", (h) => h === "time" || h.includes("opentime") || h.includes("timeopen") || h.includes("entrytime") || h.includes("timeentry") || h.includes("starttime") || h.includes("timestart")],
  ["target", (h) => h.includes("target") || h.includes("takeprofit") || h === "tp" || h.includes("profitprice")],
  ["stop", (h) => h.includes("stop") || h === "sl" || h.includes("stoplevel") || h.includes("initialstop") || h.includes("initialsl")],
  ["exit", (h) => h === "close" || h.includes("exit") || h.includes("closeprice") || h.includes("closingprice") || h.includes("lastprice") || h.includes("endprice") || h.includes("finalprice")],
  ["entry", (h) => h.includes("entry") || h.includes("openprice") || h.includes("openingprice") || h.includes("fillprice") || h.includes("avgprice") || h.includes("averageprice") || h === "price" || h.includes("price") && !h.includes("last")],
  ["multiplier", (h) => h.includes("multiplier") || h.includes("moltiplicatore") || h.includes("multiplicador") || h.includes("contractsize") || h.includes("contractvalue") || h.includes("pointvalue") || h.includes("tickvalue") || h.includes("pipvalue")],
  ["size", (h) => h.includes("lots") || h.includes("size") || h.includes("quantity") || h.includes("qty") || h.includes("shares") || h.includes("units") || h.includes("contracts") || h.includes("positionsize")],
  ["resultR", (h) => h === "r" || h === "rr" || h.includes("rmultiple") || h.includes("rmultiples") || h.includes("resultr") || (h.includes("multiple") && h.includes("r"))],
  ["result", (h) => h.includes("pnl") || h.includes("pl") || h.includes("profit") || h.includes("result") || h.includes("net") || h.includes("realized") || h.includes("loss") || h.includes("gain") || h.includes("outcome")],
  ["instrument", (h) => h.includes("symbol") || h.includes("instrument") || h.includes("ticker") || h.includes("pair") || h.includes("market") || h.includes("asset") || h.includes("coin") || h.includes("future") || h.includes("stock")],
  ["direction", (h) => h.includes("side") || h.includes("direction") || h.includes("long") || h.includes("short") || h.includes("position") || h.includes("action") || h.includes("buy") || h.includes("sell") || h.includes("l s")],
  ["setup", (h) => h.includes("setup") || h.includes("playbook") || h.includes("strategy") || h.includes("system") || h.includes("template") || h.includes("edge") || h.includes("category") || h.includes("tag") || h.includes("pattern") || h.includes("formation")],
  ["notes", (h) => h.includes("notes") || h.includes("note") || h.includes("comment") || h.includes("remark") || h.includes("description") || h.includes("journal") || h.includes("reason") || h.includes("ideas") || h.includes("thoughts") || h.includes("reflection") || h.includes("lessons") || h.includes("summary")],
];

// Ordine colonna "canonico" quando il file NON ha header.
const DEFAULT_COLUMNS: { key: string; label: string; slot?: Slot }[] = [
  { key: "date", label: "Data/Time", slot: "openDT" },
  { key: "instrument", label: "Instrument", slot: "instrument" },
  { key: "direction", label: "Direzione", slot: "direction" },
  { key: "entry", label: "Entry", slot: "entry" },
  { key: "exit", label: "Exit", slot: "exit" },
  { key: "stop", label: "Stop Loss", slot: "stop" },
  { key: "target", label: "Take Profit", slot: "target" },
  { key: "size", label: "Size", slot: "size" },
  { key: "pnl", label: "P/L", slot: "result" },
  { key: "r", label: "R", slot: "resultR" },
  { key: "notes", label: "Notes", slot: "notes" },
  { key: "multiplier", label: "Multiplier", slot: "multiplier" },
];

// ------------------------------------------------------------
// Numeri: "$-1,234.56", "€2.345,67", "(123,45)", "1.23456" (forex)
// ------------------------------------------------------------
export function parseNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  let sign = 1;
  if (s.startsWith("(") && s.endsWith(")")) {
    sign = -1;
    s = s.slice(1, -1);
  }
  // rimuove valute e spazi (es. "$ 1.23", "€-45", "CHF 120")
  s = s.replace(/[$€£¥\s]/g, "");
  if (s.startsWith("-")) {
    sign *= -1;
    s = s.slice(1);
  }
  if (s.startsWith("+")) s = s.slice(1);
  if (!s) return null;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    // "12,5" → decimale; "1,000" → migliaia
    if (/,(\\d{1,2})$/.test(s)) s = s.replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (hasDot) {
    const after = s.length - s.lastIndexOf(".") - 1;
    const before = s.lastIndexOf(".");
    if (after >= 1 && after <= 2) {
      // decimale
    } else if (after === 3) {
      // ambiguità: "1.234" m VS "1.234" migliaia — le cifre intere corte sono prezzi
      if (before <= 3) {
        /* prezzo a 3 decimali */
      } else {
        s = s.replace(/\./g, "");
      }
    } else {
      s = s.replace(/\./g, "");
    }
  }

  const n = parseFloat(s);
  return isFinite(n) ? n * sign : null;
}

// ------------------------------------------------------------
// Date: "2020-01-02 09:30:00", "1/2/2020", "02.01.2020 9:30 AM", "01/02/2020"
// ------------------------------------------------------------
interface DParts {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
  ss: number;
  hasTime: boolean;
  ambiguous?: boolean;
}

function adj12(h: number, ampm: string | undefined): number {
  if (!ampm) return h;
  const a = ampm.toLowerCase();
  if (a === "pm" && h < 12) return h + 12;
  if (a === "am" && h === 12) return 0;
  return h;
}

function validDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function parseDateTime(raw: string): DParts | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  let m = s.match(
    /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?/
  );
  if (m) {
    const y = +m[1];
    const mo = +m[2];
    const d = +m[3];
    if (!validDate(y, mo, d)) return null;
    const hasTime = !!m[4];
    return {
      y,
      m: mo,
      d,
      hh: hasTime ? adj12(+m[4], m[7]) : 9,
      mm: hasTime ? +m[5] : 0,
      ss: hasTime && m[6] ? +m[6] : 0,
      hasTime,
    };
  }

  m = s.match(
    /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?/
  );
  if (m) {
    const a = +m[1];
    const b = +m[2];
    let yy = +m[3];
    if (yy < 100) yy += 2000;
    let mo: number;
    let d: number;
    let ambiguous = false;
    if (a > 12 && b <= 12) {
      d = a;
      mo = b; // DD/MM/YYYY
    } else if (b > 12 && a <= 12) {
      d = b;
      mo = a; // MM/DD/YYYY
    } else if (a <= 12 && b <= 12) {
      mo = a;
      d = b; // default M/D/Y (Edgewonk/Tradervue); ambiguo
      ambiguous = true;
    } else {
      return null;
    }
    if (!validDate(yy, mo, d)) return null;
    const hasTime = !!m[4];
    return {
      y: yy,
      m: mo,
      d,
      hh: hasTime ? adj12(+m[4], m[7]) : 9,
      mm: hasTime ? +m[5] : 0,
      ss: hasTime && m[6] ? +m[6] : 0,
      hasTime,
      ambiguous,
    };
  }
  return null;
}

function parseTimeOnly(raw: string): { hh: number; mm: number; ss: number } | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/);
  if (!m) return null;
  const hh = adj12(+m[1], m[4]);
  if (hh > 23 || +m[2] > 59) return null;
  return { hh, mm: +m[2], ss: m[3] ? +m[3] : 0 };
}

function isoFromParts(p: { y: number; m: number; d: number; hh?: number; mm?: number; ss?: number }): string | null {
  const dt = new Date(p.y, p.m - 1, p.d, p.hh ?? 9, p.mm ?? 0, p.ss ?? 0);
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function parseDirection(raw: string): TradeDirection | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  const n = Number(s);
  if (!isNaN(n)) return n >= 0 ? "long" : "short";
  if (s === "buy" || s === "long" || s === "b" || s === "l" || s.includes("buy") || s.includes("long") || s.includes("compra")) return "long";
  if (s === "sell" || s === "short" || s === "s" || s === "sh" || s.includes("sell") || s.includes("short") || s.includes("vendi")) return "short";
  return null;
}

// P/L derivato: (exit-entry)*size*moltiplicatore * segno(direzione)
function computePnl(
  dir: TradeDirection,
  entry: number | null | undefined,
  exit: number | null | undefined,
  size: number | null | undefined,
  multiplier?: number | null
): number | null {
  if (dir !== "long" && dir !== "short") return null;
  if (entry == null || exit == null) return null;
  const mult = size != null && size > 0 ? size : 1;
  const cmult = multiplier != null && multiplier > 0 ? multiplier : 1;
  const diff = (exit - entry) * (dir === "long" ? 1 : -1);
  return isFinite(diff * mult * cmult) ? diff * mult * cmult : null;
}

// ------------------------------------------------------------
// Splitting file (quote-aware, separatori ; , tab)
// ------------------------------------------------------------
function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (c === sep && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

function detectSeparator(headerLine: string): string {
  let comma = 0;
  let semicolon = 0;
  let tab = 0;
  let inQ = false;
  for (let i = 0; i < headerLine.length; i++) {
    const c = headerLine[i];
    if (c === '"') inQ = !inQ;
    if (inQ) continue;
    if (c === ",") comma++;
    else if (c === ";") semicolon++;
    else if (c === "\t") tab++;
  }
  if (semicolon > comma && semicolon >= tab) return ";";
  if (tab > comma && tab > semicolon) return "\t";
  return ",";
}

function isBlankRow(cells: string[]): boolean {
  return cells.every((c) => !c.trim());
}

// ------------------------------------------------------------
// Dedup re-import: chiave (accountId +) closeDate|strumento|P/L nativo.
// Le date vengono normalizzate al minuto: due export dello stesso trade
// con secondi/fusi diversi generano la stessa chiave.
// ------------------------------------------------------------
export function normalizeDateKey(iso: string): string {
  return (iso || "").slice(0, 16); // "YYYY-MM-DDTHH:mm"
}

function rowDedupKey(closeDate: string, instrument: string, resultNative: number | null | undefined): string {
  return `${normalizeDateKey(closeDate)}|${String(instrument ?? "")}|${resultNative ?? ""}`;
}

/** Chiave completa usata dalla pagina di import per confrontare i trade già in archivio. */
export function tradeDedupKey(
  accountId: string,
  closeDate: string,
  instrument: string,
  resultNative: number | null | undefined
): string {
  return `${accountId}|${rowDedupKey(closeDate, instrument, resultNative)}`;
}

// Radici ticker futures comuni (indici, energy, metalli, tassi, forex 6X…)
// + eventuale suffisso mese/anno (es. NQZ4, ESM24). Euristico: genera solo un warning.
function looksLikeFuture(instrument: string): boolean {
  const s = String(instrument ?? "").trim().toUpperCase();
  if (!s) return false;
  return /^(NQ|MNQ|ES|MES|YM|MYM|RTY|M2K|GC|MGC|SI|NG|CL|MCL|RB|HO|ZB|ZN|ZF|ZT|ZS|ZW|ZC|6[A-Z]|FD[A-Z]|FGB[A-Z]|FESX|FDAX|BUND|DAX|CAC|N225|NIKKEI|VIX|VX|MSCI|STXE)\d*([FGHJKMNQUVXZ]\d{1,2})?$/.test(s);
}

// ------------------------------------------------------------
// Riga fisica con virgolette aperte → unisci alla successiva
// (campi multilinea: note/descrizioni). Ritorna anche le righe
// unite (1-based, fisiche) per segnalarle come issue.
// ------------------------------------------------------------
interface JoinedSpan {
  start: number;
  end: number;
}

function joinMultilineQuoted(trimmed: string[]): { lines: string[]; joined: Map<number, JoinedSpan> } {
  const lines: string[] = [];
  const joined = new Map<number, JoinedSpan>();
  let cur = "";
  let curStart = 0;
  let inQ = false;
  for (let i = 0; i < trimmed.length; i++) {
    const l = trimmed[i];
    if (cur === "") curStart = i;
    cur = cur === "" ? l : cur + "\n" + l;
    for (let j = 0; j < l.length; j++) {
      const c = l[j];
      if (c === '"') {
        if (inQ && l[j + 1] === '"') j++;
        else inQ = !inQ;
      }
    }
    if (!inQ) {
      if (i > curStart) joined.set(lines.length, { start: curStart + 1, end: i + 1 });
      lines.push(cur);
      cur = "";
    }
  }
  if (cur !== "") {
    const lastIdx = trimmed.length - 1;
    if (lastIdx > curStart) joined.set(lines.length, { start: curStart + 1, end: lastIdx + 1 });
    lines.push(cur);
  }
  return { lines, joined };
}

// ------------------------------------------------------------
// Parser principale
// ------------------------------------------------------------
export function parseTradesCsv(text: string, opts?: ImportCsvOptions): ParseResult {
  const o = {
    separator: opts?.separator ?? "auto",
    hasHeader: opts?.hasHeader ?? true,
    defaultMultiplier: opts?.defaultMultiplier,
  };
  const dm = o.defaultMultiplier;
  const defMult = dm != null && dm > 0 ? dm : 1;

  const rawLines = String(text ?? "")
    .replace(/^\uFEFF/, "")
    .split(/\r\n|\r|\n/);
  // unione righe fisiche con virgolette aperte (note multilinea)
  const { lines, joined } = joinMultilineQuoted(rawLines.map((l) => l.trimEnd()));

  // --- separatore ---
  const firstContentIdx = lines.findIndex((l) => l.trim().length > 0);
  let sep: string;
  if (o.separator === "auto") {
    sep = firstContentIdx >= 0 ? detectSeparator(lines[firstContentIdx]) : ",";
  } else {
    sep = o.separator === "\t" ? "\t" : o.separator;
  }

  // --- header / colonne ---
  let headerRow: string[] | null = null;
  let columnSlots: (Slot | undefined)[] = [];
  let columns: string[] = [];
  let headerLineNo = 0;
  let dataStartLine = 0;

  if (o.hasHeader) {
    for (let i = 0; i < lines.length; i++) {
      const cells = splitLine(lines[i], sep);
      if (cells.length >= 1 && cells.some((c) => c.trim().length > 0)) {
        headerRow = cells;
        headerLineNo = i + 1;
        break;
      }
    }
    columns = headerRow ?? [];
    if (headerRow) {
      columnSlots = headerRow.map((h) => {
        const hh = norm(h);
        if (!hh) return undefined;
        for (const [slot, test] of SLOT_TESTS) {
          if (test(hh)) return slot;
        }
        return undefined;
      });
    }
    dataStartLine = headerLineNo; // prima linea dati
  } else {
    columns = DEFAULT_COLUMNS.map((c) => c.label);
    columnSlots = DEFAULT_COLUMNS.map((c) => c.slot);
    dataStartLine = 0;
  }

  const recognized: string[] = [];
  const unknown: string[] = [];
  columns.forEach((c, i) => {
    if (columnSlots[i]) recognized.push(norm(c));
    else if (c.trim()) unknown.push(c.trim());
  });

  const meta: ParseMeta = {
    separator: sep === "\t" ? "tab" : sep,
    columnCount: columns.length,
    columns,
    recognized,
    unknown,
  };

  const errors: ParseRowIssue[] = [];
  const rows: ParsedTradeRow[] = [];
  let skipped = 0;
  let dataRowIndex = 0;
  let duplicateCount = 0;
  let multiLineNoteCount = 0;
  const seenKeys = new Map<string, number>();

  const cellAt = (cells: string[], slot: Slot | undefined): { idx: number; value: string } => {
    // ritorna il primo valore non vuoto tra tutte le colonne mappate allo slot
    for (let i = 0; i < cells.length; i++) {
      if (columnSlots[i] === slot && cells[i].trim()) {
        return { idx: i, value: cells[i].trim() };
      }
    }
    return { idx: -1, value: "" };
  };

  for (let i = dataStartLine; i < lines.length; i++) {
    if (!lines[i].trim()) {
      dataRowIndex++; // vuota: contata per allineare rowIndex alla numerazione dati
      continue;
    }
    dataRowIndex++;
    const lineNo = i + 1;
    const cells = splitLine(lines[i], sep);
    if (cells.length <= 1 && !cells[0]) continue;
    if (isBlankRow(cells)) continue;

    const issues: ParseRowIssue[] = [];
    const addIssue = (severity: "error" | "warning", message: string) =>
      issues.push({ rowIndex: dataRowIndex, line: lineNo, message, severity });

    const joinedGrp = joined.get(i);
    if (joinedGrp) {
      multiLineNoteCount++;
      addIssue("warning", `Nota multilinea (righe fisiche ${joinedGrp.start}–${joinedGrp.end}): contenuto conservato per intero`);
    }

    // --- direzione ---
    const dirCell = cellAt(cells, "direction");
    const direction = dirCell.value ? parseDirection(dirCell.value) : null;
    if (!direction) {
      addIssue("error", "Direzione non riconosciuta" + (dirCell.value ? ` (“${dirCell.value}”)` : " (nessuna colonna Buy/Sell o Side)"));
    }

    // --- strumento ---
    const instCell = cellAt(cells, "instrument");
    const instrument = instCell.value || undefined;
    if (!instrument) addIssue("error", "Strumento mancante (colonna Symbol/Instrument)");

    // --- numeri opzionali ---
    const num = (slot: Slot): { v: number | null; ok: boolean; raw?: string } => {
      const c = cellAt(cells, slot);
      if (!c.value) return { v: null, ok: true };
      const n = parseNumber(c.value);
      if (n === null) {
        addIssue("warning", `Valore non numerico in ${slot}: “${c.value}” (ignorato)`);
        return { v: null, ok: false, raw: c.value };
      }
      return { v: n, ok: true };
    };

    const entry = num("entry");
    const exit = num("exit");
    const stop = num("stop");
    const target = num("target");
    const size = num("size");

    // --- moltiplicatore contrattuale (futures) ---
    const multCell = cellAt(cells, "multiplier");
    let multiplier: number | null = null;
    if (multCell.value) {
      const n = parseNumber(multCell.value);
      if (n !== null && n > 0) multiplier = n;
      else addIssue("warning", `Moltiplicatore “${multCell.value}” non valido: uso il predefinito (${defMult})`);
    }
    const effMult = multiplier ?? defMult;

    // --- P/L ---
    const resCell = cellAt(cells, "result");
    let resultNative: number | null = null;
    let pnlComputed = false;
    if (resCell.value) {
      const n = parseNumber(resCell.value);
      if (n !== null) {
        resultNative = n;
      } else {
        addIssue("warning", `P/L non riconosciuto “${resCell.value}”: provo a calcolarlo da Entry/Exit`);
        resultNative = direction ? computePnl(direction, entry.v, exit.v, size.v, effMult) : null;
        pnlComputed = resultNative != null;
        if (pnlComputed) addIssue("warning", "P/L calcolato da Entry/Exit/Size/Moltiplicatore (valore originale non numerico)");
      }
    } else if (direction && entry.v != null && exit.v != null) {
      resultNative = computePnl(direction, entry.v, exit.v, size.v, effMult);
      pnlComputed = resultNative != null;
      if (pnlComputed) addIssue("warning", "P/L assente: calcolato da Entry/Exit/Size/Moltiplicatore");
    }
    if (pnlComputed && multiplier == null && defMult === 1 && instrument && looksLikeFuture(instrument)) {
      addIssue("warning", `Strumento “${instrument}” sembra un future: P/L calcolato con moltiplicatore 1. Aggiungi la colonna Multiplier (es. NQ=20, ES=50) o imposta il moltiplicatore predefinito.`);
    }
    if (resultNative == null) addIssue("error", "P/L mancante o non calcolabile (serve una colonna P/L/Result o Entry+Exit+Size)");

    // --- R ---
    const rCell = cellAt(cells, "resultR");
    let resultR: number | null = null;
    let rEstimated = false;
    if (rCell.value) {
      const n = parseNumber(rCell.value);
      if (n !== null) resultR = n;
      else addIssue("warning", `R Multiple non numerico “${rCell.value}”: lo stimo da Entry/Stop`);
    }
    if (resultR == null) {
      // stima: resultNative / (|entry-stop| * size * moltiplicatore)
      if (resultNative != null && entry.v != null && stop.v != null) {
        const riskPerUnit = Math.abs(entry.v - stop.v);
        const risk = riskPerUnit * (size.v && size.v > 0 ? size.v : 1) * (multiplier ?? defMult);
        if (risk > 0) {
          resultR = resultNative / risk;
          rEstimated = !rCell.value;
        } else {
          resultR = 0;
          addIssue("warning", "R non stimabile (Entry=Stop o Size=0): impostato a 0");
        }
        if (!rCell.value) addIssue("warning", "R stimato da Entry/Stop/Size/Moltiplicatore (colonna R assente)");
      } else {
        resultR = 0;
        if (!rCell.value) addIssue("warning", "R assente e non stimabile (manca Entry/Stop): impostato a 0");
      }
    }

    // --- date ---
    const openCell = cellAt(cells, "openDT").value || cellAt(cells, "openDate").value;
    const closeCell = cellAt(cells, "closeDT").value || cellAt(cells, "closeDate").value;
    const openTimeCell = cellAt(cells, "openTime").value;
    const closeTimeCell = cellAt(cells, "closeTime").value;

    const openParts = openCell ? parseDateTime(openCell) : null;
    const closeParts = closeCell ? parseDateTime(closeCell) : openParts;

    if (openParts?.ambiguous) addIssue("warning", "Data ambigua interpretata come M/G/A — verifica in anteprima");
    if (closeParts?.ambiguous) addIssue("warning", "Data uscita ambigua interpretata come M/G/A — verifica in anteprima");

    const openTime = openTimeCell ? parseTimeOnly(openTimeCell) : null;
    const closeTime = closeTimeCell ? parseTimeOnly(closeTimeCell) : null;

    const openISO = openParts
      ? isoFromParts({
          y: openParts.y,
          m: openParts.m,
          d: openParts.d,
          hh: openTime?.hh ?? openParts.hh,
          mm: openTime?.mm ?? openParts.mm,
          ss: openTime?.ss ?? openParts.ss,
        })
      : null;
    const closeISO =
      closeParts !== openParts && closeParts
        ? isoFromParts({
            y: closeParts.y,
            m: closeParts.m,
            d: closeParts.d,
            hh: closeTime?.hh ?? closeParts.hh,
            mm: closeTime?.mm ?? closeParts.mm,
            ss: closeTime?.ss ?? closeParts.ss,
          })
        : openISO;

    if (!openParts) addIssue("error", "Data apertura mancante o non riconosciuta");
    else if (!closeISO) addIssue("error", "Data uscita non valida");

    // fallback spec: unica data → openData = closeData alle 09:00
    let usedFallback = false;
    const finalOpen = openISO;
    let finalClose = closeISO;
    if (!closeCell && finalOpen) {
      finalClose = finalOpen;
      usedFallback = true;
    }
    if (usedFallback && (!openTimeCell || !closeTimeCell)) {
      addIssue("warning", "Unica data rilevata: apertura e chiusura impostate alle 09:00 dello stesso giorno");
    }

    // --- validazioni temporali ---
    let closeBeforeOpen = false;
    if (finalOpen && finalClose) {
      const tOpen = new Date(finalOpen).getTime();
      const tClose = new Date(finalClose).getTime();
      if (!isNaN(tOpen) && !isNaN(tClose) && tClose < tOpen) {
        closeBeforeOpen = true;
        addIssue("error", "Data uscita antecedente alla data di apertura: riga scartata");
      }
    }
    const nowT = Date.now();
    const futureOf = (iso: string | null | undefined, label: string) => {
      if (!iso) return;
      const t = new Date(iso).getTime();
      if (!isNaN(t) && t > nowT) addIssue("warning", `Data di ${label} nel futuro rispetto a oggi: verifica che sia corretta`);
    };
    futureOf(finalOpen, "apertura");
    futureOf(finalClose, "uscita");

    // la riga è valida?
    const fatal = !instrument || !direction || !finalOpen || !finalClose || resultNative == null || closeBeforeOpen;
    if (fatal) {
      errors.push(...issues.filter((x) => x.severity === "error"));
      skipped++;
      continue;
    }

    // --- notes / setup ---
    let notes: string | undefined = (cellAt(cells, "notes").value ?? "").trim();
    if (!notes) notes = undefined;
    const setup = cellAt(cells, "setup").value || undefined;

    // --- dedup re-import: stessa chiave nel file → non verrà re-importata ---
    const dk = rowDedupKey(finalClose!, instrument, resultNative);
    const firstDupOf = seenKeys.get(dk);
    if (firstDupOf !== undefined) {
      duplicateCount++;
      issues.push({
        rowIndex: dataRowIndex,
        line: lineNo,
        message: `Duplicato della riga ${firstDupOf} (stessa data uscita, strumento e P/L): non verrà importato`,
        severity: "warning",
      });
    } else {
      seenKeys.set(dk, dataRowIndex);
    }

    rows.push({
      rowIndex: dataRowIndex,
      line: lineNo,
      instrument,
      direction,
      entry: entry.v,
      exit: exit.v,
      stop: stop.v,
      target: target.v,
      size: size.v,
      multiplier: effMult,
      resultNative,
      resultR,
      rEstimated,
      pnlComputed,
      openDate: finalOpen!,
      closeDate: finalClose!,
      notes,
      setup,
      dedupKey: dk,
      duplicate: firstDupOf !== undefined,
      issues,
    });
  }

  return {
    meta,
    rows,
    errors,
    skipped,
    valid: rows.length,
    duplicateCount,
    multiLineNoteCount,
  };
}