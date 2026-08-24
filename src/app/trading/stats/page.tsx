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

import { useMemo, useState } from "react";
import { useDB } from "@/lib/storage";
import type { DB, Trade } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Field, Select } from "@/components/ui/Field";
import { EmptyState, SectionHeader } from "@/components/ui/Misc";
import { LineChart, BarsChart } from "@/components/charts";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import {
  accountBaseRate,
  consecutiveWinsLosses,
  equityCurve,
  monthlyWinRate,
  rByMonth,
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
import { DisciplineCorrelationCard } from "@/components/trading/stats/DisciplineCorrelationCard";

type PeriodId = "month" | "3m" | "12m" | "all";

const PERIODS: { id: PeriodId; label: string }[] = [
  { id: "month", label: "Questo mese" },
  { id: "3m", label: "Ultimi 3 mesi" },
  { id: "12m", label: "Ultimi 12 mesi" },
  { id: "all", label: "Tutto" },
];

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"] as const;

const HOUR_BANDS = 12; // fasce da 2h: 00-02 … 22-24

/** Punto bucket temporale: P&L aggregato (+ N trade, vinte, somma R per WR/expectancy). */
type BucketPoint = { x: string; y: number; count: number; wins: number; sumR: number };

// Soglie per l'evidenziazione "edge negativo": campione significativo E win rate sotto soglia.
const EDGE_MIN_TRADES = 20;
const EDGE_MIN_WR = 45; // %

/** Formato label mesile degli helper (x = "yy-mm") → "mm/aa". */
function monthLabel(x: string): string {
  return `${x.slice(3, 5)}/${x.slice(0, 2)}`;
}

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

/** Win rate % di un bucket (null senza trade). */
function bucketWinRate(b: { count: number; wins: number }): number | null {
  return b.count > 0 ? (b.wins / b.count) * 100 : null;
}

/** True se il bucket ha un campione significativo con win rate sotto soglia ("edge negativo"). */
function isNegativeEdge(b: { count: number; wins: number }): boolean {
  const wr = bucketWinRate(b);
  return b.count >= EDGE_MIN_TRADES && wr != null && wr < EDGE_MIN_WR;
}

/**
 * Riga compatta di statistiche per bucket temporale: N trade · WR · avg R,
 * con badge "edge negativo" quando campione ≥ soglia e WR sotto soglia.
 */
function BucketStatsRow({ bucket, masked }: { bucket: BucketPoint; masked: boolean }) {
  const wr = bucketWinRate(bucket);
  const avgR = bucket.count > 0 ? bucket.sumR / bucket.count : 0;
  const edge = isNegativeEdge(bucket);
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg px-2.5 py-1.5 text-[11px]",
        edge ? "bg-danger/10" : "bg-elevated"
      )}
    >
      <span className="w-12 shrink-0 font-medium text-secondary-text">{bucket.x}</span>
      <span className="tnum text-foreground">
        <span className="text-muted-foreground">N </span>
        {bucket.count}
      </span>
      <span aria-hidden className="text-muted-foreground">
        ·
      </span>
      <span className={cn("tnum", edge ? "font-semibold text-danger" : "text-foreground")}>
        <span className="text-muted-foreground">WR </span>
        {wr != null ? formatPercent(wr, 0) : "—"}
      </span>
      <span aria-hidden className="text-muted-foreground">
        ·
      </span>
      <span
        className={cn(
          "tnum",
          masked
            ? "text-secondary-text"
            : avgR > 0
              ? "text-success"
              : avgR < 0
                ? "text-danger"
                : "text-foreground"
        )}
      >
        <span className="text-muted-foreground">avg R </span>
        {masked ? maskKpi() : formatR(avgR)}
      </span>
      {edge && (
        <span className="ml-auto rounded-md bg-danger/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-danger">
          edge negativo
        </span>
      )}
    </div>
  );
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

/**
 * Drawdown (valori ≤ 0) della curva equity cumulativa nella STESSA valuta
 * dell'equity: valuta nativa per account singolo, base per "tutti gli account".
 * Locale a questa pagina (non compute.drawdownSeries) perché l'aggregato
 * multi-account deve sommare P&L convertiti in base, mai valute miste.
 */
