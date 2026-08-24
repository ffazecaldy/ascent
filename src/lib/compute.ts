// ============================================================
// ASCEND — Motore di calcolo (tutto derivato a runtime, mai persistito
// come fonte di verità: streak, Ascend Day, disciplina, risk, stats).
// Tutte le funzioni sono pure: ricevono DB e opzioni, ritornano valori.
// ============================================================

import type {
  DB,
  UserSettings,
  TradingAccount,
  Trade,
  DailyGoal,
  WeeklyGoal,
  GoalType,
  SetupRule,
  RecurringRule,
  Transaction as TransactionType2,
  SportDiscipline,
  WeeklyReviewStats,
} from "./types";
import {
  addDaysKey,
  dateKey,
  daysInMonth,
  isoToDayKey,
  monthKeyOf,
  monthRange,
  todayKey,
  tradingDayKey,
  weekStartKey,
} from "./dates";

// ------------------------------------------------------------
// Valuta
// ------------------------------------------------------------
export function convertToBase(amount: number, exchangeRate: number): number {
  return amount * exchangeRate;
}

/** Tasso nativo→base per un account. 1 se stessa valuta, altrimenti baseRate salvato o 1. */
export function accountBaseRate(account: TradingAccount, baseCurrency: string): number {
  if (account.nativeCurrency.toUpperCase() === baseCurrency.toUpperCase()) return 1;
  return account.baseRate ?? 1;
}

// ------------------------------------------------------------
// Attività del giorno (per Activity Streak)
// ------------------------------------------------------------
export function actionsOnDay(db: DB, dayKey: string): string[] {
  const actions: string[] = [];
  const tz = db.settings.timezone;
  if (db.transactions.some((t) => t.date === dayKey)) actions.push("transazione");
  if (db.trades.some((t) => isoToDayKey(t.closeDate, tz) === dayKey)) actions.push("trade");
  if (db.workouts.some((w) => w.date === dayKey)) actions.push("allenamento");
  if (db.pcUsageLogs.some((p) => p.date === dayKey)) actions.push("pc");
  if (db.studySessions.some((s) => s.date === dayKey)) actions.push("studio");
  // lettura: confronto nella timezone utente (mai quella del browser)
  if (db.books.some((b) => isoToDayKey(b.updatedAt, tz) === dayKey)) actions.push("lettura");
  // benessere: contano solo sonno e peso (l'umore da solo non attiva il giorno)
  const wl = db.wellnessLogs.find((w) => w.date === dayKey);
  if (wl && (wl.sleepHours != null || wl.weightKg != null)) actions.push("benessere");
  return actions;
}

export function isDayActive(db: DB, dayKey: string): boolean {
  return actionsOnDay(db, dayKey).length > 0;
}

/**
 * Activity Streak (calcolato a runtime). Freeze: uno al mese, automatico —
 * se oggi è inattivo ma ieri era attivo, lo streak non si rompe (una volta al mese).
 */
export interface StreakInfo {
  days: number;
  todayActive: boolean;
  freezeUsed: boolean; // true se il freeze è stato consumato per mantenere lo streak
  streakStart: string | null; // day key del primo giorno dello streak
  lastActiveDay: string;
}

export function activityStreak(db: DB): StreakInfo {
  const tz = db.settings.timezone;
  const today = todayKey(tz);
  // insieme di giorni attivi
  const active = new Set<string>();
  db.transactions.forEach((t) => active.add(t.date));
  db.trades.forEach((t) => active.add(isoToDayKey(t.closeDate, tz)));
  db.workouts.forEach((w) => active.add(w.date));
  db.pcUsageLogs.forEach((p) => active.add(p.date));
  db.studySessions.forEach((s) => active.add(s.date));
  // lettura: confronto nella timezone utente (mai quella del browser)
  db.books.forEach((b) => { if (isoToDayKey(b.updatedAt, tz) === today) active.add(today); });
  // includi anni precedenti fino a 370 giorni fa
  const bound = addDaysKey(today, -400);
  for (const k of Array.from(active)) {
    if (k < bound) active.delete(k);
  }

  let days = 0;
  let freezeUsed = false;
  let lastActiveDay = "";
  const todayActive = active.has(today);
  if (todayActive) {
    let cursor = today;
    while (active.has(cursor)) { days++; cursor = addDaysKey(cursor, -1); }
    lastActiveDay = today;
  } else {
    const yesterday = addDaysKey(today, -1);
    if (active.has(yesterday)) {
      // freeze: oggi inattivo ma ieri attivo → lo streak sopravvive (1 al mese)
      const currentMonth = today.slice(0, 7);
      const freezeUsedThisMonth = db.settings.lastFreezeMonth === currentMonth;
      const accountHasLife = active.has(yesterday) && days === 0;
      void accountHasLife;
      if (!freezeUsedThisMonth) {
        freezeUsed = true;
        days = 1;
        let cursor = yesterday;
        while (active.has(cursor)) { days++; cursor = addDaysKey(cursor, -1); }
        lastActiveDay = yesterday;
      } else {
        let cursor = yesterday;
        while (active.has(cursor)) { days++; cursor = addDaysKey(cursor, -1); }
        lastActiveDay = yesterday;
      }
    } else {
      let cursor = yesterday;
      while (active.has(cursor)) { days++; cursor = addDaysKey(cursor, -1); }
      lastActiveDay = active.has(yesterday) ? yesterday : addDaysKey(today, -1);
    }
  }

  if (days === 0) {
    days = 0;
    let cursor = addDaysKey(today, -1);
    while (active.has(cursor)) { days++; cursor = addDaysKey(cursor, -1); }
  }

  // streakStart
  let streakStart: string | null = null;
  if (days > 0 || todayActive || freezeUsed) {
    let c = lastActiveDay;
    let n = 0;
    while ((active.has(c) || c === today) && n < 370) {
      if (c === today && !todayActive && !freezeUsed) break;
      n++;
      c = addDaysKey(c, -1);
    }
    streakStart = addDaysKey(lastActiveDay, -(Math.max(days, n) - 1));
  }
  return { days, todayActive, freezeUsed, streakStart, lastActiveDay };
}

/** Persistenza del freeze consumato. Ritorna nuovo settings o null. */
export function claimFreeze(db: DB): UserSettings | null {
  const streak = activityStreak(db);
  if (!streak.freezeUsed) return null;
  const currentMonth = todayKey(db.settings.timezone).slice(0, 7);
  if (db.settings.lastFreezeMonth === currentMonth) return null;
  return { ...db.settings, lastFreezeMonth: currentMonth, updatedAt: new Date().toISOString() };
}

// ------------------------------------------------------------
// Ascend Day — gate sui DailyGoal (concetto separato e più severo)
// ------------------------------------------------------------
export interface AscordDayResult {
  dayKey: string;
  met: boolean;
  done: number;
  total: number;
  byGoal: Record<string, { met: boolean; value: number; target: number }>;
}

