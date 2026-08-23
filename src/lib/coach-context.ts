// ============================================================
// ASCEND — Contesto per il Coach AI.
// buildCoachContext(db) compatta i dati REALI della settimana in
// un blocco di testo italiano (~30 righe) pronto per il prompt
// del modello locale (Ollama). Nessun dato finto: tutto calcolato
// con gli stessi helper usati dall'app.
// ============================================================

import type { DB } from "./types";
import {
  actionsOnDay,
  activityStreak,
  ascordDay,
  disciplineStats,
  pcMinutesInWeek,
  sportWeekStats,
  tradingStats,
  tradesBetween,
} from "./compute";
import { addDaysKey, todayKey, weekStartKey } from "./dates";
import { formatMoney, formatNumber } from "./format";

const pct = (v: number | null): string => (v == null ? "n/d" : `${Math.round(v)}%`);
const num = (n: number): string => formatNumber(Math.round(n));

/** Blocco di contesto in italiano con i dati reali della settimana corrente. */
export function buildCoachContext(db: DB): string {
  const tz = db.settings.timezone;
  const today = todayKey(tz);
  const ws = weekStartKey(today, db.settings.weekStart);
  const cur = db.settings.baseCurrency;
  const lines: string[] = [];

  lines.push(`Settimana dal ${ws} — oggi ${today}.`);

  // --- Trading ---
  const trades = tradesBetween(db, ws, addDaysKey(ws, 6));
  const st = tradingStats(trades);
  if (st.count === 0) {
    lines.push("Trading: nessun trade chiuso questa settimana.");
  } else {
    lines.push(
      `Trading: ${st.count} trade chiusi — Win rate: ${pct(st.winRate)} — R totale: ${num(st.totalR)}R.`
    );
    const disc = disciplineStats(db, trades.map((t) => t.id));
    if (disc.disciplinePct != null) {
      lines.push(`Disciplina (setup rispettati): ${pct(disc.disciplinePct)}.`);
    }
    if (disc.noSetupCount > 0) {
      lines.push(`${disc.noSetupCount} trade senza setup assegnato.`);
    }
  }

  // --- Sport ---
  const sp = sportWeekStats(db, ws);
  if (sp.sessionsTarget > 0 || sp.minutesTarget > 0) {
    lines.push(
      `Sport: ${sp.sessions}/${sp.sessionsTarget > 0 ? sp.sessionsTarget : "—"} sessioni, ` +
        `${Math.round(sp.minutes)}/${sp.minutesTarget > 0 ? sp.minutesTarget : "—"} min.`
    );
  } else if (sp.sessions > 0) {
    lines.push(`Sport: ${sp.sessions} sessioni (${Math.round(sp.minutes)} min), nessun obiettivo settimanale impostato.`);
  } else {
    lines.push("Sport: nessun allenamento questa settimana.");
  }

  // --- PC / produttività ---
  lines.push(`Minuti al PC (sett.): ${num(pcMinutesInWeek(db, ws))}.`);

  // --- Lettura (pattern weeklyReviewStats: pagine dei libri toccati nella settimana) ---
  const wsDate = new Date(`${ws}T00:00:00`);
  const weDate = new Date(`${addDaysKey(ws, 6)}T23:59:59`);
  let pagesRead = 0;
  for (const b of db.books) {
    const upd = new Date(b.updatedAt);
    if (upd >= wsDate && upd <= weDate) pagesRead += b.pagesRead;
  }
  lines.push(`Pagine lette (sett.): ${pagesRead}.`);

  // --- Attività / streak ---
  const streak = activityStreak(db);
  lines.push(
    streak.days > 0
      ? `Streak attività: ${streak.days} giorni${streak.todayActive ? "" : " (oggi non ancora attivo)"}.`
      : "Streak attività: 0 giorni."
  );
  const azioniOggi = actionsOnDay(db, today);
  lines.push(azioniOggi.length > 0 ? `Azioni di oggi: ${azioniOggi.join(", ")}.` : "Nessuna azione registrata oggi.");

  // --- Ascend Day di oggi ---
  const ad = ascordDay(db, today);
  lines.push(
    ad.total > 0
      ? `Ascend Day oggi: ${ad.done}/${ad.total} obiettivi raggiunti${ad.met ? " — GIORNO COMPLETO ✅" : ""}.`
      : "Ascend Day: nessun obiettivo giornaliero attivo."
  );

  // --- Risparmi ---
  const goalsAttivi = db.savingsGoals.filter((g) => g.active);
  if (goalsAttivi.length === 0) {
    lines.push("Obiettivi risparmio: nessuno attivo.");
  } else {
    const byGoal = new Map<string, number>();
    for (const d of db.savingsDeposits) {
      if (d.goalId && goalsAttivi.some((g) => g.id === d.goalId)) {
        byGoal.set(d.goalId, (byGoal.get(d.goalId) ?? 0) + d.amount);
      }
    }
    lines.push(`Obiettivi risparmio attivi: ${goalsAttivi.length}.`);
    for (const g of goalsAttivi.slice(0, 5)) {
      const dep = byGoal.get(g.id) ?? 0;
      const p = g.target > 0 ? Math.min(100, Math.round((dep / g.target) * 100)) : null;
      lines.push(`- ${g.name}: ${formatMoney(dep, cur)} su ${formatMoney(g.target, cur)}${p != null ? ` (${p}%)` : ""}`);
    }
  }

  return lines.join("\n");
}

/** Prompt di sistema del coach Ascend (italiano, dati-only, conciso). */
export function coachSystemPrompt(): string {
  return [
    "Sei il coach personale di Ascend, un'app di disciplina che unisce trading, finanza personale,",
    "sport, lettura e produttività. Rispondi SEMPRE in italiano.",
    "Ti verranno forniti i dati reali dell'utente come contesto: usa SOLO quei dati.",
    "Non inventare mai numeri o fatti assenti dal contesto; se i dati non bastano per rispondere, dillo chiaramente.",
    "Sii breve e concreto: massimo 150 parole, andiamo dritti al punto.",
    "Non dare consigli medici né finanziari/investimentici: parla di abitudini, costanza e processo.",
    "Se l'utente chiede qualcosa fuori dai suoi dati, riportalo con gentilezza ai propri progressi.",
  ].join(" ");
}
