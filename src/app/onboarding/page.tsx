"use client";

// ============================================================
// ASCEND — Onboarding · wizard centrato (v2 rich)
// Card grande con hairline accent, step dots animati,
// CTA "Inizia" con gradiente animato.
// ============================================================

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDB, updateDB, uid, nowISO } from "@/lib/storage";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { GoalType } from "@/lib/types";
import { StepWelcome } from "@/components/onboarding/StepWelcome";
import { StepGoals, DEFAULT_GOALS, type GoalDef } from "@/components/onboarding/StepGoals";
import { StepConfirm } from "@/components/onboarding/StepConfirm";
import { Icon } from "@/components/ui/Icon";

const STEPS = ["Benvenuto", "Obiettivi", "Conferma"];

export default function OnboardingPage() {
  const db = useDB();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [goals, setGoals] = useState<GoalDef[]>(DEFAULT_GOALS);

  // Primo accesso? Se l'onboarding è già completato non stiamo qui.
  useEffect(() => {
    if (db.settings.onboardingDone) router.replace("/");
  }, [db.settings.onboardingDone, router]);

  if (db.settings.onboardingDone) return null;

  const toggleGoal = (type: GoalType, active: boolean) =>
    setGoals((gs) => gs.map((g) => (g.type === type ? { ...g, active } : g)));

  const setTarget = (type: GoalType, target: number) =>
    setGoals((gs) => gs.map((g) => (g.type === type ? { ...g, target } : g)));

  const finish = () => {
    const activeGoals = goals.filter((g) => g.active);
    updateDB((d) => {
      const activeTypes = new Set<GoalType>(activeGoals.map((g) => g.type));
      return {
        ...d,
        settings: { ...d.settings, onboardingDone: true, updatedAt: nowISO() },
        dailyGoals: [
          // neutralizza eventuali goal pregressi di tipo tra quelli attivi (idempotente)
          ...d.dailyGoals.filter((g) => !activeTypes.has(g.type)),
          ...activeGoals.map((g) => ({
            id: uid(),
            type: g.type,
            targetValue: g.target,
            active: true,
          })),
        ],
      };
    });
    router.replace("/");
  };

  return (
    <div className="relative mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-2xl flex-col justify-center py-6">
      {/* bagliore decorativo dietro la card */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-[110px]" />

      <Card hairline="accent" scan className="animate-rise overflow-hidden p-6 sm:p-8">
        {/* Indicatore di avanzamento — dots animati + connettori */}
        <div
          className="mb-8 flex items-center justify-center gap-2 sm:gap-3"
          aria-label={`Passo ${step + 1} di ${STEPS.length}`}
        >
          {STEPS.map((label, i) => (
            <Fragment key={label}>
              {i > 0 && (
                <span
                  className={cn(
                    "h-px w-8 transition-colors duration-500 sm:w-14",
                    i <= step ? "bg-accent/60" : "bg-border-strong"
                  )}
                />
              )}
              <div className="flex flex-col items-center gap-1.5">
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-semibold transition-[background-color,border-color,color,transform] duration-500",
                    i < step
                      ? "border-accent bg-accent text-white"
                      : i === step
                        ? "animate-glow scale-125 border-accent bg-accent-dim text-accent"
                        : "border-border-strong bg-elevated text-muted-foreground"
                  )}
                >
                  {i < step ? (
                    <Icon name="check" size={10} strokeWidth={2.5} className="text-white" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span
                  className={cn(
                    "text-[10px] font-medium uppercase tracking-wider transition-colors duration-300",
                    i === step ? "text-accent" : "text-muted-foreground"
                  )}
                >
                  {label}
                </span>
              </div>
            </Fragment>
          ))}
        </div>

        {/* Contenuto step — re-anima a ogni cambio */}
        <div key={step} className="animate-rise">
          {step === 0 && <StepWelcome />}
          {step === 1 && <StepGoals goals={goals} onToggle={toggleGoal} onTarget={setTarget} />}
          {step === 2 && <StepConfirm goals={goals} />}
        </div>

        <div className="mt-8 flex items-center gap-3">
          {step > 0 && (
            <Button variant="ghost" size="md" onClick={() => setStep((s) => Math.max(0, s - 1))}>
              ← Indietro
            </Button>
          )}
          <div className="flex-1" />
          {step < STEPS.length - 1 ? (
            <Button size="lg" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
              Continua
              <Icon name="arrow-right" size={15} strokeWidth={2.4} />
            </Button>
          ) : (
            <Button size="lg" className="grad-animated" onClick={finish}>
              Inizia
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