/** Verifica i DailyGoal attivi per un certo giorno. */
export function ascordDay(db: DB, dayKey: string): AscordDayResult {
  const goals = db.dailyGoals.filter((g) => g.active);
  const tz = db.settings.timezone;
  const byGoal: AscordDayResult["byGoal"] = {};

  const txnThisDay = db.transactions.filter((t) => t.date === dayKey);
  const tradesThisDay = db.trades.filter((t) => isoToDayKey(t.closeDate, tz) === dayKey);
  const workoutsThisDay = db.workouts.filter((w) => w.date === dayKey);
  const pcMinutes = db.pcUsageLogs.filter((p) => p.date === dayKey).reduce((s, p) => s + p.minutes, 0);
  // minuti di lettura = progresso pagine del giorno (stimato: 1 pagina ≈ 3 min)
  const bookStart = new Date(dayKey + "T00:00:00");
  const bookEnd = new Date(dayKey + "T23:59:59");
  let letturaMin = 0;
  db.books.forEach((b) => {
    const u = new Date(b.updatedAt);
    if (u >= bookStart && u <= bookEnd) letturaMin += 3 * (b.pagesRead || 0);
  });

  const disciplineOk = tradesWithSetupAllRespected(db, tradesThisDay.map((t) => t.id));

  for (const g of goals) {
    let value = 0;
    const target = g.targetValue;
    let met = false;
    switch (g.type) {
      case "finanze_check":
        value = txnThisDay.length;
        met = value > 0 || target === 0;
        break;
      case "trade_log":
        value = tradesThisDay.length;
        met = value > 0 || target === 0;
        break;
      case "disciplina_ok":
        // tutti i trade chiusi del giorno rispettano il playbook; nessun trade (0) conta come met
        if (tradesThisDay.length === 0) { met = true; value = 0; }
        else met = disciplineOk;
        break;
      case "lettura_minuti":
        value = letturaMin;
        met = value >= target;
        break;
      case "allenamento":
        value = workoutsThisDay.length;
        met = value > 0 || target === 0;
        break;
      case "ore_produttive":
        value = pcMinutes;
        met = value >= target;
        break;
    }
    byGoal[g.id] = { met, value, target };
  }
  const total = goals.length;
  const done = Object.values(byGoal).filter((x) => x.met).length;
  const metLocal = total > 0 ? done === total : false;
  return { dayKey, met: metLocal, done, total, byGoal };
}

/** Ascend Day vinti nella settimana corrente. */
export function ascordWeek(db: DB): { won: number; total: number; today: AscordDayResult | null } {
  const tz = db.settings.timezone;
  const today = todayKey(tz);
  const ws = weekStartKey(today, db.settings.weekStart);
  let won = 0;
  let total = 0;
  let todayRes: AscordDayResult | null = null;
  for (let i = 0; i < 7; i++) {
    const dk = addDaysKey(ws, i);
    if (dk > today) continue;
    total++;
    const r = ascordDay(db, dk);
    if (r.met) won++;
    if (dk === today) todayRes = r;
  }
  return { won, total, today: todayRes };
}

