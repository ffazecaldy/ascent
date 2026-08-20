"use client";
// ============================================================
// ASCEND — Risparmi (spec v3 §4.2 estesa)
// Conto di accumulo progressivo per investimenti futuri.
// - Header kicker "Finanze · Risparmi" + KPI (totale versato,
//   obiettivo attivo, % completata con ProgressBar tone success)
//   con spark savingsSeries.
// - Gestione OBIETTIVI (SavingsGoal): CRUD nome/target/deadline/
//   attivo/elimina, card con anello di progresso, X/Y · %, giorni
//   alla scadenza, payoff "classe" a 100%.
// - Gestione VERSAMENTI (SavingsDeposit): data/importo/obiettivo
//   (select opz.)/nota/elimina — tabella dense tnum con hover,
//   badge obiettivo (vuoto → "generico").
// - Curva di accumulo: savingsSeries → LineChart area accent.
// - Empty state di benvenuto quando tutto è vuoto.
// Tutto live da useDB / savingsTotals / savingsSeries.
// ART-DIRECTION: myfundedbook ricco/animato.
// ============================================================

import { useState } from "react";
import { useDB } from "@/lib/storage";
import { savingsTotals, savingsSeries } from "@/lib/compute";
import { SectionHeader } from "@/components/ui/Misc";
import { Reveal } from "@/components/ui/Reveal";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { SavingsKpi } from "@/components/risparmi/SavingsKpi";
import { GoalManager } from "@/components/risparmi/GoalManager";
import { DepositManager } from "@/components/risparmi/DepositManager";
import { AccumulationChart } from "@/components/risparmi/AccumulationChart";
import { GoalForm } from "@/components/risparmi/GoalForm";
import { DepositForm } from "@/components/risparmi/DepositForm";
import type { SavingsGoal, SavingsDeposit } from "@/lib/types";

type GoalFormState = { mode: "new" } | { mode: "edit"; goal: SavingsGoal } | null;
type DepositFormState =
  | { mode: "new"; goalId?: string }
  | { mode: "edit"; deposit: SavingsDeposit }
  | null;

export default function RisparmiPage() {
  const db = useDB();
  const [goalForm, setGoalForm] = useState<GoalFormState>(null);
  const [depositForm, setDepositForm] = useState<DepositFormState>(null);

  const totals = savingsTotals(db);
  const series = savingsSeries(db);
  const spark = series.map((p) => p.value);

  const isEmpty = db.savingsGoals.length === 0 && db.savingsDeposits.length === 0;

  return (
    <div className="space-y-8">
      <SectionHeader
        kicker="Finanze · Risparmi"
        title="Risparmi"
        subtitle="Conto di accumulo progressivo per i tuoi investimenti futuri."
        action={
          <>
            <Button variant="outline" size="sm" onClick={() => setDepositForm({ mode: "new", goalId: "" })}>
              ＋ Versamento
            </Button>
            <Button size="sm" glow onClick={() => setGoalForm({ mode: "new" })}>
              ＋ Obiettivo
            </Button>
          </>
        }
      />

      {/* Empty state benvenuto: solo quando non c'è proprio nulla */}
      {isEmpty && (
        <Reveal>
          <Card className="flex flex-col items-center gap-3 border-dashed px-6 py-10 text-center" texture>
            <div className="grid h-14 w-14 place-items-center rounded-2xl border border-accent/30 bg-accent/10 shadow-[0_0_28px_-8px_rgba(76,126,255,0.6)]">
              <Icon name="coins" size={32} className="text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Inizia a risparmiare</h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-secondary-text leading-relaxed">
                Definisci un obiettivo di accumulo e versa con costanza: vedrai la tua parabola
                crescere, versamento dopo versamento.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button size="sm" glow onClick={() => setGoalForm({ mode: "new" })}>
                Crea il primo obiettivo
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDepositForm({ mode: "new", goalId: "" })}>
                ＋ Registra un versamento
              </Button>
            </div>
          </Card>
        </Reveal>
      )}

      {/* KPI */}
      <Reveal delay={40}>
        <SavingsKpi totals={totals} spark={spark} />
      </Reveal>

      {/* Obiettivi */}
      <Reveal delay={90}>
        <GoalManager
          onNewGoal={() => setGoalForm({ mode: "new" })}
          onEditGoal={(goal) => setGoalForm({ mode: "edit", goal })}
          onNewDeposit={(goalId) => setDepositForm({ mode: "new", goalId })}
        />
      </Reveal>

      {/* Versamenti */}
      <Reveal delay={140}>
        <DepositManager
          onNew={(goalId) => setDepositForm({ mode: "new", goalId })}
          onEdit={(deposit) => setDepositForm({ mode: "edit", deposit })}
        />
      </Reveal>

      {/* Curva di accumulo */}
      <Reveal delay={190}>
        <AccumulationChart
          series={series}
          onNewDeposit={() => setDepositForm({ mode: "new", goalId: "" })}
        />
      </Reveal>

      {/* Modali */}
      <GoalForm
        open={goalForm != null}
        editing={goalForm && goalForm.mode === "edit" ? goalForm.goal : null}
        onClose={() => setGoalForm(null)}
      />
      <DepositForm
        open={depositForm != null}
        editing={depositForm && depositForm.mode === "edit" ? depositForm.deposit : null}
        defaultGoalId={depositForm && depositForm.mode === "new" ? depositForm.goalId : undefined}
        onClose={() => setDepositForm(null)}
      />
    </div>
  );
}
