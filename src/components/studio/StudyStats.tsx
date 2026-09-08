"use client";

// ============================================================
// Zona Studio — stats avanzate: tabs 7/30/90gg con StatCard
// (Totale, Media/sessione, Miglior giorno, Focus medio, Streak)
// + delta % del Totale vs periodo precedente. Dati puri da
// compute.studyStats (mai persistiti).
// ============================================================

import { useMemo, useState } from "react";
import { useDB } from "@/lib/storage";
import { studyStats } from "@/lib/compute";
import { addDaysKey, labelDayKey, todayKey } from "@/lib/dates";
import { StatCard } from "@/components/ui/StatCard";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

export function StudyStats({ from, to }: { from?: string; to?: string }) {
  const db = useDB();
  const tz = db.settings.timezone;
  const locale = db.settings.locale || "it-IT";
  const today = todayKey(tz);
  const [range, setRange] = useState<Range>(30);

  // Periodo fisso se `from` è passato via props, altrimenti tab corrente.
  const end = to ?? today;
  const start = from ?? addDaysKey(end, -(range - 1));
  const effectiveRange = from ? Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1) : range;
  const prevEnd = addDaysKey(start, -1);
  const prevStart = addDaysKey(start, -effectiveRange);

  const cur = useMemo(() => studyStats(db, start, end), [db, start, end]);
  const prev = useMemo(() => studyStats(db, prevStart, prevEnd), [db, prevStart, prevEnd]);

  const delta = useMemo(() => {
    if (cur.totalMin === 0 && prev.totalMin === 0) return { label: "—", tone: "neutral" as const };
    if (prev.totalMin === 0) return { label: "nuovo", tone: "positive" as const };
    const pct = Math.round(((cur.totalMin - prev.totalMin) / prev.totalMin) * 100);
    if (pct === 0) return { label: `0% vs precedenti ${effectiveRange}gg`, tone: "neutral" as const };
    return {
      label: `${pct > 0 ? "+" : ""}${pct}% vs precedenti ${effectiveRange}gg`,
      tone: (pct > 0 ? "positive" : "negative") as "positive" | "negative",
    };
  }, [cur.totalMin, prev.totalMin, effectiveRange]);

  return (
    <div className="space-y-3">
      {from == null && (
        <div className="flex items-center gap-1.5">
          {RANGES.map((r) => (
            <Button
              key={r}
              size="sm"
              variant={r === range ? "primary" : "subtle"}
              onClick={() => setRange(r)}
              aria-pressed={r === range}
            >
              <span className="tnum">{r}gg</span>
            </Button>
          ))}
          <span className="ml-1 text-[11px] text-muted-foreground">
            dal {labelDayKey(start, locale)} al {labelDayKey(end, locale)}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Totale periodo"
          value={
            <span className="flex items-baseline gap-1">
              <AnimatedNumber value={cur.totalMin} fmt={(n) => String(Math.round(n))} />
              <span className="text-sm font-medium text-muted-foreground">min</span>
            </span>
          }
          icon={<Icon name="timer" size={17} className="text-accent" />}
          delta={delta.label}
          deltaTone={delta.tone}
          hairline="accent"
          className="h-full"
        />

        <StatCard
          label="Media/sessione"
          value={
            <span className="flex items-baseline gap-1">
              <AnimatedNumber value={cur.avgMin} fmt={(n) => n.toFixed(0)} />
              <span className="text-sm font-medium text-muted-foreground">min</span>
            </span>
          }
          icon={<Icon name="chart-bar" size={17} className="text-accent" />}
          delta={`${cur.sessions} sessione${cur.sessions === 1 ? "" : "i"} nel periodo`}
          deltaTone="neutral"
          hairline="accent"
          className="h-full"
        />

        <StatCard
          label="Miglior giorno"
          value={
            cur.bestDay ? (
              <span className="flex items-baseline gap-1">
                <AnimatedNumber value={cur.bestDay.min} fmt={(n) => String(Math.round(n))} />
                <span className="text-sm font-medium text-muted-foreground">min</span>
              </span>
            ) : (
              <span>—</span>
            )
          }
          icon={<Icon name="trophy" size={17} className="text-accent" />}
          delta={cur.bestDay ? labelDayKey(cur.bestDay.date, locale) : "nessuna sessione"}
          deltaTone="neutral"
          hairline="accent"
          className="h-full"
        />

        <StatCard
          label="Focus medio"
          value={
            cur.avgFocus != null ? (
              <span className="flex items-baseline gap-1">
                <AnimatedNumber value={cur.avgFocus} fmt={(n) => n.toFixed(1)} />
                <span className="text-sm font-medium text-muted-foreground">/5</span>
              </span>
            ) : (
              <span>—</span>
            )
          }
          icon={<Icon name="star" size={17} className="text-accent" />}
          delta={cur.avgFocus != null ? "media voti focus" : "nessun voto focus"}
          deltaTone="neutral"
          hairline="accent"
          className="h-full"
        />

        <StatCard
          label="Streak studio"
          value={
            <span className="flex items-baseline gap-1">
              <AnimatedNumber value={cur.streakDays} fmt={(n) => String(Math.round(n))} />
              <span className="text-sm font-medium text-muted-foreground">gg</span>
            </span>
          }
          icon={<Icon name="flame" size={17} className="text-accent" />}
          delta={cur.streakDays > 0 ? "giorni consecutivi" : "nessuna serie attiva"}
          deltaTone={cur.streakDays > 0 ? "positive" : "neutral"}
          hairline="accent"
          className="h-full"
        />
      </div>
    </div>
  );
}
