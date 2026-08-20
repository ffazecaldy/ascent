"use client";

// ============================================================
// ASCEND — Risk Dashboard (spec 4.3)
// Per account, in tempo reale, in valuta NATIVA.
// Art direction ricca (stile myfundedbook): card animate, count-up,
// progress bar vs limiti, live clock sull'account, streak pulsante.
// NESSUN cambiamento di logica: solo presentazione.
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { useDB } from "@/lib/storage";
import { riskStats } from "@/lib/compute";
import { formatMoney, formatSignedMoney, formatR } from "@/lib/format";
import { labelDayKey, tradingDayKey } from "@/lib/dates";
import { maskMoney, maskKpi } from "@/lib/privacy";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, ProgressBar, SectionHeader } from "@/components/ui/Misc";
import { Field, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Reveal } from "@/components/ui/Reveal";

// Soglie di avviso (frazione del valore assoluto del limite):
// - card "Distanza dal limite": < 20% → stato di avviso
// - banner in testa:           < 15% → allerta friendly
const WARN_DIST_PCT = 0.2;
const TOP_WARN_PCT = 0.15;

type DistTone = "na" | "danger" | "warn" | "ok";

/** Tono di una distanza dal limite: rosso se superata, giallo se <20%, verde altrimenti. */
function distanceTone(
  distance: number | null | undefined,
  limit: number | null | undefined
): DistTone {
  if (distance == null || limit == null) return "na";
  const absL = Math.abs(limit);
  if (absL <= 0) return "ok"; // limite assente/non valutabile → neutro-verde
  if (distance <= 0) return "danger";
  if (distance < WARN_DIST_PCT * absL) return "warn";
  return "ok";
}

const distToneCls: Record<DistTone, string> = {
  na: "text-muted-foreground",
  danger: "text-danger",
  warn: "text-warning",
  ok: "text-success",
};

/** Tono della barra di progresso per una distanza (allineato allo stato colore). */
const distBarTone: Record<DistTone, "accent" | "success" | "danger" | "warning"> = {
  na: "accent",
  danger: "danger",
  warn: "warning",
  ok: "success",
};

/** Percentuale locale (o mascherata in complete). */
function pctStr(n: number, masked: boolean): string {
  if (masked) return maskKpi();
  return n.toLocaleString("it-IT", { maximumFractionDigits: 0 }) + "%";
}

/** Micro-metrico per la card del confine: etichetta piccola sopra, valore sotto. */
function MetaStat({ tag, value }: { tag: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{tag}</p>
      <p className="mt-0.5 text-sm font-medium tnum text-foreground">{value}</p>
    </div>
  );
}

/** Orologio live nel fuso dell'account (aggiornato ogni secondo, monta dopo l'idratazione). */
function AccountClock({ tz }: { tz: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!now) return <span className="tnum text-muted-foreground">—</span>;
  let t: string;
  try {
    t = now.toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: tz || undefined,
    });
  } catch {
    t = "—";
  }
  return (
    <span className="tnum text-foreground">
      {t}
      <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse-dot rounded-full bg-success align-middle" />
    </span>
  );
}

/** Card metrica con barra di progresso opzionale (rischio cumulativo + distanze dai limiti). */
function BarMetricCard({
  label,
  icon,
  value,
  valueClassName,
  pct,
  tone = "accent",
  delta,
}: {
  label: string;
  icon?: React.ReactNode;
  value: React.ReactNode;
  valueClassName?: string;
  /** percentuale 0..100 da mostrare come barra; null = nessuna barra */
  pct: { value: number; label?: string } | null;
  tone?: "accent" | "success" | "danger" | "warning";
  delta?: React.ReactNode;
}) {
  const clamped = pct ? Math.min(100, Math.max(0, pct.value)) : null;
  return (
    <Card className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
        {icon}
      </div>
      <div className={cn("text-[26px] font-semibold leading-none tracking-tight tnum", valueClassName)}>{value}</div>
      <div className="flex items-center gap-2 pt-0.5">
        {clamped != null ? (
          <>
            <ProgressBar value={clamped} max={100} tone={tone} className="h-1.5" shimmer={clamped > 4} />
            {pct?.label && (
              <span className="tnum w-12 shrink-0 text-right text-[11px] text-secondary-text">{pct.label}</span>
            )}
          </>
        ) : (
          <span className="h-1.5 flex-1" />
        )}
      </div>
      <div className="flex items-end justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{delta}</span>
      </div>
    </Card>
  );
}

const UpTrend = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 17l6-6 4 4 8-8" />
    <path d="M14 7h7v7" />
  </svg>
);

const DownTrend = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 7l6 6 4-4 8 8" />
    <path d="M14 17h7v-7" />
  </svg>
);

