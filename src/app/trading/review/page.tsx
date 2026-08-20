"use client";

// ============================================================
// ASCEND — Weekly Review (specifica v3) · art-direction rich/animated
// Settimana selezionabile (weekStart di UserSettings), statistiche
// auto-calcolate via weeklyReviewStats + 3 domande di riflessione
// salvate su db.weeklyReviews (upsert per weekStart).
// LOGICA INVARIATA — solo resa UI (StatCard compatte con sparkline,
// AnimatedNumber sui totali, finanze a 3 colonne, quiz curato,
// kicker, badge 'corrente', banner "Settimana perfetta ✨" con glow).
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useDB, updateDB, upsert, uid, nowISO } from "@/lib/storage";
import {
  weeklyReviewStats,
  accountBaseRate,
  ascordDay,
  disciplineStats,
} from "@/lib/compute";
import {
  todayKey,
  weekStartKey,
  addDaysKey,
  parseDateKey,
  isoToDayKey,
  labelDayKey,
} from "@/lib/dates";
import {
  formatMoney,
  formatNumber,
  formatPercent,
  formatR,
  minutiToOre,
} from "@/lib/format";
import { moneyMasked, kpiMasked, maskMoney, maskKpi } from "@/lib/privacy";
import type { DB, WeeklyReview } from "@/lib/types";
import { Card, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { TextArea } from "@/components/ui/Field";
import { EmptyState, SectionHeader } from "@/components/ui/Misc";
import { Reveal } from "@/components/ui/Reveal";

// --- helper locali (dentro il file, niente toccate a src/lib) ---

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** "yyyy-MM-dd" → "dd/mm/yyyy" */
function keyToLabel(key: string): string {
  const { y, m, d } = parseDateKey(key);
  return `${pad2(d)}/${pad2(m)}/${y}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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

/**
 * Statistiche LIVE della settimana — ricalcolate a OGNI render direttamente da
 * `db` (derivato da useDB()), mai lette dallo snapshot salvato nella WeeklyReview.
 * Funzione pura chiamata nel body del componente: nessun memo di cache che congela,
 * quindi aggiungi/elimina un trade, una transazione, un allenamento o minuti PC
 * della settimana → il valore si aggiorna immediatamente senza refresh.
 */
function computeWeekStats(db: DB, week: string): WeekStats {
  const tz = db.settings.timezone;
  const today = todayKey(tz);
  const weekEnd = addDaysKey(week, 6);
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
}

export default function WeeklyReviewPage() {
  const db = useDB();
  const tz = db.settings.timezone;
  const locale = db.settings.locale;
  const today = todayKey(tz);
  const currentWeekStart = weekStartKey(today, db.settings.weekStart);
  const [week, setWeek] = useState<string>(currentWeekStart);
  // Segnale per aprire la riflessione da "Completa oggi" (setWeek + scroll al form).
  const [openSignal, setOpenSignal] = useState(0);
  const weekEnd = addDaysKey(week, 6);
  const minWeek = addDaysKey(currentWeekStart, -728); // max ~2 anni indietro
  const isCurrent = week === currentWeekStart;

  // "Completa oggi": porta la selezione sulla settimana corrente e scroll alle domande.
  const handleCompletaOggi = () => {
    setWeek(currentWeekStart);
    setOpenSignal((n) => n + 1);
  };

  // Statistiche della settimana selezionata: RICALCOLO LIVE a ogni render,
  // direttamente da db (useDB) tramite weeklyReviewStats(db, week) + integrazioni.
  // Nessuno snapshot della WeeklyReview, nessun memo di cache congelato: il
  // valore riflette subito ogni aggiunta/eliminazione di dati della settimana.
  const stats = computeWeekStats(db, week);

  // Sparkline giornaliere (solo giorni trascorsi) per win rate, P&L, disciplina e Ascend.
  // Ricalcolate quando db cambia (deps: db) — quindi sempre allineate, mai congelate.
  const daily = useMemo(() => {
    const pnl: number[] = [];
    const winRate: number[] = [];
    const discipline: number[] = [];
    const ascord: number[] = [];
    const count: number[] = [];
    let prevWr: number | null = null;
    let prevDisc: number | null = null;
    for (let i = 0; i < 7; i++) {
      const dk = addDaysKey(week, i);
      if (dk > today) continue; // il futuro non è ancora scritto
      const dayTrades = db.trades.filter((t) => isoToDayKey(t.closeDate, tz) === dk);
      let dPnl = 0,
        wins = 0;
      for (const t of dayTrades) {
        const acc = db.accounts.find((a) => a.id === t.accountId);
        dPnl += t.resultNative * (acc ? accountBaseRate(acc, db.settings.baseCurrency) : 1);
        if (t.resultR > 0) wins++;
      }
      pnl.push(round2(dPnl));
      count.push(dayTrades.length);

      // giorni senza trade → riporta il valore precedente (linea piatta)
      let dWr: number | null = dayTrades.length ? (wins / dayTrades.length) * 100 : null;
      if (dWr == null) dWr = prevWr;
      else prevWr = dWr;
      winRate.push(dWr ?? 0);

      let dDisc: number | null = dayTrades.length
        ? disciplineStats(db, dayTrades.map((t) => t.id)).disciplinePct
        : null;
      if (dDisc == null) dDisc = prevDisc;
      else prevDisc = dDisc;
      discipline.push(dDisc ?? 0);

      ascord.push(ascordDay(db, dk).met ? 1 : 0);
    }
    return { pnl, winRate, discipline, ascord, count };
  }, [db, week, tz, today]);

  const existing = db.weeklyReviews.find((r) => r.weekStart === week) ?? null;

  const pct = (v: number | null): string =>
    v == null ? "—" : kpiMasked(db.settings.privacyMode) ? maskKpi() : formatPercent(v);
  const money = (v: number): string =>
    moneyMasked(db.settings.privacyMode)
      ? maskMoney()
      : formatMoney(v, db.settings.baseCurrency, db.settings.locale);
  const pnlTone = stats.totalBase > 0 ? "positive" : stats.totalBase < 0 ? "negative" : "neutral";
  const pnlSparkColor = stats.totalBase >= 0 ? "#2DDF9E" : "#FF5C5C";

  const perfect = stats.ascordTotal > 0 && stats.ascordWon === stats.ascordTotal;
  const perfectFull = perfect && stats.ascordTotal === 7;

  return (
    <div className="space-y-6">
      <SectionHeader
        kicker="Trading · Weekly Review"
        title="Weekly Review"
        subtitle="Dati della settimana e riflessione. Chiudi ogni settimana con consapevolezza."
        action={
          existing ? (
            <Badge tone="success">✓ Review salvata</Badge>
          ) : (
            <Badge tone="default">Da compilare</Badge>
          )
        }
      />

      {/* Selettore settimana */}
      <Reveal>
        <Card hairline="accent">
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
            <div className="min-w-0 flex-1 text-center">
              <p className="text-sm font-semibold sm:text-[15px]">
                Settimana del {labelDayKey(week, locale)}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center justify-center gap-2">
                <span className="text-[11px] text-secondary-text tnum">
                  {keyToLabel(week)} → {keyToLabel(weekEnd)}
                </span>
                {isCurrent && (
                  <Badge tone="info" pulse>
                    corrente
                  </Badge>
                )}
                {existing && (
                  <Badge tone="success">✓ review</Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {!isCurrent && (
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
      </Reveal>

      {/* Settimana perfetta ✨ — glow quando Ascend completo */}
      {perfect && (
        <Reveal>
          <div
            className={cn(
              "animate-pop relative flex items-center gap-3.5 overflow-hidden rounded-[--radius] border px-4 py-3.5",
              perfectFull
                ? "border-success/45 bg-success/10 shadow-[0_0_55px_-12px_rgba(45,223,158,0.6)]"
                : "border-success/30 bg-success/[0.07] shadow-[0_0_35px_-14px_rgba(45,223,158,0.45)]"
            )}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-success/15 text-xl shadow-[0_0_18px_-4px_rgba(45,223,158,0.7)]">
              ✨
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-success">
                {perfectFull ? "Settimana perfetta — 7/7 giorni vinti" : "Serie perfetta in corso"}
              </p>
              <p className="mt-0.5 text-xs text-success/70">
                {perfectFull
                  ? "Ogni Ascend Day completato. Hai chiuso la settimana al massimo."
                  : `${stats.ascordWon}/${stats.ascordTotal} giorno${stats.ascordTotal > 1 ? "i" : ""} vinto${
                      stats.ascordTotal > 1 ? "i" : ""
                    } finora: mantieni il ritmo.`}
              </p>
            </div>
            <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-success animate-pulse-dot" />
          </div>
        </Reveal>
      )}

      {/* Statistiche auto-calcolate — StatCard compatte con sparkline */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <Reveal delay={0}>
          <StatCard
            label="Trade chiusi"
            icon={<span className="text-sm">📊</span>}
            value={formatNumber(stats.trades)}
            delta={`${stats.wins} win · ${stats.losses} loss${stats.breakeven ? ` · ${stats.breakeven} be` : ""}`}
            spark={daily.count}
            sparkColor="#4C7EFF"
          />
        </Reveal>
        <Reveal delay={50}>
          <StatCard
            label="Win rate"
            icon={<span className="text-sm">🎯</span>}
            value={pct(stats.winRate)}
            delta="sui trade chiusi"
            spark={daily.winRate}
            sparkColor="#2DDF9E"
            hairline="success"
          />
        </Reveal>
        <Reveal delay={100}>
          <div
            className="h-full rounded-[--radius]"
            style={
              pnlTone === "positive"
                ? { boxShadow: "0 0 32px -14px rgba(45,223,158,0.5)" }
                : pnlTone === "negative"
                ? { boxShadow: "0 0 32px -14px rgba(255,92,92,0.6)" }
                : undefined
            }
          >
            <StatCard
              label="P&L trading"
              icon={<span className="text-sm">💰</span>}
              valueClassName={
                stats.totalBase > 0 ? "text-success" : stats.totalBase < 0 ? "text-danger" : ""
              }
              value={
                <AnimatedNumber
                  key={week}
                  value={stats.totalBase}
                  fmt={money}
                />
              }
              delta={`${formatR(stats.totalR)} in R`}
              deltaTone={pnlTone}
              spark={daily.pnl}
              sparkColor={pnlSparkColor}
              hairline={pnlTone === "positive" ? "success" : pnlTone === "negative" ? "danger" : "accent"}
            />
          </div>
        </Reveal>
        <Reveal delay={150}>
          <StatCard
            label="Profit factor"
            icon={<span className="text-sm">⚖️</span>}
            value={
              stats.profitFactor != null
                ? stats.profitFactor.toLocaleString("it-IT", { maximumFractionDigits: 2 })
                : "—"
            }
            delta="lordo win / lordo loss"
          />
        </Reveal>
        <Reveal delay={0}>
          <StatCard
            label="Disciplina"
            icon={<span className="text-sm">🧭</span>}
            value={pct(stats.disciplinePct)}
            delta={`${stats.noSetupCount} senza setup`}
            spark={daily.discipline}
            sparkColor="#2FD4FF"
          />
        </Reveal>
        <Reveal delay={50}>
          <StatCard
            label="Ore PC"
            icon={<span className="text-sm">💻</span>}
            value={minutiToOre(stats.pcMinutes)}
            delta={`${formatNumber(stats.pcMinutes)} min`}
          />
        </Reveal>
        <Reveal delay={100}>
          <StatCard
            label="Allenamenti"
            icon={<span className="text-sm">🏋️</span>}
            value={formatNumber(stats.workouts)}
            delta="nella settimana"
          />
        </Reveal>
        <Reveal delay={150}>
          <StatCard
            label="Pagine lette"
            icon={<span className="text-sm">📖</span>}
            value={formatNumber(stats.pagesRead)}
            delta="da libri in corso"
          />
        </Reveal>
        <Reveal delay={200}>
          <div
            className={cn(
              "h-full rounded-[--radius]",
              perfect && "shadow-[0_0_34px_-12px_rgba(45,223,158,0.65)]"
            )}
          >
            <StatCard
              label="Ascend Day"
              icon={<span className="text-sm">⚡</span>}
              value={
                <AnimatedNumber
                  key={week}
                  value={stats.ascordWon}
                  fmt={(n) => `${Math.round(n)}/${stats.ascordTotal}`}
                />
              }
              delta={perfect ? "Settimana perfetta ✨" : stats.ascordTotal > 0 ? "giorni vinti" : "nessun goal attivo"}
              deltaTone={perfect ? "positive" : "neutral"}
              spark={daily.ascord}
              sparkColor="#2DDF9E"
              hairline={perfect ? "success" : "none"}
            />
          </div>
        </Reveal>
      </div>

      {/* Finanze della settimana (valuta base) */}
      <Reveal>
        <Card className="grid-texture">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Finanze della settimana
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">transazioni registrate nel periodo</p>
            </div>
            <Badge tone="default">{db.settings.baseCurrency}</Badge>
          </div>
          <div className="grid grid-cols-3 divide-x divide-border">
            <div className="px-2 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Entrate
              </p>
              <AnimatedNumber
                key={week}
                value={stats.income}
                fmt={money}
                className="mt-1.5 block font-mono text-lg font-semibold text-success sm:text-xl"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">incassi della settimana</p>
            </div>
            <div className="px-2 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Uscite
              </p>
              <AnimatedNumber
                key={week}
                value={stats.expense}
                fmt={money}
                className="mt-1.5 block font-mono text-lg font-semibold text-danger sm:text-xl"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">spese della settimana</p>
            </div>
            <div className="px-2 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Net
              </p>
              <AnimatedNumber
                key={week}
                value={stats.net}
                fmt={money}
                className={cn(
                  "mt-1.5 block font-mono text-lg font-semibold sm:text-xl",
                  stats.net > 0 ? "text-success" : stats.net < 0 ? "text-danger" : "text-foreground"
                )}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                {stats.net > 0 ? "avanzo" : stats.net < 0 ? "deficit" : "in pari"} della settimana
              </p>
            </div>
          </div>
        </Card>
      </Reveal>

      {/* Riflessione */}
      <ReflectionForm
        key={week}
        week={week}
        existing={existing}
        stats={stats}
        openSignal={openSignal}
        onCompletaOggi={handleCompletaOggi}
      />
    </div>
  );
}

// ------------------------------------------------------------
// Form di riflessione — risposte editabili, upsert per weekStart
// ------------------------------------------------------------

function QuestionPanel({
  n,
  title,
  value,
  onChange,
  placeholder,
}: {
  n: number;
  title: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/35 p-3.5 transition-colors hover:border-border-strong focus-within:border-accent/50 sm:p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-[11px] font-bold text-white shadow-[0_2px_10px_-3px_var(--accent-glow)]">
          {n}
        </span>
        <p className="text-[13px] font-semibold leading-snug text-foreground">{title}</p>
      </div>
      <TextArea
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-3 min-h-[88px] rounded-xl border-border-strong/70 bg-muted/50 text-[13px] leading-relaxed transition-colors hover:border-border-strong focus:border-accent/50 focus:bg-muted"
      />
      {value.trim().length > 0 && (
        <p className="mt-1.5 text-right text-[11px] text-muted-foreground">
          {value.trim().length} caratteri
        </p>
      )}
    </div>
  );
}

function ReflectionForm({
  week,
  existing,
  stats,
  openSignal,
  onCompletaOggi,
}: {
  week: string;
  existing: WeeklyReview | null;
  stats: WeekStats;
  openSignal: number;
  onCompletaOggi: () => void;
}) {
  const db = useDB();

  const [a1, setA1] = useState(existing?.answer1 ?? "");
  const [a2, setA2] = useState(existing?.answer2 ?? "");
  const [a3, setA3] = useState(existing?.answer3 ?? "");
  const [showForm, setShowForm] = useState(!!existing);
  const [msg, setMsg] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // "Completa oggi" dal parent: apri la riflessione (anche se la settimana è
  // cambiata) e scroll alle domande.
  useEffect(() => {
    if (openSignal > 0) {
      setShowForm(true);
      requestAnimationFrame(() =>
        formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      );
    }
  }, [openSignal]);

  const showMsg = (text: string) => {
    setMsg(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 5000);
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
      <Reveal>
        <Card>
          <EmptyState
            icon="✍️"
            title="Nessuna review per questa settimana"
            description="Prenditi dieci minuti: cosa è andato bene, cosa no, e cosa cambierai. Le statistiche sopra sono già pronte."
            action={
              <Button glow onClick={onCompletaOggi}>
                Completa oggi ✨
              </Button>
            }
          />
        </Card>
      </Reveal>
    );
  }

  return (
    <Reveal>
      <div ref={formRef}>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Riflessione della settimana</CardTitle>
              <CardSubtitle>
                Settimana del {labelDayKey(week, db.settings.locale)} — sii onesto con te stesso.
              </CardSubtitle>
            </div>
            {existing ? (
              <Badge tone="success">✓ Salvata</Badge>
            ) : (
              <Badge tone="warning">Bozza</Badge>
            )}
          </CardHeader>

          <div className="space-y-3">
            <QuestionPanel
              n={1}
              title="Cosa ha funzionato questa settimana?"
              value={a1}
              onChange={setA1}
              placeholder="Es. ho rispettato il playbook, ho chiuso prima del rollover, niente revenge trading…"
            />
            <QuestionPanel
              n={2}
              title="Cosa non ha funzionato e perché?"
              value={a2}
              onChange={setA2}
              placeholder="Es. ho inseguito il mercato, orari sbagliati, ho saltato il journal di un giorno…"
            />
            <QuestionPanel
              n={3}
              title="Cosa farò diversamente la prossima settimana?"
              value={a3}
              onChange={setA3}
              placeholder="Un'azione concreta: regola, abitudine o processo da cambiare."
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={save} disabled={nothingToSave} glow size="lg">
              {existing ? "Aggiorna review" : "Salva review"}
            </Button>
            {msg && (
              <span className="animate-pop inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
                <span className="text-emerald-300">✔</span> {msg}
              </span>
            )}
          </div>

          {existing && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              {existing.updatedAt === existing.createdAt ? "Creato" : "Aggiornato"} il{" "}
              {new Date(existing.updatedAt).toLocaleString(db.settings.locale)}
            </p>
          )}
        </Card>
      </div>
    </Reveal>
  );
}
