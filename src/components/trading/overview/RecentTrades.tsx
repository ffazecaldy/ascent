"use client";

// ============================================================
// ASCEND — Trading overview: ultimi 10 trade chiusi (tabella densa)
// Data · strumento · direzione · risultato R · P&L nativo colorato
// · setup · dot disciplina (verde=rispettato, rossa=non rispettato).
// Righe con hover, numeri in tnum. Rispetta la privacy.
// ============================================================

import Link from "next/link";
import { cn } from "@/lib/cn";
import type { DB } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Misc";
import { setupName } from "@/lib/db";
import { tradeRespected, monthPnlTrades } from "@/lib/compute";
import { monthKeyOf, todayKey, parseDateKey } from "@/lib/dates";
import { formatR, formatSignedMoney } from "@/lib/format";
import { moneyMasked, kpiMasked, maskMoney, maskKpi } from "@/lib/privacy";
import { TrendArrow } from "@/components/ui/Arrow";

/** ISO → "12 ago · 14:05" nella timezone utente (non browser). */
function formatClose(iso: string, tz: string, locale: string): string {
  const dt = new Date(iso);
  const day = new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    day: "numeric",
    month: "short",
  }).format(dt);
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);
  return `${day} · ${time}`;
}

/** Month key "yyyy-MM" spostata di `offset` mesi (negativo = indietro). */
function monthOffsetKey(monthKey: string, offset: number): string {
  const { y, m } = parseDateKey(monthKey + "-01");
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Dot disciplina: vero=verde, falso=rossa, null=grigia (non valutabile). */
function DisciplineDot({ respected }: { respected: boolean | null }) {
  if (respected == null) {
    return (
      <span
        className="inline-block h-2 w-2 rounded-full bg-border"
        title="Nessun setup valutabile"
      />
    );
  }
  return respected ? (
    <span
      className="inline-block h-2 w-2 rounded-full bg-success shadow-[0_0_6px_rgba(45,223,158,0.6)]"
      title="Setup rispettato"
    />
  ) : (
    <span
      className="inline-block h-2 w-2 rounded-full bg-danger shadow-[0_0_6px_rgba(255,92,92,0.6)]"
      title="Setup non rispettato"
    />
  );
}

export function RecentTrades({ db }: { db: DB }) {
  const tz = db.settings.timezone;
  const locale = db.settings.locale;
  const moneyHide = moneyMasked(db.settings.privacyMode);
  const kpiHide = kpiMasked(db.settings.privacyMode);
  const baseCurrency = db.settings.baseCurrency;

  const recent = [...db.trades]
    .sort((a, b) => b.closeDate.localeCompare(a.closeDate))
    .slice(0, 10);

  // Chip riepilogativo "Δ vs mese prec" (solo freccia + delta P&L mese corrente − mese precedente).
  const monthKey = monthKeyOf(todayKey(tz));
  const pnlDelta =
    monthPnlTrades(db, monthKey).base -
    monthPnlTrades(db, monthOffsetKey(monthKey, -1)).base;

  return (
    <Card texture>
      <CardHeader>
        <div>
          <CardTitle>Ultimi trade</CardTitle>
          <CardSubtitle>
            {db.trades.length === 0
              ? "Registra il primo trade per vederlo qui"
              : `Gli ultimi ${recent.length} trade chiusi`}
          </CardSubtitle>
        </div>
        {db.trades.length > 0 && (
          <Link
            href="/trading/trades"
            className="text-xs font-medium text-accent hover:underline"
          >
            Tutti →
          </Link>
        )}
      </CardHeader>
      {recent.length === 0 ? (
        <EmptyState
          icon="🕹"
          title="Nessun trade"
          description="I trade chiusi compariranno qui con risultato e setup."
          action={
            <Link href="/trading/trades">
              <Button size="sm" variant="primary">
                Registra un trade
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              {recent.length > 0 && (
                <tr className="border-b border-border/60">
                  <th colSpan={7} className="pb-2 text-right font-normal">
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-elevated px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Δ vs mese prec
                      <TrendArrow value={pnlDelta} size={10} />
                      {!moneyHide && (
                        <span
                          className={cn(
                            "tnum",
                            pnlDelta > 0
                              ? "text-success"
                              : pnlDelta < 0
                                ? "text-danger"
                                : "text-muted-foreground"
                          )}
                        >
                          {formatSignedMoney(pnlDelta, baseCurrency, locale)}
                        </span>
                      )}
                    </span>
                  </th>
                </tr>
              )}
              <tr className="border-b border-border text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="pb-2 pr-3">Data</th>
                <th className="pb-2 pr-3">Strumento</th>
                <th className="pb-2 pr-3">Direzione</th>
                <th className="pb-2 pr-3 text-right">Risultato</th>
                <th className="pb-2 pr-3 text-right">P&L</th>
                <th className="pb-2 pr-3">Setup</th>
                <th className="pb-2 text-right">Disciplina</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((t) => {
                const acc = db.accounts.find((a) => a.id === t.accountId);
                const currency = acc?.nativeCurrency ?? baseCurrency;
                const respected = tradeRespected(db, t.id);
                return (
                  <tr
                    key={t.id}
                    className="group border-b border-border/60 transition-colors last:border-0 hover:bg-elevated/50"
                  >
                    <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground tnum">
                      {formatClose(t.closeDate, tz, locale)}
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap font-medium">
                      {t.instrument}
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      <Badge tone={t.direction === "long" ? "info" : "default"}>
                        {t.direction === "long" ? "▲ Long" : "▼ Short"}
                      </Badge>
                    </td>
                    <td
                      className={cn(
                        "py-1.5 pr-3 text-right whitespace-nowrap font-medium tnum",
                        kpiHide
                          ? "text-muted-foreground"
                          : t.resultR > 0
                            ? "text-success"
                            : t.resultR < 0
                              ? "text-danger"
                              : "text-muted-foreground"
                      )}
                    >
                      {kpiHide ? maskKpi() : formatR(t.resultR)}
                    </td>
                    <td
                      className={cn(
                        "py-1.5 pr-3 text-right whitespace-nowrap font-semibold tnum",
                        moneyHide
                          ? "text-secondary-text"
                          : t.resultNative > 0
                            ? "text-success"
                            : t.resultNative < 0
                              ? "text-danger"
                              : "text-muted-foreground"
                      )}
                    >
                      {moneyHide
                        ? maskMoney()
                        : formatSignedMoney(t.resultNative, currency, locale)}
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap text-secondary-text">
                      {setupName(db, t.setupId)}
                    </td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      <DisciplineDot respected={respected} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
