"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";

import { useDB } from "@/lib/storage";
import { pnlByTradingDay } from "@/lib/compute";
import { monthKeyOf, todayKey } from "@/lib/dates";
import { calendarNeutral, moneyMasked } from "@/lib/privacy";
import { formatSignedMoney } from "@/lib/format";
import { cn } from "@/lib/cn";

import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Field";
import { EmptyState, SectionHeader } from "@/components/ui/Misc";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";

/** Sposta un month key "yyyy-MM" di `delta` mesi. */
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function GlobeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/**
 * Griglia calendario P&L locale — stessa identità visiva di PnlCalendar
 * (colori saturati per intensità, privacy neutral) con presentazione
 * art-direction myfundedbook: celle con comparsa animate-rise in stagger,
 * oggi marcato con anello accent, intestazione Lun–Dom allineata.
 */
function CalGrid({
  month,
  days,
  today,
  locale,
  nativeCurrency,
  neutral,
}: {
  month: string;
  days: { dayKey: string; pnl: number }[];
  today: string;
  locale: string;
  nativeCurrency: string;
  neutral: boolean;
}) {
  const [y, m] = month.split("-").map(Number);
  const firstDow = new Date(y, m - 1, 1).getDay();
  const dim = new Date(y, m, 0).getDate();
  const pnlMap = new Map(days.map((d) => [d.dayKey, d.pnl]));
  const maxAbs = Math.max(...days.map((d) => Math.abs(d.pnl)), 1);

  const colorFor = (p: number): string => {
    if (neutral) return "#3a3a3f";
    if (p > 0) return `rgba(34,197,94,${(0.25 + 0.6 * Math.min(1, p / maxAbs)).toFixed(3)})`;
    if (p < 0) return `rgba(239,68,68,${(0.25 + 0.6 * Math.min(1, Math.abs(p) / maxAbs)).toFixed(3)})`;
    return "#1a1a1d";
  };

  const fmt = (p: number) =>
    `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toLocaleString(locale, { maximumFractionDigits: 0 })}`;

  // offset Lun-first: getDay() è Dom=0 → sposta con modulo 7
  const pads = Array.from({ length: (firstDow + 6) % 7 }, (_, i) => <div key={`pad-${i}`} className="aspect-square" />);

  let idx = 0;
  const daysCells: React.ReactNode[] = [];
  for (let d = 1; d <= dim; d++) {
    const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const hasPnl = pnlMap.has(key);
    const pnl = hasPnl ? pnlMap.get(key)! : 0;
    const isToday = key === today;
    daysCells.push(
      <div
        key={key}
        title={hasPnl ? `${key}: ${fmt(pnl)} ${nativeCurrency}` : key}
        style={{
          backgroundColor: hasPnl ? colorFor(pnl) : isToday ? "#18181c" : "#141416",
          animationDelay: `${idx * 14}ms`,
        }}
        className={cn(
          "animate-rise flex aspect-square flex-col items-center justify-center gap-px rounded-md",
          isToday && "ring-1 ring-accent shadow-[0_0_14px_-3px_var(--accent-glow)]"
        )}
      >
        <span className={cn("text-[11px] font-medium leading-none", hasPnl ? "text-black/70" : "text-muted-foreground")}>
          {d}
        </span>
        {hasPnl &&
          (neutral ? (
            <span className="text-[11px] font-semibold leading-none text-black/40">••</span>
          ) : (
            <span className="text-[11px] font-semibold leading-none text-black/85">{fmt(pnl)}</span>
          ))}
      </div>
    );
    idx++;
  }

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-7 gap-1.5">
        {pads}
        {daysCells}
      </div>
    </div>
  );
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
  const shareOf = (n: number) => (days.length > 0 ? Math.round((n / days.length) * 100) : 0);
  const daysLabel = `${days.length} ${days.length === 1 ? "giorno di trading" : "giorni di trading"}`;

  if (accounts.length === 0) {
    return (
      <div className="space-y-6">
        <SectionHeader
          kicker="Trading · Calendario P&L"
          title="Calendario P&L"
          subtitle="P&L per trading day dell'account — il confine segue la sessione, non la mezzanotte."
        />
        <EmptyState
          icon={<Icon name="calendar" size={32} />}
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

  const totalValue = !account || money ? "•••" : (
    <AnimatedNumber
      value={summary.total}
      duration={900}
      className="tnum text-2xl font-semibold"
      fmt={(n) => formatSignedMoney(n, account.nativeCurrency, db.settings.locale)}
    />
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        kicker="Trading · Calendario P&L"
        title="Calendario P&L"
        subtitle="P&L per trading day dell'account — il confine segue la sessione, non la mezzanotte."
      />

      {/* Selezione account + navigazione mese */}
      <Reveal>
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
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
              aria-label="Mese precedente"
              title="Mese precedente"
            >
              ←
            </Button>
            <span className="min-w-[150px] text-center text-sm font-bold capitalize tracking-tight tnum">
              {monthLabel}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              aria-label="Mese successivo"
              title="Mese successivo"
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
      </Reveal>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Calendario */}
        <Reveal delay={40}>
          <Card hairline="accent" texture>
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
                icon={<Icon name="list" size={32} />}
                title="Nessun trade nel mese"
                description={`Nessun trade chiuso per ${account!.name} in ${monthLabel}.`}
              />
            ) : (
              <>
                <CalGrid
                  month={month}
                  days={days}
                  today={today}
                  locale={db.settings.locale}
                  nativeCurrency={account!.nativeCurrency}
                  neutral={calendarNeutral(db.settings.privacyMode)}
                />
                <div className="mt-3 flex items-center gap-4 border-t border-border pt-3 text-[11px] text-secondary-text">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: "rgba(34,197,94,0.55)" }} />
                    Positivo
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: "rgba(239,68,68,0.55)" }} />
                    Negativo
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm border border-border-strong bg-[#141416]" />
                    Nessun trade
                  </span>
                </div>
              </>
            )}
          </Card>
        </Reveal>

        {/* Colonna laterale: confine + riepilogo */}
        <div className="space-y-6">
          <Reveal delay={100}>
            <Card hairline="accent" texture>
              <CardHeader>
                <div>
                  <CardTitle>Confine trading day</CardTitle>
                  <CardSubtitle>
                    {account!.name} · il giorno di trading, non mezzanotte locale
                  </CardSubtitle>
                </div>
                <Badge tone="info" pulse>
                  Sessione
                </Badge>
              </CardHeader>
              <div className="space-y-2.5">
                <div className="flex items-center gap-3 rounded-xl border border-border bg-elevated p-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                    <GlobeIcon />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-secondary-text">Fuso</p>
                    <p className="truncate text-sm font-semibold tnum">{account!.tradingDayTimezone}</p>
                  </div>
                  <Badge tone="info">IANA</Badge>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-border bg-elevated p-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                    <ClockIcon />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-secondary-text">Rollover</p>
                    <p className="text-sm font-semibold tnum">{account!.tradingDayRolloverTime}</p>
                  </div>
                  <Badge tone="warning">fine sessione</Badge>
                </div>
                <p className="rounded-lg border border-border/60 bg-elevated/40 px-2.5 py-2 text-[11px] leading-relaxed text-secondary-text">
                  Il limite giornaliero si azzera al rollover della sessione (es. 17:00
                  America/Chicago per futures CME), non a mezzanotte.
                </p>
              </div>
            </Card>
          </Reveal>

          {/* Riepilogo mese — mini StatCard con AnimatedNumber */}
          <div className="space-y-3">
            <Reveal delay={140}>
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
                  <span className="h-1 w-1 rounded-full bg-accent" />
                  Riepilogo mese
                </p>
                <span className="tnum rounded-md bg-elevated px-2 py-0.5 text-[11px] font-semibold capitalize text-secondary-text">
                  {monthLabel}
                </span>
              </div>
            </Reveal>
            <Reveal delay={180}>
              <div className="grid grid-cols-3 gap-2.5">
                <StatCard
                  label="Positivi"
                  hairline="success"
                  value={
                    <AnimatedNumber
                      value={summary.pos}
                      duration={650}
                      className="tnum text-xl font-semibold text-success"
                      fmt={(n) => String(Math.round(n))}
                    />
                  }
                  delta={`${shareOf(summary.pos)}% giorni`}
                  deltaTone="positive"
                />
                <StatCard
                  label="Negativi"
                  hairline="danger"
                  value={
                    <AnimatedNumber
                      value={summary.neg}
                      duration={650}
                      className="tnum text-xl font-semibold text-danger"
                      fmt={(n) => String(Math.round(n))}
                    />
                  }
                  delta={`${shareOf(summary.neg)}% giorni`}
                  deltaTone="negative"
                />
                <StatCard
                  label="Zero"
                  hairline="none"
                  value={
                    <AnimatedNumber
                      value={summary.zero}
                      duration={650}
                      className="tnum text-xl font-semibold text-muted-foreground"
                      fmt={(n) => String(Math.round(n))}
                    />
                  }
                  delta={`${shareOf(summary.zero)}% giorni`}
                  deltaTone="neutral"
                />
              </div>
            </Reveal>
            <Reveal delay={220}>
              <StatCard
                label="P&L totale mese"
                hairline="accent"
                value={totalValue}
                delta={daysLabel}
                deltaTone={summary.total > 0 ? "positive" : summary.total < 0 ? "negative" : "neutral"}
              />
            </Reveal>
          </div>
        </div>
      </div>
    </div>
  );
}
