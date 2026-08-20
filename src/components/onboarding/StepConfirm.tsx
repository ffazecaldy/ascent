"use client";

import type { GoalDef } from "./StepGoals";

export function StepConfirm({ goals }: { goals: GoalDef[] }) {
  const active = goals.filter((g) => g.active);

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <span className="text-3xl">🎯</span>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Tutto pronto</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          {active.length > 0 ? (
            <>
              Da oggi userai Ascend per tenere fede a{" "}
              <span className="tnum font-semibold text-foreground">
                {active.length} {active.length === 1 ? "impegno" : "impegni"}
              </span>{" "}
              ogni giorno. La streak brucia: non spezzarla.
            </>
          ) : (
            "Nessun impegno attivo per ora — potrai aggiungerli in qualsiasi momento dalla sezione Obiettivi."
          )}
        </p>
      </div>

      {active.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {active.map((g) => (
            <span
              key={g.type}
              className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-xs font-medium text-accent"
            >
              <span>{g.icon}</span>
              <span className="tnum">
                {g.label}
                {g.target > 0 ? ` · ${g.target} min` : ""}
              </span>
            </span>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Puoi sempre modificare target e obiettivi in seguito. Niente è scolpito nella pietra.
      </p>
    </div>
  );
}
