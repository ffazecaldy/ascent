"use client";

// ============================================================
// ASCEND — Obiettivi · Dettaglio "Obiettivi primari"
// Università, fisico e trading: percentuale di successo calcolata
// live dai dati. Gli ESAMI sono modificabili qui (esito, data,
// nuovo esame → collezione studySubjects). Privacy: importi €
// mascherati in modalità standard/completa (approccio card Home).
// ============================================================

import { useMemo, useState } from "react";
import Link from "next/link";
import { useDB, updateDB, uid, nowISO } from "@/lib/storage";
import {
  primaryGoals,
  examsList,
  sportAdherence,
  tradingAccountsProgress,
  type ExamRow,
} from "@/lib/primary-goals";
import { convertToBase, tradingStats } from "@/lib/compute";
import { formatMoney, formatPercent } from "@/lib/format";
import { moneyMasked, kpiMasked, maskMoney, maskKpi } from "@/lib/privacy";
import type { DB, StudySubject } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProgressBar, EmptyState, SectionHeader } from "@/components/ui/Misc";
import { Reveal } from "@/components/ui/Reveal";
import { Icon, type IconName } from "@/components/ui/Icon";

// ------------------------------------------------------------
// Tipi locali (chiavi fisse dei tre obiettivi primari)
// ------------------------------------------------------------

type GoalKey = "universita" | "fisico" | "trading";

const GOAL_ICONS: Record<GoalKey, IconName> = {
  universita: "book-open",
  fisico: "dumbbell",
  trading: "chart-line",
};

const GOAL_CHIP: Record<GoalKey, string> = {
  universita: "border-accent/30 bg-accent/10 text-accent",
  fisico: "border-success/30 bg-success/10 text-success",
  trading: "border-warning/30 bg-warning/10 text-warning",
};

// ------------------------------------------------------------
// Helper data (input yyyy-MM-dd o ISO) → testo it-IT
// ------------------------------------------------------------

function parseDay(s: string): Date | null {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + "T00:00:00" : s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDayIT(s: string, opts: Intl.DateTimeFormatOptions): string {
  const d = parseDay(s);
  return d ? d.toLocaleDateString("it-IT", opts) : s;
}

// ------------------------------------------------------------
// Esami — riga EDITABILE: esito (passato / da dare / non impostato)
// e data esame inline. Scrive su studySubjects via updateDB.
// ------------------------------------------------------------

function ExamItemRow({
  row,
  onPatch,
}: {
  row: ExamRow;
  onPatch: (id: string, patch: Partial<StudySubject>) => void;
}) {
  const e = row;
  const future = e.examDate != null && e.daysLeft != null && e.daysLeft > 0;
  const pill = (active: boolean, sel: boolean) =>
    cn(
      "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
      sel
        ? active
          ? "border-success/40 bg-success/15 text-success"
          : "border-warning/40 bg-warning/15 text-warning"
        : "border-border-strong bg-elevated text-muted-foreground hover:border-accent/40 hover:text-accent"
    );
  return (
    <li className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg border border-border bg-elevated/40 px-3 py-2">
      <p className="min-w-0 truncate text-[13px] font-medium text-foreground" title={e.subject.name}>
        {e.subject.name}
      </p>

      {/* esito: click sul pill attivo per tornare a "non impostato" */}
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          aria-pressed={e.passed === true}
          title={e.passed === true ? "Togli esito" : "Segna passato"}
          onClick={() => onPatch(e.subject.id, { examPassed: e.passed === true ? null : true })}
          className={pill(true, e.passed === true)}
        >
          <Icon name="check" size={10} strokeWidth={2.5} className="mr-1 inline" />
          passato
        </button>
        <button
          type="button"
          aria-pressed={e.passed === false}
          title={e.passed === false ? "Togli esito" : "Segna da dare"}
          onClick={() => onPatch(e.subject.id, { examPassed: e.passed === false ? null : false })}
          className={pill(false, e.passed === false)}
        >
          da dare
        </button>
      </div>

      {/* data esame inline */}
      <input
        type="date"
        value={e.examDate ?? ""}
        onChange={(ev) => onPatch(e.subject.id, { examDate: ev.target.value || null, examPassed: ev.target.value ? e.passed : null })}
        aria-label={`Data esame ${e.subject.name}`}
        title="Data esame"
        className="ml-auto h-7 w-[8.6rem] shrink-0 rounded-lg border border-border-strong bg-muted px-2 text-[11px] text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
      />

      {e.examDate && (
        <span className="tnum shrink-0 text-[11px] text-muted-foreground">
          {fmtDayIT(e.examDate, { day: "numeric", month: "short", year: "numeric" })}
        </span>
      )}
      {future && e.daysLeft != null && (
        <Badge tone={e.daysLeft <= 14 ? "warning" : "default"}>
          {e.daysLeft === 0 ? "oggi" : `tra ${e.daysLeft} gg`}
        </Badge>
      )}
    </li>
  );
}

// ------------------------------------------------------------
// Nuovo esame — inline: nome materia + data → StudySubject
// ------------------------------------------------------------

function AddExamForm({ onAdd }: { onAdd: (name: string, date: string) => void }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const submit = () => {
    if (!name.trim()) return;
    onAdd(name.trim(), date);
    setName("");
    setDate("");
  };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border-strong bg-muted/30 px-3 py-2">
      <Icon name="plus" size={13} className="shrink-0 text-accent" />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="Nome materia / esame"
        aria-label="Nome materia"
        className="h-7 min-w-0 flex-1 rounded-lg border border-border-strong bg-muted px-2 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
      />
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        aria-label="Data esame"
        title="Data esame"
        className="h-7 w-[8.6rem] shrink-0 rounded-lg border border-border-strong bg-muted px-2 text-[11px] text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
      />
      <Button variant="outline" size="sm" onClick={submit} disabled={!name.trim()}>
        Aggiungi esame
      </Button>
    </div>
  );
}

