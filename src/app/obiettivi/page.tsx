"use client";

// ============================================================
// ASCEND — Obiettivi (Progressione, spec 4.1 + 5)
// Separazione formale:
//   DailyGoal  → gate dell'Ascend Day (ascordDay, met/non met di OGGI)
//   WeeklyGoal → alimentano le progress bar/viste (settimana o mese)
// **Non** è mai ammessa una logica ibrida: qui sono due liste distinte.
// ============================================================

import React, { useEffect, useState } from "react";
import { useDB, updateDB, uid, removeById } from "@/lib/storage";
import { ascordDay, GOAL_LABELS, pcMinutesInWeek, workoutsInWeek } from "@/lib/compute";
import {
  todayKey,
  weekStartKey,
  addDaysKey,
  monthRange,
  isoToDayKey,
} from "@/lib/dates";
import type { DB, DailyGoal, WeeklyGoal, GoalType } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Toggle, ProgressBar, EmptyState, SectionHeader } from "@/components/ui/Misc";
import { Badge, StatusDot } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Input, Select } from "@/components/ui/Field";

// ------------------------------------------------------------
// Costanti locali
// ------------------------------------------------------------

const DAILY_OPTIONS = Object.entries(GOAL_LABELS) as [GoalType, string][];

type WeeklyGoalType = WeeklyGoal["type"];

const WEEKLY_OPTIONS: [WeeklyGoalType, string][] = [
  ...(Object.entries(GOAL_LABELS) as [GoalType, string][]),
  ["workout_count", "Allenamenti (n.)"],
  ["book_pages", "Pagine lette"],
  ["pc_hours", "Ore PC"],
];

const PERIOD_OPTIONS: [WeeklyGoal["period"], string][] = [
  ["week", "Settimana"],
  ["month", "Mese"],
];

const GREEN = "#22c55e"; // met (dot)
const GRAY = "#52525b"; // non met / spento (dot)

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

interface PeriodProgress {
  value: number | null; // null = non misurabile
  target: number;
  unit: string;
}

/** Progresso corrente di un WeeklyGoal attivo, per il periodo scelto (settimana/mese). */
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

  // — Raccolta dati per il periodo —
  let pcMin: number;
  if (g.period === "week") pcMin = pcMinutesInWeek(db, start, db.settings.weekStart);
  else pcMin = db.pcUsageLogs.filter((p) => inRange(p.date)).reduce((s, p) => s + p.minutes, 0);

  let workouts: number;
  if (g.period === "week") workouts = workoutsInWeek(db, start);
  else workouts = db.workouts.filter((w) => inRange(w.date)).length;

  const txs = db.transactions.filter((t) => inRange(t.date)).length;
  const trades = db.trades.filter((t) => inRange(isoToDayKey(t.closeDate, tz))).length;

  // minuti di lettura nel periodo (stima: 1 pagina ≈ 3 min), coerentemente con ascordDay
  const ps = new Date(start + "T00:00:00");
  const pe = new Date(end + "T23:59:59");
  let pagesInPeriod = 0;
  db.books.forEach((b) => {
    const u = new Date(b.updatedAt);
    if (u >= ps && u <= pe) pagesInPeriod += b.pagesRead;
  });
  // pagine totali lette nei libri attualmente in corso
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
// Editor inline per valore numerico (commit a blur/Enter)
// ------------------------------------------------------------

function NumEditor({
  value,
  onCommit,
  min = 0,
  className,
}: {
  value: number;
  onCommit: (v: number) => void;
  min?: number;
  className?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Number(draft);
    const v = Number.isFinite(n) && n >= min ? n : value;
    setDraft(String(v));
    if (v !== value) onCommit(v);
  };
  return (
    <Input
      type="number"
      inputMode="decimal"
      step="any"
      min={min}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
      className={`w-24 text-right tnum ${className ?? ""}`}
    />
  );
}

// ------------------------------------------------------------
// Riga DailyGoal (gate Ascend Day)
// ------------------------------------------------------------

