"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { useDB } from "@/lib/storage";
import { pnlByTradingDay } from "@/lib/compute";
import { monthKeyOf, todayKey } from "@/lib/dates";
import { calendarNeutral, maskMoney, moneyMasked } from "@/lib/privacy";
import { formatSignedMoney } from "@/lib/format";

import { PnlCalendar } from "@/components/charts";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Field";
import { EmptyState, SectionHeader } from "@/components/ui/Misc";

/** Sposta un month key "yyyy-MM" di `delta` mesi. */
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function TradingCalendarPage() {
  const db = useDB();
  const today = todayKey(db.settings.timezone);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [month, setMonth] = useState<string>(() => monthKeyOf(today));

  const accounts = useMemo(() => db.accounts.filter((a) => !a.archived), [db.accounts]);
  const account = accounts.find((a) => a.id === accountId) ?? accounts[0] ?? null;

  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(db.settings.locale, {
      month: "long",
      year: "numeric",
    });
  }, [month, db.settings.locale]);

  const days = useMemo(() => {
    if (!account) return [];
    return pnlByTradingDay(
      db.trades.filter((t) => t.accountId === account.id),
      account,
      month
    );
  }, [db.trades, account, month]);

  const summary = useMemo(() => {
    let pos = 0,
      neg = 0,
      zero = 0,
      total = 0;
    for (const d of days) {
      total += d.pnl;
      if (d.pnl > 0) pos++;
      else if (d.pnl < 0) neg++;
      else zero++;
    }
    return { pos, neg, zero, total };
  }, [days]);

  const money = moneyMasked(db.settings.privacyMode);
  const monthTotal =
    !account || money
      ? maskMoney()
      : formatSignedMoney(summary.total, account.nativeCurrency, db.settings.locale);

  if (accounts.length === 0) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title="Calendario P&L"
          subtitle="P&L per trading day dell'account — il confine segue la sessione, non la mezzanotte."
        />
        <EmptyState
          icon="📅"
          title="Nessun account disponibile"
          description="Crea almeno un account di trading per vedere il calendario P&L per trading day."
          action={
            <Link href="/trading/accounts">
              <Button variant="outline" size="sm">
                Vai agli account
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Calendario P&L"
        subtitle="P&L per trading day dell'account — il confine segue la sessione, non la mezzanotte."
      />

      {/* Selezione account + navigazione mese */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Account" className="w-full max-w-xs">
          <Select value={account!.id} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            aria-label="Mese precedente"
          >
            ←
          </Button>
          <span className="min-w-[130px] text-center text-sm font-semibold capitalize tnum">
            {monthLabel}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            aria-label="Mese successivo"
          >
            →
          </Button>
          <Button
            variant="subtle"
            size="sm"
            onClick={() => setMonth(monthKeyOf(today))}
            disabled={month === monthKeyOf(today)}
          >
            Oggi
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Calendario */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Calendario P&L</CardTitle>
              <CardSubtitle>
                {account!.name} · {account!.nativeCurrency} · ogni cella è un trading day
              </CardSubtitle>
            </div>
          </CardHeader>
          {days.length === 0 ? (
            <EmptyState
              icon="📭"
              title="Nessun trade nel mese"
              description={`Nessun trade chiuso per ${account!.name} in ${monthLabel}.`}
            />
          ) : (
            <PnlCalendar
              month={month}
              days={days}
              nativeCurrency={account!.nativeCurrency}
              neutral={calendarNeutral(db.settings.privacyMode)}
            />
          )}
        </Card>

        {/* Colonna laterale: confine + riepilogo */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Confine trading day</CardTitle>
                <CardSubtitle>
                  {account!.name} · il giorno di trading, non mezzanotte locale
                </CardSubtitle>
              </div>
            </CardHeader>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-secondary-text">Fuso</span>
                <span className="text-right tnum">{account!.tradingDayTimezone}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-secondary-text">Rollover</span>
                <span className="text-right tnum">{account!.tradingDayRolloverTime}</span>
              </div>
              <p className="border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
                Il limite giornaliero si azzera al rollover della sessione (es. 17:00
                America/Chicago per futures CME), non a mezzanotte.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Riepilogo mese</CardTitle>
                <CardSubtitle>{monthLabel}</CardSubtitle>
              </div>
            </CardHeader>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-elevated p-2">
                <div className="text-lg font-semibold tnum text-success">{summary.pos}</div>
                <div className="text-[10px] text-secondary-text">Positivi</div>
              </div>
              <div className="rounded-lg bg-elevated p-2">
                <div className="text-lg font-semibold tnum text-danger">{summary.neg}</div>
                <div className="text-[10px] text-secondary-text">Negativi</div>
              </div>
              <div className="rounded-lg bg-elevated p-2">
                <div className="text-lg font-semibold tnum text-muted-foreground">{summary.zero}</div>
                <div className="text-[10px] text-secondary-text">Zero</div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <span className="text-xs text-secondary-text">P&L totale mese</span>
              <span className="text-sm font-semibold tnum">{monthTotal}</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