// ------------------------------------------------------------
// Disciplina — SetupRule a ID stabile, TradeSetupRule per trade
// ------------------------------------------------------------
export function rulesOfSetup(db: DB, setupId: string): SetupRule[] {
  return db.setupRules
    .filter((r) => r.setupId === setupId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Un trade rispetta il setup se rispetta TUTTE le regole attive del proprio setup. */
export function tradeRespected(db: DB, tradeId: string): boolean | null {
  const trade = db.trades.find((t) => t.id === tradeId);
  if (!trade || !trade.setupId) return null;
  const rules = rulesOfSetup(db, trade.setupId).filter((r) => r.active);
  if (rules.length === 0) return null; // setup senza regole attive: non valutabile
  const rs = db.tradeSetupRules.filter((x) => x.tradeId === tradeId);
  return rules.every((r) => {
    const entry = rs.find((x) => x.ruleId === r.id);
    return entry ? entry.respected : false;
  });
}

export interface DisciplineStats {
  count: number; // trade con setup valutabili
  respected: number;
  disciplinePct: number | null;
  noSetupCount: number;
  noSetupPct: number | null;
  total: number;
}

export function disciplineStats(db: DB, tradeIds: string[]): DisciplineStats {
  const withSetup: string[] = [];
  const noSetup: string[] = [];
  for (const id of tradeIds) {
    const t = db.trades.find((x) => x.id === id);
    if (!t) continue;
    if (t.setupId) withSetup.push(id);
    else noSetup.push(id);
  }
  let respected = 0;
  for (const id of withSetup) if (tradeRespected(db, id) === true) respected++;
  const count = withSetup.length;
  const total = tradeIds.length;
  return {
    count,
    respected,
    disciplinePct: count > 0 ? (respected / count) * 100 : null,
    noSetupCount: noSetup.length,
    noSetupPct: total > 0 ? (noSetup.length / total) * 100 : null,
    total,
  };
}

function tradesWithSetupAllRespected(db: DB, tradeIds: string[]): boolean {
  return tradeIds.every((id) => {
    const t = db.trades.find((x) => x.id === id);
    if (!t || !t.setupId) return false;
    return tradeRespected(db, id) === true;
  });
}

// ------------------------------------------------------------
// Statistiche trading (generiche, per periodo di trade)
// ------------------------------------------------------------
export interface TradingStats {
  count: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  avgR: number | null;
  totalR: number;
  totalNative: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
  expectancyR: number | null;
}

export function tradingStats(trades: Trade[]): TradingStats {
  const wins = trades.filter((t) => t.resultR > 0);
  const losses = trades.filter((t) => t.resultR < 0);
  const breakeven = trades.filter((t) => t.resultR === 0);
  const grossProfit = wins.reduce((s, t) => s + t.resultNative, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.resultNative, 0));
  return {
    count: trades.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: breakeven.length,
    winRate: trades.length ? (wins.length / trades.length) * 100 : null,
    avgR: trades.length ? trades.reduce((s, t) => s + t.resultR, 0) / trades.length : null,
    totalR: trades.reduce((s, t) => s + t.resultR, 0),
    totalNative: trades.reduce((s, t) => s + t.resultNative, 0),
    grossProfit,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    expectancyR: trades.length ? trades.reduce((s, t) => s + t.resultR, 0) / trades.length : null,
  };
}

export function consecutiveWinsLosses(trades: Trade[]): { wins: number; losses: number; current: "win" | "loss" | null } {
  let wins = 0, losses = 0, cur = 0;
  const sorted = [...trades].sort((a, b) => a.closeDate.localeCompare(b.closeDate));
  for (const t of sorted) {
    if (t.resultR > 0) { if (cur >= 0) cur++; else cur = 1; }
    else if (t.resultR < 0) { if (cur <= 0) cur--; else cur = -1; }
  }
  if (cur > 0) wins = cur;
  if (cur < 0) losses = -cur;
  return { wins, losses, current: cur > 0 ? "win" : cur < 0 ? "loss" : null };
}

// ------------------------------------------------------------
// Equity curve
// ------------------------------------------------------------
export interface EquityPoint {
  date: string; // closeDate ISO
  dayKey: string;
  value: number; // cumulativa valuta nativa (account) o base (aggregata)
}

/** Equity cumulativa di un account (valuta nativa), ordinata per chiusura.
 *  `settingsTimezone` di fallback per il dayKey (mai UTC grezzo). */
export function equityCurve(trades: Trade[], settingsTimezone: string = "UTC"): EquityPoint[] {
  const sorted = [...trades].sort((a, b) => a.closeDate.localeCompare(b.closeDate));
  let cum = 0;
  return sorted.map((t) => {
    cum += t.resultNative;
    return { date: t.closeDate, dayKey: isoToDayKey(t.closeDate, settingsTimezone), value: cum };
  });
}

/** P&L per trading day di un account (confine dell'account).
 *  `settingsTimezone` è il fallback quando l'account non dichiara una
 *  timezone di sessione: il giorno di trading segue la timezone utente
 *  (mai UTC grezzo, che sposterebbe i trade della sera al giorno prima). */
export function pnlByTradingDay(
  trades: Trade[],
  account: TradingAccount,
  monthKey: string,
  settingsTimezone: string = "UTC"
): { dayKey: string; pnl: number }[] {
  const map = new Map<string, number>();
  for (const t of trades) {
    const dk = tradingDayKey(t.closeDate, account, settingsTimezone);
    if (monthKeyOf(dk) !== monthKey) continue;
    map.set(dk, (map.get(dk) ?? 0) + t.resultNative);
  }
  return Array.from(map.entries()).map(([dayKey, pnl]) => ({ dayKey, pnl })).sort((a, b) => a.dayKey.localeCompare(b.dayKey));
}

/** P&L per giorno CALENDARIO (timezone utente, NON confine di sessione):
 *  la cella del calendario mostra il giorno in cui l'utente ha chiuso il
 *  trade (Europe/Rome), mai il trading day della sessione dell'account
 *  (che per sessioni USA spostava i trade a ieri/domani).
 *  Date senza ora ("yyyy-MM-dd") = giorno dichiarato, senza conversioni.
 */
export function pnlByLocalDay(
  trades: Trade[],
  monthKey: string,
  settingsTimezone: string
): { dayKey: string; pnl: number }[] {
  const map = new Map<string, number>();
  for (const t of trades) {
    const dk = /^\d{4}-\d{2}-\d{2}$/.test(t.closeDate) ? t.closeDate : isoToDayKey(t.closeDate, settingsTimezone);
    if (monthKeyOf(dk) !== monthKey) continue;
    map.set(dk, (map.get(dk) ?? 0) + t.resultNative);
  }
  return Array.from(map.entries()).map(([dayKey, pnl]) => ({ dayKey, pnl })).sort((a, b) => a.dayKey.localeCompare(b.dayKey));
}

export function monthPnlTrades(db: DB, monthKey: string): { native: number; base: number } {
  const tz = db.settings.timezone;
  let native = 0, base = 0;
  for (const t of db.trades) {
    if (monthKeyOf(isoToDayKey(t.closeDate, tz)) !== monthKey) continue;
    const acc = db.accounts.find((a) => a.id === t.accountId);
    native += t.resultNative;
    base += t.resultNative * (acc ? accountBaseRate(acc, db.settings.baseCurrency) : 1);
  }
  return { native, base };
}

// ------------------------------------------------------------
// Risk Dashboard (per account — confine trading day)
// ------------------------------------------------------------
export interface RiskStats {
  accountId: string;
  nativeCurrency: string;
  dailyDrawdown: number; // peggior giorno (somma negativa del giorno) in valuta nativa
  maxDrawdown: number; // max drawdown della curva equity cumulativa
  avgRiskPerTrade: number; // media |perdite| (rischio realizzato)
  cumulativeRiskToday: number; // perdita NETTA del trading day corrente (>=0: i profitti del giorno compensano)
  distanceDailyLimit: number | null; // limite daily - consumo reale del trading day corrente
  distanceMaxLimit: number | null; // limite max - consumo reale (capital - equity live)
  bestDay: { dayKey: string; pnl: number } | null;
  worstDay: { dayKey: string; pnl: number } | null;
  consecutive: { wins: number; losses: number; current: "win" | "loss" | null };
  todayKey: string;
}

export interface LimitUsage {
  /** Perdita netta del trading day corrente (>= 0). */
  daily: number;
  /** Perdita cumulativa da equity live (>= 0). */
  max: number;
}

/**
 * Consumo REALE dei limiti di un account — stessa semantica di riskLimitAlerts
 * e delle LimitChip della pagina Account:
 *  - daily = max(0, -pnl netto del trading day corrente) (confine tradingDayKey/rollover);
 *  - max   = max(0, capital - equity live), con equity live = capital + Σ resultNative.
 * `now` è l'istante di valutazione. PURE.
 */
export function limitUsage(account: TradingAccount, trades: Trade[], now: Date): LimitUsage {
  const tdk = tradingDayKey(now.toISOString(), account);
  const dayPnl = trades
    .filter((t) => tradingDayKey(t.closeDate, account) === tdk)
    .reduce((s, t) => s + t.resultNative, 0);
  const live = account.capital + trades.reduce((s, t) => s + t.resultNative, 0);
  return { daily: Math.max(0, -dayPnl), max: Math.max(0, account.capital - live) };
}

export function riskStats(db: DB, account: TradingAccount): RiskStats {
  const trades = db.trades
    .filter((t) => t.accountId === account.id)
    .sort((a, b) => a.closeDate.localeCompare(b.closeDate));

  // per-trading-day P&L (tutti i mesi)
  const dayMap = new Map<string, number>();
  for (const t of trades) {
    const dk = tradingDayKey(t.closeDate, account);
    dayMap.set(dk, (dayMap.get(dk) ?? 0) + t.resultNative);
  }
  const days = Array.from(dayMap.entries()).map(([dayKey, pnl]) => ({ dayKey, pnl })).sort((a, b) => a.dayKey.localeCompare(b.dayKey));
  const dailyDrawdown = Math.min(0, ...days.map((d) => d.pnl));
  const bestDay = days.length ? days.reduce((a, b) => (a.pnl >= b.pnl ? a : b)) : null;
  const worstDay = days.length ? days.reduce((a, b) => (a.pnl <= b.pnl ? a : b)) : null;

  // max drawdown equity cumulativa
  const sorted = [...trades].sort((a, b) => a.closeDate.localeCompare(b.closeDate));
  let cum = 0, peak = 0, maxDD = 0;
  for (const t of sorted) {
    cum += t.resultNative;
    if (cum > peak) peak = cum;
    const dd = cum - peak;
    if (dd < maxDD) maxDD = dd;
  }

  const losses = sorted.filter((t) => t.resultNative < 0);
  const avgRiskPerTrade = losses.length
    ? losses.reduce((s, t) => s + Math.abs(t.resultNative), 0) / losses.length
    : 0;

  const todayLocal = todayKey(account.tradingDayTimezone || db.settings.timezone);
  // consumo reale dei limiti (stessa semantica di riskLimitAlerts): daily =
  // netto negativo del trading day corrente; max = capital - equity live
  const usage = limitUsage(account, trades, new Date());

  const dist = (limit: number | null | undefined, used: number) => {
    if (limit == null) return null;
    return limit - used;
  };
  return {
    accountId: account.id,
    nativeCurrency: account.nativeCurrency,
    dailyDrawdown,
    maxDrawdown: maxDD,
    avgRiskPerTrade,
    cumulativeRiskToday: usage.daily,
    distanceDailyLimit: dist(account.dailyLossLimit, usage.daily),
    distanceMaxLimit: dist(account.maxLossLimit, usage.max),
    bestDay,
    worstDay,
    consecutive: consecutiveWinsLosses(trades),
    todayKey: todayLocal,
  };
}

// ------------------------------------------------------------
// Alert drawdown globale (banner persistente in AppShell)
// ------------------------------------------------------------
export interface RiskLimitAlert {
  accountId: string;
  accountName: string;
  /** "daily" = dailyLossLimit nel trading day corrente; "max" = maxLossLimit cumulativo */
  kind: "daily" | "max";
  /** perdita consumata (valuta nativa, ≥ 0) */
  used: number;
  /** valore del limite (valuta nativa, > 0) */
  limit: number;
  /** consumo in % (used/limit*100) */
  pct: number;
  /** true se consumo ≥ 100% ("LIMITE SUPERATO") */
  breached: boolean;
  /** limite residuo (valuta nativa, ≥ 0) */
  remaining: number;
  nativeCurrency: string;
}

/** Soglia minima di allerta: i banner compaiono dal 80% di consumo. */
export const RISK_ALERT_THRESHOLD_PCT = 80;

function pushRiskAlert(
  out: RiskLimitAlert[],
  acc: TradingAccount,
  kind: RiskLimitAlert["kind"],
  used: number,
  limit: number
): void {
  const pct = (used / limit) * 100;
  if (pct < RISK_ALERT_THRESHOLD_PCT) return;
  out.push({
    accountId: acc.id,
    accountName: acc.name,
    kind,
    used,
    limit,
    pct,
    breached: pct >= 100,
    remaining: Math.max(0, limit - used),
    nativeCurrency: acc.nativeCurrency,
  });
}

/**
 * Alert drawdown per TUTTI gli account non archiviati con status eval|finanziato.
 * Semantica di consumo identica alle LimitChip della pagina Account:
 * daily = perdita del trading day corrente; max = capital − equity live.
 * Ordinati: breach (≥100%) prima, poi consumo decrescente.
 */
export function riskLimitAlerts(db: DB): RiskLimitAlert[] {
  const out: RiskLimitAlert[] = [];
  const actives = db.accounts.filter(
    (a) => !a.archived && (a.status === "eval" || a.status === "finanziato")
  );
  for (const acc of actives) {
    const accTrades = db.trades.filter((t) => t.accountId === acc.id);
    const usage = limitUsage(acc, accTrades, new Date());
    if (acc.dailyLossLimit != null && acc.dailyLossLimit > 0) {
      pushRiskAlert(out, acc, "daily", usage.daily, acc.dailyLossLimit);
    }
    if (acc.maxLossLimit != null && acc.maxLossLimit > 0) {
      pushRiskAlert(out, acc, "max", usage.max, acc.maxLossLimit);
    }
  }
  return out.sort((a, b) =>
    a.breached !== b.breached ? (a.breached ? -1 : 1) : b.pct - a.pct
  );
}

/**
 * Bucket di soglia per l'acknowledge del banner (10% in 10%: 80 → 90 → 100).
 * Un ack resta valido solo finché il consumo non sale a un bucket superiore.
 */
export function riskAckBucket(pct: number): number {
  return Math.min(100, Math.floor(pct / 10) * 10);
}

// ------------------------------------------------------------
// P&L trading del periodo per la Home (in valuta base)
// ------------------------------------------------------------
export function tradesBetween(db: DB, fromKey: string, toKey: string): Trade[] {
  const tz = db.settings.timezone;
  return db.trades.filter((t) => {
    const dk = isoToDayKey(t.closeDate, tz);
    return dk >= fromKey && dk <= toKey;
  });
}

// ------------------------------------------------------------
// Finanze (saldo mensile in valuta base)
// ------------------------------------------------------------
export function financesMonth(db: DB, monthKey: string) {
  const txs = db.transactions.filter((t) => monthKeyOf(t.date) === monthKey);
  let income = 0, expense = 0;
  for (const t of txs) {
    const amt = convertToBase(t.amount, t.exchangeRate);
    if (t.type === "income") income += amt;
    else expense += amt;
  }
  return { income, expense, net: income - expense, count: txs.length };
}

export function financesByCategory(db: DB, monthKey: string) {
  const txs = db.transactions.filter((t) => monthKeyOf(t.date) === monthKey);
  const map = new Map<string, { income: number; expense: number }>();
  for (const t of txs) {
    const amt = convertToBase(t.amount, t.exchangeRate);
    const cur = map.get(t.categoryId) ?? { income: 0, expense: 0 };
    if (t.type === "income") cur.income += amt;
    else cur.expense += amt;
    map.set(t.categoryId, cur);
  }
  return Array.from(map.entries()).map(([categoryId, v]) => ({ categoryId, ...v }));
}

// ------------------------------------------------------------
// Uso PC
// ------------------------------------------------------------
export function pcMinutesOnDay(db: DB, dayKey: string): number {
  return db.pcUsageLogs
    .filter((p) => p.date === dayKey)
    .reduce((s, p) => s + p.minutes, 0);
}

export function pcMinutesInWeek(db: DB, weekStart: string): number {
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const dk = addDaysKey(weekStart, i);
    total += db.pcUsageLogs.filter((p) => p.date === dk).reduce((s, p) => s + p.minutes, 0);
  }
  return total;
}

