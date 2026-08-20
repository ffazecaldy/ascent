"use client";

// ============================================================
// ASCEND — Obiettivi (Progressione, spec 4.1 + 5) · v2 rich
// Separazione formale:
//   DailyGoal  → gate dell'Ascend Day (ascordDay, met/non met di OGGI)
//   WeeklyGoal → alimentano le progress bar/viste (settimana o mese)
// **Non** è mai ammessa una logica ibrida: qui sono due liste distinte.
// ============================================================

import { useEffect, useState } from "react";
import { useDB, updateDB, uid, removeById } from "@/lib/storage";
import {
  ascordDay,
  GOAL_LABELS,
  pcMinutesInWeek,
  workoutsInWeek,
  upcomingDeadlines,
} from "@/lib/compute";
import type { DeadlineItem } from "@/lib/compute";
import {
  todayKey,
  weekStartKey,
  addDaysKey,
  monthRange,
  isoToDayKey,
} from "@/lib/dates";
import type { DB, DailyGoal, WeeklyGoal, GoalType } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProgressBar, EmptyState, SectionHeader } from "@/components/ui/Misc";
import { Badge, StatusDot } from "@/components/ui/Badge";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Input, Select, Field } from "@/components/ui/Field";
import { Reveal } from "@/components/ui/Reveal";

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

const WEEKLY_ICONS: Record<WeeklyGoalType, string> = {
  finanze_check: "💶",
  trade_log: "🕹️",
  lettura_minuti: "📚",
  allenamento: "💪",
  ore_produttive: "💻",
  disciplina_ok: "📋",
  workout_count: "🏋️",
  book_pages: "📖",
  pc_hours: "💻",
};

const GRAY = "#52525b"; // non met / spento (dot)

// ------------------------------------------------------------
// Toggle curato (con glow quando attivo) — locale alla pagina
// ------------------------------------------------------------

function GoalToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="group flex items-center gap-2"
    >
      <span
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-[background-color,border-color,box-shadow] duration-300",
          checked
            ? "bg-gradient-to-r from-accent to-accent-2 shadow-[0_0_14px_-2px_var(--accent-glow)]"
            : "border border-border-strong bg-elevated group-hover:border-accent/40"
        )}
      >
        <span
          className={cn(
            "inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-sm transition-transform duration-300",
            checked ? "translate-x-[23px]" : "translate-x-[3px]"
          )}
        />
      </span>
      {label && <span className="text-sm text-secondary-text">{label}</span>}
    </button>
  );
}

// ------------------------------------------------------------
// Status di oggi — pallino verde (fatto) / grigio (mancante/spento)
// ------------------------------------------------------------

function TodayDot({ met, active }: { met: boolean; active: boolean }) {
  return (
    <span
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-[background-color,border-color,box-shadow] duration-300",
        active && met
          ? "border-success/50 bg-success/15 shadow-[0_0_16px_-2px_rgba(45,223,158,0.5)]"
          : "border-border-strong bg-elevated"
      )}
    >
      {active && met ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-pulse-dot text-success"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <StatusDot color={active ? GRAY : GRAY} />
      )}
    </span>
  );
}

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
  if (g.period === "week") pcMin = pcMinutesInWeek(db, start);
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
// Scadenza (deadline opzionale) — giorni rimanenti, badge, campo inline
// ------------------------------------------------------------

/** Giorni rimanenti rispetto a oggi (negativo se la scadenza è passata). */
function daysUntil(today: string, deadline: string): number {
  const t = new Date(today + "T00:00:00").getTime();
  const d = new Date(deadline + "T00:00:00").getTime();
  return Math.round((d - t) / 86400000);
}

/** "yyyy-MM-dd" → "12/09" */
function shortDate(deadline: string): string {
  const [, m, d] = deadline.split("-");
  return `${Number(d)}/${String(Number(m)).padStart(2, "0")}`;
}

/** Badge compatto con la scadenza della riga: warning ≤ 3 gg, danger se passata e non fatta. */
function DeadlineBadge({ deadline, today, met }: { deadline: string; today: string; met?: boolean }) {
  const dl = daysUntil(today, deadline);
  const passed = dl < 0;
  const tone = passed ? (met ? "default" : "danger") : dl <= 3 ? "warning" : "default";
  let text: string;
  if (passed) {
    text = `scad. ${shortDate(deadline)}${met ? " · fatto" : ""}`;
  } else if (dl === 0) {
    text = "scade oggi";
  } else if (dl <= 3) {
    text = `tra ${dl} gg`;
  } else {
    text = `scad. ${shortDate(deadline)}`;
  }
  return (
    <Badge tone={tone}>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M8 3v4M16 3v4M3 10h18" />
      </svg>
      {text}
    </Badge>
  );
}

