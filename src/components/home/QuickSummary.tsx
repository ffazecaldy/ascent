"use client";

// ============================================================
// ASCEND — Home · Riepilogo rapido
// P&L trading mese · saldo entrate/uscite · ore produttive oggi ·
// allenamenti settimana · libro in corso.
// Privacy: cifre monetarie mascherate (moneyMasked),
// KPI/percentuali mascherati solo in modalità "complete" (kpiMasked).
// ============================================================

import { useMemo } from "react";
import {
  todayKey,
  weekStartKey,
  monthKeyOf,
  isoToDayKey,
} from "@/lib/dates";
import {
  monthPnlTrades,
  financesMonth,
  pcMinutesOnDay,
  currentBook,
  workoutsInWeek,
} from "@/lib/compute";
import { formatSignedMoney, formatMoney, formatR, minutiToOre } from "@/lib/format";
import { moneyMasked, kpiMasked, maskMoney, maskKpi } from "@/lib/privacy";
import type { DB } from "@/lib/types";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/Misc";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export function QuickSummary({ db }: { db: DB }) {
  const tz = db.settings.timezone;
  const currency = db.settings.baseCurrency;

  const maskedMoney = moneyMasked(db.settings.privacyMode);
  const maskedKpi = kpiMasked(db.settings.privacyMode);

  // Selettori pesanti raggruppati (ognuno scansiona una collezione del DB a ogni
  // render) → un solo useMemo([db, tz]) con risultati identici.
  const { pnl, fin, pcMin, workouts, book, monthR } = useMemo(() => {
    const today = todayKey(tz);
    const monthKey = today.slice(0, 7);
    const pnl = monthPnlTrades(db, monthKey).base;
    const fin = financesMonth(db, monthKey);
    const pcMin = pcMinutesOnDay(db, today);
    const weekStart = weekStartKey(today, db.settings.weekStart);
    const workouts = workoutsInWeek(db, weekStart);
    const book = currentBook(db);

    // R del mese (KPI → mascherato in modalità completa)
    const monthR = db.trades
      .filter((t) => monthKeyOf(isoToDayKey(t.closeDate, tz)) === monthKey)
      .reduce((s, t) => s + t.resultR, 0);
    return { pnl, fin, pcMin, workouts, book, monthR };
  }, [db, tz]);

  const tone = (v: number) => (v > 0 ? "positive" : v < 0 ? "negative" : "neutral");

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="P&L Trading · Mese"
          value={
            maskedMoney ? (
              maskMoney()
            ) : (
              <span className={pnl > 0 ? "text-success" : pnl < 0 ? "text-danger" : ""}>
                {formatSignedMoney(pnl, currency, db.settings.locale)}
              </span>
            )
          }
          delta={maskedKpi ? maskKpi() : formatR(monthR)}
          deltaTone={tone(monthR)}
          valueClassName={cn(pnl > 0 && "text-success", pnl < 0 && "text-danger")}
        />

        <StatCard
          label="Saldo · Mese"
          value={
            maskedMoney ? (
              maskMoney()
            ) : (
              <span className={fin.net > 0 ? "text-success" : fin.net < 0 ? "text-danger" : ""}>
                {formatSignedMoney(fin.net, currency, db.settings.locale)}
              </span>
            )
          }
          delta={
            maskedMoney
              ? maskMoney()
              : `In ${formatMoney(fin.income, currency, db.settings.locale)} · Uscite ${formatMoney(
                  fin.expense,
                  currency,
                  db.settings.locale
                )}`
          }
          deltaTone="neutral"
          valueClassName={cn(fin.net > 0 && "text-success", fin.net < 0 && "text-danger")}
        />

        <StatCard
          label="Ore produttive · Oggi"
          value={minutiToOre(pcMin)}
          delta={`${pcMin} min`}
          deltaTone="neutral"
        />

        <StatCard
          label="Allenamenti · Settimana"
          value={String(workouts)}
          delta={workouts === 1 ? "1 sessione" : `${workouts} sessioni`}
          deltaTone="neutral"
        />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Libro in corso</CardTitle>
            <CardSubtitle>Progresso di lettura</CardSubtitle>
          </div>
        </CardHeader>
        {book ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold">{book.title}</p>
              <span className="text-xs tnum text-secondary-text">
                {Math.min(book.pagesRead, book.totalPages)}/{book.totalPages} pagine
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {book.author || "Autore sconosciuto"}
            </p>
            <ProgressBar value={book.pagesRead} max={Math.max(1, book.totalPages)} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong py-12 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl border border-accent/30 bg-accent/10 shadow-[0_0_28px_-8px_rgba(76,126,255,0.6)]">
              <Icon name="book-open" size={30} className="text-accent" />
            </div>
            <p className="text-sm font-medium text-secondary-text">Nessun libro in corso</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Avvia un nuovo libro per tracciare il tuo progresso di lettura.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
