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
import { primaryGoals } from "@/lib/primary-goals";
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

      {virgin ? (
        <EmptyState
          icon={<Icon name="trophy" size={34} className="text-warning" />}
          title="Nessun obiettivo configurato"
          description="I tuoi 3 obiettivi primari — Università, Fisico e Trading — con la percentuale di successo calcolata live dai tuoi dati."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {goals.map((g) => {
            const done = g.pct != null && g.pct >= 100;
            const hint = g.lines[0] ? (maskedMoney ? maskLine(g.lines[0]) : g.lines[0]) : undefined;
            return (
              <li key={g.key} className="rounded-lg border border-border bg-elevated/40 p-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-accent/25 bg-accent/10">
                    <Icon name={GOAL_ICONS[g.key]} size={13} className="text-accent" />
                  </span>
                  <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                    {g.label}
                  </p>
                  <span
                    className={cn(
                      "tnum shrink-0 text-xs font-bold",
                      g.pct == null ? "text-muted-foreground" : done ? "text-success" : "text-accent"
                    )}
                  >
                    {maskedKpi ? maskKpi() : g.pct == null ? "—" : formatPercent(g.pct, 0)}
                  </span>
                </div>
                <ProgressBar
                  value={g.pct ?? 0}
                  max={100}
                  tone={done ? "success" : "accent"}
                  className="mt-2 h-1.5"
                />
                <p className="mt-1.5 truncate text-[11px] text-secondary-text">{g.headline}</p>
                {hint && (
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
