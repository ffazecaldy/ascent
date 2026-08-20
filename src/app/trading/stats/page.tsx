"use client";
// ============================================================
// ASCEND — Statistiche Trading (spec 4.3)
// Filtri account/periodo + KPI + curva equity + performance
// per setup e per temporizzazione (giorno della settimana, ora
// di chiusura). Tutto derivato a runtime da useDB(); nessuna
// scrittura sul DB, nessun dato persistito dalla pagina.
// ============================================================

import { useState } from "react";
import { useDB } from "@/lib/storage";
import type { DB, Trade } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Field, Select } from "@/components/ui/Field";
import { EmptyState, SectionHeader } from "@/components/ui/Misc";
import { LineChart, BarsChart } from "@/components/charts";
import {
  accountBaseRate,
  consecutiveWinsLosses,
  equityCurve,
  tradingStats,
  tradesBetween,
} from "@/lib/compute";
import {
  addDaysKey,
  isoToDayKey,
  monthKeyOf,
  monthRange,
  parseDateKey,
  todayKey,
} from "@/lib/dates";
import { formatNumber, formatPercent, formatR, formatSignedMoney } from "@/lib/format";
import { setupName } from "@/lib/db";
import { kpiMasked, maskKpi, maskMoney, moneyMasked } from "@/lib/privacy";

type PeriodId = "month" | "3m" | "12m" | "all";

const PERIODS: { id: PeriodId; label: string }[] = [
  { id: "month", label: "Questo mese" },
  { id: "3m", label: "Ultimi 3 mesi" },
  { id: "12m", label: "Ultimi 12 mesi" },
  { id: "all", label: "Tutto" },
];

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"] as const;

const HOUR_BANDS = 12; // fasce da 2h: 00-02 … 22-24

/** "2026-08-20" → "20/08" */
function shortDay(key: string): string {
  const { d, m } = parseDateKey(key);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** Ora di chiusura (0-23) nella timezone utente. */
function hourInTZ(iso: string, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hour12: false });
  let h = Number(fmt.format(new Date(iso)));
  if (h === 24) h = 0; // mezzanotte resa come "24" da alcuni engine
  return h;
}

/** Range di day key per il periodo selezionato. */
function periodRange(db: DB, period: PeriodId): { start: string; end: string } {
  const today = todayKey(db.settings.timezone);
  switch (period) {
    case "month":
      return monthRange(monthKeyOf(today));
    case "3m":
      return { start: addDaysKey(today, -90), end: today };
    case "12m":
      return { start: addDaysKey(today, -365), end: today };
    case "all":
    default:
      return { start: "0000-01-01", end: "9999-12-31" };
  }
}

/** Tasso nativo→base per l'account del trade (1 se account mancante). */
function baseRateOf(db: DB, t: Trade): number {
  const acc = db.accounts.find((a) => a.id === t.accountId);
  return acc ? accountBaseRate(acc, db.settings.baseCurrency) : 1;
}

/** P&L del trade convertito in valuta base. */
function basePnl(db: DB, t: Trade): number {
  return t.resultNative * baseRateOf(db, t);
}

/** Nome troncato per le etichette dei grafici. */
function shortName(name: string, max = 11): string {
  return name.length > max ? name.slice(0, max) + "…" : name;
}

