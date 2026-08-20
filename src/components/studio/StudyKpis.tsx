"use client";

// ============================================================
// Zona Studio — KPI in StatCard (AnimatedNumber + sparkline
// ultimi 7gg): Minuti di oggi · Minuti questa settimana
// (dalla data odierna indietro a lunedì della weekStart) ·
// Ore del mese · Materia top del mese (per minuti).
// ============================================================

import { useMemo } from "react";
import { useDB } from "@/lib/storage";
import { StatCard } from "@/components/ui/StatCard";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { todayKey, weekStartKey, monthKeyOf, labelDayKey } from "@/lib/dates";
import { Icon } from "@/components/ui/Icon";
import { last7Minutes, subjectColor, subjectIcon } from "./constants";

export function StudyKpis() {
  const db = useDB();
  const tz = db.settings.timezone;
  const locale = db.settings.locale || "it-IT";
  const today = todayKey(tz);
  const monthKey = today.slice(0, 7);
  const sessions = db.studySessions;

  const last7 = useMemo(() => last7Minutes(sessions, today, locale), [sessions, today, locale]);
  const spark = last7.map((d) => d.y);

  const todayMin = useMemo(
    () => sessions.filter((s) => s.date === today).reduce((a, s) => a + (s.minutes || 0), 0),
    [sessions, today]
  );

  const weekStart = useMemo(
    () => weekStartKey(today, db.settings.weekStart),
    [today, db.settings.weekStart]
  );
  const weekMin = useMemo(
    () =>
      sessions
        .filter((s) => s.date >= weekStart && s.date <= today)
        .reduce((a, s) => a + (s.minutes || 0), 0),
    [sessions, weekStart, today]
  );

  const monthSessions = useMemo(
    () => sessions.filter((s) => monthKeyOf(s.date) === monthKey),
    [sessions, monthKey]
  );
  const monthMin = monthSessions.reduce((a, s) => a + (s.minutes || 0), 0);

  const topSubject = useMemo(() => {
    const by = new Map<string, number>();
    for (const s of monthSessions) by.set(s.subject, (by.get(s.subject) || 0) + (s.minutes || 0));
    let best: { name: string; min: number } | null = null;
    for (const [name, min] of by) {
      if (!best || min > best.min || (min === best.min && name < best.name)) best = { name, min };
    }
    return best;
  }, [monthSessions]);

  const topColor = topSubject ? subjectColor(topSubject.name) : "#4C7EFF";

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Minuti di oggi"
        value={
          <span className="flex items-baseline gap-1">
            <AnimatedNumber value={todayMin} fmt={(n) => String(Math.round(n))} />
            <span className="text-sm font-medium text-muted-foreground">min</span>
          </span>
        }
        icon={<Icon name="book-open" size={17} className="text-accent" />}
        delta={
          todayMin > 0 ? (
            <span className="flex items-center gap-1 text-success">
              <Icon name="check" size={11} />
              alimenta lo streak
            </span>
          ) : (
            "nessuna sessione oggi"
          )
        }
        deltaTone={todayMin > 0 ? "positive" : "neutral"}
        hairline="accent"
        spark={spark}
        className="h-full"
      />

      <StatCard
        label="Minuti questa settimana"
        value={
          <span className="flex items-baseline gap-1">
            <AnimatedNumber value={weekMin} fmt={(n) => String(Math.round(n))} />
            <span className="text-sm font-medium text-muted-foreground">min</span>
          </span>
        }
        icon={<Icon name="calendar" size={17} className="text-accent" />}
        delta={`dal ${labelDayKey(weekStart, locale)}`}
        deltaTone="neutral"
        hairline="accent"
        spark={spark}
        className="h-full"
      />

      <StatCard
        label="Ore del mese"
        value={
          <span className="flex items-baseline gap-1">
            <AnimatedNumber value={monthMin / 60} fmt={(n) => n.toFixed(1)} />
            <span className="text-sm font-medium text-muted-foreground">h</span>
          </span>
        }
        icon={<Icon name="timer" size={17} className="text-accent" />}
        delta={`${monthSessions.length} sessione${monthSessions.length === 1 ? "" : "i"} questo mese`}
        deltaTone="neutral"
        hairline="accent"
        spark={spark}
        className="h-full"
      />

      <StatCard
        label="Materia top del mese"
        value={
          topSubject ? (
            <span
              className="flex min-w-0 items-center justify-between gap-1.5"
              style={{ color: topColor, fontSize: 19, lineHeight: 1.15, fontFamily: "var(--font-ui)" }}
            >
              <span className="truncate">{topSubject.name}</span>
              <Icon name={subjectIcon(topSubject.name)} size={17} className="shrink-0" />
            </span>
          ) : (
            <span style={{ fontFamily: "var(--font-ui)" }}>—</span>
          )
        }
        icon={<Icon name="trophy" size={17} className="text-accent" />}
        delta={topSubject ? `${topSubject.min} min questo mese` : "nessuna sessione"}
        deltaTone="neutral"
        hairline="accent"
        spark={spark}
        sparkColor={topColor}
        className="h-full"
      />
    </div>
  );
}