// ------------------------------------------------------------
// Libri / Sport
// ------------------------------------------------------------
export function currentBook(db: DB) {
  return db.books.find((b) => b.status === "in_corso") ?? null;
}

export function workoutsInWeek(db: DB, weekStart: string): number {
  let n = 0;
  for (let i = 0; i < 7; i++) n += db.workouts.filter((w) => w.date === addDaysKey(weekStart, i)).length;
  return n;
}

export function sportStreak(db: DB): number {
  const days = new Set(db.workouts.map((w) => w.date));
  const tz = db.settings.timezone;
  let streak = 0;
  let cursor = todayKey(tz);
  // se oggi non c'è allenamento, riparti da ieri
  if (!days.has(cursor)) cursor = addDaysKey(cursor, -1);
  while (days.has(cursor)) {
    streak++;
    cursor = addDaysKey(cursor, -1);
  }
  return streak;
}

// ------------------------------------------------------------
// Sport Zone — profilo discipline (wizard + promemoria + anello)
// ------------------------------------------------------------

export interface SportWeekStats {
  weekStart: string; // day key "yyyy-MM-dd" dell'inizio settimana
  sessions: number; // allenamenti registrati nella settimana
  minutes: number; // minuti totali nella settimana
  sessionsTarget: number; // dal profilo (0 se assente)
  minutesTarget: number;
  done: boolean; // obiettivo sessioni raggiunto
  perDiscipline: { id: string; name: string; sessions: number; minutes: number }[];
}