/** Input type=date inline: imposta la scadenza (upsert del goal), bottone ✕ per toglierla. */
function DeadlineField({
  value,
  onCommit,
}: {
  value: string | null | undefined;
  onCommit: (v: string | null) => void;
}) {
  return (
    <span className="flex items-center gap-1">
      <input
        type="date"
        value={value ?? ""}
        onChange={(e) => onCommit(e.target.value || null)}
        aria-label="Scadenza (opzionale)"
        title="Scadenza (opzionale)"
        className="h-7 w-[8.6rem] rounded-lg border border-border-strong bg-muted px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
      />
      {value && (
        <button
          type="button"
          onClick={() => onCommit(null)}
          aria-label="Togli scadenza"
          title="Togli scadenza"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border-strong bg-elevated text-muted-foreground transition-colors hover:border-danger/40 hover:text-danger"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
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
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-card p-3 transition-[border-color,background-color] duration-300",
        goal.active ? "border-accent/25 hover:border-accent/40" : "border-border bg-muted/40"
      )}
    >
      {/* hairline superiore quando attivo */}
      {goal.active && (
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <TodayDot met={met} active={goal.active} />

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
          <Badge tone="info" className="hidden sm:inline-flex">
            presenza
          </Badge>
        ) : (
          <Badge className="hidden sm:inline-flex">soglia</Badge>
        )}

        <div className="ml-auto flex items-center gap-2.5">
          {goal.active ? (
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                met
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-border-strong bg-elevated text-muted-foreground"
              )}
              title={`Oggi (${today}): ${value}/${target}`}
            >
              {met ? (
                <>
                  <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-success" />
                  oggi fatto
                </>
              ) : (
                <>
                  <StatusDot color={GRAY} />
                  oggi mancante
                  {target > 0 && (
                    <span className="tnum opacity-80">
                      · {value}/{target}
                    </span>
                  )}
                </>
              )}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
              <StatusDot color={GRAY} /> spento
            </span>
          )}

          <GoalToggle checked={goal.active} onChange={(v) => patchGoal({ active: v })} label="Attivo" />

          <Button variant="ghost" size="icon" onClick={() => setConfirmDel(true)} aria-label="Elimina" className="text-muted-foreground hover:text-danger">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
            </svg>
          </Button>
        </div>
      </div>

      {/* Scadenza opzionale — input date inline + badge urgenza */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <DeadlineField value={goal.deadline} onCommit={(v) => patchGoal({ deadline: v })} />
        {goal.deadline && <DeadlineBadge deadline={goal.deadline} today={today} met={met} />}
      </div>

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
  const today = todayKey(db.settings.timezone);

  const patchGoal = (patch: Partial<WeeklyGoal>) =>
    updateDB((d) => ({
      ...d,
      weeklyGoals: d.weeklyGoals.map((g) => (g.id === goal.id ? { ...g, ...patch } : g)),
    }));

  const deleteGoal = () =>
    updateDB((d) => ({ ...d, weeklyGoals: removeById(d.weeklyGoals, goal.id) }));

  const prog = goal.active ? weeklyProgress(db, goal) : null;
  const met =
    goal.active && prog !== null && prog.value !== null && prog.target > 0
      ? prog.value >= prog.target
      : false;
  const pct =
    prog && prog.value !== null ? Math.min(100, Math.round((prog.value / (prog.target || 1)) * 100)) : 0;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-card p-3 transition-[border-color,background-color] duration-300",
        goal.active ? "border-accent/25 hover:border-accent/40" : "border-border bg-muted/40"
      )}
    >
      {/* hairline superiore quando attivo */}
      {goal.active && (
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border-strong bg-elevated text-base">
          {WEEKLY_ICONS[goal.type]}
        </span>

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

        <div className="ml-auto flex items-center gap-2.5">
          <GoalToggle checked={goal.active} onChange={(v) => patchGoal({ active: v })} label="Attivo" />
          <Button variant="ghost" size="icon" onClick={() => setConfirmDel(true)} aria-label="Elimina" className="text-muted-foreground hover:text-danger">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
            </svg>
          </Button>
        </div>
      </div>

      {goal.active && prog ? (
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-muted-foreground">
              {goal.period === "week" ? "Questa settimana" : "Questo mese"}
            </span>
            {prog.value === null ? (
              <span className="text-muted-foreground">non misurabile — registra le azioni dalla sezione dedicata</span>
            ) : (
              <span className={cn("tnum font-medium", met ? "text-success" : "text-secondary-text")}>
                {met && <span className="mr-1">✓</span>}
                {prog.value}/{prog.target} {prog.unit}
                {" · "}
                {pct}%
              </span>
            )}
          </div>
          <ProgressBar
            className="h-1.5"
            value={prog.value ?? 0}
            max={Math.max(1, prog.target)}
            tone={met ? "success" : "accent"}
          />
        </div>
      ) : (
        <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <StatusDot color={GRAY} /> spento
        </div>
      )}

      {/* Scadenza opzionale — input date inline + badge urgenza */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <DeadlineField value={goal.deadline} onCommit={(v) => patchGoal({ deadline: v })} />
        {goal.deadline && <DeadlineBadge deadline={goal.deadline} today={today} met={met} />}
      </div>

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
// Riga compatta per la sezione "In scadenza" (upcomingDeadlines)
// ------------------------------------------------------------

function DeadlineRow({ item }: { item: DeadlineItem }) {
  const t: "danger" | "warning" | "accent" =
    item.daysLeft <= 1 ? "danger" : item.daysLeft <= 3 ? "warning" : "accent";
  const fill = Math.min(100, Math.max(14, Math.round(((14 - item.daysLeft) / 14) * 100)));
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2 transition-colors hover:border-border-strong">
      {/* giorni mancanti — numerone tnum */}
      <div
        className={cn(
          "flex h-10 w-14 shrink-0 flex-col items-center justify-center rounded-lg border",
          t === "danger"
            ? "border-danger/30 bg-danger/10"
            : t === "warning"
              ? "border-warning/30 bg-warning/10"
              : "border-accent/30 bg-accent/10"
        )}
      >
        <span
          className={cn(
            "tnum text-xl font-semibold leading-none",
            t === "danger" ? "text-danger" : t === "warning" ? "text-warning" : "text-accent"
          )}
        >
          {item.daysLeft}
        </span>
        <span className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">gg</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[13px] font-medium text-foreground">{item.label}</p>
          <Badge tone={item.kind === "daily" ? "info" : "default"} className="hidden sm:inline-flex">
            {item.kind === "daily" ? "giornaliero" : "settimanale"}
          </Badge>
          <span className="tnum ml-auto shrink-0 text-[11px] text-muted-foreground">
            scad. {shortDate(item.deadline)}
          </span>
        </div>
        {/* barra di urgenza colorata */}
        <div className="mt-1.5">
          <ProgressBar className="h-1.5" value={fill} max={100} tone={t} shimmer={false} />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Form creazione goal — include la scadenza opzionale
// ------------------------------------------------------------

function CreateGoalModal({
  kind,
  open,
  onClose,
}: {
  kind: "daily" | "weekly";
  open: boolean;
  onClose: () => void;
}) {
  const [type, setType] = useState<string>(kind === "daily" ? "finanze_check" : "workout_count");
  const [targetVal, setTargetVal] = useState<string>(kind === "daily" ? "0" : "1");
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [deadline, setDeadline] = useState("");

  const n = Number(targetVal);
  const target = Number.isFinite(n) && n >= 0 ? n : kind === "daily" ? 0 : 1;

  const create = () => {
    const dl = deadline || null;
    if (kind === "daily") {
      updateDB((d) => ({
        ...d,
        dailyGoals: [
          ...d.dailyGoals,
          { id: uid(), type: type as GoalType, targetValue: target, active: true, deadline: dl },
        ],
      }));
    } else {
      updateDB((d) => ({
        ...d,
        weeklyGoals: [
          ...d.weeklyGoals,
          {
            id: uid(),
            type: type as WeeklyGoalType,
            targetValue: target,
            period,
            active: true,
            deadline: dl,
          },
        ],
      }));
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={kind === "daily" ? "Nuovo goal giornaliero" : "Nuovo obiettivo di periodo"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={create}>Crea obiettivo</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Tipo">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {(kind === "daily" ? DAILY_OPTIONS : WEEKLY_OPTIONS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        {kind === "weekly" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Obiettivo">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={targetVal}
                onChange={(e) => setTargetVal(e.target.value)}
              />
            </Field>
            <Field label="Periodo">
              <Select value={period} onChange={(e) => setPeriod(e.target.value as "week" | "month")}>
                {PERIOD_OPTIONS.map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : (
          <Field label="Soglia (0 = presenza)">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={targetVal}
              onChange={(e) => setTargetVal(e.target.value)}
            />
          </Field>
        )}

        <Field label="Scadenza (opzionale)">
          <Input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            title="Scadenza (opzionale)"
          />
        </Field>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------
// Pagina
// ------------------------------------------------------------

export default function ObiettiviPage() {
  const db = useDB();
  const today = todayKey(db.settings.timezone);
  const todayRes = ascordDay(db, today);

  const [createKind, setCreateKind] = useState<"daily" | "weekly" | null>(null);

  const deadlines = upcomingDeadlines(db);
  const hasAny = db.dailyGoals.length > 0 || db.weeklyGoals.length > 0;

  return (
    <div className="space-y-6">
      <SectionHeader
        kicker="Progressione"
        title="Obiettivi"
        subtitle="Gate giornalieri (Ascend Day) e obiettivi di periodo con progresso in tempo reale."
      />

      {/* — In scadenza: obiettivi con deadline (upcomingDeadlines) — */}
      {deadlines.length > 0 && (
        <Reveal>
          <Card hairline="danger" className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-danger/30 bg-danger/10 text-base">
                ⏳
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold tracking-tight text-foreground">In scadenza</p>
                <p className="text-xs text-muted-foreground">
                  {deadlines.length === 1
                    ? "1 obiettivo con scadenza da rispettare"
                    : `${deadlines.length} obiettivi con scadenza da rispettare`}
                  .
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {deadlines.map((d) => (
                <DeadlineRow key={`${d.kind}-${d.id}`} item={d} />
              ))}
            </div>
          </Card>
        </Reveal>
      )}

      {/* Spiegazione — separazione formale Daily/Weekly */}
      <div className="relative overflow-hidden rounded-xl border border-accent/25 bg-accent-dim px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-base">
            🧭
          </span>
          <div className="text-[13px] leading-relaxed text-secondary-text">
            <p className="font-semibold text-foreground">Due livelli, due ruoli.</p>
            I <span className="font-medium text-accent">DailyGoal</span> sono la soglia che decide se
            vinci l&apos;Ascend Day ogni giorno; i{" "}
            <span className="font-medium text-accent">WeeklyGoal</span> alimentano le progress bar su
            settimana o mese. Non sono intercambiabili.
          </div>
        </div>
      </div>

      {!hasAny ? (
        <EmptyState
          icon="🎯"
          title="Nessun obiettivo: aggiungine uno o completa l'onboarding"
          description="I DailyGoal decidono se vinci l'Ascend Day ogni giorno; i WeeklyGoal tracciano il progresso su settimana o mese."
          action={
            <div className="flex gap-2">
              <Button onClick={() => setCreateKind("daily")}>Aggiungi goal giornaliero</Button>
              <Button variant="outline" onClick={() => setCreateKind("weekly")}>
                Aggiungi goal settimanale
              </Button>
            </div>
          }
        />
      ) : (
        <div className="space-y-6">
          {/* — DailyGoal (gate Ascend Day) — */}
          <Reveal>
            <Card hairline="accent">
              <CardHeader>
                <div>
                  <CardTitle>Goal giornalieri</CardTitle>
                  <CardSubtitle>
                    Gate dell&apos;Ascend Day: tutti gli attivi devono essere rispettati oggi.
                  </CardSubtitle>
                </div>
                <div className="flex items-center gap-2">
                  {db.dailyGoals.some((g) => g.active) && (
                    <span className="flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent">
                      <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-accent" />
                      oggi{" "}
                      <span className="tnum">
                        {todayRes.done}/{todayRes.total}
                      </span>
                    </span>
                  )}
                  <Button onClick={() => setCreateKind("daily")} size="sm">
                    + Aggiungi
                  </Button>
                </div>
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
          </Reveal>

          {/* — WeeklyGoal (progress bar / viste) — */}
          <Reveal delay={80}>
            <Card hairline="accent">
              <CardHeader>
                <div>
                  <CardTitle>Obiettivi di periodo</CardTitle>
                  <CardSubtitle>
                    Alimentano le progress bar: settimana o mese, il progresso è calcolato live dai
                    tuoi dati.
                  </CardSubtitle>
                </div>
                <Button onClick={() => setCreateKind("weekly")} size="sm">
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
          </Reveal>
        </div>
      )}

      {/* Form creazione (include la scadenza opzionale) */}
      <CreateGoalModal
        key={createKind ?? "closed"}
        kind={createKind ?? "daily"}
        open={createKind !== null}
        onClose={() => setCreateKind(null)}
      />
    </div>
  );
}
