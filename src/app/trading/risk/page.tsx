"use client";

// ============================================================
// ASCEND — Risk Dashboard (spec 4.3)
// Per account, in tempo reale, in valuta NATIVA.
// - drawdown giornaliero / max drawdown / rischio per trade
// - distanza dai loss limit (daily e max) con soglie di avviso
// - miglior / peggior giornata di trading
// - streak corrente (win / loss consecutive)
// - card del confine del trading day (timezone + rollover)
// ============================================================

import { useState } from "react";
import Link from "next/link";
import { useDB } from "@/lib/storage";
import { riskStats } from "@/lib/compute";
import { formatMoney, formatSignedMoney, formatR } from "@/lib/format";
import { labelDayKey, tradingDayKey } from "@/lib/dates";
import { maskMoney, maskKpi } from "@/lib/privacy";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Misc";
import { Field, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

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
  warn: "text-yellow-500",
  ok: "text-success",
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

export default function RiskPage() {
  const db = useDB();
  const accounts = db.accounts;
  const [selectedId, setSelectedId] = useState<string>(() => accounts[0]?.id ?? "");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Risk Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Drawdown, rischio per trade e distanza dai loss limit — per account, in valuta nativa.
          </p>
        </div>
        {accounts.length > 0 && (
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
        )}
      </div>

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

  return (
    <>
      {/* Confine del trading day */}
      <Card>
        <CardHeader>
          <CardTitle>🕐 Confine del trading day</CardTitle>
          <Badge tone={near.length > 0 ? "warning" : "default"}>
            {near.length > 0 ? "⚠ limite vicino" : "limiti ok"}
          </Badge>
        </CardHeader>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetaStat tag="Fuso orario" value={account.tradingDayTimezone || db.settings.timezone} />
          <MetaStat tag="Rollover" value={account.tradingDayRolloverTime || "00:00"} />
          <MetaStat tag="Trading day corrente" value={labelDayKey(tradingDayNow)} />
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

      {/* Avviso friendly se un limite è vicino */}
      {near.length > 0 && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <div className="flex items-start gap-2">
            <span className="text-base leading-5">⚠️</span>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-yellow-500">
                Attenzione: un loss limit è quasi raggiunto.
              </p>
              {near.map((n) => {
                const pct = Math.round((Math.abs(n.distance) / n.limit) * 100);
                const body =
                  n.distance <= 0
                    ? `${n.label} raggiunto o superato: il drawdown ha già consumato il limite di ${fmt(n.limit)}.`
                    : `${n.label} vicino: margine residuo ${fmt(n.distance)} su ${fmt(n.limit)} (${pctStr(pct, masked)}).`;
                return (
                  <p key={n.label} className="text-sm text-yellow-500/90">
                    {body}
                  </p>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {/* Griglia metriche */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Daily drawdown"
          value={fmt(stats.dailyDrawdown)}
          valueClassName="text-danger"
          delta="peggior giorno chiuso"
        />
        <StatCard
          label="Max drawdown"
          value={fmt(stats.maxDrawdown)}
          valueClassName="text-danger"
          delta="equity cumulativa, da picco"
        />
        <StatCard
          label="Rischio medio per trade"
          value={fmt(stats.avgRiskPerTrade)}
          delta={losingCount > 0 ? `${losingCount} trade in perdita` : "nessuna perdita registrata"}
        />
        <StatCard
          label="Rischio cumulativo oggi"
          value={fmt(stats.cumulativeRiskToday)}
          delta={cumTodayDelta}
        />
        <StatCard
          label="Distanza dal daily loss limit"
          value={stats.distanceDailyLimit == null ? "—" : fmt(stats.distanceDailyLimit)}
          valueClassName={distToneCls[ddTone]}
          delta={limitDelta(stats.distanceDailyLimit, dl)}
        />
        <StatCard
          label="Distanza dal max loss limit"
          value={stats.distanceMaxLimit == null ? "—" : fmt(stats.distanceMaxLimit)}
          valueClassName={distToneCls[mdTone]}
          delta={limitDelta(stats.distanceMaxLimit, ml)}
        />
      </div>

      {/* Miglior / peggior giornata + streak corrente */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Miglior giornata"
          value={signedFmt(stats.bestDay.pnl)}
          valueClassName="text-success"
          delta={labelDayKey(stats.bestDay.dayKey)}
          deltaTone="positive"
        />
        <StatCard
          label="Peggior giornata"
          value={signedFmt(stats.worstDay.pnl)}
          valueClassName="text-danger"
          delta={labelDayKey(stats.worstDay.dayKey)}
          deltaTone="negative"
        />
        <Card className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Streak corrente
          </span>
          {current === "win" && (
            <span className="text-2xl font-semibold tnum leading-tight text-success">
              🔥 {wins} win consecutive
            </span>
          )}
          {current === "loss" && (
            <span className="text-2xl font-semibold tnum leading-tight text-danger">
              ⚠ {losses} loss consecutive
            </span>
          )}
          {current === null && (
            <span className="text-2xl font-semibold tnum leading-tight text-muted-foreground">
              Nessuna streak in corso
            </span>
          )}
          <span className="text-xs tnum text-muted-foreground">
            {lastTrade
              ? `ultimo trade: ${formatR(lastTrade.resultR)} (${labelDayKey(tradingDayKey(lastTrade.closeDate, account))})`
              : "nessun trade chiuso"}
          </span>
        </Card>
      </div>
    </>
  );
}