function DailyGoalRow({
  goal,
  todayRes,
  today,
}: {
  goal: DailyGoal;
  todayRes: ReturnType<typeof ascordDay>;
  today: string;
}) {
  const [confirmDel, setConfirmDel] = useState(false);

  const patchGoal = (patch: Partial<DailyGoal>) =>
    updateDB((d) => ({
      ...d,
      dailyGoals: d.dailyGoals.map((g) => (g.id === goal.id ? { ...g, ...patch } : g)),
    }));

  const deleteGoal = () =>
    updateDB((d) => ({ ...d, dailyGoals: removeById(d.dailyGoals, goal.id) }));

  const res = goal.active ? todayRes.byGoal[goal.id] : undefined;
  const met = goal.active ? (res?.met ?? false) : false;
  const value = res?.value ?? 0;
  const target = res?.target ?? goal.targetValue;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-muted/50 p-3">
      <StatusDot color={goal.active ? (met ? GREEN : GRAY) : GRAY} />
      <Select
        value={goal.type}
        onChange={(e) => patchGoal({ type: e.target.value as GoalType })}
        className="w-44"
        aria-label="Tipo"
      >
        {DAILY_OPTIONS.map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </Select>

      <NumEditor value={goal.targetValue} onCommit={(v) => patchGoal({ targetValue: v })} />
      {goal.targetValue === 0 ? (
        <Badge tone="info">presenza</Badge>
      ) : (
        <span className="text-[11px] text-muted-foreground">soglia</span>
      )}

      <Toggle checked={goal.active} onChange={(v) => patchGoal({ active: v })} label="Attivo" />

      {goal.active ? (
        <span
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
          title={`Oggi (${today}): ${value}/${target}`}
        >
          <StatusDot color={met ? GREEN : GRAY} />
          oggi {met ? "fatto" : "mancante"}
          {target > 0 && <span className="tnum">· {value}/{target}</span>}
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <StatusDot color={GRAY} /> spento
        </span>
      )}

      <Button variant="ghost" size="icon" onClick={() => setConfirmDel(true)} aria-label="Elimina">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
        </svg>
      </Button>

      <ConfirmDialog
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        onConfirm={() => {
          deleteGoal();
          setConfirmDel(false);
        }}
        title="Eliminare l'obiettivo?"
        message="Questa azione non può essere annullata."
      />
    </div>
  );
}

// ------------------------------------------------------------
// Riga WeeklyGoal (progress bar / viste)
// ------------------------------------------------------------

function WeeklyGoalRow({ goal }: { goal: WeeklyGoal }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const db = useDB();

  const patchGoal = (patch: Partial<WeeklyGoal>) =>
    updateDB((d) => ({
      ...d,
      weeklyGoals: d.weeklyGoals.map((g) => (g.id === goal.id ? { ...g, ...patch } : g)),
    }));

  const deleteGoal = () =>
    updateDB((d) => ({ ...d, weeklyGoals: removeById(d.weeklyGoals, goal.id) }));

  const prog = goal.active ? weeklyProgress(db, goal) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-muted/50 p-3">
      <Select
        value={goal.type}
        onChange={(e) => patchGoal({ type: e.target.value as WeeklyGoalType })}
        className="w-44"
        aria-label="Tipo"
      >
        {WEEKLY_OPTIONS.map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </Select>

      <NumEditor value={goal.targetValue} onCommit={(v) => patchGoal({ targetValue: v })} />

      <Select
        value={goal.period}
        onChange={(e) => patchGoal({ period: e.target.value as WeeklyGoal["period"] })}
        className="w-32"
        aria-label="Periodo"
      >
        {PERIOD_OPTIONS.map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </Select>

      <Toggle checked={goal.active} onChange={(v) => patchGoal({ active: v })} label="Attivo" />

      {goal.active && prog ? (
        <div className="flex min-w-[150px] flex-1 items-center gap-2">
          <ProgressBar
            className="h-1.5 min-w-[80px] flex-1"
            value={prog.value ?? 0}
            max={Math.max(1, prog.target)}
          />
          <span className="text-xs tnum text-secondary-text">
            {prog.value === null ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <>
                {prog.value}/{prog.target} {prog.unit}
              </>
            )}
          </span>
        </div>
      ) : (
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <StatusDot color={GRAY} /> spento
        </span>
      )}

      <Button variant="ghost" size="icon" onClick={() => setConfirmDel(true)} aria-label="Elimina">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
        </svg>
      </Button>

      <ConfirmDialog
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        onConfirm={() => {
          deleteGoal();
          setConfirmDel(false);
        }}
        title="Eliminare l'obiettivo?"
        message="Questa azione non può essere annullata."
      />
    </div>
  );
}