/**
 * Statistiche sport della settimana che inizia a `weekStart`.
 * Le sessioni sono i workouts registrati (db.workouts): l'abbinamento con le
 * discipline è per nome (`workout.type === discipline.name`, confronto case-insensitive).
 */
export function sportWeekStats(db: DB, weekStart: string): SportWeekStats {
  const weekEnd = addDaysKey(weekStart, 6);
  const weekWorkouts = db.workouts.filter((w) => w.date >= weekStart && w.date <= weekEnd);
  const profile = db.sportProfile ?? null;

  const perDiscipline = (profile?.disciplines ?? []).map((d) => {
    const ws = weekWorkouts.filter(
      (w) => w.type.trim().toLowerCase() === d.name.trim().toLowerCase()
    );
    return {
      id: d.id,
      name: d.name,
      sessions: ws.length,
      minutes: ws.reduce((s, w) => s + (w.durationMin || 0), 0),
    };
  });

  return {
    weekStart,
    sessions: weekWorkouts.length,
    minutes: weekWorkouts.reduce((s, w) => s + (w.durationMin || 0), 0),
    sessionsTarget: profile?.weeklySessionsTarget ?? 0,
    minutesTarget: profile?.weeklyMinutesTarget ?? 0,
    done:
      profile != null &&
      profile.weeklySessionsTarget > 0 &&
      weekWorkouts.length >= profile.weeklySessionsTarget,
    perDiscipline,
  };
}

/** Discipline previste per il giorno `dayKey` (getDay(): 0=Dom..6=Sab). [] senza profilo. */
export function sportTodayDisciplines(db: DB, dayKey?: string): SportDiscipline[] {
  if (!db.sportProfile) return [];
  const key = dayKey ?? todayKey(db.settings.timezone);
  const dow = new Date(key + "T12:00:00").getDay(); // 0=Dom..6=Sab
  return db.sportProfile.disciplines.filter((d) => d.weekDays.includes(dow));
}

/**
 * Sovraccarico progressivo: quante settimane CONSECUTIVE (incluse le precedenti)
 * hanno raggiunto il target sessioni. L'ultima settimana in corso conta come
 * raggiunta solo se l'obiettivo è già stato sbloccato.
 */
export function sportConsecutiveWeeksDone(db: DB, thisWeekStart: string): number {
  if (!db.sportProfile || db.sportProfile.weeklySessionsTarget <= 0) return 0;
  let weeks = 0;
  let cursor = thisWeekStart;
  for (let i = 0; i < 52; i++) {
    const st = sportWeekStats(db, cursor);
    if (!st.done) break;
    weeks++;
    cursor = addDaysKey(cursor, -7);
  }
  return weeks;
}

/**
 * Suggerimento di sovracarico progressivo: dopo 4 settimane consecutive
 * raggiunte propone +10% sui minuti settimanali (hint manuale, mai automatico).
 */
export function sportOverloadHint(db: DB, thisWeekStart: string): { suggestedMinutes: number } | null {
  const profile = db.sportProfile;
  if (!profile || profile.weeklyMinutesTarget <= 0) return null;
  const streakWeeks = sportConsecutiveWeeksDone(db, thisWeekStart);
  if (streakWeeks < 4) return null;
  const steps = Math.floor(streakWeeks / 4); // un +10% ogni 4 settimane piene
  return {
    suggestedMinutes: Math.round(profile.weeklyMinutesTarget * Math.pow(1.1, steps)),
  };
}

// ------------------------------------------------------------
// Badge — key stabile, condizione nel codice (non nel DB)
// ------------------------------------------------------------
export interface BadgeDef {
  key: string;
  label: string;
  description: string;
  emoji: string;
}

export const BADGE_DEFS: BadgeDef[] = [
  { key: "streak_7", label: "Settimana di fuoco", description: "7 giorni di streak", emoji: "🔥" },
  { key: "streak_14", label: "Due settimane", description: "14 giorni di streak", emoji: "⚡" },
  { key: "streak_30", label: "Un mese", description: "30 giorni di streak", emoji: "🚀" },
  { key: "streak_60", label: "Due mesi", description: "60 giorni di streak", emoji: "🏆" },
  { key: "streak_100", label: "Cento giorni", description: "100 giorni di streak", emoji: "💎" },
  { key: "streak_365", label: "Un anno", description: "365 giorni di streak", emoji: "👑" },
  { key: "first_trade", label: "Primo trade", description: "Registra il tuo primo trade", emoji: "📈" },
  { key: "payout_first", label: "Primo payout", description: "Ricevi il tuo primo payout", emoji: "💰" },
  { key: "eval_superato", label: "Eval superata", description: "Supera un'account in valutazione", emoji: "🎯" },
  { key: "primo_libro", label: "Prima pagina", description: "Finisci il tuo primo libro", emoji: "📚" },
  { key: "primo_allenamento", label: "Primo allenamento", description: "Registra il primo workout", emoji: "💪" },
  { key: "mese_positivo", label: "Mese in verde", description: "P&L trading mensile positivo", emoji: "🌱" },
];

export function badgeDef(key: string): BadgeDef | undefined {
  return BADGE_DEFS.find((b) => b.key === key);
}

/** Ritorna le chiavi da sbloccare ora (non ancora in db.badges). */
export function computeNewBadges(db: DB): string[] {
  const owned = new Set(db.badges.map((b) => b.key));
  const streak = activityStreak(db);
  const newKeys: string[] = [];
  const steps = [7, 14, 30, 60, 100, 365];
  for (const s of steps) {
    const key = `streak_${s}`;
    if (streak.days >= s && !owned.has(key)) newKeys.push(key);
  }
  if (db.trades.length > 0 && !owned.has("first_trade")) newKeys.push("first_trade");
  if (db.payouts.length > 0 && !owned.has("payout_first")) newKeys.push("payout_first");
  if (db.accounts.some((a) => a.status === "superato") && !owned.has("eval_superato")) newKeys.push("eval_superato");
  if (db.books.some((b) => b.status === "finito") && !owned.has("primo_libro")) newKeys.push("primo_libro");
  if (db.workouts.length > 0 && !owned.has("primo_allenamento")) newKeys.push("primo_allenamento");
  const monthKey = todayKey(db.settings.timezone).slice(0, 7);
  if (monthPnlTrades(db, monthKey).base > 0 && !owned.has("mese_positivo")) newKeys.push("mese_positivo");
  return newKeys;
}

// ------------------------------------------------------------
// "Cosa manca oggi" — checklist dinamica dai DailyGoal
// ------------------------------------------------------------
export function missingToday(db: DB): { goal: DailyGoal; done: boolean; value: number; target: number }[] {
  const today = todayKey(db.settings.timezone);
  const res = ascordDay(db, today);
  return db.dailyGoals
    .filter((g) => g.active)
    .map((g) => ({
      goal: g,
      done: res.byGoal[g.id]?.met ?? false,
      value: res.byGoal[g.id]?.value ?? 0,
      target: g.targetValue,
    }));
}

