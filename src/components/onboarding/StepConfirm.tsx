"use client";

import type { GoalDef } from "./StepGoals";

export function StepConfirm({ goals }: { goals: GoalDef[] }) {
  const active = goals.filter((g) => g.active);

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full border border-success/40 bg-success/10 shadow-[0_0_30px_-8px_rgba(45,223,158,0.5)]">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-success"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>

      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Tutto pronto</h2>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
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
        <div className="flex max-w-md flex-wrap justify-center gap-2">
          {active.map((g) => (
            <span
              key={g.type}
              className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-xs font-medium text-accent transition-all duration-200 hover:border-accent/50 hover:shadow-[0_0_16px_-6px_var(--accent-glow)]"
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
