"use client";
// ============================================================
// ASCEND — Pannello "Tracker live" (Uso PC)
// Registrazione dinamica via micro-server locale (scripts/tracker-server.mjs):
//  - badge stato tracker online/offline (dot verde/rossa, fetch /api/health)
//  - ultima app attiva (lastSample da /api/active)
//  - "● Inizia a registrare" / "■ Ferma": quando attivo, polling
//    GET /api/since?ts=<ultimo import> ogni 20s → categorize() +
//    aggregazione (giorno, categoria) → upsert in pcUsageLogs (source "auto").
//  - "Ferma" ferma SOLO il polling: il tracker di sistema continua a
//    campionare in background (i dati restano nel file .jsonl/giornaliero).
// Offline: ogni fetch fallito (rete/CORS/processo spento) → lo stato passa a
// "offline" e il polling riprende automaticamente quando il server torna su.
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { useDB, updateDB, uid, nowISO } from "@/lib/storage";
import { todayKey } from "@/lib/dates";
import type { PCUsageLog } from "@/lib/types";
import {
  TRACKER_POLL_MS,
  fetchTrackerActive,
  fetchTrackerHealth,
  fetchTrackerSince,
  aggregateSamples,
  formatOreMin,
  timeAgo,
  type TrackerSample,
} from "@/lib/pc-tracker";
import { cn } from "@/lib/cn";

type TrackerStatus = "checking" | "online" | "offline";

const STATUS_POLL_MS = 15_000;
const LAST_TS_KEY = "ascend:pcTrackerLastTs";
const SOURCE: PCUsageLog["source"] = "auto";

export function TrackerLive() {
  const db = useDB();

  const [status, setStatus] = useState<TrackerStatus>("checking");
  const [lastSample, setLastSample] = useState<TrackerSample | null>(null);
  const [recording, setRecording] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [appCount, setAppCount] = useState(0);

  // refs di lavoro (nessun re-render quando cambiano)
  const lastTsRef = useRef<string | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const appSetRef = useRef<Set<string>>(new Set());

  const today = todayKey(db.settings.timezone);
  const todayMin = useMemo(
    () => db.pcUsageLogs.filter((p) => p.date === today).reduce((s, p) => s + p.minutes, 0),
    [db.pcUsageLogs, today]
  );

  // --- upsert campioni aggregati in pcUsageLogs (source "auto") ---
  const importSamples = useCallback((samples: TrackerSample[]): number => {
    if (samples.length === 0) return 0;

    const aggregated = aggregateSamples(samples);
    let inserted = 0;
    updateDB((d) => {
      const next = { ...d, pcUsageLogs: [...d.pcUsageLogs] };

      for (const [key, minutes] of Object.entries(aggregated)) {
        if (minutes <= 0) continue;
        const [date, category] = key.split("|");
        if (!date || !category) continue;

        // upsert per (giorno, categoria)
        const idx = next.pcUsageLogs.findIndex((l) => l.date === date && l.categoryId === category);
        if (idx >= 0) {
          const cur = next.pcUsageLogs[idx];
          next.pcUsageLogs[idx] = { ...cur, minutes: Math.round((cur.minutes + minutes) * 10) / 10 };
        } else {
          next.pcUsageLogs.push({ id: uid(), date, categoryId: category, minutes, source: SOURCE, createdAt: nowISO() });
          inserted++;
        }
      }
      return next;
    });
    return inserted;
  }, []);

  // --- un ciclo di polling /api/since ---
  const poll = useCallback(async () => {
    if (busyRef.current) return; // evita sovrapposizioni se il fetch dura >20s
    busyRef.current = true;
    try {
      const since = await fetchTrackerSince(lastTsRef.current ?? nowISO());
      if (!since || !Array.isArray(since.samples) || since.samples.length === 0) return;

      // il server filtra già per ts, ma proteggiamo dai doppioni
      const base = lastTsRef.current;
      const fresh = base
        ? since.samples.filter((s) => s && typeof s.ts === "string" && s.ts > base)
        : since.samples;
      if (fresh.length === 0) return;

      importSamples(fresh);

      // avanza il "ultimo import" al campione più recente
      const maxTs = fresh.reduce((a, b) => (b.ts > a ? b.ts : a), base ?? "");
      lastTsRef.current = maxTs;
      setLastSync(maxTs);
      try {
        window.localStorage.setItem(LAST_TS_KEY, maxTs);
      } catch {
        /* quota/privato — ignorabile */
      }

      // contatore app distinte viste in questa sessione
      const seen = appSetRef.current;
      let changed = false;
      for (const s of fresh) {
        if (s.exe && !seen.has(s.exe)) {
          seen.add(s.exe);
          changed = true;
        }
      }
      if (changed) setAppCount(seen.size);
    } finally {
      busyRef.current = false;
    }
  }, [importSamples]);

  const startRecording = useCallback(() => {
    // Base: ultimo ts importato persistito (se di oggi), altrimenti "adesso".
    // Così una sessione interrotta riprende dai campioni del gap senza doppioni.
    let base = nowISO();
    try {
      const stored = window.localStorage.getItem(LAST_TS_KEY);
      if (stored && !Number.isNaN(Date.parse(stored))) {
        const d = new Date(stored);
        const now = new Date();
        if (d.toDateString() === now.toDateString()) base = stored;
      }
    } catch {
      /* localStorage non disponibile */
    }

    lastTsRef.current = base;
    appSetRef.current = new Set();
    setAppCount(0);
    setLastSync(null);
    setRecording(true);

    if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current);
    void poll(); // poll immediato + intervallo
    pollTimerRef.current = window.setInterval(() => void poll(), TRACKER_POLL_MS);
  }, [poll]);

  const stopRecording = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setRecording(false);
  }, []);

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
      if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current);
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

      {/* contatore live */}
      {recording && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-success/25 bg-success/[0.07] px-3 py-2 text-sm">
          <span className="h-2 w-2 animate-pulse-dot rounded-full bg-success" />
          <span className="font-medium text-success">Registrando</span>
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

      {/* azioni */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant={recording ? "danger" : "primary"}
          glow={!recording}
          onClick={recording ? stopRecording : startRecording}
          disabled={status === "checking"}
          className="flex-1 justify-center gap-2 sm:flex-none sm:px-6"
        >
          <Icon name={recording ? "pause" : "play"} size={16} />
          <span>{recording ? "■ Ferma" : "● Inizia a registrare"}</span>
        </Button>
        <p className="text-[11px] text-muted-foreground">
          Aggiorna ogni {TRACKER_POLL_MS / 1000}s · il tracker campiona in background ogni 30s anche a
          registrazione ferma.
        </p>
      </div>
    </Card>
  );
}
