// ============================================================
// ASCEND — Obiettivi primari (seam dati): Università, Fisico,
// Trading. TUTTO derivato a runtime dalle collezioni esistenti
// (pattern compute.ts: "derivato ≠ persistito") — nessuna nuova
// collezione, nessun backfill. Funzioni pure: ricevono DB (ed
// eventuali opzioni), ritornano valori, non toccano lo storage.
// ============================================================

import type { DB, StudySubject, TradingAccount } from "./types";
import { addDaysKey, parseDateKey, todayKey, weekStartKey } from "./dates";
import {
  convertToBase,
  evalProgress,
  sportConsecutiveWeeksDone,
  sportStreak,
  tradingStats,
  workoutsInWeek,
} from "./compute";

export interface PrimaryGoal {
  key: "universita" | "fisico" | "trading";
  label: string;
  pct: number | null; // 0..100 intero; null = non calcolabile
  headline: string; // es. "3/8 esami passati"
  lines: string[]; // max 3 dettagli secondari, testo italiano
  ready: boolean; // false = mancano dati di base
}

export interface ExamRow {
  subject: StudySubject;
  passed: boolean | null; // true = passato, false = da dare, null = non impostato
  examDate: string | null; // "yyyy-MM-dd" o assente
  daysLeft: number | null; // giorni examDate - oggi (negativo = già sostenuto)
}

export interface SportWeekRow {
  weekStart: string; // day key "yyyy-MM-dd" dell'inizio settimana
  sessions: number;
  target: number;
  pct: number | null; // aderenza 0..100, null senza target
}

export interface TradingAccountRow {
  account: TradingAccount;
  saldo: number; // capitale + pnl chiuso (valuta nativa)
  target: number | null; // evalTarget (solo account in eval)
  pnl: number; // pnl chiuso (valuta nativa) — il progresso eval conta QUESTO
  gainTarget: number | null; // utile richiesto (target − capitale)
  pct: number | null; // 100 se finanziato, round(progressPct) in eval, altrimenti null
  funded: boolean;
}

// --- helpers -------------------------------------------------

/** Differenza in giorni tra due day key "yyyy-MM-dd" (to - from). */
function daysBetweenKeys(fromKey: string, toKey: string): number {
  const a = parseDateKey(fromKey);
  const b = parseDateKey(toKey);
  return Math.round(
    (Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000
  );
}

/** Numero in formato italiano (fino a 2 decimali, senza frazioni inutili). */
function fmtNum(n: number): string {
  return n.toLocaleString("it-IT", { maximumFractionDigits: 2 });
}

// ------------------------------------------------------------
// Università — esami dalle materie non archiviate con data esame
// ------------------------------------------------------------

/** Righe esame per ogni materia non archiviata (examDate/daysLeft null se non impostati). */
export function examsList(db: DB): ExamRow[] {
  const today = todayKey(db.settings.timezone);
  return db.studySubjects
    .filter((s) => s.archived !== true)
    .map((s) => {
      const examDate = s.examDate ?? null;
      return {
        subject: s,
        passed:
          s.examPassed === true ? true : s.examPassed === false ? false : null,
        examDate,
        daysLeft: examDate ? daysBetweenKeys(today, examDate) : null,
      };
    });
}

export function universitaProgress(db: DB): PrimaryGoal {
  const rows = examsList(db).filter((r) => r.examDate != null);
  const total = rows.length;
  const passed = rows.filter((r) => r.passed === true).length;
  const toDo = total - passed;
  if (total === 0) {
    return {
      key: "universita",
      label: "Università",
      pct: null,
      headline: "Nessun esame in calendario",
      lines: ["Imposta la data esame su una materia"],
      ready: false,
    };
  }
  const pct = Math.round((passed / total) * 100);
  // prossimo esame = il più vicino (minore daysLeft) tra quelli non ancora passati
  const next = rows
    .filter((r) => r.passed !== true && r.daysLeft != null)
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))[0] ?? null;
  const lines: string[] = [];
  if (next && next.daysLeft != null) {
    const d = next.daysLeft;
    const when = d > 0 ? `tra ${d}g` : d === 0 ? "oggi" : `${-d}g fa`;
    lines.push(`Prossimo: ${next.subject.name} · ${when}`);
  }
  lines.push(`${toDo} da dare`);
  lines.push(`${passed} passati`);
  return {
    key: "universita",
    label: "Università",
    pct,
    headline: `${passed}/${total} esami passati`,
    lines: lines.slice(0, 3),
    ready: true,
  };
}

