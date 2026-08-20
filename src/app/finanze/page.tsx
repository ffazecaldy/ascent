"use client";
// ============================================================
// Finanze (spec 4.2) — page owned dal subagent Finanze.
// Form rapido + FX pipeline, categorie inline, vista mese con
// saldo/netto e grafici, tabella transazioni del mese.
// ART DIRECTION: blochi rivelati con <Reveal> a stagger.
// ============================================================

import { useState } from "react";
import { useDB } from "@/lib/storage";
import { todayKey } from "@/lib/dates";
import { SectionHeader } from "@/components/ui/Misc";
import { Reveal } from "@/components/ui/Reveal";
import { BalanceOverview } from "@/components/finanze/BalanceOverview";
import { TransactionForm } from "@/components/finanze/TransactionForm";
import { CategoryManager } from "@/components/finanze/CategoryManager";
import { MonthOverview } from "@/components/finanze/MonthOverview";
import { TransactionTable } from "@/components/finanze/TransactionTable";

export default function FinanzePage() {
  const db = useDB();
  const currentMonth = todayKey(db.settings.timezone).slice(0, 7);
  const [month, setMonth] = useState(currentMonth);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Finanze"
        subtitle="Registra transazioni, gestisci categorie e controlla il saldo mensile."
        kicker="Area contabile"
      />

      <Reveal delay={0}>
        <BalanceOverview />
      </Reveal>

      <Reveal delay={0}>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <TransactionForm />
          </div>
          <div>
            <CategoryManager />
          </div>
        </div>
      </Reveal>

      <Reveal delay={120}>
        <MonthOverview month={month} onMonthChange={setMonth} />
      </Reveal>

      <Reveal delay={220}>
        <TransactionTable month={month} />
      </Reveal>
    </div>
  );
}
