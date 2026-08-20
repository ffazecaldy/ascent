"use client";

// ============================================================
// ASCEND — Home · Riepilogo Risparmi
// Da savingsTotals(db): totale versato (AnimatedNumber formatMoney),
// obiettivo attivo con ProgressBar tone (accent in corso, success
// quando >= 100%) + "X di Y · Z%". Link a /risparmi in header.
// Tutto live da useDB → verdi ad ogni versamento.
// Privacy: cifre monetarie mascherate in modalità standard/completa.
// ============================================================

import { useMemo } from "react";
import Link from "next/link";
import { savingsTotals } from "@/lib/compute";
import { formatMoney, formatPercent } from "@/lib/format";
import { moneyMasked, kpiMasked, maskMoney, maskKpi } from "@/lib/privacy";
import type { DB } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { ProgressBar } from "@/components/ui/Misc";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export function SavingsSummaryCard({ db }: { db: DB }) {
  const totals = useMemo(() => savingsTotals(db), [db]);
  const maskedMoney = moneyMasked(db.settings.privacyMode);
  const maskedKpi = kpiMasked(db.settings.privacyMode);
  const currency = db.settings.baseCurrency;
  const locale = db.settings.locale;

  // obiettivo attivo "in corso": il meno avanzato (<100%); se tutti completati, l'ultimo.
  const active =
    [...totals.goals].sort((a, b) => a.progressPct - b.progressPct)[0] ?? null;
  const done = active !== null && active.progressPct >= 100;

  return (
    <Card hairline="accent" texture className="flex flex-col gap-3">
      <CardHeader>
        <div>
          <CardTitle>Risparmi</CardTitle>
          <CardSubtitle>
            {totals.goals.length > 0
              ? `${totals.goals.length} obiettivo${totals.goals.length === 1 ? "" : "i"} attivo${totals.goals.length === 1 ? "" : "i"} · conto di accumulo`
              : "Conto di accumulo"}
          </CardSubtitle>
        </div>
        <Link
          href="/risparmi"
          className="shrink-0 text-xs font-medium text-secondary-text transition-colors hover:text-accent"
        >
          Vedi tutto →
        </Link>
      </CardHeader>

      {/* totale versato */}
      <div className="rounded-xl border border-border bg-elevated/40 p-3.5">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <Icon name="coins" size={13} />
          Totale versato
        </span>
        <div className="mt-1">
          <AnimatedNumber
            value={totals.deposited}
            fmt={(n) => (maskedMoney ? maskMoney() : formatMoney(n, currency, locale))}
            className={cn(
              "tnum text-3xl font-bold leading-tight",
              maskedMoney ? "text-secondary-text" : totals.deposited > 0 ? "text-foreground" : ""
            )}
          />
        </div>
        {totals.goals.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">obiettivo corrente: {active?.goal.name}</p>
        )}
      </div>

      {/* obiettivo attivo in corso */}
      {active ? (
        <div className="rounded-xl border border-border bg-elevated/40 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium">{active.goal.name}</p>
            <span
              className={cn(
                "tnum text-xs font-bold",
                done ? "text-success" : "text-accent"
              )}
            >
              {maskedKpi ? maskKpi() : formatPercent(active.progressPct, 0)}
            </span>
          </div>
          <ProgressBar
            value={active.deposited}
            max={Math.max(1, active.goal.target)}
            tone={done ? "success" : "accent"}
            className="mt-2.5 h-2"
          />
          <p className="mt-1.5 text-xs tnum text-secondary-text">
            {maskedMoney
              ? `${maskMoney()} di ${maskMoney()}`
              : `${formatMoney(active.deposited, currency, locale)} di ${formatMoney(active.goal.target, currency, locale)}`}
          </p>
        </div>
      ) : (
        <Link
          href="/risparmi"
          className="flex items-center gap-2.5 rounded-xl border border-dashed border-border-strong px-3.5 py-4 transition-colors hover:border-accent/40 hover:bg-elevated/40"
        >
          <Icon name="target" size={16} className="text-accent" />
          <p className="text-xs text-secondary-text">
            Nessun obiettivo di risparmio — <span className="text-accent">creane uno</span> per
            vedere la barra di avanzamento.
          </p>
        </Link>
      )}
    </Card>
  );
}
