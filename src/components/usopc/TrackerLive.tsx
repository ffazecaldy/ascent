"use client";
// ============================================================
// ASCEND — Pannello "Tracker live" (Uso PC)
// Registrazione dinamica via micro-server locale (scripts/tracker-server.mjs):
//  - badge stato tracker online/offline (dot verde/rossa, fetch /api/health)
//  - ultima app attiva (lastSample da /api/active)
//  - "● Inizia a registrare" / "■ Ferma": quando attivo, cronometro live
//    HH:MM:SS + polling GET /api/since?ts=<ultimo import> ogni 20s →
//    categorize() + aggregazione (giorno, categoria) → upsert in
//    pcUsageLogs (source "auto").
//  - "Ferma" ferma SOLO il polling e mostra le stats della sessione appena
//    chiusa (buffer locale): durata, app distinte, top categorie,
//    % produttivo, app più usata. Il riquadro si resetta al nuovo start.
//  - Il tracker di sistema continua a campionare in background anche a
//    registrazione ferma (i dati restano nel file .jsonl/giornaliero).
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
  TRACKER_SAMPLE_MIN,
  fetchTrackerActive,
  fetchTrackerHealth,
  fetchTrackerSince,
  aggregateSamples,
  categorize,
  categoryColor,
  formatDurHMS,
  formatOreMin,
  PRODUCTIVE_CATEGORIES,
  timeAgo,
  type TrackerSample,
} from "@/lib/pc-tracker";
import { cn } from "@/lib/cn";

type TrackerStatus = "checking" | "online" | "offline";

const STATUS_POLL_MS = 15_000;
const LAST_TS_KEY = "ascend:pcTrackerLastTs";
const SOURCE: PCUsageLog["source"] = "auto";

/** Stats della sessione appena fermata (solo buffer locale, no storico). */
interface SessionStats {
  durationMs: number;
  appCount: number;
  productiveMin: number;
  totalMin: number;
  categories: { category: string; minutes: number }[];
  topApp: { exe: string; samples: number } | null;
}

export function TrackerLive() {
  const db = useDB();

  // Regole personali app→categoria (priorità massima nella categorizzazione)
  const userMap = useMemo(
    () => Object.fromEntries(db.pcAppCategoryMap.map((m) => [m.appName.toLowerCase(), m.category])),
    [db.pcAppCategoryMap]
  );

  const [status, setStatus] = useState<TrackerStatus>("checking");
  const [lastSample, setLastSample] = useState<TrackerSample | null>(null);
  const [recording, setRecording] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [appCount, setAppCount] = useState(0);
  const [sessionStart, setSessionStart] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);

  // refs di lavoro (nessun re-render quando cambiano)
  const lastTsRef = useRef<string | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const appSetRef = useRef<Set<string>>(new Set());
  const sessionStartRef = useRef<number | null>(null);
  const sessionSamplesRef = useRef<TrackerSample[]>([]);

  const today = todayKey(db.settings.timezone);
  const todayMin = useMemo(
    () => db.pcUsageLogs.filter((p) => p.date === today).reduce((s, p) => s + p.minutes, 0),
    [db.pcUsageLogs, today]
  );

  // --- cronometro live HH:MM:SS (1 tick/s mentre registra) ---
  useEffect(() => {
    if (sessionStart === null) return;
    // Primo tick in microtask: il setState non è sincrono nel corpo dell'effect.
    queueMicrotask(() => setNowTs(Date.now()));
    const id = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [sessionStart]);

  // --- upsert campioni aggregati in pcUsageLogs (source "auto") ---
  const importSamples = useCallback((samples: TrackerSample[]): number => {
    if (samples.length === 0) return 0;

    const aggregated = aggregateSamples(samples, userMap);
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
  }, [userMap]);

  // --- un ciclo di polling /api/since ---
  const poll = useCallback(async () => {
    if (busyRef.current) return; // evita sovrapposizioni se il fetch dura >20s
    busyRef.current = true;
    try {
      const since = await fetchTrackerSince(lastTsRef.current ?? nowISO());
      if (!since || !Array.isArray(since.samples) || since.samples.length === 0) return;

      // il server filtra già per ts, ma proteggiamo dai doppioni.
      // Confronto NUMERICO (Date.parse): i ts possono avere formati misti
      // ("Z" del client vs "+02:00" del tracker) e il confronto
      // lessicografico scartava campioni validi.
      const base = lastTsRef.current;
      const baseMs = base ? Date.parse(base) : NaN;
      const fresh = base
        ? since.samples.filter((s) => {
            if (!s || typeof s.ts !== "string") return false;
            const t = Date.parse(s.ts);
            return Number.isFinite(t) && (!Number.isFinite(baseMs) || t > baseMs);
          })
        : since.samples;
      if (fresh.length === 0) return;

      importSamples(fresh);

      // avanza il "ultimo import" al campione più recente
      const maxTs = fresh.reduce((a, b) => {
        const ta = Date.parse(a);
        const tb = Date.parse(b.ts);
        if (!Number.isFinite(ta)) return b.ts;
        if (!Number.isFinite(tb)) return a;
        return tb > ta ? b.ts : a;
      }, base ?? "");
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

      // buffer locale per le stats di sessione allo stop
      sessionSamplesRef.current.push(...fresh);
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

    // nuova sessione: resetta buffer + stats del riquadro precedente
    const startMs = Date.now();
    sessionStartRef.current = startMs;
    sessionSamplesRef.current = [];
    appSetRef.current = new Set();
    setSessionStart(startMs);
    setNowTs(startMs);
    setSessionStats(null);
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
    setSessionStart(null);

    // --- stats della sessione appena fermata (solo buffer locale) ---
    const startMs = sessionStartRef.current;
    const durationMs = startMs !== null ? Date.now() - startMs : 0;
    const buf = sessionSamplesRef.current;

    const catMin = new Map<string, number>();
    const exeCount = new Map<string, number>();
    for (const s of buf) {
      if (!s?.exe) continue;
      const cat = categorize(s.exe, s.title ?? "", userMap);
      catMin.set(cat, (catMin.get(cat) ?? 0) + TRACKER_SAMPLE_MIN);
      exeCount.set(s.exe, (exeCount.get(s.exe) ?? 0) + 1);
    }

    const categories = [...catMin.entries()]
      .map(([category, minutes]) => ({ category, minutes: Math.round(minutes * 10) / 10 }))
      .sort((a, b) => b.minutes - a.minutes);

    const totalMin = categories.reduce((s, c) => s + c.minutes, 0);
    const productiveMin = categories
      .filter((c) => PRODUCTIVE_CATEGORIES.has(c.category))
      .reduce((s, c) => s + c.minutes, 0);

    const topAppEntry = [...exeCount.entries()].sort((a, b) => b[1] - a[1])[0];

    setSessionStats({
      durationMs,
      appCount: exeCount.size,
      productiveMin,
      totalMin,
      categories: categories.slice(0, 3),
      topApp: topAppEntry ? { exe: topAppEntry[0], samples: topAppEntry[1] } : null,
    });
  }, [userMap]);

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
      {sessionStats && <SessionSummary stats={sessionStats} />}

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

// ============================================================
// Riquadro "Sessione registrata" — stats SOLO della sessione
// appena fermata (buffer locale dei campioni importati).
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