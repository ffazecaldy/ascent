"use client";
// ============================================================
// ASCEND — Statistiche Trading (spec 4.3) · v2 rich+animated
// Stile myfundedbook: KPI row animata (count-up + spark + hairline
// per segno), curva equity con texture e gradiente, tabelle dense,
// barre accent con zero evidenziato, filtri compatti, reveal stagger.
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
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";
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

// Hex coerenti con i token CSS (--accent / --success / --danger)
// per sparkline e occlusioni inline: verdi/blu/rossi SOLO per P&L.
const ACCENT_HEX = "#4c7eff";
const SUCCESS_HEX = "#2ddf9e";
const DANGER_HEX = "#ff5c5c";

// Altezza condivisa per i BarsChart con zero evidenziato (vs ZeroBaseline).
const CHART_H = 190;

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

/**
 * Riga di evidenziazione dello zero per BarsChart — replica la
 * geometria del chart (viewBox 600×H, padT=14, padB=22) per
 * allinearsi alla linea di zero nativa e renderla più visibile.
 * Solo presentazionale; non tocca la libreria chart condivisa.
 */
function ZeroBaseline({ data, height }: { data: { y: number }[]; height: number }) {
  const padT = 14;
  const padB = 22;
  const ih = height - padT - padB;
  const ys = data.map((d) => d.y);
  const min = Math.min(0, ...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const y = padT + ((max - 0) / span) * ih;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-1" style={{ top: y, height: 1 }}>
      <div className="h-px w-full bg-gradient-to-r from-transparent via-border-strong to-transparent shadow-[0_0_6px_0_rgba(245,245,247,0.06)]" />
    </div>
  );
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

  // ---- Riepilogo derivato SOLO per la presentazione (non tocca i calcoli sopra) ----
  // Win rate per mese (spark della card "Win rate").
  const winSpark = (() => {
    const byMonth = new Map<string, { w: number; n: number }>();
    for (const t of trades) {
      const mk = monthKeyOf(isoToDayKey(t.closeDate, tz));
      const cur = byMonth.get(mk) ?? { w: 0, n: 0 };
      cur.n += 1;
      if (t.resultR > 0) cur.w += 1;
      byMonth.set(mk, cur);
    }
    return Array.from(byMonth.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v]) => (v.w / v.n) * 100);
  })();

  // Serie equity numerica (spark della card "P&L totale", ultimi N punti).
  const equityRow = equityData.map((p) => p.y);

  // Esiti per setup (solo per la tabella densa: N vinte / perse).
  const setupWinMap = (() => {
    const m = new Map<string, { wins: number; loses: number }>();
    for (const t of trades) {
      const id = t.setupId ?? "";
      const cur = m.get(id) ?? { wins: 0, loses: 0 };
      if (t.resultR > 0) cur.wins += 1;
      else if (t.resultR < 0) cur.loses += 1;
      m.set(id, cur);
    }
    return m;
  })();

  const totalNative = st.totalNative;
  const pnlTone = totalNative > 0 ? "text-success" : totalNative < 0 ? "text-danger" : "text-foreground";
  const pnlHairline = totalNative > 0 ? "success" : totalNative < 0 ? "danger" : "accent";
  const lastEquity = equityData.length ? equityData[equityData.length - 1].y : 0;
  const filterKey = `${selectedId}-${period}`;

  const tone = (v: number) => (v > 0 ? "positive" : v < 0 ? "negative" : "neutral");

  return (
    <div className="space-y-5">
      <SectionHeader
        kicker="Trading · Statistiche"
        title="Statistiche Trading"
        subtitle="Analisi del tuo trading per periodo, setup e temporizzazione."
      />

      {/* Filtri — barra compatta */}
      <Reveal>
        <Card className="p-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Account" className="min-w-44 flex-1">
              <Select
                value={selectedId}
                onChange={(e) => setAccount(e.target.value)}
                className="py-1.5 text-sm"
              >
                <option value="all">Tutti gli account</option>
                {openAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="flex flex-1 flex-col gap-1.5">
              <span className="text-xs font-medium text-secondary-text">Periodo</span>
              <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted p-0.5">
                {PERIODS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPeriod(p.id)}
                    className={cn(
                      "flex-1 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap transition-all",
                      period === p.id
                        ? "bg-accent text-white shadow-[0_0_14px_-2px_var(--accent-glow)]"
                        : "text-muted-foreground hover:text-secondary-text"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2 pb-1">
              <span className="tnum rounded-lg bg-elevated px-2 py-1 text-xs text-secondary-text">
                {formatNumber(st.count)} <span className="text-muted-foreground">trade</span>
              </span>
            </div>
          </div>
        </Card>
      </Reveal>

      {trades.length === 0 ? (
        <Reveal>
          <EmptyState
            icon="📈"
            title={db.trades.length === 0 ? "Nessun trade registrato" : "Nessun trade nel periodo"}
            description={
              db.trades.length === 0
                ? "Aggiungi i tuoi trade dal Trade log per vedere le statistiche."
                : "Cambia periodo o account per vedere i dati."
            }
          />
        </Reveal>
      ) : (
        <>
          {/* KPI row */}
          <Reveal>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              <StatCard
                label="Win rate"
                hairline="accent"
                icon={<span className="text-base leading-none">🎯</span>}
                value={
                  kpiHidden
                    ? maskKpi()
                    : st.winRate != null ? (
                        <AnimatedNumber
                          key={`wr-${filterKey}`}
                          value={st.winRate}
                          fmt={(n) => formatPercent(n)}
                        />
                      ) : (
                        "—"
                      )
                }
                delta={`${st.wins} V · ${st.losses} P`}
                deltaTone="neutral"
                spark={winSpark}
                sparkColor={ACCENT_HEX}
              />
              <StatCard
                label="R medio"
                hairline="accent"
                icon={<span className="text-base leading-none">📏</span>}
                value={
                  kpiHidden
                    ? maskKpi()
                    : st.avgR != null ? (
                        <AnimatedNumber
                          key={`r-${filterKey}`}
                          value={st.avgR}
                          fmt={(n) => formatR(n)}
                        />
                      ) : (
                        "—"
                      )
                }
                delta={kpiHidden ? maskKpi() : `${formatR(st.totalR)} totali`}
                deltaTone={tone(st.totalR)}
              />
              <StatCard
                label="Profit factor"
                hairline="accent"
                icon={<span className="text-base leading-none">⚖️</span>}
                value={
                  kpiHidden
                    ? maskKpi()
                    : st.profitFactor != null ? (
                        <AnimatedNumber
                          key={`pf-${filterKey}`}
                          value={st.profitFactor}
                          fmt={(n) => formatNumber(n)}
                        />
                      ) : (
                        "—"
                      )
                }
                delta="obiettivo ≥ 1"
                deltaTone="neutral"
              />
              <StatCard
                label="Expectancy (R)"
                hairline="accent"
                icon={<span className="text-base leading-none">🎲</span>}
                value={
                  kpiHidden
                    ? maskKpi()
                    : st.expectancyR != null ? (
                        <AnimatedNumber
                          key={`ex-${filterKey}`}
                          value={st.expectancyR}
                          fmt={(n) => formatR(n)}
                        />
                      ) : (
                        "—"
                      )
                }
                delta={`su ${st.count} ${st.count === 1 ? "trade" : "trade"}`}
                deltaTone="neutral"
              />
              <StatCard
                label="Trade totali"
                icon={<span className="text-base leading-none">🧾</span>}
                value={
                  <AnimatedNumber
                    key={`n-${filterKey}`}
                    value={st.count}
                    fmt={(n) => formatNumber(Math.round(n))}
                  />
                }
                delta={`${st.wins} V · ${st.losses} P`}
                deltaTone="neutral"
              />
              <StatCard
                label="P&L totale"
                hairline={pnlHairline}
                icon={<span className="text-base leading-none">💶</span>}
                value={
                  moneyHidden ? (
                    maskMoney()
                  ) : (
                    <AnimatedNumber
                      key={`pnl-${filterKey}`}
                      value={totalNative}
                      fmt={(n) => formatSignedMoney(n, moneyCurrency)}
                    />
                  )
                }
                valueClassName={moneyHidden ? "text-secondary-text" : pnlTone}
                delta="curva equity sotto"
                deltaTone={tone(totalNative)}
                spark={equityRow.slice(-14)}
                sparkColor={totalNative >= 0 ? SUCCESS_HEX : DANGER_HEX}
              />
              <StatCard
                label="Streak corrente"
                hairline={streak.current === "win" ? "success" : streak.current === "loss" ? "danger" : "accent"}
                icon={<span className="text-base leading-none">🔥</span>}
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
          </Reveal>

          {/* Curva equity */}
          <Reveal delay={60}>
            <Card hairline="accent" texture className="relative">
              <CardHeader>
                <div className="min-w-0">
                  <CardTitle>Curva equity</CardTitle>
                  <CardSubtitle>
                    {selAccount
                      ? `${selAccount.name} · ${selAccount.nativeCurrency}`
                      : `Tutti gli account · ${db.settings.baseCurrency} (base)`}
                  </CardSubtitle>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="tnum rounded-lg bg-elevated px-2 py-1 text-[11px] text-secondary-text">
                    <span className="text-muted-foreground">N </span>
                    {st.count}
                  </span>
                  <span
                    className={cn(
                      "tnum rounded-lg bg-elevated px-2 py-1 text-[11px]",
                      lastEquity > 0
                        ? "text-success"
                        : lastEquity < 0
                          ? "text-danger"
                          : "text-secondary-text"
                    )}
                  >
                    {moneyHidden ? maskMoney() : formatSignedMoney(lastEquity, moneyCurrency)}
                  </span>
                </div>
              </CardHeader>
              <LineChart
                data={equityData}
                color={ACCENT_HEX}
                height={CHART_H}
                yFormatter={moneyHidden ? () => maskMoney() : undefined}
              />
            </Card>
          </Reveal>

          {/* Performance per setup: bars + tabella densa */}
          <Reveal delay={100}>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Performance per setup</CardTitle>
                  <CardSubtitle>P&L in {db.settings.baseCurrency} · ordinati per risultato</CardSubtitle>
                </div>
              </CardHeader>
              <BarsChart
                data={setupRows.map((r) => ({ x: shortName(setupName(db, r.id)), y: r.pnl }))}
                showValue={!moneyHidden}
              />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      <th className="px-2 py-1 font-semibold">Setup</th>
                      <th className="px-2 py-1 text-right font-semibold">Trade</th>
                      <th className="px-2 py-1 text-right font-semibold">Win rate</th>
                      <th className="px-2 py-1 text-right font-semibold">P&L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {setupRows.map((r, i) => {
                      const wl = setupWinMap.get(r.id);
                      const wins = wl?.wins ?? 0;
                      const wr = r.count > 0 ? (wins / r.count) * 100 : null;
                      return (
                        <tr key={r.id || i} className="transition-colors hover:bg-elevated/40">
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-2">
                              <span className="tnum text-[10px] text-muted-foreground">
                                {String(i + 1).padStart(2, "0")}
                              </span>
                              <span className="max-w-40 truncate font-medium text-foreground">
                                {setupName(db, r.id)}
                              </span>
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-right tnum text-secondary-text">{r.count}</td>
                          <td className="px-2 py-1.5 text-right">
                            {wr != null && (
                              <div className="flex items-center justify-end gap-2">
                                <div className="h-1 w-14 overflow-hidden rounded-full bg-elevated">
                                  <div
                                    className={cn("h-full", wr >= 50 ? "bg-success" : "bg-danger")}
                                    style={{ width: `${wr}%` }}
                                  />
                                </div>
                                <span
                                  className={cn(
                                    "tnum",
                                    wr >= 50 ? "text-success" : wr < 50 ? "text-danger" : "text-secondary-text"
                                  )}
                                >
                                  {formatPercent(wr, 0)}
                                </span>
                              </div>
                            )}
                          </td>
                          <td
                            className={cn(
                              "px-2 py-1.5 text-right tnum",
                              r.pnl > 0 ? "text-success" : r.pnl < 0 ? "text-danger" : "text-secondary-text"
                            )}
                          >
                            {moneyHidden ? maskMoney() : formatSignedMoney(r.pnl, db.settings.baseCurrency)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </Reveal>

          {/* Temporizzazione: giorno della settimana + fascia oraria */}
          <div className="grid gap-4 md:grid-cols-2">
            <Reveal delay={120}>
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Per giorno della settimana</CardTitle>
                    <CardSubtitle>Chiusure · P&L in {db.settings.baseCurrency}</CardSubtitle>
                  </div>
                </CardHeader>
                <div className="relative">
                  <BarsChart data={weekdayData} showValue={!moneyHidden} height={CHART_H} />
                  <ZeroBaseline data={weekdayData} height={CHART_H} />
                </div>
                <div className="mt-2 flex items-center gap-4 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm bg-accent" /> profitto
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm bg-danger" /> perdita
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-px w-3 bg-border-strong" /> pareggio (0)
                  </span>
                </div>
              </Card>
            </Reveal>
            <Reveal delay={160}>
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Per fascia oraria</CardTitle>
                    <CardSubtitle>Ora di chiusura · P&L in {db.settings.baseCurrency}</CardSubtitle>
                  </div>
                </CardHeader>
                <div className="relative">
                  <BarsChart data={hourData} showValue={!moneyHidden} height={CHART_H} />
                  <ZeroBaseline data={hourData} height={CHART_H} />
                </div>
                <div className="mt-2 flex items-center gap-4 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm bg-accent" /> profitto
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm bg-danger" /> perdita
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-px w-3 bg-border-strong" /> pareggio (0)
                  </span>
                </div>
              </Card>
            </Reveal>
          </div>
        </>
      )}
    </div>
  );
}
