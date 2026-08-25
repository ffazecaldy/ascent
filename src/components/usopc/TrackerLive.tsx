"use client";
// ============================================================
// ASCEND — Pannello "Tracker live" (Uso PC)
// La REGISTRAZIONE è globale (src/lib/pc-record.ts): parte da qui
// ma continua a girare su OGNI pagina (il polling vive nel modulo,
// non nel componente). Un popup flottante (TrackerFloating,
// montato in AppShell) permette di fermarla ovunque.
// - badge stato tracker online/offline (fetch /api/health)
// - ultima app attiva (lastSample da /api/active)
// - "● Inizia a registrare" / "■ Ferma": cronometro HH:MM:SS +
//   polling GET /api/since?ts=<ultimo import> ogni 20s →
//   categorize() + aggregazione (giorno, categoria) → upsert in
//   pcUsageLogs (source "auto").
// - "Ferma" mostra le stats della sessione appena chiusa: durata,
//   app distinte, top categorie, % produttivo, app più usata.
// - Il tracker di sistema campiona in background anche a
//   registrazione ferma (file .jsonl/giornaliero).
// Offline: ogni fetch fallito (rete/CORS/processo spento) → stato
// "offline"; il polling riprende quando il server torna su.
// ============================================================

import React, { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { useDB } from "@/lib/storage";
import { todayKey } from "@/lib/dates";
import {
  TRACKER_POLL_MS,
  fetchTrackerActive,
  fetchTrackerHealth,
  categoryColor,
  formatDurHMS,
  formatOreMin,
  timeAgo,
  type TrackerSample,
} from "@/lib/pc-tracker";
import {
  getRecordState,
  getRecordStateServer,
  startRecord,
  stopRecord,
  subscribeRecord,
  type SessionStats,
} from "@/lib/pc-record";
import { cn } from "@/lib/cn";

type TrackerStatus = "checking" | "online" | "offline";

const STATUS_POLL_MS = 15_000;

export function TrackerLive() {
  const db = useDB();
  // stato registrazione GLOBALE: continua anche navigando via
  const record = useSyncExternalStore(subscribeRecord, getRecordState, getRecordStateServer);
  const { recording, sessionStart, lastSync, appCount, lastSessionStats } = record;

  const [status, setStatus] = useState<TrackerStatus>("checking");
  const [lastSample, setLastSample] = useState<TrackerSample | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());

  const today = todayKey(db.settings.timezone);
  const todayMin = useMemo(
    () => db.pcUsageLogs.filter((p) => p.date === today).reduce((s, p) => s + p.minutes, 0),
    [db.pcUsageLogs, today]
  );

  // --- cronometro live HH:MM:SS (1 tick/s mentre registra) ---
  useEffect(() => {
    if (sessionStart === null) return;
    queueMicrotask(() => setNowTs(Date.now()));
    const id = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [sessionStart]);

  // --- stato tracker + ultima app attiva (sempre attivi) ---
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const [health, active] = await Promise.all([fetchTrackerHealth(), fetchTrackerActive()]);
      if (cancelled) return; // evita setState dopo l'unmount
      setStatus(health?.ok ? "online" : "offline");
      setLastSample(health?.lastSample ?? active?.last ?? null);
    };
    void tick();
    const id = window.setInterval(() => void tick(), STATUS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const statusLabel =
    status === "online"
      ? recording
        ? "Registrazione attiva"
        : "Tracker online"
      : status === "checking"
        ? "Verifica…"
        : "Offline";

  return (
    <Card hairline={recording ? "success" : "accent"} scan={recording} className="w-full">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-accent/30 bg-accent/10">
            <Icon name="activity" size={20} className="text-accent" />
          </div>
          <div>
            <CardTitle className="text-base">Tracker live</CardTitle>
            <CardSubtitle>Registra l&apos;uso del PC via micro-server locale</CardSubtitle>
          </div>
        </div>

        {/* badge stato: dot verde/rossa */}
        <Badge tone={status === "online" ? "success" : "danger"}>
          <span className={cn("h-1.5 w-1.5 rounded-full bg-current", recording && "animate-pulse-dot")} />
          {statusLabel}
        </Badge>
      </div>

      {/* contatore live + cronometro sessione */}
      {recording && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-success/25 bg-success/[0.07] px-3 py-2 text-sm">
          <span className="h-2 w-2 animate-pulse-dot rounded-full bg-success" />
          <span className="font-medium text-success">Registrando</span>
          <span className="tnum rounded-md bg-success/15 px-1.5 py-0.5 text-sm font-semibold text-success">
            {formatDurHMS(sessionStart !== null ? nowTs - sessionStart : 0)}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-secondary-text">
            oggi <span className="tnum font-semibold text-foreground">{formatOreMin(todayMin)}</span>
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-secondary-text">
            <span className="tnum font-semibold text-foreground">{appCount}</span> app
          </span>
          {lastSync && (
            <>
              <span className="text-muted-foreground">· ultimo sync</span>
              <span className="tnum text-secondary-text">{timeAgo(lastSync)}</span>
            </>
          )}
        </div>
      )}

      {/* ultima app attiva */}
      <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-border bg-elevated/40 px-3 py-2">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", status === "online" ? "bg-success" : "bg-danger/60")} />
        <div className="min-w-0 flex-1">
          {lastSample ? (
            <>
              <p className="truncate text-sm">
                <span className="font-semibold text-foreground">{lastSample.exe}</span>
                {lastSample.title ? <span className="text-secondary-text"> · {lastSample.title}</span> : null}
              </p>
              <p className="text-[11px] text-muted-foreground">
                ultima attività <span className="tnum">{timeAgo(lastSample.ts)}</span>
              </p>
            </>
          ) : (
            <p className="text-sm text-secondary-text">
              {status === "offline"
                ? "Il tracker di sistema non risponde. Avvia node scripts/tracker-server.mjs e riprova."
                : "Nessuna attività rilevata ancora."}
            </p>
          )}
        </div>
      </div>

      {/* stats sessione appena fermata (resettate al prossimo start) */}
      {lastSessionStats && <SessionSummary stats={lastSessionStats} />}

      {/* azioni */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant={recording ? "danger" : "primary"}
          glow={!recording}
          onClick={recording ? stopRecord : startRecord}
          disabled={status === "checking"}
          className="flex-1 justify-center gap-2 sm:flex-none sm:px-6"
        >
          <Icon name={recording ? "pause" : "play"} size={16} />
          <span>{recording ? "■ Ferma" : "● Inizia a registrare"}</span>
        </Button>
        <p className="text-[11px] text-muted-foreground">
          La registrazione continua anche se cambi pagina — fermala dal popup in alto.
        </p>
      </div>
    </Card>
  );
}