function drawdownSeriesIn(
  db: DB,
  trades: Trade[],
  allAccounts: boolean
): { date: string; value: number }[] {
  const sorted = [...trades].sort((a, b) => a.closeDate.localeCompare(b.closeDate));
  let cum = 0;
  let peak = 0;
  return sorted.map((t) => {
    cum += allAccounts ? basePnl(db, t) : t.resultNative;
    if (cum > peak) peak = cum;
    return { date: t.closeDate, value: Math.min(0, cum - peak) };
  });
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

/**
 * Linea di riferimento orizzontale per LineChart — replica la geometria
 * esatta del chart condiviso (viewBox 600×H, padT=12, padB=22) così la
 * linea (es. cut al 50% del win rate) si allinea al dominio reale.
 * Solo presentazionale; non tocca la libreria chart condivisa.
 */
function LineAt({
  data,
  height,
  value,
  label,
  hex = SUCCESS_HEX,
}: {
  data: { y: number }[];
  height: number;
  value: number;
  label: string;
  hex?: string;
}) {
  const padT = 12;
  const padB = 22;
  const ih = height - padT - padB;
  const ys = data.map((d) => d.y);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const v = Math.min(max, Math.max(min, value));
  const y = padT + ((max - v) / span) * ih;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-1" style={{ top: y, height: 1 }}>
      <div className="h-px w-full border-t border-dashed" style={{ borderColor: `${hex}55` }} />
      <span
        className="absolute -top-4 right-0 rounded bg-card px-1 text-[10px] font-medium"
        style={{ color: hex }}
      >
        {label}
      </span>
    </div>
  );
}