// ------------------------------------------------------------
// Fisico — aderenza settimanale dal profilo Sport Zone
// ------------------------------------------------------------

/**
 * Aderenza delle ultime `weeks` settimane (default 6), dalla più vecchia alla
 * settimana CORRENTE (inclusa,ultima riga). Senza profilo/target: pct null.
 */
export function sportAdherence(db: DB, weeks: number = 6): SportWeekRow[] {
  const target = db.sportProfile?.weeklySessionsTarget ?? 0;
  const thisWeek = weekStartKey(
    todayKey(db.settings.timezone),
    db.settings.weekStart
  );
  const out: SportWeekRow[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = addDaysKey(thisWeek, -7 * i);
    const sessions = workoutsInWeek(db, ws);
    out.push({
      weekStart: ws,
      sessions,
      target,
      pct: target > 0 ? Math.min(100, Math.round((sessions / target) * 100)) : null,
    });
  }
  return out;
}

export function fisicoProgress(db: DB): PrimaryGoal {
  const target = db.sportProfile?.weeklySessionsTarget ?? 0;
  const thisWeek = weekStartKey(
    todayKey(db.settings.timezone),
    db.settings.weekStart
  );
  if (target <= 0) {
    return {
      key: "fisico",
      label: "Fisico",
      pct: null,
      headline: "Profilo sport non configurato",
      lines: ["Completa il wizard Sport Zone"],
      ready: false,
    };
  }
  // media arrotondata dell'aderenza delle ultime 4 settimane COMPLETE:
  // sportAdherence(db, 5) include la corrente in coda → scartata.
  const last4 = sportAdherence(db, 5).slice(0, 4);
  const pct = Math.round(
    last4.reduce((s, r) => s + (r.pct ?? 0), 0) / Math.max(1, last4.length)
  );
  const thisWeekSessions = workoutsInWeek(db, thisWeek);
  return {
    key: "fisico",
    label: "Fisico",
    pct,
    headline: `${pct}% aderenza ultime 4 sett.`,
    lines: [
      `${thisWeekSessions}/${target} sessioni questa settimana`,
      `${sportStreak(db)} giorni di streak`,
      `${sportConsecutiveWeeksDone(db, thisWeek)} settimane di fila`,
    ],
    ready: true,
  };
}

// ------------------------------------------------------------
// Trading — target di valutazione e promozione a finanziato
// ------------------------------------------------------------

/**
 * Righe per account NON archiviato (l'archivio è storico, stesso criterio di
 * riskLimitAlerts): finanziato → pct 100; eval con evalTarget → round del
 * progresso; altri stati → pct null, escluso dalla media globale.
 */
export function tradingAccountsProgress(db: DB): TradingAccountRow[] {
  return db.accounts
    .filter((a) => a.archived !== true)
    .map((a) => {
      const ep = evalProgress(db, a);
      const funded = a.status === "finanziato";
      const pct = funded
        ? 100
        : a.status === "eval" && a.evalTarget != null && ep.progressPct != null
          ? Math.round(ep.progressPct)
          : null;
      return { account: a, saldo: ep.saldo, target: ep.target, pnl: ep.pnl, gainTarget: ep.gainTarget, pct, funded };
    });
}

