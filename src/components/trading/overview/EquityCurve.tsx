"use client";

// ============================================================
// ASCEND — Trading overview: "Andamento cumulato" (curva equity)
// Equity cumulata dei trade chiusi nel MESE corrente, convertita
// in valuta base (resultNative × baseRate account). LineChart in
// Card con hairline accent + texture: linea accent se trend
// positivo, DANGER se l'ultimo valore < 0. Header con totale del
// mese (AnimatedNumber, formatSignedMoney) e TrendArrow del delta
// vs mese precedente. Se il mese ha meno di 2 trade si ripiega sugli
// ultimi 20 trade chiusi (SCELTA dichiarata; vedi rangeLabel).
// Tutto derivato a runtime da useDB: all'inserimento di un trade
// i dati si aggiornano da soli. Nessuna scrittura sul DB.
// ============================================================

import { useMemo } from "react";
import { cn } from "@/lib/cn";
import type { DB, Trade } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { LineChart } from "@/components/charts";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { TrendArrow } from "@/components/ui/Arrow";
import { accountBaseRate, monthPnlTrades, tradesBetween } from "@/lib/compute";
import {
  isoToDayKey,
  monthKeyOf,
  monthRange,
  parseDateKey,
  todayKey,
} from "@/lib/dates";
import { formatSignedMoney } from "@/lib/format";
import { moneyMasked, kpiMasked, maskMoney, maskCompact } from "@/lib/privacy";

// Hex coerenti con i token CSS (--accent / --danger), come nelle stats.
const ACCENT_HEX = "#4c7eff";
const DANGER_HEX = "#ff5c5c";

const CHART_H = 180;

/** "2026-08" → "Agosto 2026" */
function monthLabel(monthKey: string, locale: string): string {
  const { y, m } = parseDateKey(monthKey + "-01");
  return new Date(y, m - 1, 1).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });
}

/** Month key spostata di `offset` mesi (negativo = indietro nel tempo). */
function monthOffsetKey(monthKey: string, offset: number): string {
  const { y, m } = parseDateKey(monthKey + "-01");
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "2026-08-20" → "20/08" */
function shortDay(key: string): string {
  const { d, m } = parseDateKey(key);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** Tasso nativo→base per l'account del trade (1 se account mancante). */
function baseRateOf(db: DB, t: Trade): number {
  const acc = db.accounts.find((a) => a.id === t.accountId);
  return acc ? accountBaseRate(acc, db.settings.baseCurrency) : 1;
}

export function EquityCurve({ db }: { db: DB }) {
  const tz = db.settings.timezone;
  const locale = db.settings.locale;
  const baseCurrency = db.settings.baseCurrency;
  const moneyHide = moneyMasked(db.settings.privacyMode);
  const kpiHide = kpiMasked(db.settings.privacyMode);

  // Selettori pesanti: intervallo, curva cumulata (base) e totali del mese
  // (dipendono solo da db) → memoizzati per non ricalcolarli a ogni re-render.
  const { data, total, delta, rangeLabel } = useMemo(() => {
    const monthKey = monthKeyOf(todayKey(tz));
    const { start, end } = monthRange(monthKey);
    const prevMonthKey = monthOffsetKey(monthKey, -1);

    // SCELTA dell'intervallo: trade chiusi nel mese corrente; se il mese
    // ha meno di 2 trade si ripiega sugli ultimi 20 trade chiusi (così la
    // curva non è mai triviale/inutile). rangeLabel dichiara la scelta.
    const monthTrades = tradesBetween(db, start, end);
    const useMonth = monthTrades.length >= 2;
    const curveTrades = useMonth
      ? monthTrades
      : [...db.trades]
          .sort((a, b) => b.closeDate.localeCompare(a.closeDate)) // ultimi chiusi per primi
          .slice(0, 20);

    // Curva equity cumulata in VALUTA BASE, ordinata per chiusura.
    // reduce immutabile: nessuna riassegnazione di variabili nel render.
    const data = [...curveTrades]
      .sort((a, b) => a.closeDate.localeCompare(b.closeDate))
      .reduce<{ x: string; y: number }[]>((acc, t) => {
        const y = (acc[acc.length - 1]?.y ?? 0) + t.resultNative * baseRateOf(db, t);
        return [...acc, { x: shortDay(isoToDayKey(t.closeDate, tz)), y }];
      }, []);

    // Totale del mese (base) + delta vs mese precedente — coerenti coi KPI.
    const total = monthPnlTrades(db, monthKey).base;
    const delta = total - monthPnlTrades(db, prevMonthKey).base;

    const rangeLabel = useMonth
      ? `Mese corrente · ${monthLabel(monthKey, locale)} · ${monthTrades.length} trade`
      : `Ultimi 20 trade chiusi · ${monthLabel(monthKey, locale)}`;

    return { data, total, delta, rangeLabel };
  }, [db, tz, locale]);

  const lastValue = data.length ? data[data.length - 1].y : 0;
  const lineColor = lastValue < 0 ? DANGER_HEX : ACCENT_HEX;
  const totalTone =
    total > 0 ? "text-success" : total < 0 ? "text-danger" : "text-foreground";
  const deltaTone =
    delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-muted-foreground";

  return (
    <Card hairline="accent" texture className="relative">
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Andamento cumulato</CardTitle>
          <CardSubtitle className="text-secondary-text">
            Equity in {baseCurrency} (base) · {rangeLabel}
          </CardSubtitle>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-medium uppercase tracking-wide text-secondary-text">
            Totale del mese
          </p>
          <p
            className={cn(
              "inline-flex items-center justify-end text-base font-semibold tnum leading-tight",
              moneyHide ? "text-secondary-text" : totalTone
            )}
          >
            {moneyHide ? (
              maskMoney()
            ) : (
              <AnimatedNumber
                value={total}
                fmt={(n) => formatSignedMoney(n, baseCurrency, locale)}
              />
            )}
          </p>
          {!kpiHide && (
            <p
              className={cn(
                "inline-flex items-center justify-end gap-1 text-[11px] tnum",
                moneyHide ? "text-secondary-text" : deltaTone
              )}
            >
              <TrendArrow value={delta} size={11} />
              {moneyHide ? (
                maskCompact()
              ) : (
                formatSignedMoney(delta, baseCurrency, locale)
              )}
              <span className="text-secondary-text">vs mese prec.</span>
            </p>
          )}
        </div>
      </CardHeader>
      {data.length === 0 ? (
        <p className="py-8 text-center text-xs text-secondary-text">
          Chiudi un trade per vedere la tua curva
        </p>
      ) : (
        <LineChart
          data={data}
          height={CHART_H}
          color={lineColor}
          yFormatter={moneyHide ? () => maskMoney() : undefined}
        />
      )}
    </Card>
  );
}
