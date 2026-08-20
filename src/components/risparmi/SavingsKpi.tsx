"use client";
// ============================================================
// ASCEND — Risparmi · KPI header (myfundedbook-style)
// - Totale versato: AnimatedNumber formatMoney + spark savingsSeries
// - Obiettivo attivo: somma target dei goal attivi
// - Completamento %: ProgressBar tone success + cuore verde a 100%
// Privacy-aware (money → •••, percentuali → ••% in mode complete).
// ============================================================

import { useDB } from "@/lib/storage";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { ProgressBar } from "@/components/ui/Misc";
import { formatMoney, formatPercent } from "@/lib/format";
import { moneyMasked, kpiMasked, maskMoney, maskKpi } from "@/lib/privacy";
import { cn } from "@/lib/cn";
import type { SavingsTotals } from "@/lib/compute";

export function SavingsKpi({ totals, spark }: { totals: SavingsTotals; spark: number[] }) {
  const db = useDB();
  const base = db.settings.baseCurrency;
  const locale = db.settings.locale;
  const hidden = moneyMasked(db.settings.privacyMode);
  const kpiHidden = kpiMasked(db.settings.privacyMode);

  const activeCount = totals.goals.length;
  const pctOverall = totals.target > 0 ? Math.min(100, (totals.deposited / totals.target) * 100) : 0;
  const doneAll = totals.target > 0 && pctOverall >= 100;
  const sparkVals = spark.length > 1 ? spark : undefined;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {/* Totale versato */}
      <StatCard
        label="Totale versato"
        icon={<span className="text-base leading-none">💰</span>}
        hairline="accent"
        spark={sparkVals}
        sparkColor="#4C7EFF"
        value={
          hidden ? (
            maskMoney()
          ) : (
            <AnimatedNumber
              key={`deposited-${Math.round(totals.deposited * 100)}`}
              value={totals.deposited}
              duration={850}
              fmt={(n) => formatMoney(n, base, locale)}
            />
          )
        }
        delta={`${db.savingsDeposits.length} versamenti registrati`}
      />

      {/* Obiettivo attivo — target somma */}
      <StatCard
        label="Obiettivo attivo"
        icon={<span className="text-base leading-none">🎯</span>}
        hairline="accent"
        value={
          hidden ? (
            maskMoney()
          ) : (
            <AnimatedNumber
              key={`target-${Math.round(totals.target * 100)}`}
              value={totals.target}
              duration={850}
              fmt={(n) => formatMoney(n, base, locale)}
            />
          )
        }
        delta={activeCount > 0 ? `${activeCount} obiettivi attivi` : "nessun obiettivo attivo"}
      />

      {/* Completamento % — ProgressBar tone success */}
      <Card hairline="success" className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Completamento
          </span>
          <span className="text-base leading-none">
            {doneAll ? "🏆" : "📈"}
          </span>
        </div>
        <div
          className={cn(
            "text-[26px] font-semibold leading-none tracking-tight tnum",
            doneAll ? "text-success" : "text-foreground"
          )}
        >
          {kpiHidden ? (
            maskKpi()
          ) : (
            <AnimatedNumber
              key={`pct-${Math.round(pctOverall * 10)}`}
              value={pctOverall}
              duration={850}
              fmt={(n) => formatPercent(n, 0)}
            />
          )}
        </div>
        <ProgressBar value={pctOverall} tone="success" />
        <div className="text-xs text-muted-foreground">
          {doneAll
            ? "Obiettivo complessivo raggiunto 🎉"
            : totals.target > 0
              ? `${hidden ? maskMoney() : formatMoney(totals.deposited, base, locale)} versati su ${hidden ? maskMoney() : formatMoney(totals.target, base, locale)}`
              : "Crea il primo obiettivo per iniziare"}
        </div>
      </Card>
    </div>
  );
}
