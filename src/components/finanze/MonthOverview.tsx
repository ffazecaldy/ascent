"use client";
// ============================================================
// Vista mese (spec 4.2 §3) — ART DIRECTION myfundedbook-style
// Navigazione prev/next con kicker in SectionHeader, KPI mese come
// StatCard con spark a 12 mesi + AnimatedNumber, GroupedBars/Donut
// mantenuti ma in Card hairline+texture con legenda ordinata,
// BarsChart del saldo netto con scan line, blocchi Reveal a stagger.
// Valori sempre in valuta base via formatMoney; privacy rispettata.
// ============================================================

import { useState } from "react";
import { useDB } from "@/lib/storage";
import { financesMonth, financesByCategory } from "@/lib/compute";
import { getCategory } from "@/lib/db";
import { todayKey, monthKeyOf } from "@/lib/dates";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { moneyMasked, maskMoney } from "@/lib/privacy";
import type { TransactionType } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/Misc";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Reveal } from "@/components/ui/Reveal";
import { GroupedBars, DonutChart, BarsChart, SUCCESS, DANGER } from "@/components/charts";
import { monthLabel, shortMonth, shiftMonth, lastMonths } from "./helpers";

// Colori in linea coi token del design system (globals.css).
const C_SUCCESS = "#2ddf9e";
const C_DANGER = "#ff5c5c";

/**
 * Variazione % vs mese precedente, con freccia nella direzione reale
 * della variazione e colore che codifica "buono/cattivo":
 *  - entrate: salita = verde, discesa = rosso
 *  - uscite (invert): salita = rosso, discesa = verde
 */
function MoMDelta({
  current,
  previous,
  invert = false,
  masked,
}: {
  current: number;
  previous?: number;
  invert?: boolean;
  masked: boolean;
}) {
  if (masked) return null;
  if (previous == null || !Number.isFinite(previous)) return null;
  if (previous === 0) {
    if (current === 0) return null;
    return <span className="tnum text-xs font-medium text-success">nuovo</span>;
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const flat = Math.abs(pct) < 0.05;
  const good = invert ? pct < 0 : pct > 0;
  const sign = pct > 0 ? "+" : "−";
  const text = `${sign}${Math.abs(pct).toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        flat ? "text-muted-foreground" : good ? "text-success" : "text-danger"
      )}
    >
      {!flat && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          {pct > 0 ? <path d="M5 15l7-7 7 7" /> : <path d="M5 9l7 7 7-7" />}
        </svg>
      )}
      <span className="tnum font-medium">{text}</span>
    </span>
  );
}

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

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

  const prevMonth = shiftMonth(month, -1);
  const fmPrev = financesMonth(db, prevMonth);

  const groupedData = trend.map((t) => ({ x: t.x, income: t.income, expense: t.expense }));
  const netData = trend.map((t) => ({ x: t.x, y: t.net }));

  // Serie per le sparkline dei KPI (12 mesi net/income/expense).
  const incomeSpark = trend.map((t) => t.income);
  const expenseSpark = trend.map((t) => t.expense);
  const netSpark = trend.map((t) => t.net);

  const incomeCount = db.transactions.filter(
    (t) => monthKeyOf(t.date) === month && t.type === "income"
  ).length;
  const expenseCount = db.transactions.filter(
    (t) => monthKeyOf(t.date) === month && t.type === "expense"
  ).length;

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

  const countText = (n: number) => (n > 0 ? `${n} mov` : masked ? null : "vuoto");

  return (
    <div className="space-y-4">
      {/* Navigazione mese: kicker + titolo in SectionHeader */}
      <SectionHeader
        kicker="Vista mese"
        title={capitalize(monthLabel(month))}
        subtitle={`Saldo, entrate e uscite · ${base}`}
        action={
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
              className="tnum"
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
        }
      />

      {/* KPI mese — StatCard con spark 12 mesi */}
      <Reveal delay={30}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Entrate"
            value={<AnimatedNumber value={fm.income} fmt={(n) => money(n)} duration={700} />}
            valueClassName="text-success"
            spark={incomeSpark}
            sparkColor={C_SUCCESS}
            hairline="success"
            delta={
              <span className="flex items-center gap-2">
                <MoMDelta current={fm.income} previous={fmPrev.income} masked={masked} />
                <span className="tnum text-[11px] text-muted-foreground">{countText(incomeCount)}</span>
              </span>
            }
          />
          <StatCard
            label="Uscite"
            value={<AnimatedNumber value={fm.expense} fmt={(n) => money(n)} duration={700} />}
            valueClassName="text-danger"
            spark={expenseSpark}
            sparkColor={C_DANGER}
            hairline="danger"
            delta={
              <span className="flex items-center gap-2">
                <MoMDelta current={fm.expense} previous={fmPrev.expense} invert masked={masked} />
                <span className="tnum text-[11px] text-muted-foreground">{countText(expenseCount)}</span>
              </span>
            }
          />
          <StatCard
            label="Saldo netto"
            value={<AnimatedNumber value={fm.net} fmt={(n) => money(n, true)} duration={800} />}
            valueClassName={fm.net >= 0 ? "text-success" : "text-danger"}
            hairline={fm.net >= 0 ? "success" : "danger"}
            spark={netSpark}
            sparkColor={fm.net >= 0 ? C_SUCCESS : C_DANGER}
            delta={
              <span className="flex items-center gap-2">
                <MoMDelta current={fm.net} previous={fmPrev.net} masked={masked} />
                <span className="tnum text-[11px] text-muted-foreground">{countText(fm.count)}</span>
              </span>
            }
          />
        </div>
      </Reveal>

      <div className="grid gap-4 lg:grid-cols-2">
        <Reveal delay={90} className="h-full">
          <Card hairline="accent" texture className="h-full">
            <CardHeader>
              <div>
                <CardTitle>Entrate vs uscite</CardTitle>
                <CardSubtitle>Ultimi 12 mesi · {base}</CardSubtitle>
              </div>
            </CardHeader>
            {masked ? (
              <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-border-strong text-xs text-secondary-text">
                Grafico nascosto in modalità privacy
              </div>
            ) : (
              <div>
                <GroupedBars data={groupedData} height={200} />
                {/* Legenda ordinata */}
                <div className="mt-2.5 flex items-center justify-center gap-4 text-[11px] text-secondary-text">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: SUCCESS }} />
                    Entrate
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: DANGER }} />
                    Uscite
                  </span>
                </div>
              </div>
            )}
          </Card>
        </Reveal>

        <Reveal delay={150} className="h-full">
          <Card hairline="accent" texture className="h-full">
            <CardHeader className="flex-wrap">
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
              <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-border-strong text-xs text-secondary-text">
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
              // Legenda del donut già ordinata desc per valore (più pesante in alto)
              <DonutChart
                data={donutData}
                centerLabel={donutType === "expense" ? "Uscite" : "Entrate"}
                centerValue={money(donutTotal)}
              />
            )}
          </Card>
        </Reveal>
      </div>

      <Reveal delay={200}>
        <Card hairline="accent" scan>
          <CardHeader>
            <div>
              <CardTitle>Saldo netto mensile</CardTitle>
              <CardSubtitle>Ultimi 12 mesi · {base}</CardSubtitle>
            </div>
          </CardHeader>
          {masked ? (
            <div className="flex h-[180px] items-center justify-center rounded-lg border border-dashed border-border-strong text-xs text-secondary-text">
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
      </Reveal>
    </div>
  );
}