export default function RiskPage() {
  const db = useDB();
  const accounts = db.accounts;
  const [selectedId, setSelectedId] = useState<string>(() => accounts[0]?.id ?? "");

  return (
    <div className="space-y-6">
      <SectionHeader
        kicker="Trading · Risk"
        title="Risk Dashboard"
        subtitle="Drawdown, rischio per trade e distanza dai loss limit — per account, in valuta nativa."
        action={
          accounts.length > 0 ? (
            <Field label="Account" className="w-full sm:w-64">
              <Select
                value={accounts.some((a) => a.id === selectedId) ? selectedId : accounts[0].id}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.archived ? " (archiviato)" : ""} — {a.nativeCurrency}
                  </option>
                ))}
              </Select>
            </Field>
          ) : undefined
        }
      />

      {accounts.length === 0 ? (
        <EmptyState
          icon="🏦"
          title="Nessun account"
          description="Crea un account di trading per vedere drawdown, rischio e distanza dai limiti."
          action={
            <Link href="/trading/accounts">
              <Button variant="outline" size="sm">Crea account</Button>
            </Link>
          }
        />
      ) : (
        <RiskBody
          accountId={accounts.some((a) => a.id === selectedId) ? selectedId : accounts[0].id}
        />
      )}
    </div>
  );
}

