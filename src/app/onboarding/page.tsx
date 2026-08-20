"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDB, updateDB, uid, nowISO } from "@/lib/storage";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { GoalType } from "@/lib/types";
import { StepWelcome } from "@/components/onboarding/StepWelcome";
import { StepGoals, DEFAULT_GOALS, type GoalDef } from "@/components/onboarding/StepGoals";
import { StepConfirm } from "@/components/onboarding/StepConfirm";

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
    <div className="mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-xl flex-col justify-center py-6">
      <Card className="p-6 sm:p-8">
        {/* Indicatore di avanzamento */}
        <div className="mb-7 flex items-center justify-center gap-2" aria-label={`Passo ${step + 1} di ${STEPS.length}`}>
          {STEPS.map((label, i) => (
            <span
              key={label}
              title={`${label} (${i + 1}/3)`}
              className={cn("h-1 rounded-full transition-all duration-200", i <= step ? "w-8 bg-accent" : "w-4 bg-elevated")}
            />
          ))}
        </div>

        {step === 0 && <StepWelcome />}
        {step === 1 && <StepGoals goals={goals} onToggle={toggleGoal} onTarget={setTarget} />}
        {step === 2 && <StepConfirm goals={goals} />}

        <div className="mt-8 flex items-center gap-3">
          {step > 0 && (
            <Button variant="ghost" size="md" onClick={() => setStep((s) => Math.max(0, s - 1))}>
              Indietro
            </Button>
          )}
          <div className="flex-1" />
          {step < STEPS.length - 1 ? (
            <Button size="lg" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
              Continua
            </Button>
          ) : (
            <Button size="lg" onClick={finish}>
              Inizia
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
