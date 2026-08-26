"use client";
// ============================================================
// ASCEND — Tab "Salute" (Uso PC): benessere digitale.
// Sessioni maratona, pause, uso notturno, streak — derivati dai
// campioni del tracker (/api/day, jsonl locale). Nessun dato nuovo
// salvato nel DB; solo gli ack dello streak in localStorage.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { BarsChart } from "@/components/charts";
import { minutiToOre } from "@/lib/format";
import {
  aggregateDayHealth,
  isCleanDay,
  wellnessStreak,
  LONG_SESSION_MIN,
  type DayHealth,
} from "@/lib/pc-health";
import type { TrackerSample } from "@/lib/pc-tracker";

const BASE = "http://127.0.0.1:4877";
const ACK_KEY = "ascend:wellnessAck";

function addDaysKey(base: string, delta: number): string {
  const d = new Date(base + "T12:00:00");
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function fetchDay(date: string): Promise<TrackerSample[]> {
  try {
    const res = await fetch(`${BASE}/api/day?date=${date}`, { cache: "no-store" });
    if (!res.ok) return [];
    const j = (await res.json()) as { ok: boolean; samples?: TrackerSample[] };
    return Array.isArray(j.samples) ? j.samples : [];
  } catch {
    return [];
  }
}

function hhmm(ms: number): string {
  return new Date(ms).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

/** Colore sessione per durata: verde ok, arancio lunga, rosso critica. */
function sessionColor(minutes: number): string {
  if (minutes > 120) return "#ef4444";
  if (minutes > LONG_SESSION_MIN) return "#f59e0b";
  return "#22c55e";
}

export function HealthTab({ today }: { today: string }) {
  const [days, setDays] = useState<Record<string, DayHealth>>({});
  const [loading, setLoading] = useState(true);

  // carica oggi + 6 giorni indietro (una tantum al mount)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const dates = Array.from({ length: 7 }, (_, i) => addDaysKey(today, i - 6));
      const entries = await Promise.all(
        dates.map(async (d) => [d, aggregateDayHealth(d, await fetchDay(d))] as const)
      );
      if (cancelled) return;
      const map: Record<string, DayHealth> = {};
      for (const [d, h] of entries) map[d] = h;
      setDays(map);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [today]);

  // ack automatico dei giorni puliti (mai quello in corso)
  useEffect(() => {
    if (loading) return;
    try {
      const raw = window.localStorage.getItem(ACK_KEY);
      const acked: string[] = raw ? JSON.parse(raw) : [];
      let changed = false;
      for (const [date, h] of Object.entries(days)) {
        if (date >= today) continue; // il giorno in corso non fa fede
        if (!acked.includes(date) && isCleanDay(h)) {
          acked.push(date);
          changed = true;
        }
      }
      if (changed) window.localStorage.setItem(ACK_KEY, JSON.stringify(acked.sort()));
    } catch {
      /* storage bloccato: streak solo di sessione */
    }
  }, [days, loading, today]);

  const todayH = days[today];
  const yesterdayH = days[addDaysKey(today, -1)];

  // streak dai giorni puliti ack-ati
  const streak = useMemo(() => {
    try {
      const raw = window.localStorage.getItem(ACK_KEY);
      return wellnessStreak(raw ? JSON.parse(raw) : []);
    } catch {
      return 0;
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps -- ricalcola a fine load

  // trend 7 giorni: n° sessioni lunghe per giorno
  const trendLong = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const dk = addDaysKey(today, i - 6);
      return { x: dk.slice(8) + "/" + dk.slice(5, 7), y: days[dk]?.longSessions ?? 0 };
    });
  }, [days, today]);

  // timeline giornata: rect su frazione 24h
  const timeline = useMemo(() => {
    if (!todayH || todayH.sessions.length === 0) return [];
    const dayStart = new Date(today + "T00:00:00").getTime();
    const dayMs = 86_400_000;
    return todayH.sessions.map((s) => ({
      left: ((s.startMs - dayStart) / dayMs) * 100,
      width: Math.max(0.4, ((s.endMs - s.startMs) / dayMs) * 100),
      color: sessionColor(s.minutes),
      minutes: s.minutes,
    }));
  }, [todayH, today]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong py-12 text-sm text-muted-foreground">
        <Icon name="timer" size={16} className="animate-pulse" />
        Analizzo gli ultimi 7 giorni…
      </div>
    );
  }

  const longest = todayH?.longestSessionMin ?? 0;
  const night = todayH?.nightMinutes ?? 0;

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Sessione più lunga"
          value={minutiToOre(longest)}
          delta={longest > 120 ? "⚠ oltre il limite consigliato" : longest > LONG_SESSION_MIN ? "un po' lunga" : "ok"}
          hairline={longest > 120 ? "danger" : longest > LONG_SESSION_MIN ? "accent" : "success"}
          icon={<Icon name="timer" size={16} />}
        />
        <StatCard
          label="Pause fatte"
          value={`${todayH?.goodPauses ?? 0}`}
          delta={todayH && todayH.goodPauses > 0 ? `la più lunga ${Math.max(...todayH.pausesMinutes)} min` : "stacca ogni ~90 min"}
          hairline={(todayH?.goodPauses ?? 0) >= 3 ? "success" : "accent"}
          icon={<Icon name="pause" size={16} />}
        />
        <StatCard
          label="Uso serale (post 23)"
          value={night === 0 ? "0 min" : minutiToOre(night)}
          delta={night === 0 ? "bene 💤".replace(" 💤", "") : "meglio staccare prima"}
          hairline={night === 0 ? "success" : "danger"}
          icon={<Icon name="moon" size={16} />}
        />
        <StatCard
          label="Streak benessere"
          value={`${streak} ${streak === 1 ? "giorno" : "giorni"}`}
          delta="giorni senza maratone né uso notturno"
          hairline={streak >= 3 ? "success" : "accent"}
          icon={<Icon name="flame" size={16} />}
        />
      </div>

      {/* Timeline giornata */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">La tua giornata</CardTitle>
            <CardSubtitle>
              blocchi = sessioni continue · spazi = pause · oggi {minutiToOre(todayH?.totalMinutes ?? 0)} attivo
            </CardSubtitle>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#22c55e]" />ok</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#f59e0b]" />&gt;90m</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#ef4444]" />&gt;2h</span>
          </div>
        </div>
        <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="mt-3 h-8 w-full rounded-lg bg-elevated/60" role="img" aria-label="Timeline delle sessioni di oggi">
          {[25, 50, 75].map((x) => (
            <line key={x} x1={x} y1={0} x2={x} y2={10} stroke="var(--border)" strokeWidth={0.15} />
          ))}
          {timeline.map((seg, i) => (
            <rect key={i} x={seg.left} y={1.5} width={seg.width} height={7} rx={0.6} fill={seg.color} opacity={0.85}>
              <title>{`${Math.round(seg.minutes)} min`}</title>
            </rect>
          ))}
        </svg>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
        </div>
      </Card>

      {/* Lista sessioni + trend affiancati */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle className="text-sm">Sessioni di oggi</CardTitle>
          <CardSubtitle>{todayH?.sessions.length ?? 0} sessioni · {(todayH?.pausesMinutes.length ?? 0)} pause</CardSubtitle>
          <div className="mt-3 space-y-1">
            {(todayH?.sessions ?? []).slice().reverse().map((s, i) => (
              <div key={i} className="flex items-center gap-2.5 rounded-lg border border-border bg-elevated/40 px-3 py-1.5 text-sm">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: sessionColor(s.minutes) }} />
                <span className="tnum shrink-0 text-secondary-text">{hhmm(s.startMs)} – {hhmm(s.endMs)}</span>
                <span className="tnum ml-auto font-semibold text-foreground">{minutiToOre(s.minutes)}</span>
                {s.minutes > 120 && <Badge tone="danger">lunga</Badge>}
              </div>
            ))}
            {(todayH?.sessions ?? []).length === 0 && (
              <p className="py-3 text-center text-xs text-muted-foreground">Nessuna sessione registrata oggi.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardTitle className="text-sm">Sessioni &gt;90 min · 7 giorni</CardTitle>
          <CardSubtitle>quante volte hai superato la soglia</CardSubtitle>
          <div className="mt-3">
            <BarsChart data={trendLong} color="#f59e0b" height={140} />
          </div>
        </Card>
      </div>

      {/* confronto ieri */}
      {yesterdayH && yesterdayH.totalMinutes > 0 && (
        <p className="text-center text-[11px] text-muted-foreground">
          Ieri: {minutiToOre(yesterdayH.totalMinutes)} attivo · {yesterdayH.longSessions} sessioni lunghe · {yesterdayH.nightMinutes === 0 ? "niente uso notturno" : `${minutiToOre(yesterdayH.nightMinutes)} dopo le 23`}
        </p>
      )}

      <p className="text-center text-[11px] text-muted-foreground">
        Derivato dai campioni del tracker locale (gap &gt;5 min = pausa). Nessun dato lascia il tuo PC.
      </p>
    </div>
  );
}