// ============================================================
// ASCEND — Merge engine per backup JSON (multidispositivo)
// Regola: per ogni voce (id ⇒ chiave), vince quella con la data
// di modifica più recente (updatedAt → createdAt → date).
// Regole speciali: settings e sportProfile (oggetti singoli)
// vince il più recente. A parità di data vince il LOCALE (mai
// sovrascrivere dati che stai vedendo senza motivo).
// Nota: i blob degli allegati studio (IndexedDB) non viaggiano
// nel JSON: le voci importate con attachments avranno il chip
// ma il file resterà sul dispositivo che l'ha caricato.
// ============================================================

import { seedDB } from "./db";
import { migrate } from "./storage";
import type { DB } from "./types";
import { DB_VERSION } from "./types";

// ---- Validazione forma minima (stessa filosofia di isValidDBShape) ----
export function isValidBackupShape(x: unknown): x is DB {
  if (!x || typeof x !== "object") return false;
  const o = x as Partial<DB>;
  return (
    Number.isInteger(o.version) &&
    (o.version as number) >= 1 &&
    !!o.settings &&
    typeof o.settings === "object" &&
    !Array.isArray(o.settings) &&
    Array.isArray(o.categories) &&
    Array.isArray(o.transactions) &&
    Array.isArray(o.accounts) &&
    Array.isArray(o.trades)
  );
}

/** Normalizza un backup grezzo: spread su seedDB + cascata migrazioni. */
export function normalizeIncoming(raw: unknown): DB | null {
  if (!isValidBackupShape(raw)) return null;
  const base = seedDB();
  return migrate({
    ...base,
    ...(raw as DB),
    settings: { ...base.settings, ...(raw as DB).settings },
  });
}

/** Collezioni a lista del DB (tutte quelle presenti in seedDB). */
const LIST_KEYS = [
  "categories",
  "transactions",
  "accounts",
  "trades",
  "setups",
  "setupRules",
  "tradeSetupRules",
  "firmExpenses",
  "payouts",
  "weeklyReviews",
  "dailyGoals",
  "weeklyGoals",
  "pcUsageLogs",
  "pcAppCategoryMap",
  "books",
  "workouts",
  "studySessions",
  "studySubjects",
  "savingsGoals",
  "savingsDeposits",
  "recurringRules",
  "wellnessLogs",
  "badges",
] as const;

function itemTs(item: Record<string, unknown>): string {
  const v = item.updatedAt ?? item.createdAt ?? item.date;
  return typeof v === "string" ? v : "";
}

function itemKey(item: Record<string, unknown>): string {
  const id = item.id;
  if (typeof id === "string" && id) return `id:${id}`;
  const date = item.date;
  if (typeof date === "string" && date) return `date:${date}`;
  return `json:${JSON.stringify(item)}`;
}

export interface MergeEntry {
  key: string;
  label: string;
  added: number;
  updated: number;
  kept: number;
}

export interface MergeResult {
  db: DB;
  report: MergeEntry[];
}

/** Etichetta leggibile per collezione (messaggi di riepilogo). */
export const COLLECTION_LABELS: Record<string, string> = {
  transactions: "transazioni",
  trades: "trade",
  accounts: "account",
  categories: "categorie",
  setups: "setup",
  setupRules: "regole setup",
  tradeSetupRules: "regole trade",
  firmExpenses: "spese firm",
  payouts: "payout",
  weeklyReviews: "review",
  dailyGoals: "obiettivi giornalieri",
  weeklyGoals: "obiettivi settimanali",
  pcUsageLogs: "log PC",
  pcAppCategoryMap: "categorizzazioni app",
  books: "libri",
  workouts: "allenamenti",
  studySessions: "sessioni studio",
  studySubjects: "materie",
  savingsGoals: "obiettivi risparmio",
  savingsDeposits: "versamenti",
  recurringRules: "ricorrenti",
  wellnessLogs: "log benessere",
  badges: "badge",
};

/** Fonde due liste: vince la voce più recente per itemTs. */
function mergeList(
  local: Record<string, unknown>[],
  incoming: Record<string, unknown>[]
): { out: Record<string, unknown>[]; added: number; updated: number; kept: number } {
  const map = new Map<string, Record<string, unknown>>();
  for (const it of local) map.set(itemKey(it), it);
  let added = 0;
  let updated = 0;
  let kept = 0;
  for (const it of incoming) {
    const key = itemKey(it);
    const cur = map.get(key);
    if (!cur) {
      map.set(key, it);
      added++;
    } else if (itemTs(it) > itemTs(cur)) {
      map.set(key, it);
      updated++;
    } else {
      kept++;
    }
  }
  return { out: Array.from(map.values()), added, updated, kept };
}

/** Fonde due DB. `report` è ordinato con le collezioni toccate per prime. */
export function mergeDB(local: DB, incoming: DB): MergeResult {
  const out = { ...local } as DB;
  const report: MergeEntry[] = [];

  // settings: vince il più recente (updatedAt). Mail se il locale è più recente, resta locale.
  const localSettingsTs = local.settings.updatedAt ?? "";
  const incomingSettingsTs = incoming.settings.updatedAt ?? "";
  if (incomingSettingsTs > localSettingsTs) {
    out.settings = { ...local.settings, ...incoming.settings };
    report.push({ key: "settings", label: "impostazioni", added: 0, updated: 1, kept: 0 });
  }

  // sportProfile: oggetto singolo → vince il più recente
  const lp = local.sportProfile;
  const ip = incoming.sportProfile;
  const tsOf = (p: typeof lp): string => (p ? p.onboardedAt ?? "" : "");
  if (ip && (!lp || tsOf(ip) > tsOf(lp))) {
    out.sportProfile = ip;
    report.push({ key: "sportProfile", label: "profilo sport", added: 0, updated: 1, kept: 0 });
  }

  // Liste per-collezione
  for (const key of LIST_KEYS) {
    const localList = (local as unknown as Record<string, Record<string, unknown>[]>)[key] ?? [];
    const incomingList = (incoming as unknown as Record<string, Record<string, unknown>[]>)[key] ?? [];
    const { out: merged, added, updated, kept } = mergeList(localList, incomingList);
    (out as unknown as Record<string, Record<string, unknown>[]>)[key] = merged;
    if (added + updated > 0) {
      report.push({ key, label: COLLECTION_LABELS[key] ?? key, added, updated, kept });
    }
  }

  // version: porta sempre al DB_VERSION corrente
  out.version = DB_VERSION;

  return { db: out, report };
}

/** Riepilogo leggibile: "transazioni +3 · trade +1 …" (+ totale). */
export function describeReport(report: MergeEntry[]): { totalAdded: number; totalUpdated: number; text: string } {
  let totalAdded = 0;
  let totalUpdated = 0;
  const parts: string[] = [];
  for (const e of report) {
    totalAdded += e.added;
    totalUpdated += e.updated;
    const bits: string[] = [];
    if (e.added > 0) bits.push(`+${e.added}`);
    if (e.updated > 0) bits.push(`${e.updated} aggiornate/i`);
    if (bits.length) parts.push(`${e.label} ${bits.join(", ")}`);
  }
  return { totalAdded, totalUpdated, text: parts.join(" · ") };
}