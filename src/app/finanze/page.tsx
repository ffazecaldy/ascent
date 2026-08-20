"use client";
// ============================================================
// Finanze (spec 4.2) — page owned dal subagent Finanze.
// Form rapido + FX pipeline, categorie inline, vista mese con
// saldo/netto e grafici, tabella transazioni del mese.
// ============================================================

import { useState } from "react";
import { useDB } from "@/lib/storage";
import { todayKey } from "@/lib/dates";
import { SectionHeader } from "@/components/ui/Misc";
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
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TransactionForm />
        </div>
        <div>
          <CategoryManager />
        </div>
      </div>

      <MonthOverview month={month} onMonthChange={setMonth} />
      <TransactionTable month={month} />
    </div>
  );
}
