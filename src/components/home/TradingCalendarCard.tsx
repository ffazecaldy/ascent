"use client";

// ============================================================
// ASCEND — Home · Calendario Trading (mese corrente)
// Griglia del mese: una cella per giorno con il P&L del giorno in
// valuta BASE (compatto: +120 / −45, tnum) + numero di trade chiusi
// (es. "3 trade") + TrendArrow di direzione sopra le celle non nulle.
// Oggi evidenziato con anello accento. Giorni senza trade: celle
// presenti ma vuote. TUTTO derivato da useDB a ogni render → LIVE.
// Privacy: cifre monetarie mascherate in modalità standard/completa.
// ============================================================

import { useMemo } from "react";
import Link from "next/link";
import {
  todayKey,
  isoToDayKey,
  monthKeyOf,
  daysInMonth,
} from "@/lib/dates";
import { getAccount } from "@/lib/db";
import { accountBaseRate } from "@/lib/compute";
import { moneyMasked, maskMoney } from "@/lib/privacy";
import type { DB } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { TrendArrow } from "@/components/ui/Arrow";
import { cn } from "@/lib/cn";

const DOW_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

interface DayAgg {
  pnlBase: number;
  count: number;
}

/** Formato compatto del P&L del giorno: +120 / −45 / 0. */
function compactMoney(n: number): string {
  const abs = Math.round(Math.abs(n)).toLocaleString("it-IT");
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${abs}`;
}

export function TradingCalendarCard({ db }: { db: DB }) {
  const tz = db.settings.timezone;
  const masked = moneyMasked(db.settings.privacyMode);
  const currency = db.settings.baseCurrency;

  const { monthKey, monthLabel, aggs, today, tradeDays, totalTrades } = useMemo(() => {
    const today = todayKey(tz);
    const monthKey = today.slice(0, 7);
    const [y, m] = monthKey.split("-").map(Number);
    const monthLabel = new Date(y, m - 1, 1)
      .toLocaleDateString("it-IT", { month: "long", year: "numeric" });

    const map = new Map<string, DayAgg>();
    for (const t of db.trades) {
      const dk = isoToDayKey(t.closeDate, tz);
      if (monthKeyOf(dk) !== monthKey) continue;
      const acc = getAccount(db, t.accountId);
      const rate = acc ? accountBaseRate(acc, currency) : 1;
      const cur = map.get(dk) ?? { pnlBase: 0, count: 0 };
      cur.pnlBase += t.resultNative * rate;
      cur.count += 1;
      map.set(dk, cur);
    }
    const tradeDays = map.size;
    const totalTrades = Array.from(map.values()).reduce((s, a) => s + a.count, 0);
    return { monthKey, monthLabel, aggs: map, today, tradeDays, totalTrades };
  }, [db, tz, currency]);

  const [y, m] = monthKey.split("-").map(Number);
  const firstDow = new Date(y, m - 1, 1).getDay(); // 0=dom → offset per griglia che parte da lun
  const leading = (firstDow + 6) % 7;
  const dim = daysInMonth(y, m);

  return (
    <Card hairline="accent" texture className="flex flex-col">
      <CardHeader>
        <div>
          <CardTitle>Calendario Trading</CardTitle>
          <CardSubtitle>
            {totalTrades > 0
              ? `${monthLabel} · ${tradeDays} giorni di trading, ${totalTrades} trade`
              : `${monthLabel} · nessun trade nel mese`}
          </CardSubtitle>
        </div>
        <Link
          href="/trading/calendar"
          className="shrink-0 text-xs font-medium text-secondary-text transition-colors hover:text-accent"
        >
          Vedi calendario →
        </Link>
      </CardHeader>

      {/* intestazione giorni */}
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {DOW_LABELS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>

      {/* griglia del mese */}
      <div className="mt-1.5 grid grid-cols-7 gap-1.5">
        {Array.from({ length: leading }).map((_, i) => (
          <div key={`b${i}`} />
        ))}
        {Array.from({ length: dim }).map((_, i) => {
          const d = i + 1;
          const dk = `${monthKey}-${String(d).padStart(2, "0")}`;
          const agg = aggs.get(dk);
          const hasPnl = !!agg && agg.count > 0;
          const isToday = dk === today;
          const positive = hasPnl && agg!.pnlBase >= 0;
          return (
            <div
              key={dk}
              title={
                hasPnl && !masked
                  ? `${dk} · ${compactMoney(agg!.pnlBase)} ${currency} · ${agg!.count} trade`
                  : dk
              }
              className={cn(
                "relative flex aspect-[0.86] min-h-12 flex-col rounded-lg border p-1.5 transition-colors duration-300",
                hasPnl
                  ? positive
                    ? "border-success/70 bg-success/10 hover:border-success"
                    : "border-danger/70 bg-danger/10 hover:border-danger"
                  : "border-border/50 bg-elevated/15 hover:border-border",
                isToday && "ring-2 ring-accent/80 shadow-[0_0_14px_-2px_var(--accent-glow)]"
              )}
              style={
                hasPnl
                  ? {
                      backgroundImage: `radial-gradient(circle at 50% 40%, ${
                        positive ? "rgba(45, 223, 158, 0.16)" : "rgba(255, 92, 92, 0.16)"
                      } 0%, transparent 68%)`,
                    }
                  : undefined
              }
            >
              {/* giorno + freccia di direzione (poco invasiva) */}
              <div className="flex items-start justify-between leading-none">
                <span
                  className={cn(
                    "tnum text-[11px]",
                    isToday ? "font-bold text-accent" : "text-muted-foreground"
                  )}
                >
                  {d}
                </span>
                {hasPnl && <TrendArrow value={agg!.pnlBase} size={10} className="opacity-80" />}
              </div>

              {/* P&L del giorno (cifra principale grande) + n. trade (secondario sotto) */}
              {hasPnl ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-1 px-0.5">
                  <span
                    className={cn(
                      "tnum text-[15px] font-semibold leading-none",
                      masked ? "text-secondary-text" : positive ? "text-success" : "text-danger"
                    )}
                  >
                    {masked ? maskMoney() : compactMoney(agg!.pnlBase)}
                  </span>
                  <span className="tnum text-[11px] font-medium leading-none text-secondary-text">
                    {agg!.count} tr
                  </span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* legenda */}
      <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5 text-[11px] text-muted-foreground">
        <span>
          ▲ verde · giorno positivo&ensp;|&ensp;▼ rossa · giorno negativo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border border-accent/60 bg-accent/15" /> oggi
        </span>
      </div>
    </Card>
  );
}