export const GOAL_LABELS: Record<GoalType, string> = {
  finanze_check: "Registra una transazione",
  trade_log: "Chiudi almeno un trade",
  disciplina_ok: "Rispetta il playbook",
  lettura_minuti: "Minuti di lettura",
  allenamento: "Allenati",
  ore_produttive: "Ore produttive al PC",
};

// ------------------------------------------------------------
// Best/Worst della settimana (per la Home)
// ------------------------------------------------------------
export function bestWorstWeek(db: DB) {
  const tz = db.settings.timezone;
  const weeks = new Map<string, number[]>();
  for (const t of db.trades) {
    const dk = isoToDayKey(t.closeDate, tz);
    const wk = weekStartKey(dk, db.settings.weekStart);
    const arr = weeks.get(wk) ?? [];
    arr.push(t.resultNative * (db.accounts.find((a) => a.id === t.accountId) ? accountBaseRate(db.accounts.find((a) => a.id === t.accountId)!, db.settings.baseCurrency) : 1));
    weeks.set(wk, arr);
  }
  const rows = Array.from(weeks.entries())
    .map(([wk, arr]) => ({ weekKey: wk, pnl: arr.reduce((s, x) => s + x, 0) }))
    .sort((a, b) => a.weekKey.localeCompare(b.weekKey))
    .slice(-12); // ultime 12 settimane
  const best = rows.length ? rows.reduce((a, b) => (a.pnl >= b.pnl ? a : b)) : null;
  const worst = rows.length ? rows.reduce((a, b) => (a.pnl <= b.pnl ? a : b)) : null;
  return { best, worst };
}

// ------------------------------------------------------------
// Finanze — saldo complessivo (con saldo iniziale) + scadenze obiettivi
// ------------------------------------------------------------

/** Saldo totale del conto personale = saldoIniziale + Σ(entrate−uscite) di sempre (valuta base). */
export function financesToDate(db: DB): { start: number; income: number; expense: number; net: number } {
  let income = 0;
  let expense = 0;
  for (const t of db.transactions) {
    const amt = convertToBase(t.amount, t.exchangeRate);
    if (t.type === "income") income += amt;
    else expense += amt;
  }
  const start = db.settings.initialBalance ?? 0;
  return { start, income, expense, net: start + income - expense };
}

export interface DeadlineItem {
  id: string;
  kind: "daily" | "weekly";
  type: string;
  label: string;
  targetValue: number;
  deadline: string; // yyyy-MM-dd
  daysLeft: number;
  /** true solo negli "arretrati": deadline passata e obiettivo non soddisfatto. */
  overdue?: boolean;
  /** giorni di ritardo oltre la deadline (solo arretrati). */
  overdueDays?: number;
}

/** Obiettivi con scadenza (non passata) — usati in Home. */
export function upcomingDeadlines(db: DB): DeadlineItem[] {
  const tz = db.settings.timezone;
  const today = todayKey(tz);
  const todayMs = new Date(today + "T00:00:00").getTime();
  const daysLeftOf = (deadline: string) =>
    Math.max(0, Math.round((new Date(deadline + "T00:00:00").getTime() - todayMs) / 86400000));

  const out: DeadlineItem[] = [];
  for (const g of db.dailyGoals) {
    if (g.active && g.deadline && g.deadline >= today) {
      out.push({
        id: g.id,
        kind: "daily",
        type: g.type,
        label: GOAL_LABELS[g.type] ?? g.type,
        targetValue: g.targetValue,
        deadline: g.deadline,
        daysLeft: daysLeftOf(g.deadline),
      });
    }
  }
  for (const g of db.weeklyGoals) {
    if (g.active && g.deadline && g.deadline >= today) {
      out.push({
        id: g.id,
        kind: "weekly",
        type: g.type,
        label: WEEKLY_GOAL_LABELS[g.type] ?? g.type,
        targetValue: g.targetValue,
        deadline: g.deadline,
        daysLeft: daysLeftOf(g.deadline),
      });
    }
  }
  return out.sort((a, b) => a.deadline.localeCompare(b.deadline));
}

/** Trade chiusi nel periodo (settimana/mese) di un WeeklyGoal che contiene `dayKey`. */
function tradesInPeriod(db: DB, g: WeeklyGoal, dayKey: string): Trade[] {
  const tz = db.settings.timezone;
  let start: string;
  let end: string;
  if (g.period === "week") {
    start = weekStartKey(dayKey, db.settings.weekStart);
    end = addDaysKey(start, 6);
  } else {
    const r = monthRange(dayKey.slice(0, 7));
    start = r.start;
    end = r.end;
  }
  return db.trades.filter((t) => {
    const dk = isoToDayKey(t.closeDate, tz);
    return dk >= start && dk <= end;
  });
}

/** Progresso di un WeeklyGoal nel periodo che contiene `dayKey` (stessa metrica
 *  della pagina Obiettivi, ma valutata sul periodo della scadenza, non su oggi). */
function weeklyGoalValue(db: DB, g: WeeklyGoal, dayKey: string): number {
  const tz = db.settings.timezone;
  let start: string;
  let end: string;
  if (g.period === "week") {
    start = weekStartKey(dayKey, db.settings.weekStart);
    end = addDaysKey(start, 6);
  } else {
    const r = monthRange(dayKey.slice(0, 7));
    start = r.start;
    end = r.end;
  }
  const inRange = (dk: string) => dk >= start && dk <= end;
  const pcMin =
    g.period === "week"
      ? pcMinutesInWeek(db, start)
      : db.pcUsageLogs.filter((p) => inRange(p.date)).reduce((s, p) => s + p.minutes, 0);
  const workouts =
    g.period === "week"
      ? workoutsInWeek(db, start)
      : db.workouts.filter((w) => inRange(w.date)).length;
  let pages = 0;
  db.books.forEach((b) => {
    const u = isoToDayKey(b.updatedAt, tz);
    if (inRange(u)) pages += b.pagesRead || 0;
  });

  switch (g.type) {
    case "pc_hours":
      return Math.round((pcMin / 60) * 10) / 10;
    case "workout_count":
    case "allenamento":
      return workouts;
    case "book_pages":
      return pages;
    case "ore_produttive":
      return pcMin;
    case "lettura_minuti":
      return pages * 3;
    case "finanze_check":
      return db.transactions.filter((t) => inRange(t.date)).length;
    case "trade_log":
      return tradesInPeriod(db, g, dayKey).length;
    default:
      return 0;
  }
}

/** Un WeeklyGoal è soddisfatto se il target è raggiunto nel periodo della deadline. */
function weeklyGoalSatisfied(db: DB, g: WeeklyGoal): boolean {
  if (!g.deadline) return true; // senza deadline non è mai "arretrato"
  if (g.type === "disciplina_ok") {
    const ids = tradesInPeriod(db, g, g.deadline).map((t) => t.id);
    // come ascordDay: nessun trade nel periodo conta come rispettato
    return ids.length === 0 || ids.every((id) => tradeRespected(db, id) === true);
  }
  return weeklyGoalValue(db, g, g.deadline) >= g.targetValue;
}