// ------------------------------------------------------------
// Pagina
// ------------------------------------------------------------

export default function ObiettiviPage() {
  const db = useDB();
  const today = todayKey(db.settings.timezone);
  const todayRes = ascordDay(db, today);

  const addDaily = () =>
    updateDB((d) => ({
      ...d,
      dailyGoals: [
        ...d.dailyGoals,
        { id: uid(), type: "finanze_check" as GoalType, targetValue: 0, active: true },
      ],
    }));

  const addWeekly = () =>
    updateDB((d) => ({
      ...d,
      weeklyGoals: [
        ...d.weeklyGoals,
        { id: uid(), type: "workout_count" as WeeklyGoalType, targetValue: 1, period: "week" as const, active: true },
      ],
    }));

  const hasAny = db.dailyGoals.length > 0 || db.weeklyGoals.length > 0;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Obiettivi"
        subtitle="Gate giornalieri (Ascend Day) e obiettivi di periodo con progresso in tempo reale."
      />

      {/* Spiegazione — separazione formale Daily/Weekly */}
      <div className="rounded-xl border border-accent/25 bg-accent/10 px-4 py-3 text-sm text-accent">
        DailyGoal gate-ano l&apos;Ascend Day; i WeeklyGoal alimentano le progress bar. Non sono
        intercambiabili.
      </div>

      {!hasAny ? (
        <EmptyState
          icon="🎯"
          title="Nessun obiettivo: aggiungine uno o completa l'onboarding"
          description="I DailyGoal decidono se vinci l'Ascend Day ogni giorno; i WeeklyGoal tracciano il progresso su settimana o mese."
          action={
            <div className="flex gap-2">
              <Button onClick={addDaily}>Aggiungi goal giornaliero</Button>
              <Button variant="outline" onClick={addWeekly}>
                Aggiungi goal settimanale
              </Button>
            </div>
          }
        />
      ) : (
        <div className="space-y-6">
          {/* — DailyGoal (gate Ascend Day) — */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Goal giornalieri</CardTitle>
                <CardSubtitle>
                  Gate dell&apos;Ascend Day: tutti gli attivi devono essere rispettati oggi.
                  {db.dailyGoals.filter((g) => g.active).length > 0 && (
                    <>
                      {" "}
                      — oggi {todayRes.done}/{todayRes.total} raggiunti.
                    </>
                  )}
                </CardSubtitle>
              </div>
              <Button onClick={addDaily} size="sm">
                + Aggiungi goal giornaliero
              </Button>
            </CardHeader>

            {db.dailyGoals.length === 0 ? (
              <EmptyState
                icon="🎯"
                title="Nessun obiettivo: aggiungine uno o completa l'onboarding"
              />
            ) : (
              <div className="space-y-2">
                {db.dailyGoals.map((g) => (
                  <DailyGoalRow key={g.id} goal={g} todayRes={todayRes} today={today} />
                ))}
              </div>
            )}
          </Card>

          {/* — WeeklyGoal (progress bar / viste) — */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Obiettivi di periodo</CardTitle>
                <CardSubtitle>
                  Alimentano le progress bar: settimana o mese, il progresso è calcolato live dai
                  tuoi dati.
                </CardSubtitle>
              </div>
              <Button onClick={addWeekly} size="sm">
                + Aggiungi obiettivo
              </Button>
            </CardHeader>

            {db.weeklyGoals.length === 0 ? (
              <EmptyState
                icon="📊"
                title="Nessun obiettivo: aggiungine uno o completa l'onboarding"
              />
            ) : (
              <div className="space-y-2">
                {db.weeklyGoals.map((g) => (
                  <WeeklyGoalRow key={g.id} goal={g} />
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