export default function TradingStatsPage() {
  const db = useDB();
  const [account, setAccount] = useState<string>("all");
  const [period, setPeriod] = useState<PeriodId>("month");
  const tz = db.settings.timezone;

  // Account non archiviati per il filtro; se il selezionato viene
  // archiviato altrove, ripiega su "tutti".
  const openAccounts = db.accounts.filter((a) => !a.archived);
  const selectedId = openAccounts.some((a) => a.id === account) ? account : "all";
  const selAccount =
    selectedId !== "all" ? (db.accounts.find((a) => a.id === selectedId) ?? null) : null;

  // (1) Filtri: periodo via day key (tz settings), poi account.
  const range = periodRange(db, period);
  const inPeriod = tradesBetween(db, range.start, range.end);
  const trades = selectedId === "all" ? inPeriod : inPeriod.filter((t) => t.accountId === selectedId);

  const moneyCurrency = selAccount ? selAccount.nativeCurrency : db.settings.baseCurrency;
  const mode = db.settings.privacyMode;
  const moneyHidden = moneyMasked(mode); // sempre vero per il contratto privacy
  const kpiHidden = kpiMasked(mode); // solo "complete"

  // (2)+(7) KPI + streak corrente.
  const st = tradingStats(trades);
  const streak = consecutiveWinsLosses(trades);

  // (3) Curva equity: account singolo → valuta nativa; "tutti" → valuta base.
  const equityData = (() => {
    if (trades.length === 0) return [] as { x: string; y: number }[];
    const points: { date: string; value: number }[] =
      selectedId === "all"
        ? (() => {
            const sorted = [...trades].sort((a, b) => a.closeDate.localeCompare(b.closeDate));
            let cum = 0;
            return sorted.map((t) => ({ date: t.closeDate, value: (cum += basePnl(db, t)) }));
          })()
        : equityCurve(trades); // cumulata in resultNative (valuta nativa dell'account)
    return points.map((p) => ({ x: shortDay(isoToDayKey(p.date, tz)), y: p.value }));
  })();

  // (4) Performance per setup: somma resultNative convertita in base.
  const setupRows = (() => {
    const map = new Map<string, { count: number; pnl: number }>();
    for (const t of trades) {
      const id = t.setupId ?? "";
      const cur = map.get(id) ?? { count: 0, pnl: 0 };
      cur.count += 1;
      cur.pnl += basePnl(db, t);
      map.set(id, cur);
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, count: v.count, pnl: v.pnl }))
      .sort((a, b) => b.pnl - a.pnl);
  })();

  // (5) P&L per giorno della settimana: 0=Lun … 6=Dom via giorno di chiusura in tz.
  const weekdayData = WEEKDAY_LABELS.map((label, i) => {
    let sum = 0;
    for (const t of trades) {
      const { y, m, d } = parseDateKey(isoToDayKey(t.closeDate, tz));
      const idx = (new Date(y, m - 1, d).getDay() + 6) % 7;
      if (idx === i) sum += basePnl(db, t);
    }
    return { x: label, y: sum };
  });

  // (6) P&L per fascia oraria (ora di chiusura in tz, fasce da 2h).
  const hourData = (() => {
    const sums = Array.from({ length: HOUR_BANDS }, () => 0);
    for (const t of trades) {
      const band = Math.min(HOUR_BANDS - 1, Math.floor(hourInTZ(t.closeDate, tz) / 2));
      sums[band] += basePnl(db, t);
    }
    return sums
      .map((y, i) => ({
        y,
        x: `${String(i * 2).padStart(2, "0")}–${String(i * 2 + 2).padStart(2, "0")}`,
      }))
      .filter((r) => r.y !== 0); // solo fasce con attività
  })();

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Statistiche Trading"
        subtitle="Analisi del tuo trading per periodo, setup e temporizzazione."
      />

      {/* Filtri */}
      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Account" className="min-w-52 flex-1">
            <Select value={selectedId} onChange={(e) => setAccount(e.target.value)}>
              <option value="all">Tutti gli account</option>
              {openAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Periodo" className="min-w-44 flex-1">
            <Select value={period} onChange={(e) => setPeriod(e.target.value as PeriodId)}>
              {PERIODS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      {trades.length === 0 ? (
        <EmptyState
          icon="📈"
          title={db.trades.length === 0 ? "Nessun trade registrato" : "Nessun trade nel periodo"}
          description={
            db.trades.length === 0
              ? "Aggiungi i tuoi trade dal Trade log per vedere le statistiche."
              : "Cambia periodo o account per vedere i dati."
          }
        />
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            <StatCard
              label="Win rate"
              value={kpiHidden ? maskKpi() : st.winRate != null ? formatPercent(st.winRate) : "—"}
            />
            <StatCard
              label="R medio"
              value={kpiHidden ? maskKpi() : st.avgR != null ? formatR(st.avgR) : "—"}
            />
            <StatCard
              label="Profit factor"
              value={kpiHidden ? maskKpi() : st.profitFactor != null ? formatNumber(st.profitFactor) : "—"}
            />
            <StatCard
              label="Expectancy (R)"
              value={kpiHidden ? maskKpi() : st.expectancyR != null ? formatR(st.expectancyR) : "—"}
            />
            <StatCard label="Trade totali" value={formatNumber(st.count)} />
            <StatCard
              label="P&L totale"
              value={moneyHidden ? maskMoney() : formatSignedMoney(st.totalNative, moneyCurrency)}
              valueClassName={
                st.totalNative > 0 ? "text-success" : st.totalNative < 0 ? "text-danger" : undefined
              }
            />
            <StatCard
              label="Streak corrente"
              value={
                streak.current === "win"
                  ? `${streak.wins} V`
                  : streak.current === "loss"
                    ? `${streak.losses} P`
                    : "—"
              }
              valueClassName={
                streak.current === "win"
                  ? "text-success"
                  : streak.current === "loss"
                    ? "text-danger"
                    : undefined
              }
              delta={
                streak.current === "win"
                  ? "vittorie consecutive"
                  : streak.current === "loss"
                    ? "sconfitte consecutive"
                    : "nessuna serie"
              }
              deltaTone={
                streak.current === "win" ? "positive" : streak.current === "loss" ? "negative" : "neutral"
              }
            />
          </div>

          {/* Curva equity */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Curva equity</CardTitle>
                <CardSubtitle>
                  {selAccount
                    ? `${selAccount.name} · ${selAccount.nativeCurrency}`
                    : `Tutti gli account · ${db.settings.baseCurrency} (base)`}
                </CardSubtitle>
              </div>
            </CardHeader>
            <LineChart data={equityData} yFormatter={moneyHidden ? () => maskMoney() : undefined} />
          </Card>

          {/* Performance per setup */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Performance per setup</CardTitle>
                <CardSubtitle>P&L in {db.settings.baseCurrency}</CardSubtitle>
              </div>
            </CardHeader>
            <BarsChart
              data={setupRows.map((r) => ({ x: shortName(setupName(db, r.id)), y: r.pnl }))}
              showValue={!moneyHidden}
            />
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="pb-1.5 font-medium">Setup</th>
                  <th className="pb-1.5 text-right font-medium">N</th>
                  <th className="pb-1.5 text-right font-medium">P&L</th>
                </tr>
              </thead>
              <tbody>
                {setupRows.map((r, i) => (
                  <tr key={r.id || i} className="border-t border-border">
                    <td className="py-1.5 pr-2">{setupName(db, r.id)}</td>
                    <td className="py-1.5 pr-2 text-right tnum text-secondary-text">{r.count}</td>
                    <td
                      className={`py-1.5 text-right tnum ${
                        r.pnl > 0 ? "text-success" : r.pnl < 0 ? "text-danger" : "text-secondary-text"
                      }`}
                    >
                      {moneyHidden ? maskMoney() : formatSignedMoney(r.pnl, db.settings.baseCurrency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Temporizzazione: giorno della settimana + fascia oraria */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Per giorno della settimana</CardTitle>
                  <CardSubtitle>Chiusure · P&L in {db.settings.baseCurrency}</CardSubtitle>
                </div>
              </CardHeader>
              <BarsChart data={weekdayData} showValue={!moneyHidden} />
            </Card>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Per fascia oraria</CardTitle>
                  <CardSubtitle>Ora di chiusura · P&L in {db.settings.baseCurrency}</CardSubtitle>
                </div>
              </CardHeader>
              <BarsChart data={hourData} showValue={!moneyHidden} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
