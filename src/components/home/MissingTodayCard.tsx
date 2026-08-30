"use client";

// ============================================================
// ASCEND — Home · "Cosa manca oggi"
// Checklist dinamica dai DailyGoal attivi (missingToday).
// ============================================================

import { useMemo } from "react";
import { missingToday, GOAL_LABELS } from "@/lib/compute";
import type { DB, GoalType } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/Misc";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

function valueText(type: GoalType, value: number, target: number): string {
  if (target <= 0) return value > 0 ? String(value) : "";
  switch (type) {
    case "ore_produttive":
      return `${value}/${target} min`;
    case "lettura_minuti":
      return `${value}/${target} min`;
    case "lettura_pagine":
      return `${value}/${target} pagg.`;
    default:
      return `${value}/${target}`;
  }
}

export function MissingTodayCard({ db }: { db: DB }) {
  // missingToday → ascordDay (scan di transazioni/trade/workout/PC/libri) → memoizzato.
  const items = useMemo(() => missingToday(db), [db]);
  const done = items.filter((i) => i.done).length;

  return (
    <Card className="flex flex-col gap-3">
      <CardHeader>
        <div>
          <CardTitle>Cosa manca oggi</CardTitle>
          <CardSubtitle>
            {items.length > 0
              ? `${done} di ${items.length} completati`
              : "Obiettivi quotidiani"}
          </CardSubtitle>
        </div>
      </CardHeader>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong py-12 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-accent/30 bg-accent/10 shadow-[0_0_28px_-8px_rgba(76,126,255,0.6)]">
            <Icon name="target" size={30} className="text-accent" />
          </div>
          <p className="text-sm font-medium text-secondary-text">Nessun obiettivo quotidiano attivo</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Aggiungi i tuoi DailyGoal nella sezione Obiettivi: qui vedrai cosa resta da fare oggi.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map(({ goal, done: isDone, value, target }) => (
            <li
              key={goal.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-elevated/40 p-2.5"
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                  isDone
                    ? "bg-accent text-white"
                    : "border border-border-strong text-transparent"
                )}
              >
                {isDone && <Icon name="check" size={13} strokeWidth={3} />}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm font-medium",
                    isDone ? "text-muted-foreground line-through" : "text-foreground"
                  )}
                >
                  {GOAL_LABELS[goal.type] ?? goal.type}
                </p>
                {!isDone && target > 0 && (
                  <ProgressBar value={Math.min(value, target)} max={target} className="mt-1.5 h-1.5" />
                )}
              </div>
              <span className="shrink-0 text-xs tnum text-secondary-text">
                {valueText(goal.type, value, target)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
