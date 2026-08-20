"use client";

// ============================================================
// ASCEND — Home · Curva di andamento (equity del mese)
// Curva cumulativa del P&L in valuta BASE (LineChart area accent).
// Se il mese ha meno di 2 chiusure mostra le ultime 20 chiusure.
// In header: "Totale mese" (AnimatedNumber count-up, formatSignedMoney)
// + TrendArrow del delta vs mese precedente. LIVE da useDB.
// Privacy: cifre monetarie mascherate in modalità standard/completa.
// ============================================================

import { useMemo } from "react";
import { todayKey, isoToDayKey, monthKeyOf } from "@/lib/dates";
import { getAccount } from "@/lib/db";
import { accountBaseRate, monthPnlTrades } from "@/lib/compute";
import { formatSignedMoney } from "@/lib/format";
import { moneyMasked, maskMoney } from "@/lib/privacy";
import type { DB, Trade } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { LineChart, ACCENT } from "@/components/charts";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { TrendArrow } from "@/components/ui/Arrow";
import { cn } from "@/lib/cn";

function prevMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const dt = new Date(y, m - 2, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

export function EquityCurveCard({ db }: { db: DB }) {
  const tz = db.settings.timezone;
  const currency = db.settings.baseCurrency;
  const locale = db.settings.locale;
  const masked = moneyMasked(db.settings.privacyMode);

  const { points, monthTotal, delta, scope } = useMemo(() => {
    const today = todayKey(tz);
    const monthKey = today.slice(0, 7);
    const prevKey = prevMonthKey(monthKey);

    const toBase = (t: Trade) => {
      const acc = getAccount(db, t.accountId);
      return t.resultNative * (acc ? accountBaseRate(acc, currency) : 1);
    };

    const build = (trades: Trade[]) => {
      let cum = 0;
      return trades.map((t) => {
        cum += toBase(t);
        return { x: isoToDayKey(t.closeDate, tz).slice(5), y: cum };
      });
    };

    const monthTrades = db.trades
      .filter((t) => monthKeyOf(isoToDayKey(t.closeDate, tz)) === monthKey)
      .sort((a, b) => a.closeDate.localeCompare(b.closeDate));

    const monthPoints = build(monthTrades);
    let points = monthPoints;
    let scope: "month" | "last20" = "month";
    if (monthPoints.length < 2) {
      const last20 = [...db.trades]
        .sort((a, b) => b.closeDate.localeCompare(a.closeDate))
        .slice(0, 20)
        .reverse();
      points = build(last20);
      scope = "last20";
    }

    const monthTotal = monthTrades.reduce((s, t) => s + toBase(t), 0);
    const prevTotal = monthPnlTrades(db, prevKey).base;
    return { points, monthTotal, delta: monthTotal - prevTotal, scope };
  }, [db, tz, currency]);

  const fmtMoney = (n: number) => formatSignedMoney(n, currency, locale);
  const totalFmt = masked ? () => maskMoney() : fmtMoney;

  return (
    <Card hairline="accent" texture className="flex flex-col">
      <CardHeader>
        <div>
          <CardTitle>Curva di andamento</CardTitle>
          <CardSubtitle>
            {scope === "month"
              ? "Equity del mese · P&L cumulato in valuta base"
              : "Ultime 20 chiusure · P&L cumulato in valuta base"}
          </CardSubtitle>
        </div>

        <div className="text-right">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Totale mese
          </span>
          <div className="flex items-baseline justify-end gap-1.5">
            <AnimatedNumber
              value={monthTotal}
              fmt={totalFmt}
              className={cn(
                "tnum text-2xl font-bold leading-tight",
                masked ? "text-secondary-text" : monthTotal >= 0 ? "text-success" : "text-danger"
              )}
            />
          </div>
          <div className="mt-1 flex items-center justify-end gap-1">
            <TrendArrow value={delta} size={10} />
            <span
              className={cn(
                "tnum text-[11px] font-medium",
                masked ? "text-secondary-text" : delta >= 0 ? "text-success" : "text-danger"
              )}
            >
              {masked ? maskMoney() : fmtMoney(delta)}
            </span>
            <span className="text-[11px] text-muted-foreground">vs mese scorso</span>
          </div>
        </div>
      </CardHeader>

      <div className="mt-auto">
        <LineChart
          data={points}
          height={170}
          color={ACCENT}
          yFormatter={masked ? () => maskMoney() : undefined}
        />
      </div>
    </Card>
  );
}
