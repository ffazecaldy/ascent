"use client";

// ============================================================
// ASCEND — Trading stats: Correlazione Disciplina → P&L
// Tre colonne (Rispettato / Violato / Senza setup) con le stesse
// metriche delle KPI (count, win rate, R medio, P&L base, profit
// factor) + insight automatico sul costo dei trade senza setup.
// Count/WR/R/PF derivano da disciplinePnlSplit() (compute.ts); il P&L
// per bucket è ricalcolato qui in valuta BASE con accountBaseRate
// (compute somma resultNative grezzi, non confrontabili tra valute).
// Privacy: cifre monetarie mascherate con
// moneyMasked, percentuali/R con kpiMasked come nelle altre card.
// ============================================================

import { useMemo } from "react";
import { cn } from "@/lib/cn";
import type { DB, Trade } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Icon, type IconName } from "@/components/ui/Icon";
import {
  accountBaseRate,
  disciplinePnlSplit,
  tradeRespected,
  type DisciplinePnlBucket,
} from "@/lib/compute";
import { formatNumber, formatPercent, formatR, formatSignedMoney } from "@/lib/format";
import { moneyMasked, kpiMasked, maskMoney, maskKpi } from "@/lib/privacy";

interface ColumnSpec {
  key: string;
  label: string;
  tone: "success" | "danger" | "default";
  valueCls: string;
  icon: IconName;
}

const COLUMNS: ColumnSpec[] = [
  {
    key: "respected",
    label: "Rispettato",
    tone: "success",
    valueCls: "text-success",
    icon: "check",
  },
  {
    key: "violated",
    label: "Violato",
    tone: "danger",
    valueCls: "text-danger",
    icon: "x",
  },
  {
    key: "none",
    label: "Senza setup",
    tone: "default",
    valueCls: "text-secondary-text",
    icon: "alert",
  },
];

/** Chiavi dei tre bucket di disciplina. */
type BucketKey = "respected" | "violated" | "none";

/**
 * Frasario temporale dell'insight, derivato dall'etichetta del filtro
 * periodo attivo nella pagina (mai un "questo mese" fisso: i trade
 * mostrati possono coprire 3 mesi, 12 mesi o tutto lo storico).
 */
function periodPhrase(label: string): string {
  switch (label) {
    case "Questo mese":
      return "questo mese";
    case "Tutto":
      return "in tutto";
    default:
      return `negli ${label.toLowerCase()}`; // "Ultimi 3 mesi" → "negli ultimi 3 mesi"
  }
}

/** Riga etichetta/valore dentro una colonna. */
function MetricRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="tnum text-[12px] font-medium text-foreground">{children}</span>
    </div>
  );
}