// ------------------------------------------------------------
// Pagina
// ------------------------------------------------------------

export default function ObiettiviPrimariPage() {
  const db = useDB();
  const maskedMoney = moneyMasked(db.settings.privacyMode);
  const maskedKpi = kpiMasked(db.settings.privacyMode);
  const currency = db.settings.baseCurrency;
  const locale = db.settings.locale;

  const money = (n: number) => (maskedMoney ? maskMoney() : formatMoney(n, currency, locale));

  // — Percentuali dei tre obiettivi (una sola fonte: il seam) —
  const goals = useMemo(() => primaryGoals(db), [db]);
  const goalByKey = useMemo(() => {
    const m = new Map<GoalKey, (typeof goals)[number]>();
    for (const g of goals) m.set(g.key, g);
    return m;
  }, [goals]);

  // — Università: esami ordinati per data crescente (senza data in fondo) —
  const exams = useMemo(
    () =>
      [...examsList(db)].sort((a, b) =>
        (a.examDate ?? "9999-99-99").localeCompare(b.examDate ?? "9999-99-99")
      ),
    [db]
  );

  // — Fisico: ultime 6 settimane, dalla più vecchia alla più recente —
  const adherence = useMemo(() => sportAdherence(db), [db]);
  const sportActive = adherence.length > 0 && adherence.some((w) => w.target > 0);

  // — Trading: conti + riepilogo payout/win rate —
  const accounts = useMemo(() => tradingAccountsProgress(db), [db]);
  const payoutTotal = useMemo(
    () => db.payouts.reduce((s, p) => s + convertToBase(p.amount, p.exchangeRate), 0),
    [db.payouts]
  );
  const winRate = useMemo(() => tradingStats(db.trades).winRate, [db.trades]);

  const statusTone: Record<string, "info" | "success" | "danger"> = {
    eval: "info",
    finanziato: "success",
    superato: "success",
    bruciato: "danger",
  };

  const pctText = (pct: number | null, masked = maskedKpi) =>
    pct == null ? "—" : masked ? maskKpi() : formatPercent(pct, 0);

  // — Esami: patch su studySubjects (esito/data) + creazione nuovo esame —
  const patchSubject = (id: string, patch: Partial<StudySubject>) =>
    updateDB((d) => ({
      ...d,
      studySubjects: d.studySubjects.map((s) =>
        s.id === id ? { ...s, ...patch, updatedAt: nowISO() } : s
      ),
    }));
  const addExam = (name: string, date: string) =>
    updateDB((d) => ({
      ...d,
      studySubjects: [
        ...d.studySubjects,
        {
          id: uid(),
          name,
          examDate: date || null,
          examPassed: false, // appena aggiunto = da dare
          createdAt: nowISO(),
          updatedAt: nowISO(),
        },
      ],
    }));

  return (
    <div className="space-y-6">
      <Link
        href="/obiettivi"
        className="flex items-center gap-1.5 text-sm text-secondary-text transition-colors hover:text-accent"
      >
        <Icon name="arrow-left" size={14} />
        Obiettivi
      </Link>

      <SectionHeader
        kicker="Progressione"
        title="Obiettivi primari"
        subtitle="Università, fisico e trading: percentuale di successo calcolata live dai tuoi dati."
      />

      {/* — Riga riassuntiva: le tre percentuali — */}
      <div className="grid gap-3 sm:grid-cols-3">
        {goals.map((g, i) => (
          <Reveal key={g.key} delay={i * 70}>
            <Card hairline="accent" className="flex h-full flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                    GOAL_CHIP[g.key]
                  )}
                >
                  <Icon name={GOAL_ICONS[g.key]} size={18} />
                </span>
                <p className="text-[13px] font-semibold tracking-tight text-foreground">{g.label}</p>
              </div>
              <p
                className={cn(
                  "tnum text-3xl font-bold leading-none",
                  g.pct != null ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {pctText(g.pct)}
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{g.headline}</p>
            </Card>
          </Reveal>
        ))}
      </div>

      {/* — Sezione UNIVERSITÀ — */}
      <Reveal>
        <Card hairline="accent" className="space-y-3">
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent/10">
                <Icon name="book-open" size={18} className="text-accent" />
              </span>
              <div>
                <CardTitle>Università</CardTitle>
                <CardSubtitle>Esami con esito e data: la percentuale segue il piano di studio.</CardSubtitle>
              </div>
            </div>
            <span className="tnum shrink-0 text-xl font-semibold text-foreground">
              {pctText(goalByKey.get("universita")?.pct ?? null)}
            </span>
          </CardHeader>

          <ProgressBar
            className="h-1.5"
            value={goalByKey.get("universita")?.pct ?? 0}
            max={100}
          />

          {exams.length === 0 ? (
            <EmptyState
              icon={<Icon name="book-open" size={34} className="text-accent" />}
              title="Nessun esame in programma"
              description="Aggiungi qui sotto il tuo primo esame: nome materia e data. Oppure gestisci le materie in Studio."
              action={
                <Link href="/studio">
                  <Button variant="outline" size="sm">Vai a Studio →</Button>
                </Link>
              }
            />
          ) : (
            <ul className="space-y-2">
              {exams.map((e, i) => (
                <ExamItemRow
                  key={`${e.subject.id}-${i}`}
                  row={e}
                  onPatch={patchSubject}
                />
              ))}
            </ul>
          )}

          {/* Nuovo esame: sempre disponibile in fondo alla lista */}
          <AddExamForm onAdd={addExam} />
        </Card>
      </Reveal>

      {/* — Sezione FISICO — */}
      <Reveal delay={80}>
        <Card hairline="success" className="space-y-3">
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-success/30 bg-success/10">
                <Icon name="dumbbell" size={18} className="text-success" />
              </span>
              <div>
                <CardTitle>Fisico</CardTitle>
                <CardSubtitle>Aderenza settimanale agli allenamenti delle ultime 6 settimane.</CardSubtitle>
              </div>
            </div>
            <span className="tnum shrink-0 text-xl font-semibold text-foreground">
              {pctText(goalByKey.get("fisico")?.pct ?? null)}
            </span>
          </CardHeader>

          <ProgressBar
            className="h-1.5"
            value={goalByKey.get("fisico")?.pct ?? 0}
            max={100}
            tone={sportActive ? "success" : "accent"}
          />

          {!sportActive ? (
            <EmptyState
              icon={<Icon name="dumbbell" size={34} className="text-success" />}
              title="Nessuna settimana con target"
              description="Imposta un profilo con allenamenti settimanali in Sport per tracciare l'aderenza."
              action={
                <Link href="/sport">
                  <Button variant="outline" size="sm">Vai a Sport →</Button>
                </Link>
              }
            />
          ) : (
            <div className="space-y-2">
              {adherence.map((w, i) => {
                const current = i === adherence.length - 1;
                const hit = w.target > 0 && w.sessions >= w.target;
                return (
                  <div
                    key={w.weekStart}
                    className={cn(
                      "rounded-lg border px-3 py-2 transition-colors",
                      current ? "border-accent/40 bg-accent/5" : "border-border bg-elevated/40"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex min-w-0 items-center gap-2 text-[12px] text-secondary-text">
                        <span>
                          settimana del{" "}
                          <span className="font-medium text-foreground">
                            {fmtDayIT(w.weekStart, { day: "numeric", month: "short" })}
                          </span>
                        </span>
                        {current && (
                          <Badge tone="info" className="shrink-0">
                            corrente
                          </Badge>
                        )}
                      </p>
                      <span
                        className={cn(
                          "tnum shrink-0 text-[12px] font-medium",
                          hit ? "text-success" : "text-secondary-text"
                        )}
                      >
                        {w.sessions}/{w.target}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2.5">
                      <ProgressBar
                        className="h-1.5 flex-1"
                        value={w.sessions}
                        max={Math.max(1, w.target)}
                        tone={hit ? "success" : "accent"}
                        shimmer={current}
                      />
                      <span className="tnum w-10 shrink-0 text-right text-[11px] text-muted-foreground">
                        {w.pct == null ? "—" : `${Math.round(w.pct)}%`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </Reveal>

      {/* — Sezione TRADING — */}
      <Reveal delay={160}>
        <Card hairline="accent" texture className="space-y-3">
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-warning/30 bg-warning/10">
                <Icon name="chart-line" size={18} className="text-warning" />
              </span>
              <div>
                <CardTitle>Trading</CardTitle>
                <CardSubtitle>Conti prop e personali: saldo, target di valutazione e payout.</CardSubtitle>
              </div>
            </div>
            <span className="tnum shrink-0 text-xl font-semibold text-foreground">
              {pctText(goalByKey.get("trading")?.pct ?? null)}
            </span>
          </CardHeader>

          <ProgressBar
            className="h-1.5"
            value={goalByKey.get("trading")?.pct ?? 0}
            max={100}
          />

          {accounts.length === 0 ? (
            <EmptyState
              icon={<Icon name="chart-line" size={34} className="text-warning" />}
              title="Nessun account di trading"
              description="Aggiungi un conto prop o personale in Trading per tracciare saldo e target."
              action={
                <Link href="/trading">
                  <Button variant="outline" size="sm">Vai a Trading →</Button>
                </Link>
              }
            />
          ) : (
            <ul className="space-y-2">
              {accounts.map((r) => (
                <li key={r.account.id} className="rounded-lg border border-border bg-elevated/40 px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 truncate text-[13px] font-medium text-foreground">
                      {r.account.name}
                    </p>
                    <Badge tone="default">{r.account.type === "prop" ? "prop" : "personal"}</Badge>
                    <Badge tone={statusTone[r.account.status] ?? "default"}>{r.account.status}</Badge>
                    {r.funded && <Badge tone="success">promosso</Badge>}
                    <span className={cn("tnum ml-auto shrink-0 text-[13px] font-semibold", r.funded ? "text-success" : "text-foreground")}>
                      {money(r.saldo)}
                    </span>
                  </div>
                  {r.target != null && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="tnum text-muted-foreground">
                          utile {money(Math.max(0, r.pnl))} / +{money(r.gainTarget ?? 0)}
                          <span className="ml-1.5 text-muted-foreground/70">
                            (saldo {money(r.saldo)} / {money(r.target)})
                          </span>
                        </span>
                        <span className={cn("tnum font-medium", r.funded ? "text-success" : "text-secondary-text")}>
                          {r.pct == null ? "—" : `${Math.round(r.pct)}%`}
                        </span>
                      </div>
                      <ProgressBar
                        className="mt-1.5 h-1.5"
                        value={Math.max(0, r.pnl)}
                        max={Math.max(1, r.gainTarget ?? 1)}
                        tone={r.funded ? "success" : "accent"}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Riepilogo: payout totali in valuta base + win rate */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-[12px] text-secondary-text">
            <span className="flex items-center gap-1.5">
              <Icon name="banknote" size={14} className="text-accent" />
              Payout totali:
              <span
                className={cn(
                  "tnum font-semibold",
                  maskedMoney ? "text-secondary-text" : "text-success"
                )}
              >
                {maskedMoney ? maskMoney() : formatMoney(payoutTotal, currency, locale)}
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <Icon name="activity" size={14} className="text-accent" />
              Win rate:
              <span className={cn("tnum font-semibold", winRate != null && !maskedKpi ? "text-foreground" : "text-secondary-text")}>
                {winRate == null ? "—" : maskedKpi ? maskKpi() : formatPercent(winRate, 0)}
              </span>
            </span>
          </div>
        </Card>
      </Reveal>
    </div>
  );
}
