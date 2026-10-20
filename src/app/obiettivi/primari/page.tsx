"use client";

// ============================================================
// ASCEND — Obiettivi · Dettaglio "Obiettivi primari"
// Università, fisico e trading: percentuale di successo calcolata
// live dai dati (read-only: nessun updateDB, tutto derivato da
// lib/primary-goals). Privacy: importi € mascherati in modalità
// standard/completa (stesso approccio delle card Home).
// ============================================================

import { useMemo } from "react";
import Link from "next/link";
import { useDB } from "@/lib/storage";
import {
  primaryGoals,
  examsList,
  sportAdherence,
  tradingAccountsProgress,
} from "@/lib/primary-goals";
import { convertToBase, tradingStats } from "@/lib/compute";
import { formatMoney, formatPercent } from "@/lib/format";
import { moneyMasked, kpiMasked, maskMoney, maskKpi } from "@/lib/privacy";
import type { DB } from "@/lib/types";
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
              description="Aggiungi materie ed esami in Studio per vederli qui con esito e countdown."
              action={
                <Link href="/studio">
                  <Button variant="outline" size="sm">Vai a Studio →</Button>
                </Link>
              }
            />
          ) : (
            <ul className="space-y-2">
              {exams.map((e, i) => {
                const tone = e.passed === true ? "success" : e.passed === false ? "warning" : "default";
                const label = e.passed === true ? "passato" : e.passed === false ? "da dare" : "non impostato";
                const future = e.examDate != null && e.daysLeft != null && e.daysLeft > 0;
                return (
                  <li
                    key={`${e.subject.id}-${i}`}
                    className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg border border-border bg-elevated/40 px-3 py-2"
                  >
                    <p className="min-w-0 truncate text-[13px] font-medium text-foreground">
                      {e.subject.name}
                    </p>
                    <Badge tone={tone}>{label}</Badge>
                    {e.examDate && (
                      <span className="ml-auto text-[11px] text-muted-foreground">
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
              })}
            </ul>
          )}
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
                          {money(r.saldo)} / {money(r.target)}
                        </span>
                        <span className={cn("tnum font-medium", r.funded ? "text-success" : "text-secondary-text")}>
                          {r.pct == null ? "—" : `${Math.round(r.pct)}%`}
                        </span>
                      </div>
                      <ProgressBar
                        className="mt-1.5 h-1.5"
                        value={r.saldo}
                        max={Math.max(1, r.target)}
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