/** Obiettivi ARRETRATI: deadline già passata e obiettivo NON soddisfatto.
 *  Complementare di upcomingDeadlines (che esclude le scadenze passate);
 *  consumatori esistenti invariati. */
export function overdueDeadlines(db: DB): DeadlineItem[] {
  const tz = db.settings.timezone;
  const today = todayKey(tz);
  const todayMs = new Date(today + "T00:00:00").getTime();
  const overdueDaysOf = (deadline: string) =>
    Math.max(1, Math.round((todayMs - new Date(deadline + "T00:00:00").getTime()) / 86400000));

  const out: DeadlineItem[] = [];
  for (const g of db.dailyGoals) {
    if (!(g.active && g.deadline && g.deadline < today)) continue;
    if (ascordDay(db, g.deadline).met) continue; // soddisfatto entro il giorno di scadenza
    out.push({
      id: g.id,
      kind: "daily",
      type: g.type,
      label: GOAL_LABELS[g.type] ?? g.type,
      targetValue: g.targetValue,
      deadline: g.deadline,
      daysLeft: 0,
      overdue: true,
      overdueDays: overdueDaysOf(g.deadline),
    });
  }
  for (const g of db.weeklyGoals) {
    if (!(g.active && g.deadline && g.deadline < today)) continue;
    if (weeklyGoalSatisfied(db, g)) continue;
    out.push({
      id: g.id,
      kind: "weekly",
      type: g.type,
      label: WEEKLY_GOAL_LABELS[g.type] ?? g.type,
      targetValue: g.targetValue,
      deadline: g.deadline,
      daysLeft: 0,
      overdue: true,
      overdueDays: overdueDaysOf(g.deadline),
    });
  }
  // prima i più in ritardo
  return out.sort((a, b) => (b.overdueDays ?? 0) - (a.overdueDays ?? 0));
}

export const WEEKLY_GOAL_LABELS: Record<string, string> = {
  workout_count: "Allenamenti",
  book_pages: "Pagine lette",
  pc_hours: "Ore al PC",
  finanze_check: "Check finanze",
  trade_log: "Trade loggati",
  lettura_minuti: "Minuti di lettura",
  allenamento: "Allenamenti",
  ore_produttive: "Ore produttive",
  disciplina_ok: "Disciplina",
};

// ------------------------------------------------------------
// Risparmi — conto di accumulo progressivo
// ------------------------------------------------------------
export interface SavingsTotals {
  deposited: number;
  committed: number; // versamenti allocati ai goal attivi
  target: number; // somma target dei goal attivi
  goals: {
    goal: import("./types").SavingsGoal;
    deposited: number;
    progressPct: number;
  }[];
}

export function savingsTotals(db: DB): SavingsTotals {
  const activeGoals = db.savingsGoals.filter((g) => g.active);
  const byGoal = new Map<string, number>();
  for (const d of db.savingsDeposits) {
    if (d.goalId && activeGoals.some((g) => g.id === d.goalId)) {
      byGoal.set(d.goalId, (byGoal.get(d.goalId) ?? 0) + d.amount);
    }
  }
  const deposited = db.savingsDeposits.reduce((s, d) => s + d.amount, 0);
  return {
    deposited,
    committed: activeGoals.reduce((s, g) => s + (byGoal.get(g.id) ?? 0), 0),
    target: activeGoals.reduce((s, g) => s + g.target, 0),
    goals: activeGoals.map((g) => {
      const dep = byGoal.get(g.id) ?? 0;
      return { goal: g, deposited: dep, progressPct: g.target > 0 ? Math.min(100, (dep / g.target) * 100) : dep > 0 ? 100 : 0 };
    }),
  };
}

/** Serie cumulativa dei versamenti (per la curva di accumulo). */
export function savingsSeries(db: DB): { date: string; value: number }[] {
  const sorted = [...db.savingsDeposits].sort((a, b) => a.date.localeCompare(b.date));
  let cum = 0;
  return sorted.map((d) => {
    cum += d.amount;
    return { date: d.date, value: cum };
  });
}

// ------------------------------------------------------------
// Serie per i nuovi grafici (trading & personale)
// ------------------------------------------------------------
export function rByMonth(db: DB, months: number = 12) {
  const tz = db.settings.timezone;
  const today = todayKey(tz);
  const out: { x: string; r: number; wins: number; count: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today + "T00:00:00");
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const trades = db.trades.filter((t) => monthKeyOf(isoToDayKey(t.closeDate, tz)) === key);
    out.push({
      x: key.slice(2),
      r: trades.reduce((s, t) => s + t.resultR, 0),
      wins: trades.filter((t) => t.resultR > 0).length,
      count: trades.length,
    });
  }
  return out;
}

export function monthlyWinRate(db: DB, months: number = 12) {
  const tz = db.settings.timezone;
  const today = todayKey(tz);
  const out: { x: string; winRate: number; count: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today + "T00:00:00");
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const trades = db.trades.filter((t) => monthKeyOf(isoToDayKey(t.closeDate, tz)) === key);
    const wins = trades.filter((t) => t.resultR > 0).length;
    out.push({ x: key.slice(2), winRate: trades.length ? (wins / trades.length) * 100 : 0, count: trades.length });
  }
  return out;
}

/** Drawdown della curva equity cumulativa (per area chart). */
export function drawdownSeries(trades: Trade[]): { date: string; value: number }[] {
  const sorted = [...trades].sort((a, b) => a.closeDate.localeCompare(b.closeDate));
  let cum = 0;
  let peak = 0;
  return sorted.map((t) => {
    cum += t.resultNative;
    if (cum > peak) peak = cum;
    return { date: t.closeDate, value: Math.min(0, cum - peak) };
  });
}

export interface EvalProgress {
  target: number | null; // saldo obiettivo (valuta nativa)
  capital: number;
  pnl: number; // pnl chiuso (valuta nativa)
  saldo: number; // capitale + pnl
  progressPct: number | null;
  reached: boolean;
}

export function evalProgress(db: DB, account: TradingAccount): EvalProgress {
  const pnl = db.trades
    .filter((t) => t.accountId === account.id)
    .reduce((s, t) => s + t.resultNative, 0);
  const saldo = account.capital + pnl;
  const target =
    account.status === "eval" && account.evalTarget != null ? account.evalTarget : null;
  return {
    target,
    capital: account.capital,
    pnl,
    saldo,
    progressPct: target && target !== 0 ? Math.min(100, (saldo / target) * 100) : null,
    reached: target != null && saldo >= target,
  };
}

