"use client";
// ============================================================
// Vista mese (spec 4.2 §3)
// Navigazione prev/next, saldo netto da financesMonth, GroupedBars
// entrate vs uscite (12 mesi), Donut per categoria (financesByCategory)
// e trend saldo netto a 12 mesi (BarsChart).
// Valori sempre in valuta base via formatMoney; privacy rispettata.
// ============================================================

import { useState } from "react";
import { useDB } from "@/lib/storage";
import { financesMonth, financesByCategory } from "@/lib/compute";
import { getCategory } from "@/lib/db";
import { todayKey } from "@/lib/dates";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { moneyMasked, maskMoney } from "@/lib/privacy";
import type { TransactionType } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { GroupedBars, DonutChart, BarsChart, SUCCESS, DANGER } from "@/components/charts";
import { monthLabel, shortMonth, shiftMonth, lastMonths } from "./helpers";

export function MonthOverview({
  month,
  onMonthChange,
}: {
  month: string;
  onMonthChange: (m: string) => void;
}) {
  const db = useDB();
  const base = db.settings.baseCurrency.toUpperCase();
  const locale = db.settings.locale;
  const masked = moneyMasked(db.settings.privacyMode);
  const currentMonth = todayKey(db.settings.timezone).slice(0, 7);

  const fm = financesMonth(db, month);
  const byCat = financesByCategory(db, month);

  const [donutType, setDonutType] = useState<TransactionType>("expense");

  const trend = lastMonths(month, 12).map((m) => {
    const f = financesMonth(db, m);
    return { x: shortMonth(m), income: f.income, expense: f.expense, net: f.net };
  });

  const groupedData = trend.map((t) => ({ x: t.x, income: t.income, expense: t.expense }));
  const netData = trend.map((t) => ({ x: t.x, y: t.net }));

  const donutData = byCat
    .filter((c) => c[donutType] > 0)
    .map((c) => ({
      label: getCategory(db, c.categoryId)?.name ?? "—",
      value: c[donutType],
      color: getCategory(db, c.categoryId)?.color ?? "#64748b",
    }))
    .sort((a, b) => b.value - a.value);
  const donutTotal = donutData.reduce((s, d) => s + d.value, 0);

  const money = (v: number, signed = false) => {
    if (masked) return maskMoney();
    return signed ? formatSignedMoney(v, base, locale) : formatMoney(v, base, locale);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-wrap">
          <div>
            <CardTitle className="text-lg capitalize">{monthLabel(month)}</CardTitle>
            <CardSubtitle>Saldo mensile in {base}</CardSubtitle>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => onMonthChange(shiftMonth(month, -1))}
              aria-label="Mese precedente"
            >
              ‹
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onMonthChange(currentMonth)}
              disabled={month === currentMonth}
            >
              Mese corrente
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onMonthChange(shiftMonth(month, 1))}
              aria-label="Mese successivo"
            >
              ›
            </Button>
          </div>
        </CardHeader>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Entrate" value={money(fm.income)} valueClassName="text-success" />
          <StatCard label="Uscite" value={money(fm.expense)} valueClassName="text-danger" />
          <StatCard
            label="Saldo netto"
            value={money(fm.net, true)}
            valueClassName={fm.net >= 0 ? "text-success" : "text-danger"}
            delta={fm.count > 0 ? `${fm.count} transazioni` : masked ? undefined : "vuoto"}
            deltaTone="neutral"
          />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Entrate vs uscite</CardTitle>
              <CardSubtitle>Ultimi 12 mesi · {base}</CardSubtitle>
            </div>
          </CardHeader>
          {masked ? (
            <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-border-strong text-xs text-muted-foreground">
              Grafico nascosto in modalità privacy
            </div>
          ) : (
            <GroupedBars data={groupedData} height={200} />
          )}
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Per categoria</CardTitle>
              <CardSubtitle>Composizione di {monthLabel(month)}</CardSubtitle>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-border-strong bg-muted p-0.5">
              <button
                onClick={() => setDonutType("expense")}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  donutType === "expense"
                    ? "bg-danger/15 text-danger"
                    : "text-muted-foreground hover:text-secondary-text"
                )}
              >
                Uscite
              </button>
              <button
                onClick={() => setDonutType("income")}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  donutType === "income"
                    ? "bg-success/15 text-success"
                    : "text-muted-foreground hover:text-secondary-text"
                )}
              >
                Entrate
              </button>
            </div>
          </CardHeader>
          {donutData.length === 0 ? (
            <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-border-strong text-xs text-muted-foreground">
              Nessuna {donutType === "expense" ? "uscita" : "entrata"} in questo mese
            </div>
          ) : masked ? (
            <div className="space-y-1.5 py-1">
              {donutData.map((d, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-1.5 truncate text-secondary-text">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
                    {d.label}
                  </span>
                  <span className="tnum text-muted-foreground">
                    {Math.round((d.value / donutTotal) * 100)}%
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <DonutChart
              data={donutData}
              centerLabel={donutType === "expense" ? "Uscite" : "Entrate"}
              centerValue={formatMoney(donutTotal, base, locale)}
            />
          )}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Saldo netto mensile</CardTitle>
            <CardSubtitle>Ultimi 12 mesi · {base}</CardSubtitle>
          </div>
        </CardHeader>
        {masked ? (
          <div className="flex h-[180px] items-center justify-center rounded-lg border border-dashed border-border-strong text-xs text-muted-foreground">
            Grafico nascosto in modalità privacy
          </div>
        ) : (
          <BarsChart
            data={netData}
            height={180}
            color={SUCCESS}
            negativeColor={DANGER}
            showValue={!masked}
          />
        )}
      </Card>
    </div>
  );
}