export default function TradingStatsPage() {
  const db = useDB();
  const [account, setAccount] = useState<string>("all");
  const [period, setPeriod] = useState<PeriodId>("month");

  // Account non archiviati per il filtro; se il selezionato viene
  // archiviato altrove, ripiega su "tutti".
  const openAccounts = db.accounts.filter((a) => !a.archived);
  const selectedId = openAccounts.some((a) => a.id === account) ? account : "all";
  const selAccount =
    selectedId !== "all" ? (db.accounts.find((a) => a.id === selectedId) ?? null) : null;

  const moneyCurrency = selAccount ? selAccount.nativeCurrency : db.settings.baseCurrency;
  const mode = db.settings.privacyMode;
  const moneyHidden = moneyMasked(mode); // sempre vero per il contratto privacy
  const kpiHidden = kpiMasked(mode); // solo "complete"

  // ---- Selettori pesanti: tutto il derivato dai trade FILTRATI è raggruppato in
  // un unico useMemo([db, selectedId, period]) così un re-render (es. toggle della
  // sidebar in AppShell) non ricalcola stats/curve/perf dalla fonte. I risultati
  // sono identici a prima: stesse funzioni pure, stessa sequenza. ----
  const {
    trades,
    st,
    totalPnl,
    streak,
    equityData,
    setupRows,
    weekdayData,
    hourData,
    rBarData,
    rTotal,
    rMonths,
    ddDates,
    maxDD,
    wrData,
    avgWR,
    winSpark,
    equityRow,
    setupWinMap,
  } = useMemo(() => {
    // (1) Filtri: periodo via day key (tz settings), poi account.
    const range = periodRange(db, period);
    const inPeriod = tradesBetween(db, range.start, range.end);
    const trades =
      selectedId === "all" ? inPeriod : inPeriod.filter((t) => t.accountId === selectedId);

    // (2)+(7) KPI + streak corrente.
    const st = tradingStats(trades);
    const streak = consecutiveWinsLosses(trades);

    // (2b) P&L totale in una valuta UNICA, coerente con la curva equity:
    // valuta nativa per account singolo, convertita in base per "tutti gli
    // account" (st.totalNative sommerebbe resultNative di valute diverse).
    const totalPnl =
      selectedId === "all"
        ? trades.reduce((s, t) => s + basePnl(db, t), 0)
        : st.totalNative;

    // (3) Curva equity: account singolo → valuta nativa; "tutti" → valuta base.
    const tz = db.settings.timezone;
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
    // Oltre alla somma P&L: N trade, vinte e somma R per WR/expectancy per bucket.
    const weekdayData: BucketPoint[] = WEEKDAY_LABELS.map((label, i) => {
      let sum = 0;
      let count = 0;
      let wins = 0;
      let sumR = 0;
      for (const t of trades) {
        const { y, m, d } = parseDateKey(isoToDayKey(t.closeDate, tz));
        const idx = (new Date(y, m - 1, d).getDay() + 6) % 7;
        if (idx === i) {
          sum += basePnl(db, t);
          count += 1;
          if (t.resultR > 0) wins += 1;
          sumR += t.resultR;
        }
      }
      return { x: label, y: sum, count, wins, sumR };
    });

    // (6) P&L per fascia oraria (ora di chiusura in tz, fasce da 2h) + N/WR/R per bucket.
    const hourData: BucketPoint[] = (() => {
      const acc = Array.from({ length: HOUR_BANDS }, () => ({ y: 0, count: 0, wins: 0, sumR: 0 }));
      for (const t of trades) {
        const band = Math.min(HOUR_BANDS - 1, Math.floor(hourInTZ(t.closeDate, tz) / 2));
        acc[band].y += basePnl(db, t);
        acc[band].count += 1;
        if (t.resultR > 0) acc[band].wins += 1;
        acc[band].sumR += t.resultR;
      }
      return acc
        .map((v, i) => ({
          ...v,
          x: `${String(i * 2).padStart(2, "0")}–${String(i * 2 + 2).padStart(2, "0")}`,
        }))
        .filter((r) => r.count > 0); // solo fasce con trade chiusi (visibili anche a P&L 0)
    })();

    // (8) R per mese — ultimi 12 mesi. Dati reali dagli helper: si mostrano
    // solo i mesi con chiusura corretta (count > 0), niente mesi a zero.
    const rMonths = rByMonth(db, 12).filter((m) => m.count > 0);
    const rBarData = rMonths.map((m) => ({ x: monthLabel(m.x), y: m.r }));
    const rTotal = rMonths.reduce((s, m) => s + m.r, 0); // segno per hairline

    // (9) Drawdown — dall'equity cumulativa dei trade FILTRATI (valori ≤ 0),
    // nella stessa valuta dell'equity (base se multi-account, mai valute miste).
    const ddDates = drawdownSeriesIn(db, trades, selectedId === "all").map((p) => ({
      x: shortDay(isoToDayKey(p.date, tz)),
      y: p.value,
    }));
    const maxDD = ddDates.length ? Math.min(...ddDates.map((p) => p.y)) : 0;

    // (10) Win rate mensile — ultimi 12 mesi, solo mesi con chiusura corretta.
    const wrMonths = monthlyWinRate(db, 12).filter((m) => m.count > 0);
    const wrData = wrMonths.map((m) => ({ x: monthLabel(m.x), y: m.winRate }));
    const wrTotalCount = wrMonths.reduce((s, m) => s + m.count, 0);
    const avgWR =
      wrTotalCount > 0
        ? wrMonths.reduce((s, m) => s + m.winRate * m.count, 0) / wrTotalCount
        : 0;

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

    return {
      trades,
      st,
      totalPnl,
      streak,
      equityData,
      setupRows,
      weekdayData,
      hourData,
      rBarData,
      rTotal,
      rMonths,
      ddDates,
      maxDD,
      wrData,
      avgWR,
      winSpark,
      equityRow,
      setupWinMap,
    };
  }, [db, selectedId, period]);

  // P&L totale in valuta unica (base se multi-account): determina tono/hairline/spark
  // della card. La somma arriva dal memo (totalPnl), mai st.totalNative qui sotto.
  const pnlTone = totalPnl > 0 ? "text-success" : totalPnl < 0 ? "text-danger" : "text-foreground";
  const pnlHairline = totalPnl > 0 ? "success" : totalPnl < 0 ? "danger" : "accent";
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
                      "flex-1 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap transition-[color,background-color,box-shadow]",
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
            icon={<Icon name="chart-line" size={32} />}
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
                icon={<Icon name="target" size={16} />}
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
                icon={<Icon name="chart-line" size={16} />}
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
                icon={<Icon name="scale" size={16} />}
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
                icon={<Icon name="activity" size={16} />}
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
                icon={<Icon name="list" size={16} />}
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
                icon={<Icon name="coins" size={16} />}
                value={
                  moneyHidden ? (
                    maskMoney()
                  ) : (
                    <AnimatedNumber
                      key={`pnl-${filterKey}`}
                      value={totalPnl}
                      fmt={(n) => formatSignedMoney(n, moneyCurrency)}
                    />
                  )
                }
                valueClassName={moneyHidden ? "text-secondary-text" : pnlTone}
                delta="curva equity sotto"
                deltaTone={tone(totalPnl)}
                spark={equityRow.slice(-14)}
                sparkColor={totalPnl >= 0 ? SUCCESS_HEX : DANGER_HEX}
              />
              <StatCard
                label="Streak corrente"
                hairline={streak.current === "win" ? "success" : streak.current === "loss" ? "danger" : "accent"}
                icon={<Icon name="flame" size={16} />}
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

          {/* Correlazione Disciplina → P&L (subito dopo le KPI) */}
          <Reveal delay={30}>
            <DisciplineCorrelationCard
              db={db}
              trades={trades}
              periodLabel={PERIODS.find((p) => p.id === period)?.label ?? "Questo mese"}
            />
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
                    <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-secondary-text">
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
                              <span className="tnum text-[11px] text-secondary-text">
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
                {/* N trade · WR · avg R per bucket (stessi trade del chart) */}
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {weekdayData.map((b) => (
                    <BucketStatsRow key={b.x} bucket={b} masked={kpiHidden} />
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-4 text-[11px] text-secondary-text">
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
                {/* N trade · WR · avg R per bucket (stessi trade del chart) */}
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {hourData.map((b) => (
                    <BucketStatsRow key={b.x} bucket={b} masked={kpiHidden} />
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-4 text-[11px] text-secondary-text">
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

          {/* Panoramica mensile: R per mese + Win rate mensile (dati reali, chiusure corrette) */}
          <div className="grid gap-4 md:grid-cols-2">
            <Reveal delay={160}>
              <Card
                hairline={rTotal > 0 ? "success" : rTotal < 0 ? "danger" : "accent"}
                texture
                className="relative"
              >
                <CardHeader>
                  <div>
                    <CardTitle>R per mese</CardTitle>
                    <CardSubtitle>
                      Ultimi 12 mesi · tutti gli account · solo mesi con chiusura corretta
                    </CardSubtitle>
                  </div>
                  <span
                    className={cn(
                      "tnum rounded-lg bg-elevated px-2 py-1 text-[11px]",
                      rTotal > 0 ? "text-success" : rTotal < 0 ? "text-danger" : "text-secondary-text"
                    )}
                  >
                    {kpiHidden ? maskKpi() : formatR(rTotal)}
                  </span>
                </CardHeader>
                <div className="relative">
                  <BarsChart
                    data={rBarData}
                    color={SUCCESS_HEX}
                    negativeColor={DANGER_HEX}
                    showValue={false}
                    height={CHART_H}
                  />
                  <ZeroBaseline data={rBarData} height={CHART_H} />
                </div>
                {/* dettaglio per mese: wins/count (dati del tooltip) */}
                <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {rMonths.map((m) => (
                    <div key={m.x} className="rounded-lg bg-elevated px-2.5 py-1.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] font-medium text-secondary-text">
                          {monthLabel(m.x)}
                        </span>
                        <span
                          className={cn(
                            "tnum text-[12px] font-semibold",
                            m.r > 0 ? "text-success" : m.r < 0 ? "text-danger" : "text-secondary-text"
                          )}
                        >
                          {kpiHidden ? maskKpi() : formatR(m.r)}
                        </span>
                      </div>
                      <div className="tnum text-[11px] text-secondary-text">
                        {m.wins} V · {m.count - m.wins} P · su {m.count}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </Reveal>

            <Reveal delay={200}>
              <Card hairline="success" texture>
                <CardHeader>
                  <div>
                    <CardTitle>Win rate mensile</CardTitle>
                    <CardSubtitle>
                      Ultimi 12 mesi · tutti gli account · solo mesi con chiusura corretta
                    </CardSubtitle>
                  </div>
                  <span
                    className={cn(
                      "tnum rounded-lg bg-elevated px-2 py-1 text-[11px] font-semibold",
                      avgWR >= 50 ? "text-success" : "text-danger"
                    )}
                  >
                    {kpiHidden ? maskKpi() : formatPercent(avgWR, 0)}
                  </span>
                </CardHeader>
                <div className="relative">
                  <LineChart
                    data={wrData}
                    color={SUCCESS_HEX}
                    height={CHART_H}
                    yFormatter={kpiHidden ? () => maskKpi() : (n) => formatPercent(n, 0)}
                  />
                  <LineAt data={wrData} height={CHART_H} value={50} label="50% breakeven" />
                </div>
              </Card>
            </Reveal>
          </div>

          {/* Drawdown — equity cumulativa sotto il picco (valori ≤ 0) */}
          <Reveal delay={240}>
            <Card hairline="danger" texture className="relative">
              <CardHeader>
                <div>
                  <CardTitle>Drawdown</CardTitle>
                  <CardSubtitle>
                    Equity cumulativa sotto il picco · trade filtrati · valori ≤ 0
                  </CardSubtitle>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    Max
                  </span>
                  <span
                    className={cn(
                      "tnum rounded-lg bg-elevated px-2 py-1 text-[11px] font-semibold",
                      maxDD < 0 ? "text-danger" : "text-secondary-text"
                    )}
                  >
                    {moneyHidden ? maskMoney() : formatSignedMoney(maxDD, moneyCurrency)}
                  </span>
                </div>
              </CardHeader>
              <LineChart
                data={ddDates}
                color={DANGER_HEX}
                height={CHART_H}
                yFormatter={moneyHidden ? () => maskMoney() : undefined}
              />
              <div className="mt-1 flex items-center gap-4 text-[11px] text-secondary-text">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-danger" /> drawdown (≤ 0)
                </span>
                <span className="tnum">{ddDates.length} chiusure</span>
              </div>
            </Card>
          </Reveal>
        </>
      )}
    </div>
  );
}
