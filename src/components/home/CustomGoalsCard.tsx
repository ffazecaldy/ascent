"use client";

// ============================================================
// ASCEND — Home · Obiettivi personalizzati
// Reminder della Home con gli obiettivi DOVUTI OGGI e spunta
// manuale (toggle check per oggi). Derivato da db prop +
// updateDB diretto (nessun useDB nel componente).
// ============================================================

import { useMemo } from "react";
import Link from "next/link";
import { dueToday, checkedOn, streakOf } from "@/lib/custom-goals";
import { todayKey } from "@/lib/dates";
import { updateDB, removeById, uid, nowISO } from "@/lib/storage";
import type { DB, CustomGoal } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Misc";
import { Icon } from "@/components/ui/Icon";
import { StatusDot } from "@/components/ui/Badge";

export function CustomGoalsCard({ db }: { db: DB }) {
  const today = useMemo(() => todayKey(db.settings.timezone), [db.settings.timezone]);
  const items = useMemo(() => dueToday(db), [db]);
  const checks = db.customGoalChecks;

  // righe pre-calcolate per il render (evita .map con setState dentro JSX)
  const rows = useMemo(
    () =>
      items.map((goal) => {
        const isChecked = checkedOn(checks, goal.id, today);
        const streak = streakOf(goal, checks, today);
        return { goal, isChecked, streak };
      }),
    [items, checks, today]
  );

  // obiettivi dovuti oggi che sono stati spuntati oggi
  const done = useMemo(
    () => items.filter((g) => checkedOn(checks, g.id, today)).length,
    [items, checks, today]
  );

  // toggle manuale del check per oggi: aggiunge (uid) o rimuove (removeById)
  const toggleCheck = (goal: CustomGoal) => {
    const existing = checks.find((c) => c.goalId === goal.id && c.date === today);
    if (existing) {
      updateDB((d) => ({
        ...d,
        customGoalChecks: removeById(d.customGoalChecks, existing.id),
      }));
    } else {
      updateDB((d) => ({
        ...d,
        customGoalChecks: [
          ...d.customGoalChecks,
          { id: uid(), goalId: goal.id, date: today, createdAt: nowISO() },
        ],
      }));
    }
  };

  return (
    <Card hairline="accent" className="flex flex-col gap-3">
      <CardHeader>
        <div>
          <CardTitle>Obiettivi personalizzati</CardTitle>
          <CardSubtitle>
            {items.length > 0 ? `${done}/${items.length} di oggi` : "Nessun obiettivo per oggi"}
          </CardSubtitle>
        </div>
        <Link
          href="/obiettivi"
          className="shrink-0 text-xs font-medium text-secondary-text transition-colors hover:text-accent"
        >
          Gestisci →
        </Link>
      </CardHeader>

      {db.customGoals.length === 0 ? (
        <EmptyState
          icon={<Icon name="target" size={34} className="text-accent" />}
          title="Nessun obiettivo personalizzato"
          description="Aggiungi obiettivi ricorrenti (quotidiani, festivi o fissi) e spunta la casella quando li completi."
          action={
            <Link
              href="/obiettivi"
              className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
            >
              <Icon name="plus" size={12} />
              + obiettivo
            </Link>
          }
        />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-center">
          <Icon name="target" size={22} className="text-muted-foreground/60" />
          <p className="text-sm text-secondary-text">Niente da fare oggi</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map(({ goal, isChecked, streak }) => (
            <li
              key={goal.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-elevated/40 p-2.5"
            >
                {/* checkbox grande cliccabile */}
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isChecked}
                  aria-label={isChecked ? "Segna come non fatto" : "Segna come fatto"}
                  onClick={() => toggleCheck(goal)}
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors",
                    isChecked
                      ? "bg-accent text-white"
                      : "border border-border-strong text-transparent hover:border-accent hover:bg-accent/10"
                  )}
                >
                  {isChecked && <Icon name="check" size={13} strokeWidth={3} />}
                </button>

                {/* titolo + eventuale nota */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {goal.color && <StatusDot color={goal.color} />}
                    <p
                      className={cn(
                        "text-sm font-medium",
                        isChecked ? "line-through text-muted-foreground" : "text-foreground"
                      )}
                    >
                      {goal.title}
                    </p>
                  </div>
                  {goal.note && (
                    <p className="mt-0.5 max-w-xs text-[11px] text-muted-foreground line-clamp-2">
                      {goal.note}
                    </p>
                  )}
                </div>

                {/* target unit (a destra) */}
                {goal.target != null && goal.target > 0 && (
                  <span className="shrink-0 text-xs tnum text-secondary-text">
                    {goal.target}{goal.unit ? ` ${goal.unit}` : ""}
                  </span>
                )}

                {/* streak (a fine riga, solo se > 0) */}
                {streak > 0 && (
                  <span className="flex items-center gap-1 shrink-0 text-xs text-secondary-text">
                    <Icon name="target" size={13} />
                    <span className="tnum">{streak}</span>
                  </span>
                )}
              </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
