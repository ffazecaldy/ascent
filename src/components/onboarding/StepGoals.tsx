"use client";

import type { GoalType } from "@/lib/types";
import { Toggle } from "@/components/ui/Misc";
import { Field, Select } from "@/components/ui/Field";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

export interface GoalDef {
  type: GoalType;
  label: string;
  description: string;
  icon: string;
  /** Attivo per default all'arrivo nel wizard */
  active: boolean;
  /** 0 = presenza generica ("almeno un'azione"), altrimenti soglia in minuti */
  target: number;
  /** Se presente, il target è regolabile dal Select */
  targetOptions?: number[];
}

/** DailyGoal DEFAULT pre-seedati — lista toggleabile al primo accesso. */
export const DEFAULT_GOALS: GoalDef[] = [
  {
    type: "finanze_check",
    label: "Registrare la finanza",
    description: "Almeno una transazione al giorno: il flusso resta sotto controllo.",
    icon: "💶",
    active: true,
    target: 0,
  },
  {
    type: "trade_log",
    label: "Chiudere un trade",
    description: "Ogni trade chiuso finisce nel log: base dati per le statistiche.",
    icon: "🕹️",
    active: false,
    target: 0,
  },
  {
    type: "lettura_minuti",
    label: "Leggere",
    description: "Minuti di lettura al giorno, contati dal progresso dei libri.",
    icon: "📚",
    active: true,
    target: 15,
    targetOptions: [10, 15, 20, 30, 45, 60],
  },
  {
    type: "allenamento",
    label: "Allenarsi",
    description: "Almeno un workout al giorno: anche 20 minuti contano.",
    icon: "💪",
    active: true,
    target: 0,
  },
  {
    type: "ore_produttive",
    label: "Ore produttive al PC",
    description: "Minuti produttivi tracciati da Uso del PC.",
    icon: "💻",
    active: false,
    target: 120,
    targetOptions: [60, 90, 120, 150, 180, 240],
  },
  {
    type: "disciplina_ok",
    label: "Disciplina nel trading",
    description: "Tutti i trade del giorno eseguiti col setup rispettato.",
    icon: "📋",
    active: false,
    target: 0,
  },
];

export function StepGoals({
  goals,
  onToggle,
  onTarget,
}: {
  goals: GoalDef[];
  onToggle: (type: GoalType, active: boolean) => void;
  onTarget: (type: GoalType, target: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-xl font-semibold tracking-tight">Cosa vuoi rendere obbligatorio ogni giorno?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Attiva gli impegni non negoziabili. Potrai cambiarli in qualsiasi momento.
        </p>
      </div>

      <div className="space-y-2.5">
        {goals.map((g) => {
          const adjustable = g.targetOptions && g.target > 0;
          return (
            <Card
              key={g.type}
              className={cn(
                "overflow-hidden p-4 transition-all duration-300",
                g.active
                  ? "ring-1 ring-accent/40 shadow-[0_0_30px_-10px_var(--accent-glow)]"
                  : "opacity-90 hover:opacity-100"
              )}
            >
              {g.active && (
                <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
              )}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border-strong bg-elevated text-lg">
                    {g.icon}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{g.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{g.description}</p>
                    {!adjustable && (
                      <span
                        className={cn(
                          "mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                          g.target === 0
                            ? "bg-accent/10 text-accent"
                            : "text-muted-foreground"
                        )}
                      >
                        {g.target === 0 ? "Presenza" : `${g.target} min`}
                      </span>
                    )}
                  </div>
                </div>
                {g.active && (
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[10px] text-accent">
                    ✓
                  </span>
                )}
                <Toggle
                  checked={g.active}
                  onChange={(v) => onToggle(g.type, v)}
                  aria-label={`${g.label}: attivo/disattivo`}
                />
              </div>

              {adjustable && g.active && (
                <div className="mt-3 flex items-end justify-end border-t border-border pt-3">
                  <Field label="Target giornaliero" className="w-36">
                    <Select
                      value={g.target}
                      onChange={(e) => onTarget(g.type, Number(e.target.value))}
                      aria-label={`Target per ${g.label}`}
                    >
                      {g.targetOptions!.map((o) => (
                        <option key={o} value={o}>
                          {o} min
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
