"use client";

// ============================================================
// ASCEND — Trading overview: KPI del mese corrente (StatCard)
// P&L trading in valuta base con sparkline degli ultimi 6 mesi,
// hairline success/danger e count-up (AnimatedNumber); win rate
// e Disciplina % mascherati in privacy "complete" (kpiMasked).
// Cifre mascherate in modalità privacy (moneyMasked).
// ============================================================

import { cn } from "@/lib/cn";
import type { DB } from "@/lib/types";
import { StatCard } from "@/components/ui/StatCard";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { TrendArrow } from "@/components/ui/Arrow";
import { Icon } from "@/components/ui/Icon";
import {
  monthPnlTrades,
  tradingStats,
  disciplineStats,
  tradesBetween,
} from "@/lib/compute";
import { monthKeyOf, todayKey, monthRange, parseDateKey } from "@/lib/dates";
import { formatSignedMoney, formatPercent } from "@/lib/format";
import { moneyMasked, kpiMasked, maskMoney, maskKpi } from "@/lib/privacy";

/** "2026-08" → "Agosto 2026" */
function monthLabel(monthKey: string, locale: string): string {
  const { y, m } = parseDateKey(monthKey + "-01");
  return new Date(y, m - 1, 1).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });
}

/** month key spostata di `offset` mesi (negativo = indietro nel tempo). */
function monthOffsetKey(monthKey: string, offset: number): string {
  const { y, m } = parseDateKey(monthKey + "-01");
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function KpiCards({ db }: { db: DB }) {
  const tz = db.settings.timezone;
  const locale = db.settings.locale;
  const mode = db.settings.privacyMode;

  const monthKey = monthKeyOf(todayKey(tz));
  const { start, end } = monthRange(monthKey);
  const monthTrades = tradesBetween(db, start, end); // trade chiusi nel mese
  const st = tradingStats(monthTrades);
  const disc = disciplineStats(db, monthTrades.map((t) => t.id));
  const pnlBase = monthPnlTrades(db, monthKey).base; // in valuta base

  // Delta vs MESE PRECEDENTE (frecce di movimento sui KPI).
  const prevMonthKey = monthOffsetKey(monthKey, -1);
  const pnlDelta = pnlBase - monthPnlTrades(db, prevMonthKey).base;
  const prevRange = monthRange(prevMonthKey);
  const prevTrades = tradesBetween(db, prevRange.start, prevRange.end);
  const prevSt = tradingStats(prevTrades);
  const prevDisc = disciplineStats(db, prevTrades.map((t) => t.id));
  const winRateDelta =
    st.winRate != null && prevSt.winRate != null
      ? st.winRate - prevSt.winRate
      : null;
  const discDelta =
    disc.disciplinePct != null && prevDisc.disciplinePct != null
      ? disc.disciplinePct - prevDisc.disciplinePct
      : null;

  const moneyHide = moneyMasked(mode);
  const kpiHide = kpiMasked(mode);
  const baseCurrency = db.settings.baseCurrency;

  // Serie P&L degli ultimi 6 mesi (valuta base) per la sparkline.
  const pnlSeries = Array.from(
    { length: 6 },
    (_, i) => monthPnlTrades(db, monthOffsetKey(monthKey, i - 5)).base
  );
  const pnlPos = pnlBase >= 0;
  const pnlTone =
    pnlBase > 0 ? "text-success" : pnlBase < 0 ? "text-danger" : "text-foreground";
  const pnlNote =
    st.count > 0
      ? `${st.count} ${st.count === 1 ? "trade" : "trade"} chiusi nel mese`
      : "nessun trade nel mese";

  const winRateBody = kpiHide ? (
    maskKpi()
  ) : st.winRate == null ? (
    "—"
  ) : (
    <AnimatedNumber value={st.winRate} fmt={formatPercent} className="tnum" />
  );
  const winNote =
    st.count > 0 ? `${st.wins} vinti · ${st.losses} persi` : "—";

  const discBody = kpiHide ? (
    maskKpi()
  ) : disc.disciplinePct == null ? (
    "—"
  ) : (
    <AnimatedNumber
      value={disc.disciplinePct}
      fmt={formatPercent}
      className="tnum"
    />
  );
  const discNote =
    disc.count > 0
      ? `${disc.respected}/${disc.count} setup rispettati`
      : disc.total > 0
        ? "nessun trade con setup"
        : "—";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        label={`P&L trading · ${monthLabel(monthKey, locale)}`}
        value={
          <span className="inline-flex items-center gap-1.5">
            {moneyHide ? (
              <span className="tnum text-secondary-text">{maskMoney()}</span>
            ) : (
              <AnimatedNumber
                value={pnlBase}
                className={cn("tnum", pnlTone)}
                fmt={(n) => formatSignedMoney(n, baseCurrency, locale)}
              />
            )}
            {!kpiHide && <TrendArrow value={pnlDelta} size={14} label />}
          </span>
        }
        delta={pnlNote}
        icon={<Icon name="chart-line" size={16} />}
        spark={moneyHide ? undefined : pnlSeries}
        sparkColor={pnlPos ? "var(--success)" : "var(--danger)"}
        hairline={moneyHide ? "none" : pnlPos ? "success" : "danger"}
      />
      <StatCard
        label="Win rate del mese"
        value={
          <span className="inline-flex items-center gap-1.5">
            {winRateBody}
            {!kpiHide && winRateDelta != null && (
              <TrendArrow value={winRateDelta} size={14} label />
            )}
          </span>
        }
        delta={winNote}
        icon={<Icon name="target" size={16} />}
      />
      <StatCard
        label="Disciplina del mese"
        value={
          <span className="inline-flex items-center gap-1.5">
            {discBody}
            {!kpiHide && discDelta != null && (
              <TrendArrow value={discDelta} size={14} label />
            )}
          </span>
        }
        delta={discNote}
        icon={<Icon name="clipboard" size={16} />}
      />
    </div>
  );
}
