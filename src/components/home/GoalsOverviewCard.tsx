"use client";

// ============================================================
// ASCEND — Home · Panoramica Obiettivi
// Elenca TUTTI gli obiettivi attivi (daily + weekly):
//  - nome + badge tipo (daily/weekly)
//  - stato di oggi: daily → ✓ verde (met) / grigio (mancante);
//    weekly → progress bar con valore/target (success se raggiunto)
//  - badge scadenza se deadline (warning ≤3 gg, danger se scaduta)
// Tutto derivato da useDB a ogni render → ogni nuovo obiettivo
// compare subito (live). Link a /obiettivi.
// ============================================================

import { useMemo } from "react";
import Link from "next/link";
import {
  ascordDay,
  GOAL_LABELS,
  WEEKLY_GOAL_LABELS,
  pcMinutesInWeek,
  workoutsInWeek,
} from "@/lib/compute";
import {
  todayKey,
  weekStartKey,
  addDaysKey,
  monthRange,
  isoToDayKey,
} from "@/lib/dates";
import type { DB, WeeklyGoal, DailyGoal } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar, EmptyState } from "@/components/ui/Misc";
import { cn } from "@/lib/cn";

// ------------------------------------------------------------
// Progresso settimanale/mensile di un WeeklyGoal (helper locale,
// coerente con la pagina Obiettivi)
// ------------------------------------------------------------
interface PeriodProgress {
  value: number | null;
  target: number;
  unit: string;
}

function weeklyProgress(db: DB, g: WeeklyGoal): PeriodProgress {
  const tz = db.settings.timezone;
  const today = todayKey(tz);

  let start: string;
  let end: string;
  if (g.period === "week") {
    start = weekStartKey(today, db.settings.weekStart);
    end = addDaysKey(start, 6);
  } else {
    const r = monthRange(today.slice(0, 7));
    start = r.start;
    end = r.end;
  }
  const inRange = (dk: string) => dk >= start && dk <= end;

  let pcMin: number;
  if (g.period === "week") pcMin = pcMinutesInWeek(db, start, db.settings.weekStart);
  else pcMin = db.pcUsageLogs.filter((p) => inRange(p.date)).reduce((s, p) => s + p.minutes, 0);

  let workouts: number;
  if (g.period === "week") workouts = workoutsInWeek(db, start);
  else workouts = db.workouts.filter((w) => inRange(w.date)).length;

  const txs = db.transactions.filter((t) => inRange(t.date)).length;
  const trades = db.trades.filter((t) => inRange(isoToDayKey(t.closeDate, tz))).length;

  const ps = new Date(start + "T00:00:00");
  const pe = new Date(end + "T23:59:59");
  let pagesInPeriod = 0;
  db.books.forEach((b) => {
    const u = new Date(b.updatedAt);
    if (u >= ps && u <= pe) pagesInPeriod += b.pagesRead;
  });
  const bookPagesTotal = db.books
    .filter((b) => b.status === "in_corso")
    .reduce((s, b) => s + b.pagesRead, 0);

  switch (g.type) {
    case "pc_hours":
      return { value: Math.round((pcMin / 60) * 10) / 10, target: g.targetValue, unit: "h" };
    case "workout_count":
      return { value: workouts, target: g.targetValue, unit: "" };
    case "book_pages":
      return { value: bookPagesTotal, target: g.targetValue, unit: "pagg." };
    case "ore_produttive":
      return { value: pcMin, target: g.targetValue, unit: "min" };
    case "lettura_minuti":
      return { value: pagesInPeriod * 3, target: g.targetValue, unit: "min" };
    case "finanze_check":
      return { value: txs, target: g.targetValue, unit: "" };
    case "trade_log":
      return { value: trades, target: g.targetValue, unit: "" };
    case "allenamento":
      return { value: workouts, target: g.targetValue, unit: "" };
    case "disciplina_ok":
      return { value: null, target: g.targetValue, unit: "" };
  }
}

// ------------------------------------------------------------
// Scadenza — badge urgenza
// ------------------------------------------------------------
function deadlineInfo(today: string, deadline: string, met: boolean) {
  const t = new Date(today + "T00:00:00").getTime();
  const d = new Date(deadline + "T00:00:00").getTime();
  const dl = Math.round((d - t) / 86400000);
  const passed = dl < 0;
  const short = `${Number(deadline.slice(8, 10))}/${String(Number(deadline.slice(5, 7))).padStart(2, "0")}`;
  const tone: "danger" | "warning" | "default" = passed
    ? met
      ? "default"
      : "danger"
    : dl <= 3
      ? "warning"
      : "default";
  const text = passed ? (met ? `scaduta · fatto` : "scaduta") : dl === 0 ? "scade oggi" : dl <= 3 ? `tra ${dl} gg` : `scad. ${short}`;
  return { tone, text };
}

