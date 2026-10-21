"use client";

// ============================================================
// ASCEND — Home · Obiettivi Primari (università, fisico, trading)
// I 3 life goals con PERCENTUALE di successo calcolata live da
// primaryGoals(db). Subtitle con media delle pct (null escluse).
// Privacy: importi € nelle lines mascherati con privacyMode != off
// (approccio di SavingsSummaryCard/TradingCalendarCard) + pct
// mascherate come KPI in modalità completa (maskKpi, lib/privacy).
// ============================================================

import { useMemo } from "react";
import Link from "next/link";
import { primaryGoals, loggingHealth, tradingPhase } from "@/lib/primary-goals";
import { formatPercent } from "@/lib/format";
import { moneyMasked, kpiMasked, maskMoney, maskKpi } from "@/lib/privacy";
import type { DB } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { EmptyState, ProgressBar } from "@/components/ui/Misc";
import { Icon, type IconName } from "@/components/ui/Icon";

type PrimaryGoal = ReturnType<typeof primaryGoals>[number];

const GOAL_ICONS: Record<PrimaryGoal["key"], IconName> = {
  universita: "book-open",
  fisico: "dumbbell",
  trading: "activity",
};

// Importi in € (o $/£/¥/CHF/EUR/USD/GBP, prima o dopo la cifra)
// mascherati come maskMoney(): stesso approccio di lib/privacy.
const MONEY_RE =
  /(?:[$€£¥]|CHF|EUR|USD|GBP)\s*\d[\d.,]*\s*[kKmM]?|\d[\d.,]*\s*[kKmM]?\s*(?:[$€£¥]|CHF|EUR|USD|GBP)/g;

function maskLine(line: string): string {
  return line.replace(MONEY_RE, maskMoney());
}

export function PrimaryGoalsCard({ db }: { db: DB }) {
  const goals = useMemo(() => primaryGoals(db), [db]);
  const maskedMoney = moneyMasked(db.settings.privacyMode);
  const maskedKpi = kpiMasked(db.settings.privacyMode);

  // Media delle percentuali disponibili (le null escluse dalla media).
  const avg = useMemo(() => {
    const pcts = goals.map((g) => g.pct).filter((p): p is number => p != null);
    return pcts.length > 0 ? pcts.reduce((s, p) => s + p, 0) / pcts.length : null;
  }, [goals]);

  // DB vergine: nessun goal ha ancora i dati per calcolare nulla.
  const virgin = goals.length > 0 && goals.every((g) => !g.ready);

  // Piano 5 anni: allarme registrazioni (≥14 gg senza dati) + fase trading.
  const health = useMemo(() => loggingHealth(db), [db]);
  const phase = useMemo(() => tradingPhase(db), [db]);

  return (
    <Card hairline="accent" className="flex flex-col gap-3">
      <CardHeader>
        <div>
          <CardTitle>Obiettivi primari</CardTitle>
          <CardSubtitle>
            {avg != null && !maskedKpi
              ? `successo medio ${formatPercent(avg, 0)}`
              : "Università, fisico, trading"}
          </CardSubtitle>
        </div>
        <Link
          href="/obiettivi/primari"
          className="shrink-0 text-xs font-medium text-secondary-text transition-colors hover:text-accent"
        >
          Dettagli →
        </Link>
      </CardHeader>

      {/* Allarme "piano morto": ≥14 giorni (o mai) senza registrazioni */}
      {health.alarm && (
        <div className="flex items-start gap-2.5 rounded-lg border border-danger/40 bg-danger/5 px-3 py-2.5">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-danger" />
          <p className="text-[12px] leading-relaxed text-foreground">
            <span className="font-semibold text-danger">Il piano è fermo</span>
            {health.daysSinceLast == null
              ? " — nessuna registrazione nel DB. "
              : ` — ultima registrazione ${health.daysSinceLast === 0 ? "oggi" : `${health.daysSinceLast} giorni fa`} (${health.lastLabel}). `}
            Registra oggi un allenamento, una sessione di studio o il peso: le % salgono solo sui dati.
          </p>
        </div>
      )}

      {virgin ? (
        <EmptyState
          icon={<Icon name="trophy" size={34} className="text-warning" />}
          title="Nessun obiettivo configurato"
          description="I tuoi 3 obiettivi primari — Università, Fisico e Trading — con la percentuale di successo calcolata live dai tuoi dati."
        />
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {goals.map((g) => {
            const done = g.pct != null && g.pct >= 100;
            // Trading: in sessione d'esame l'hint diventa il promemoria di freeze
            const rawHint =
              g.key === "trading" && phase.key === "freeze" ? phase.note : g.lines[0];
            const hint = rawHint ? (maskedMoney ? maskLine(rawHint) : rawHint) : undefined;
            return (
              <div
                key={g.key}
                className={cn(
                  "relative overflow-hidden rounded-xl border bg-elevated/40 p-3",
                  done ? "border-success/30" : "border-border"
                )}
              >
                {/* hairline quando completato */}
                {done && (
                  <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-success/70 to-transparent" />
                )}

                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border",
                      done ? "border-success/30 bg-success/10" : "border-accent/25 bg-accent/10"
                    )}
                  >
                    <Icon
                      name={GOAL_ICONS[g.key]}
                      size={15}
                      className={done ? "text-success" : "text-accent"}
                    />
                  </span>
                  <span
                    className={cn(
                      "tnum text-2xl font-bold leading-none",
                      g.pct == null
                        ? "text-muted-foreground"
                        : done
                          ? "text-success"
                          : "text-foreground"
                    )}
                  >
                    {maskedKpi ? maskKpi() : g.pct == null ? "—" : formatPercent(g.pct, 0)}
                  </span>
                </div>

                <p className="mt-2 truncate text-[13px] font-semibold tracking-tight text-foreground">
                  {g.label}
                </p>

                <ProgressBar
                  value={g.pct ?? 0}
                  max={100}
                  tone={done ? "success" : "accent"}
                  className="mt-1.5 h-1"
                  shimmer={false}
                />

                <p
                  className="mt-1.5 truncate text-[11px] text-secondary-text"
                  title={maskedKpi ? undefined : g.headline}
                >
                  {maskedKpi ? "dettaglio nascosto" : g.headline}
                </p>
                {hint && (
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={hint}>
                    {hint}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