export function weeklyReviewStats(db: DB, weekStart: string): WeeklyReviewStats {
  const weekEnd = addDaysKey(weekStart, 6);
  const trades = tradesBetween(db, weekStart, weekEnd);
  const st = tradingStats(trades);
  const disc = disciplineStats(db, trades.map((t) => t.id));
  const pc = pcMinutesInWeek(db, weekStart);
  const workouts = workoutsInWeek(db, weekStart);
  const txs = db.transactions.filter((t) => t.date >= weekStart && t.date <= weekEnd);
  let income = 0, expense = 0;
  txs.forEach((t) => {
    const amt = convertToBase(t.amount, t.exchangeRate);
    if (t.type === "income") income += amt; else expense += amt;
  });
  let pagesRead = 0;
  db.books.forEach((b) => { const upd = new Date(b.updatedAt); const s = new Date(weekStart + "T00:00:00"); const e = new Date(weekEnd + "T23:59:59"); if (upd >= s && upd <= e) pagesRead += b.pagesRead; });
  const asc = ascordWeek(db);
  return {
    weekStart,
    trades: st.count,
    winRate: st.winRate,
    totalR: st.totalR,
    totalNative: st.totalNative,
    profitFactor: st.profitFactor,
    disciplinePct: disc.disciplinePct,
    noSetupCount: disc.noSetupCount,
    pcMinutes: pc,
    workouts,
    income,
    expense,
    net: income - expense,
    pagesRead,
    ascordWon: asc.won,
    ascordTotal: asc.total,
  };
}

// ------------------------------------------------------------
// Ricorrenti — generazione automatica mensile
// ------------------------------------------------------------

/** Chiave mese "yyyy-MM" da una data "yyyy-MM-dd". */
function monthKeyOfDate(dk: string): string {
  return dk.slice(0, 7);
}

/** Chiave del mese successivo a "yyyy-MM" (es. "2026-12" → "2027-01"). */
function nextMonthKey(mk: string): string {
  const [y, m] = mk.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/** Giorno effettivo di addebito nel mese `mk`: dayOfMonth clampato ai giorni del mese (31 → 28 a febbraio). */
function dayOfMonthInMonth(rule: RecurringRule, mk: string): number {
  const [y, m] = mk.split("-").map(Number);
  return Math.min(rule.dayOfMonth, daysInMonth(y, m));
}

/**
 * Genera le transazioni per le regole ricorrenti attive scadute, con BACKFILL:
 * loop da lastAppliedMonth+1 al mese corrente — vengono generati anche i mesi
 * saltati (app non aperta). Data transazione = min(dayOfMonth, giorni del mese
 * TARGET) del mese generato (mai "oggi"). Regole nuove (lastAppliedMonth null):
 * se la scadenza del mese corrente è già passata generano subito, altrimenti
 * partono dal mese prossimo (niente retroattivo per regole appena create).
 * Anti-doppione: id deterministico `rec-<ruleId>-<yyyy-MM>`; lastAppliedMonth
 * avanza a ogni mese effettivamente generato.
 * Ritorna { transactions, rules }: nuove transazioni + regole aggiornate. PURE.
 */
export function applyRecurringRules(
  db: DB,
  today: string // "yyyy-MM-dd"
): { transactions: TransactionType2[]; rules: RecurringRule[] } {
  const thisMonth = monthKeyOfDate(today);
  const day = Number(today.slice(8, 10));
  const newTx: TransactionType2[] = [];
  const updatedRules: RecurringRule[] = [];

  for (const rule of db.recurringRules ?? []) {
    if (!rule.active) continue;
    if (rule.lastAppliedMonth === thisMonth) continue; // già generata questo mese

    // mese di partenza: il successivo all'ultimo applicato; per una regola
    // nuova, il mese corrente solo se la scadenza clampata è già passata,
    // altrimenti il mese prossimo (mai generazione retroattiva).
    const fromMonth = rule.lastAppliedMonth
      ? nextMonthKey(rule.lastAppliedMonth)
      : dayOfMonthInMonth(rule, thisMonth) <= day
        ? thisMonth
        : nextMonthKey(thisMonth);

    let lastApplied: string | null = null;
    for (let mk = fromMonth; mk <= thisMonth; mk = nextMonthKey(mk)) {
      const dueDay = dayOfMonthInMonth(rule, mk);
      if (mk === thisMonth && dueDay > day) break; // scadenza di questo mese non ancora raggiunta
      const [y, m] = mk.split("-").map(Number);
      const tx: TransactionType2 = {
        id: `rec-${rule.id}-${mk}`,
        amount: rule.amount,
        currency: rule.currency,
        exchangeRate: rule.exchangeRate,
        type: rule.type,
        categoryId: rule.categoryId,
        date: dateKey(y, m, dueDay), // giorno del MESE TARGET (mai "oggi")
        note: `${rule.name} (ricorrente)`,
        recurring: true,
        autoGenerated: true,
        sourceRecurringId: rule.id,
        createdAt: new Date().toISOString(),
      };
      newTx.push(tx);
      lastApplied = mk;
    }
    if (lastApplied != null) {
      updatedRules.push({ ...rule, lastAppliedMonth: lastApplied });
    }
  }

  return { transactions: newTx, rules: updatedRules };
}

// ------------------------------------------------------------
// Correlazione Disciplina → P&L
// ------------------------------------------------------------

/** Metriche di tradingStats limitate ai campi chiave, per un gruppo di trade. */
export interface DisciplinePnlBucket {
  count: number;
  winRate: number | null; // % wins/count
  avgR: number | null; // media rMultiple
  totalNative: number; // somma resultNative (valuta nativa)
  pf: number | null; // profit factor, come in tradingStats
}

export interface DisciplinePnlSplit {
  respected: DisciplinePnlBucket; // tradeRespected() === true
  violated: DisciplinePnlBucket; // tradeRespected() === false
  none: DisciplinePnlBucket; // senza setup o non valutabile
}

function disciplinePnlBucket(trades: Trade[]): DisciplinePnlBucket {
  const wins = trades.filter((t) => t.resultR > 0);
  const losses = trades.filter((t) => t.resultR < 0);
  const grossProfit = wins.reduce((s, t) => s + t.resultNative, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.resultNative, 0));
  return {
    count: trades.length,
    winRate: trades.length ? (wins.length / trades.length) * 100 : null,
    avgR: trades.length ? trades.reduce((s, t) => s + t.resultR, 0) / trades.length : null,
    totalNative: trades.reduce((s, t) => s + t.resultNative, 0),
    pf: grossLoss > 0 ? grossProfit / grossLoss : null,
  };
}

/**
 * Correlazione disciplina → P&L: raggruppa i trade (chiusi) per esito di
 * disciplina — rispettati (tradeRespected === true), violati (=== false) e
 * senza setup valutabile (null) — con le stesse metriche di tradingStats
 * per ciascun gruppo. PURE: legge il DB, non lo modifica.
 */
export function disciplinePnlSplit(db: DB, trades: Trade[]): DisciplinePnlSplit {
  const respected: Trade[] = [];
  const violated: Trade[] = [];
  const none: Trade[] = [];
  for (const t of trades) {
    const r = tradeRespected(db, t.id);
    if (r === true) respected.push(t);
    else if (r === false) violated.push(t);
    else none.push(t);
  }
  return {
    respected: disciplinePnlBucket(respected),
    violated: disciplinePnlBucket(violated),
    none: disciplinePnlBucket(none),
  };
}