export function tradingProgress(db: DB): PrimaryGoal {
  const rows = tradingAccountsProgress(db);
  const defined = rows.filter((r) => r.pct != null);
  const pct =
    defined.length > 0
      ? Math.round(defined.reduce((s, r) => s + (r.pct ?? 0), 0) / defined.length)
      : null;
  const allFunded = rows.length > 0 && rows.every((r) => r.funded);

  // P&L chiuso totale: somma in valuta nativa, significativa solo se gli
  // account coinvolti condividono la stessa valuta (altrimenti "multi-valuta").
  const pnl = db.trades.reduce((s, t) => s + t.resultNative, 0);
  const currencies = new Set(
    db.trades
      .map((t) =>
        db.accounts.find((a) => a.id === t.accountId)?.nativeCurrency.toUpperCase()
      )
      .filter((c): c is string => !!c)
  );
  const pnlLabel =
    currencies.size <= 1
      ? `${fmtNum(pnl)} ${[...currencies][0] ?? db.settings.baseCurrency}`
      : "multi-valuta";

  const payoutsTotal = db.payouts.reduce(
    (s, p) => s + convertToBase(p.amount, p.exchangeRate),
    0
  );
  const st = tradingStats(db.trades);

  const lines: string[] = [`P&L chiuso: ${pnlLabel}`];
  lines.push(`Payout totali: ${fmtNum(payoutsTotal)} ${db.settings.baseCurrency}`);
  if (st.count > 0 && st.winRate != null) {
    lines.push(`Win rate: ${Math.round(st.winRate)}%`);
  }
  return {
    key: "trading",
    label: "Trading",
    pct,
    headline: allFunded
      ? "100% — tutti finanziati"
      : pct != null
        ? `${pct}% verso i target`
        : "Nessun target attivo",
    lines: lines.slice(0, 3),
    ready: pct != null,
  };
}

// ------------------------------------------------------------
// Aggregato — ordine fisso [universita, fisico, trading]
// ------------------------------------------------------------

export function primaryGoals(db: DB): PrimaryGoal[] {
  return [universitaProgress(db), fisicoProgress(db), tradingProgress(db)];
}

// ============================================================
// Piano 5 anni — fase trading e salute delle registrazioni
// Derivati puri: nessuna persistenza.
// ============================================================

export type TradingPhase = {
  key: "formazione" | "freeze";
  label: string;
  note: string;
};

/**
 * Fase del piano in base al mese (sessioni d'esame: gennaio, giugno,
 * luglio, settembre → freeze trading; il resto dell'anno = formazione).
 */
export function tradingPhase(db: DB): TradingPhase {
  const m = Number(todayKey(db.settings.timezone).slice(5, 7));
  const freeze = m === 1 || m === 6 || m === 7 || m === 9;
  return freeze
    ? {
        key: "freeze",
        label: "Sessione — freeze",
        note: "Sessione d'esame: solo review del journal (30 min/sett). Gli esami non si negoziano.",
      }
    : {
        key: "formazione",
        label: "Fase formazione",
        note: "Slot fisso 2-3 h/settimana: teoria, playbook, backtest.",
      };
}

export interface LoggingHealth {
  /** Giorni dall'ultima registrazione su qualsiasi raccolta chiave; null = mai registrato nulla. */
  daysSinceLast: number | null;
  /** Etichetta dell'ultima registrazione (es. "allenamento"). */
  lastLabel: string | null;
  /** true = ≥14 giorni senza registrazioni (o DB vergine): allarme "piano morto". */
  alarm: boolean;
}

/**
 * Salute delle registrazioni: il piano a 5 anni è vivo solo se i dati
 * entrano nell'app. Guarda workouts, studio, trade, benessere, lettura,
 * transazioni e check obiettivi — la più recente vince.
 */
export function loggingHealth(db: DB): LoggingHealth {
  const candidates: { date: string; label: string }[] = [
    ...db.workouts.map((w) => ({ date: w.date, label: "allenamento" })),
    ...db.studySessions.map((s) => ({ date: s.date, label: "sessione di studio" })),
    ...db.trades.map((t) => ({ date: t.closeDate.slice(0, 10), label: "trade" })),
    ...db.wellnessLogs.map((w) => ({ date: w.date, label: "log benessere" })),
    ...db.readingLog.map((r) => ({ date: r.date, label: "lettura" })),
    ...db.transactions.map((t) => ({ date: t.date, label: "transazione" })),
    ...db.customGoalChecks.map((c) => ({ date: c.date, label: "obiettivo spuntato" })),
  ];
  const last = candidates.sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  const today = todayKey(db.settings.timezone);
  const daysSinceLast =
    last != null ? Math.max(0, daysBetweenKeys(last.date.slice(0, 10), today)) : null;
  return {
    daysSinceLast,
    lastLabel: last?.label ?? null,
    alarm: daysSinceLast == null || daysSinceLast >= 14,
  };
}