export function DisciplineCorrelationCard({
  db,
  trades,
  periodLabel = "Questo mese",
}: {
  db: DB;
  trades: Trade[];
  periodLabel?: string;
}) {
  const mode = db.settings.privacyMode;
  const moneyHide = moneyMasked(mode); // cifre monetarie (standard o completa)
  const kpiHide = kpiMasked(mode); // percentuali/R (solo completa)

  // Raggruppamento per esito disciplina + metriche per gruppo (puro, memoizzato).
  const split = useMemo(() => disciplinePnlSplit(db, trades), [db, trades]);

  // P&L per bucket in valuta BASE: lo split somma resultNative grezzi (valute
  // miste su più account); qui si converte con accountBaseRate come fa la
  // curva equity aggregata della pagina. Bucketing identico a compute
  // (tradeRespected). Count/WR/R/PF sono valuta-indipendenti, restano dallo split.
  const pnlBase = useMemo(() => {
    const m = new Map<BucketKey, number>();
    for (const t of trades) {
      const acc = db.accounts.find((a) => a.id === t.accountId);
      const rate = acc ? accountBaseRate(acc, db.settings.baseCurrency) : 1;
      const r = tradeRespected(db, t.id);
      const key: BucketKey = r === true ? "respected" : r === false ? "violated" : "none";
      m.set(key, (m.get(key) ?? 0) + t.resultNative * rate);
    }
    return m;
  }, [db, trades]);

  const hasData = trades.length > 0;

  // Insight automatico sui trade SENZA setup: costo in R del periodo.
  const noneTotalR = (split.none.avgR ?? 0) * split.none.count;
  const insight = (() => {
    if (!hasData || split.none.count === 0) return null;
    if (noneTotalR < 0) {
      return {
        tone: "danger" as const,
        icon: "alert" as IconName,
        text: `I trade senza setup ti costano ${formatR(Math.abs(noneTotalR))} ${periodPhrase(periodLabel)}.`,
      };
    }
    if (noneTotalR > 0) {
      return {
        tone: "warning" as const,
        icon: "zap" as IconName,
        text: `I trade senza setup portano ${formatR(noneTotalR)} ${periodPhrase(periodLabel)}: profitto non replicabile senza playbook.`,
      };
    }
    return {
      tone: "default" as const,
      icon: "list" as IconName,
      text: `${split.none.count} ${split.none.count === 1 ? "trade" : "trade"} senza setup: risultato neutro ${periodPhrase(periodLabel)}.`,
    };
  })();

  const bucketOf = (key: string): DisciplinePnlBucket => split[key as keyof typeof split];

  return (
    <Card hairline="accent" texture className="relative">
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Disciplina → P&amp;L</CardTitle>
          <CardSubtitle>
            Trade chiusi per rispetto del playbook · P&amp;L in {db.settings.baseCurrency}
          </CardSubtitle>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Icon name="shield" size={16} className="text-accent" />
        </div>
      </CardHeader>

      {hasData ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {COLUMNS.map((col) => {
              const b = bucketOf(col.key);
              const pnl = pnlBase.get(col.key as BucketKey) ?? 0;
              return (
                <div key={col.key} className="rounded-lg bg-elevated/40 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Badge tone={col.tone}>{col.label}</Badge>
                    <Icon name={col.icon} size={14} className={col.valueCls} />
                  </div>
                  <div className={cn("tnum text-xl font-semibold", col.valueCls)}>
                    {b.count}
                    <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                      {b.count === 1 ? "trade" : "trade"}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1 border-t border-border pt-2">
                    <MetricRow label="Win rate">
                      {kpiHide && b.winRate != null ? maskKpi() : b.winRate != null ? formatPercent(b.winRate) : "—"}
                    </MetricRow>
                    <MetricRow label="R medio">
                      {kpiHide && b.avgR != null ? maskKpi() : b.avgR != null ? formatR(b.avgR) : "—"}
                    </MetricRow>
                    <MetricRow label="P&L">
                      {moneyHide ? (
                        <span className="text-secondary-text">{maskMoney()}</span>
                      ) : (
                        <span
                          className={cn(
                            "tnum font-semibold",
                            pnl > 0
                              ? "text-success"
                              : pnl < 0
                                ? "text-danger"
                                : "text-secondary-text"
                          )}
                        >
                          {formatSignedMoney(pnl, db.settings.baseCurrency)}
                        </span>
                      )}
                    </MetricRow>
                    <MetricRow label="Profit factor">
                      {kpiHide && b.pf != null ? maskKpi() : b.pf != null ? formatNumber(b.pf) : "—"}
                    </MetricRow>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Insight automatico */}
          {insight && (
            <div
              className={cn(
                "mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs",
                insight.tone === "danger"
                  ? "bg-danger/10 text-danger"
                  : insight.tone === "warning"
                    ? "bg-warning/10 text-warning"
                    : "bg-elevated text-secondary-text"
              )}
            >
              <Icon name={insight.icon} size={14} className="mt-0.5 shrink-0" />
              <span>{insight.text}</span>
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Nessun trade nel periodo: la correlazione disciplina → risultati apparirà qui.
        </p>
      )}
    </Card>
  );
}
