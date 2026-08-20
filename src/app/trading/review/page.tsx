"use client";

// ============================================================
// ASCEND — Weekly Review (specifica v3)
// Settimana selezionabile (weekStart di UserSettings), statistiche
// auto-calcolate via weeklyReviewStats + 3 domande di riflessione
// salvate su db.weeklyReviews (upsert per weekStart).
// ============================================================

import { useMemo, useRef, useState } from "react";
import { useDB, updateDB, upsert, uid, nowISO } from "@/lib/storage";
import { weeklyReviewStats, accountBaseRate, ascordDay } from "@/lib/compute";
import { todayKey, weekStartKey, addDaysKey, parseDateKey, isoToDayKey } from "@/lib/dates";
import {
  formatMoney,
  formatNumber,
  formatPercent,
  formatR,
  minutiToOre,
} from "@/lib/format";
import { moneyMasked, kpiMasked, maskMoney, maskKpi } from "@/lib/privacy";
import type { WeeklyReview } from "@/lib/types";
import { Card, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { Field, TextArea } from "@/components/ui/Field";
import { EmptyState, SectionHeader } from "@/components/ui/Misc";

// --- helper locali (dentro il file, niente toccate a src/lib) ---

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** "yyyy-MM-dd" → "dd/mm/yyyy" */
function keyToLabel(key: string): string {
  const { y, m, d } = parseDateKey(key);
  return `${pad2(d)}/${pad2(m)}/${y}`;
}

/** Snapshot tipizzato delle statistiche di settimana (weeklyReviewStats + integrazioni). */
interface WeekStats {
  trades: number;
  winRate: number | null;
  totalR: number;
  totalNative: number;
  totalBase: number; // P&L nativo → valuta base
  profitFactor: number | null;
  disciplinePct: number | null;
  noSetupCount: number;
  pcMinutes: number;
  workouts: number;
  income: number;
  expense: number;
  net: number;
  pagesRead: number;
  ascordWon: number;
  ascordTotal: number;
  wins: number;
  losses: number;
  breakeven: number;
}

export default function WeeklyReviewPage() {
  const db = useDB();
  const tz = db.settings.timezone;
  const today = todayKey(tz);
  const currentWeekStart = weekStartKey(today, db.settings.weekStart);
  const [week, setWeek] = useState<string>(currentWeekStart);
  const weekEnd = addDaysKey(week, 6);
  const minWeek = addDaysKey(currentWeekStart, -728); // max ~2 anni indietro

  // Statistiche della settimana selezionata, auto-calcolate a ogni render.
  const stats = useMemo<WeekStats>(() => {
    const raw = weeklyReviewStats(db, week) as unknown as Omit<
      WeekStats,
      "totalBase" | "ascordWon" | "ascordTotal" | "wins" | "losses" | "breakeven"
    >;

    // P&L in valuta base (native → base) per i trade chiusi nella settimana.
    const tradesOfWeek = db.trades.filter((t) => {
      const dk = isoToDayKey(t.closeDate, tz);
      return dk >= week && dk <= weekEnd;
    });
    let totalBase = 0,
      wins = 0,
      losses = 0,
      breakeven = 0;
    for (const t of tradesOfWeek) {
      const acc = db.accounts.find((a) => a.id === t.accountId);
      totalBase += t.resultNative * (acc ? accountBaseRate(acc, db.settings.baseCurrency) : 1);
      if (t.resultR > 0) wins++;
      else if (t.resultR < 0) losses++;
      else breakeven++;
    }

    // Ascend Day di QUESTA settimana (weeklyReviewStats usa la settimana corrente):
    // conta i giorni già trascorsi della settimana selezionata.
    let ascordWon = 0,
      ascordTotal = 0;
    for (let i = 0; i < 7; i++) {
      const dk = addDaysKey(week, i);
      if (dk > today) break;
      ascordTotal++;
      if (ascordDay(db, dk).met) ascordWon++;
    }

    return { ...raw, totalBase, ascordWon, ascordTotal, wins, losses, breakeven };
  }, [db, week, tz, weekEnd, today]);

  const existing = db.weeklyReviews.find((r) => r.weekStart === week) ?? null;

  const pct = (v: number | null): string =>
    v == null ? "—" : kpiMasked(db.settings.privacyMode) ? maskKpi() : formatPercent(v);
  const money = (v: number): string =>
    moneyMasked(db.settings.privacyMode)
      ? maskMoney()
      : formatMoney(v, db.settings.baseCurrency, db.settings.locale);
  const pnlTone = stats.totalBase > 0 ? "positive" : stats.totalBase < 0 ? "negative" : "neutral";

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Weekly Review"
        subtitle="Dati della settimana e riflessione. Chiudi ogni settimana con consapevolezza."
      />

      {/* Selettore settimana */}
      <Card>
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeek(addDaysKey(week, -7))}
            disabled={week <= minWeek}
            aria-label="Settimana precedente"
            title="Settimana precedente"
          >
            ‹
          </Button>
          <div className="text-center">
            <p className="text-sm font-semibold">Settimana del {keyToLabel(week)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground tnum">
              {keyToLabel(week)} → {keyToLabel(weekEnd)}
              {week === currentWeekStart && <span className="text-accent"> · corrente</span>}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {week !== currentWeekStart && (
              <Button variant="ghost" size="sm" onClick={() => setWeek(currentWeekStart)}>
                Oggi
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setWeek(addDaysKey(week, 7))}
              disabled={week >= currentWeekStart}
              aria-label="Prossima settimana"
              title="Prossima settimana"
            >
              ›
            </Button>
          </div>
        </div>
      </Card>

      {/* Statistiche auto-calcolate */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <StatCard
          label="Trade chiusi"
          value={formatNumber(stats.trades)}
          delta={`${stats.wins} win · ${stats.losses} loss`}
        />
        <StatCard label="Win rate" value={pct(stats.winRate)} delta="sui trade chiusi" />
        <StatCard
          label="P&L trading"
          value={money(stats.totalBase)}
          delta={`${formatR(stats.totalR)} in R`}
          deltaTone={pnlTone}
        />
        <StatCard
          label="Profit factor"
          value={
            stats.profitFactor != null
              ? stats.profitFactor.toLocaleString("it-IT", { maximumFractionDigits: 2 })
              : "—"
          }
          delta="lordo win / lordo loss"
        />
        <StatCard
          label="Disciplina"
          value={pct(stats.disciplinePct)}
          delta={`${stats.noSetupCount} senza setup`}
        />
        <StatCard
          label="Ore PC"
          value={minutiToOre(stats.pcMinutes)}
          delta={`${formatNumber(stats.pcMinutes)} min`}
        />
        <StatCard label="Allenamenti" value={formatNumber(stats.workouts)} delta="nella settimana" />
        <StatCard label="Pagine lette" value={formatNumber(stats.pagesRead)} delta="da libri in corso" />
        <StatCard
          label="Ascend Day"
          value={`${stats.ascordWon}/${stats.ascordTotal}`}
          delta={
            stats.ascordTotal > 0 && stats.ascordWon === stats.ascordTotal
              ? "Settimana perfetta ✨"
              : "giorni vinti"
          }
          deltaTone={stats.ascordTotal > 0 && stats.ascordWon === stats.ascordTotal ? "positive" : "neutral"}
        />
      </div>

      {/* Finanze della settimana (valuta base) */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Finanze della settimana
          </span>
          <span className="text-[10px] text-muted-foreground">
            {db.settings.baseCurrency}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Entrate</p>
            <p className="mt-1 text-lg font-semibold tnum text-success">{money(stats.income)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Uscite</p>
            <p className="mt-1 text-lg font-semibold tnum text-danger">{money(stats.expense)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Net</p>
            <p
              className={`mt-1 text-lg font-semibold tnum ${
                stats.net > 0 ? "text-success" : stats.net < 0 ? "text-danger" : "text-foreground"
              }`}
            >
              {money(stats.net)}
            </p>
          </div>
        </div>
      </Card>

      {/* Riflessione */}
      <ReflectionForm key={week} week={week} existing={existing} stats={stats} />
    </div>
  );
}

// ------------------------------------------------------------
// Form di riflessione — risposte editabili, upsert per weekStart
// ------------------------------------------------------------

function ReflectionForm({
  week,
  existing,
  stats,
}: {
  week: string;
  existing: WeeklyReview | null;
  stats: WeekStats;
}) {
  const db = useDB();

  const [a1, setA1] = useState(existing?.answer1 ?? "");
  const [a2, setA2] = useState(existing?.answer2 ?? "");
  const [a3, setA3] = useState(existing?.answer3 ?? "");
  const [showForm, setShowForm] = useState(!!existing);
  const [msg, setMsg] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showMsg = (text: string) => {
    setMsg(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 4000);
  };

  const startForm = () => {
    setShowForm(true);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const save = () => {
    const now = nowISO();
    const review: WeeklyReview = {
      id: existing?.id ?? uid(),
      weekStart: week,
      stats: { ...stats, weekStart: week }, // snapshot auto-calcolato
      answer1: a1.trim(),
      answer2: a2.trim(),
      answer3: a3.trim(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    updateDB((d) => ({ ...d, weeklyReviews: upsert(d.weeklyReviews, review) }));
    setShowForm(true);
    showMsg(`Review salvata per la settimana del ${keyToLabel(week)}.`);
  };

  const nothingToSave = !a1.trim() && !a2.trim() && !a3.trim();

  // Empty state: nessuna review salvata per questa settimana
  if (!existing && !showForm) {
    return (
      <Card>
        <EmptyState
          icon="✍️"
          title="Nessuna review per questa settimana"
          description="Prenditi dieci minuti: cosa è andato bene, cosa no, e cosa cambierai. Le statistiche sopra sono già pronte."
          action={<Button onClick={startForm}>Completa oggi</Button>}
        />
      </Card>
    );
  }

  return (
    <div ref={formRef}>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Riflessione della settimana</CardTitle>
            <CardSubtitle>Settimana del {keyToLabel(week)}</CardSubtitle>
          </div>
        </CardHeader>
        <div className="space-y-4">
          <Field label="1 · Cosa ha funzionato questa settimana?">
            <TextArea
              rows={3}
              value={a1}
              onChange={(e) => setA1(e.target.value)}
              placeholder="Es. ho rispettato il playbook, ho chiuso prima del rollover, niente revenge trading…"
            />
          </Field>
          <Field label="2 · Cosa non ha funzionato e perché?">
            <TextArea
              rows={3}
              value={a2}
              onChange={(e) => setA2(e.target.value)}
              placeholder="Es. ho inseguito il mercato, orari sbagliati, ho saltato il journal di un giorno…"
            />
          </Field>
          <Field label="3 · Cosa farò diversamente la prossima settimana?">
            <TextArea
              rows={3}
              value={a3}
              onChange={(e) => setA3(e.target.value)}
              placeholder="Un'azione concreta: regola, abitudine o processo da cambiare."
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={nothingToSave}>
            Salva review
          </Button>
          {msg && <span className="text-sm font-medium text-success">{msg}</span>}
        </div>
        {existing && (
          <p className="mt-3 text-xs text-muted-foreground">
            {existing.updatedAt === existing.createdAt ? "Creato" : "Aggiornato"} il{" "}
            {new Date(existing.updatedAt).toLocaleString(db.settings.locale)}
          </p>
        )}
      </Card>
    </div>
  );
}