// ============================================================
// Riquadro "Sessione registrata" — stats SOLO della sessione
// appena fermata (buffer globale del modulo pc-record).
// ============================================================
function SessionSummary({ stats }: { stats: SessionStats }) {
  const pct = stats.totalMin > 0 ? Math.round((stats.productiveMin / stats.totalMin) * 100) : 0;
  const maxMin = stats.categories.length > 0 ? stats.categories[0].minutes : 0;

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-success/25 bg-success/[0.04] p-3">
      {/* intestazione: titolo + durata totale */}
      <div className="flex items-center gap-2.5">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-success/25 bg-success/10">
          <Icon name="check" size={15} className="text-success" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground">Sessione registrata</p>
          <p className="text-[11px] text-muted-foreground">dati della sessione appena fermata · {stats.appCount} app</p>
        </div>
        <span className="tnum text-base font-semibold text-foreground">{formatDurHMS(stats.durationMs)}</span>
      </div>

      {/* mini-stat: app distinte + % produttivo */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border bg-elevated px-2.5 py-2">
          <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <Icon name="activity" size={11} /> App distinte
          </p>
          <p className="tnum mt-0.5 text-base font-semibold text-foreground">{stats.appCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-elevated px-2.5 py-2">
          <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <Icon name="zap" size={11} /> Produttivo
          </p>
          <p className={cn("tnum mt-0.5 text-base font-semibold", pct >= 50 ? "text-success" : "text-warning")}>
            {pct}%
          </p>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-elevated-2">
            <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="tnum mt-1 text-[10px] text-muted-foreground">
            {formatOreMin(stats.productiveMin)} di {formatOreMin(stats.totalMin)}
          </p>
        </div>
      </div>

      {/* top 3 categorie con barre colorate */}
      {stats.categories.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Top categorie</p>
          <div className="space-y-1.5">
            {stats.categories.map((c) => (
              <div key={c.category} className="flex items-center gap-2">
                <span className="w-16 shrink-0 truncate text-[11px] text-secondary-text">{c.category}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-elevated-2">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${maxMin > 0 ? (c.minutes / maxMin) * 100 : 0}%`, backgroundColor: categoryColor(c.category) }}
                  />
                </div>
                <span className="tnum w-12 shrink-0 text-right text-[11px] text-secondary-text">
                  {formatOreMin(c.minutes)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Nessun campione rilevato durante la sessione (tracker offline?).
        </p>
      )}

      {/* app più usata */}
      {stats.topApp && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-elevated px-2.5 py-2">
          <Icon name="monitor" size={14} className="shrink-0 text-accent" />
          <span className="text-[11px] text-muted-foreground">App più usata</span>
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{stats.topApp.exe}</span>
          <span className="tnum shrink-0 text-[11px] text-muted-foreground">
            {stats.topApp.samples} campioni
          </span>
        </div>
      )}
    </div>
  );
}