function DeadlineBadge({ today, deadline, met }: { today: string; deadline: string; met: boolean }) {
  const { tone, text } = deadlineInfo(today, deadline, met);
  return (
    <Badge tone={tone} className="shrink-0">
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M8 3v4M16 3v4M3 10h18" />
      </svg>
      {text}
    </Badge>
  );
}

// ------------------------------------------------------------
// Card principale
// ------------------------------------------------------------
export function GoalsOverviewCard({ db }: { db: DB }) {
  const today = todayKey(db.settings.timezone);
  const asc = ascordDay(db, today);

  const { daily, weekly } = useMemo(
    () => ({
      daily: db.dailyGoals.filter((g) => g.active),
      weekly: db.weeklyGoals.filter((g) => g.active),
    }),
    [db]
  );

  const total = daily.length + weekly.length;

  return (
    <Card hairline="accent" texture className="flex flex-col gap-3">
      <CardHeader>
        <div>
          <CardTitle>Obiettivi</CardTitle>
          <CardSubtitle>
            {total > 0
              ? `${daily.length} quotidiani · ${weekly.length} settimanali/mensili`
              : "Nessun obiettivo attivo"}
          </CardSubtitle>
        </div>
        <Link
          href="/obiettivi"
          className="shrink-0 text-xs font-medium text-secondary-text transition-colors hover:text-accent"
        >
          Gestisci →
        </Link>
      </CardHeader>

      {total === 0 ? (
        <EmptyState
          icon="🎯"
          title="Nessun obiettivo attivo"
          description="Definisci i tuoi obiettivi nella sezione Obiettivi: appariranno qui subito, con lo stato di oggi."
        />
      ) : (
        <ul className="space-y-2">
          {/* Daily goals — stato di oggi */}
          {daily.map((g: DailyGoal) => {
            const res = asc.byGoal[g.id];
            const met = res?.met ?? false;
            const value = res?.value ?? 0;
            const target = res?.target ?? g.targetValue;
            return (
              <li
                key={g.id}
                className="rounded-xl border border-border bg-elevated/40 p-2.5 transition-colors hover:border-accent/40"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold transition-all duration-300",
                      met
                        ? "bg-success text-[#0b0b0c] shadow-[0_0_12px_-2px_rgba(45,223,158,0.6)]"
                        : "border border-border-strong bg-elevated text-transparent"
                    )}
                  >
                    ✓
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                      <span className="truncate">{GOAL_LABELS[g.type] ?? g.type}</span>
                      <Badge tone="info" className="shrink-0">daily</Badge>
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-[11px] font-semibold tnum",
                      met ? "text-success" : "text-muted-foreground"
                    )}
                  >
                    {met ? "✓ fatto" : target > 0 ? `${value}/${target}` : "da fare"}
                  </span>
                </div>
                {g.deadline && (
                  <div className="mt-1.5 flex justify-end">
                    <DeadlineBadge today={today} deadline={g.deadline} met={met} />
                  </div>
                )}
              </li>
            );
          })}

          {/* Weekly goals — progress bar */}
          {weekly.map((g: WeeklyGoal) => {
            const prog = weeklyProgress(db, g);
            const met =
              prog.value !== null && prog.target > 0 ? prog.value >= prog.target : false;
            const pct =
              prog.value !== null ? Math.min(100, (prog.value / (prog.target || 1)) * 100) : 0;
            return (
              <li
                key={g.id}
                className="rounded-xl border border-border bg-elevated/40 p-2.5 transition-colors hover:border-accent/40"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold transition-all duration-300",
                      met
                        ? "bg-success text-[#0b0b0c] shadow-[0_0_12px_-2px_rgba(45,223,158,0.6)]"
                        : "border border-border-strong bg-elevated text-transparent"
                    )}
                  >
                    ✓
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                      <span className="truncate">
                        {WEEKLY_GOAL_LABELS[g.type] ?? GOAL_LABELS[g.type as keyof typeof GOAL_LABELS] ?? g.type}
                      </span>
                      <Badge className="shrink-0">
                        {g.period === "week" ? "weekly" : "mensile"}
                      </Badge>
                    </p>
                  </div>
                  {prog.value !== null && (
                    <span className="shrink-0 text-[11px] tnum text-secondary-text">
                      {prog.value}
                      {prog.unit} / {prog.target}
                      {prog.unit}
                    </span>
                  )}
                </div>
                {(prog.value !== null || g.deadline) && (
                  <div className="mt-2 space-y-1.5">
                    {prog.value !== null && (
                      <ProgressBar
                        value={prog.value}
                        max={Math.max(1, prog.target)}
                        tone={met ? "success" : "accent"}
                        className="h-1.5"
                      />
                    )}
                    {g.deadline && (
                      <div className="flex justify-end">
                        <DeadlineBadge today={today} deadline={g.deadline} met={met} />
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
