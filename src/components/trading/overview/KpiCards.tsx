"use client";

// ============================================================
// ASCEND — Trading overview: KPI del mese corrente
// P&L trading (valuta base) + win rate + Disciplina % sui trade
// del mese. Rispetta la privacy (moneyMasked / kpiMasked).
// ============================================================

import { cn } from "@/lib/cn";
import type { DB } from "@/lib/types";
import { StatCard } from "@/components/ui/StatCard";
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

  const moneyHide = moneyMasked(mode);
  const kpiHide = kpiMasked(mode);
  const baseCurrency = db.settings.baseCurrency;

  const pnl = moneyHide
    ? maskMoney()
    : formatSignedMoney(pnlBase, baseCurrency, locale);
  const pnlTone =
    pnlBase > 0 ? "text-success" : pnlBase < 0 ? "text-danger" : "text-foreground";
  const pnlNote =
    st.count > 0
      ? `${st.count} ${st.count === 1 ? "trade" : "trade"} chiusi nel mese`
      : "nessun trade nel mese";

  const winRate = kpiHide
    ? maskKpi()
    : st.winRate == null
      ? "—"
      : formatPercent(st.winRate);
  const winNote =
    st.count > 0 ? `${st.wins} vinti · ${st.losses} persi` : "—";

  const discPct = kpiHide
    ? maskKpi()
    : disc.disciplinePct == null
      ? "—"
      : formatPercent(disc.disciplinePct);
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
        value={pnl}
        valueClassName={cn("tnum", moneyHide ? "text-secondary-text" : pnlTone)}
        delta={pnlNote}
        icon={<span className="text-base leading-none">📈</span>}
      />
      <StatCard
        label="Win rate del mese"
        value={winRate}
        valueClassName="tnum"
        delta={winNote}
        icon={<span className="text-base leading-none">🎯</span>}
      />
      <StatCard
        label="Disciplina del mese"
        value={discPct}
        valueClassName="tnum"
        delta={discNote}
        icon={<span className="text-base leading-none">📋</span>}
      />
    </div>
  );
}