function RiskBody({ accountId }: { accountId: string }) {
  const db = useDB();
  const account = db.accounts.find((a) => a.id === accountId)!;
  const stats = riskStats(db, account);

  const masked = db.settings.privacyMode === "complete";
  const cur = stats.nativeCurrency;
  const fmt = (n: number) => (masked ? maskMoney() : formatMoney(n, cur));
  const signedFmt = (n: number) => (masked ? maskMoney() : formatSignedMoney(n, cur));

  const accountTrades = db.trades.filter((t) => t.accountId === account.id);
  const losingCount = accountTrades.filter((t) => t.resultNative < 0).length;
  const tradingDayNow = tradingDayKey(new Date().toISOString(), account);

  const dl = account.dailyLossLimit ?? null;
  const ml = account.maxLossLimit ?? null;

  // ---- Allerta in testa: almeno un limite è vicino (< 15% del limite) ----
  const near: { label: string; distance: number; limit: number }[] = [];
  if (stats.distanceDailyLimit != null && dl != null && Math.abs(dl) > 0) {
    if (stats.distanceDailyLimit < TOP_WARN_PCT * Math.abs(dl))
      near.push({ label: "Daily loss limit", distance: stats.distanceDailyLimit, limit: Math.abs(dl) });
  }
  if (stats.distanceMaxLimit != null && ml != null && Math.abs(ml) > 0) {
    if (stats.distanceMaxLimit < TOP_WARN_PCT * Math.abs(ml))
      near.push({ label: "Max loss limit", distance: stats.distanceMaxLimit, limit: Math.abs(ml) });
  }

  // ---- Streak corrente ----
  const { wins, losses, current } = stats.consecutive;
  const sortedTrades = [...accountTrades].sort((a, b) => a.closeDate.localeCompare(b.closeDate));
  const lastTrade = sortedTrades[sortedTrades.length - 1];

  // ---- Nessun trade → empty state (con select account ancora attivo sopra) ----
  if (accountTrades.length === 0 || !stats.bestDay || !stats.worstDay) {
    return (
      <EmptyState
        icon="🕹"
        title="Nessun trade per questo account"
        description="Registra qualche trade nel Trade log per popolare drawdown, rischio medio e distanza dai limiti."
        action={
          <Link href="/trading/trades">
            <Button variant="outline" size="sm">Vai al Trade log</Button>
          </Link>
        }
      />
    );
  }

  const ddTone = distanceTone(stats.distanceDailyLimit, dl);
  const mdTone = distanceTone(stats.distanceMaxLimit, ml);

  const limitDelta = (distance: number | null | undefined, limit: number | null | undefined) => {
    if (limit == null || distance == null) return "nessun limite impostato";
    if (distance <= 0) return "limite raggiunto o superato";
    return `${pctStr(Math.round((distance / Math.abs(limit)) * 100), masked)} del margine rimasto`;
  };

  const cumTodayDelta =
    dl != null && Math.abs(dl) > 0
      ? `${pctStr(Math.round((stats.cumulativeRiskToday / Math.abs(dl)) * 100), masked)} del limite giornaliero`
      : `trading day ${labelDayKey(tradingDayNow)}`;

  // Barra rischio cumulativo vs limite (consumo): tono per gravità, valore colorato.
  const cumPct = dl != null && Math.abs(dl) > 0 ? (stats.cumulativeRiskToday / Math.abs(dl)) * 100 : null;
  const cumTone: "accent" | "success" | "danger" | "warning" =
    cumPct == null ? "accent" : cumPct >= 90 ? "danger" : cumPct >= 60 ? "warning" : "accent";
  const cumValueCls =
    cumPct == null ? "" : cumPct >= 90 ? "text-danger" : cumPct >= 60 ? "text-warning" : "text-foreground";

  // Barre mini-progress delle distanze (margine residuo come % del limite).
  const ddPct =
    dl != null && Math.abs(dl) > 0 && stats.distanceDailyLimit != null
      ? (stats.distanceDailyLimit / Math.abs(dl)) * 100
      : null;
  const mdPct =
    ml != null && Math.abs(ml) > 0 && stats.distanceMaxLimit != null
      ? (stats.distanceMaxLimit / Math.abs(ml)) * 100
      : null;

  const tz = account.tradingDayTimezone || db.settings.timezone;

  return (
    <>
      {/* Animazioni custom locali (banner warning + pulse rosso streak) */}
      <style>{`
        .warn-float { animation: warnFloat 2.6s ease-in-out infinite; }
        @keyframes warnFloat {
          0%, 100% { box-shadow: 0 0 0 0 rgba(240, 180, 41, 0); }
          50% { box-shadow: 0 0 30px 6px rgba(240, 180, 41, 0.16); }
        }
        .pulse-red { animation: pulseRed 1.8s ease-out infinite; }
        @keyframes pulseRed {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255, 92, 92, 0.45); }
          70% { box-shadow: 0 0 0 9px rgba(255, 92, 92, 0); }
        }
      `}</style>

      {/* Confine del trading day — timezone & rollover nei badge */}
      <Reveal delay={0}>
        <Card hairline="accent" texture>
          <CardHeader>
            <CardTitle>🕐 Confine del trading day</CardTitle>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <Badge tone="info">📍 {tz || "—"}</Badge>
              <Badge tone="info">🔄 rollover {account.tradingDayRolloverTime || "00:00"}</Badge>
              <Badge
                tone={near.length > 0 ? "warning" : "success"}
                pulse={near.length > 0}
              >
                {near.length > 0 ? "⚠ limite vicino" : "limiti ok"}
              </Badge>
            </div>
          </CardHeader>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetaStat tag="Trading day corrente" value={labelDayKey(tradingDayNow)} />
            <MetaStat tag="Ora account" value={<AccountClock tz={tz} />} />
            <MetaStat
              tag="Ultimo trade"
              value={
                lastTrade
                  ? `${formatR(lastTrade.resultR)} · ${labelDayKey(tradingDayKey(lastTrade.closeDate, account))}`
                  : "nessun trade chiuso"
              }
            />
            <MetaStat
              tag="Limiti"
              value={
                <span className="tnum">
                  daily {dl != null ? fmt(dl) : "—"} · max {ml != null ? fmt(ml) : "—"}
                </span>
              }
            />
          </div>
          <CardSubtitle>
            Il trading day inizia/finisce al rollover ({account.tradingDayRolloverTime || "00:00"}) nel fuso
            dell'account; ogni trade è assegnato al giorno in base alla propria data di chiusura.
          </CardSubtitle>
        </Card>
      </Reveal>

      {/* Avviso friendly se un limite è vicino (banner warning animato) */}
      {near.length > 0 && (
        <Reveal delay={60}>
          <Card className="warn-float relative overflow-hidden border-warning/40 bg-warning/5">
            <div className="shimmer pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-warning to-transparent" />
            <div className="flex items-start gap-3">
              <span className="relative mt-1 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-70" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-warning" />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-semibold text-warning">Attenzione: un loss limit è quasi raggiunto.</p>
                {near.map((n) => {
                  const body =
                    n.distance <= 0
                      ? `${n.label} raggiunto o superato: il drawdown ha già consumato il limite di ${fmt(n.limit)}.`
                      : `${n.label} vicino: margine residuo ${fmt(n.distance)} su ${fmt(n.limit)} (${pctStr(Math.round((Math.abs(n.distance) / n.limit) * 100), masked)}).`;
                  return (
                    <p key={n.label} className="text-sm text-warning/90">
                      {body}
                    </p>
                  );
                })}
              </div>
              <span className="text-xl leading-none">⚠️</span>
            </div>
          </Card>
        </Reveal>
      )}

      {/* Griglia metriche */}
      <Reveal delay={90}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Daily drawdown"
            hairline="danger"
            value={<AnimatedNumber value={stats.dailyDrawdown} fmt={(n) => fmt(n)} className="text-danger" />}
            delta="peggior giorno chiuso"
            icon={<span className="text-base leading-none">📉</span>}
          />
          <StatCard
            label="Max drawdown"
            hairline="danger"
            value={<AnimatedNumber value={stats.maxDrawdown} fmt={(n) => fmt(n)} className="text-danger" />}
            delta="equity cumulativa, da picco"
            icon={<span className="text-base leading-none">💧</span>}
          />
          <StatCard
            label="Rischio medio per trade"
            value={<AnimatedNumber value={stats.avgRiskPerTrade} fmt={(n) => fmt(n)} />}
            delta={losingCount > 0 ? `${losingCount} trade in perdita` : "nessuna perdita registrata"}
            icon={<span className="text-base leading-none">🎯</span>}
          />
          <BarMetricCard
            label="Rischio cumulativo oggi"
            icon={<span className="text-base leading-none">⏳</span>}
            value={
              <AnimatedNumber
                value={stats.cumulativeRiskToday}
                fmt={(n) => fmt(n)}
                className={cumValueCls}
              />
            }
            valueClassName={cumValueCls}
            pct={
              cumPct != null
                ? { value: cumPct, label: `${Math.round(Math.min(100, cumPct))}%` }
                : null
            }
            tone={cumTone}
            delta={cumTodayDelta}
          />
          <BarMetricCard
            label="Distanza dal daily loss limit"
            icon={<span className="text-base leading-none">🛡️</span>}
            value={
              stats.distanceDailyLimit == null ? (
                "—"
              ) : (
                <AnimatedNumber value={stats.distanceDailyLimit} fmt={(n) => fmt(n)} className={distToneCls[ddTone]} />
              )
            }
            valueClassName={distToneCls[ddTone]}
            pct={ddPct != null ? { value: ddPct, label: `${Math.round(Math.max(0, Math.min(100, ddPct)))}%` } : null}
            tone={distBarTone[ddTone]}
            delta={limitDelta(stats.distanceDailyLimit, dl)}
          />
          <BarMetricCard
            label="Distanza dal max loss limit"
            icon={<span className="text-base leading-none">🧱</span>}
            value={
              stats.distanceMaxLimit == null ? (
                "—"
              ) : (
                <AnimatedNumber value={stats.distanceMaxLimit} fmt={(n) => fmt(n)} className={distToneCls[mdTone]} />
              )
            }
            valueClassName={distToneCls[mdTone]}
            pct={mdPct != null ? { value: mdPct, label: `${Math.round(Math.max(0, Math.min(100, mdPct)))}%` } : null}
            tone={distBarTone[mdTone]}
            delta={limitDelta(stats.distanceMaxLimit, ml)}
          />
        </div>
      </Reveal>

      {/* Miglior / peggior giornata (box con trend) + streak corrente */}
      <Reveal delay={180}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card hairline="success" texture className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-success/90">
                Miglior giornata
              </span>
              <span className="animate-rise inline-flex h-6 w-6 items-center justify-center rounded-full bg-success/15 text-success">
                <UpTrend className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="text-[26px] font-semibold leading-none tracking-tight tnum text-success">
              <AnimatedNumber value={stats.bestDay.pnl} fmt={(n) => signedFmt(n)} />
            </div>
            <div className="mt-auto flex items-center gap-1.5 text-xs">
              <span className="text-success">▲</span>
              <span className="text-muted-foreground">{labelDayKey(stats.bestDay.dayKey)} · picco assoluto</span>
            </div>
          </Card>

          <Card hairline="danger" texture className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-danger/90">
                Peggior giornata
              </span>
              <span className="animate-rise inline-flex h-6 w-6 items-center justify-center rounded-full bg-danger/15 text-danger">
                <DownTrend className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="text-[26px] font-semibold leading-none tracking-tight tnum text-danger">
              <AnimatedNumber value={stats.worstDay.pnl} fmt={(n) => signedFmt(n)} />
            </div>
            <div className="mt-auto flex items-center gap-1.5 text-xs">
              <span className="text-danger">▼</span>
              <span className="text-muted-foreground">{labelDayKey(stats.worstDay.dayKey)} · fondo assoluto</span>
            </div>
          </Card>

          <Card className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Streak corrente
              </span>
              <Badge
                tone={current === "win" ? "success" : current === "loss" ? "danger" : "default"}
                pulse={current != null}
              >
                {current === "win" ? "🔥 win streak" : current === "loss" ? "⚠ loss streak" : "inattiva"}
              </Badge>
            </div>
            <div
              className={cn(
                "text-[22px] font-semibold leading-tight tracking-tight tnum",
                current === "win" && "animate-pulse-dot text-success",
                current === "loss" && "pulse-red text-danger",
                current === null && "text-muted-foreground"
              )}
            >
              {current === "win" ? `🔥 ${wins} win` : current === "loss" ? `⚠ ${losses} loss` : "Nessuna streak in corso"}
            </div>
            <div className="mt-auto text-xs tnum text-secondary-text">
              {lastTrade
                ? `ultimo trade: ${formatR(lastTrade.resultR)} · ${labelDayKey(tradingDayKey(lastTrade.closeDate, account))}`
                : "nessun trade chiuso"}
            </div>
          </Card>
        </div>
      </Reveal>
    </>
  );
}
