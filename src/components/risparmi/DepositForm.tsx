"use client";
// ============================================================
// ASCEND — Risparmi · Form Versamento (crea / modifica)
// Campi: data, importo (valuta base), obiettivo (select opz.),
// nota. goalId vuoto → versamento "generico".
// Persistenza live via updateDB → upsert su db.savingsDeposits.
// ============================================================

import { useEffect, useState } from "react";
import { useDB, updateDB, upsert, uid, nowISO } from "@/lib/storage";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Field, Input, Select, TextArea } from "@/components/ui/Field";
import { formatMoney } from "@/lib/format";
import { todayKey } from "@/lib/dates";
import { moneyMasked, maskMoney } from "@/lib/privacy";
import type { SavingsDeposit } from "@/lib/types";

export function DepositForm({
  open,
  editing,
  defaultGoalId,
  onClose,
}: {
  open: boolean;
  editing: SavingsDeposit | null;
  /** se apertura in modalità "nuovo", obiettivo pre-selezionato (es. da card goal) */
  defaultGoalId?: string;
  onClose: () => void;
}) {
  const db = useDB();
  const base = db.settings.baseCurrency;
  const locale = db.settings.locale;
  const hidden = moneyMasked(db.settings.privacyMode);

  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [goalId, setGoalId] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    // Reset/init in microtask: nessun setState sincrono nel corpo dell'effect.
    queueMicrotask(() => {
      if (editing) {
        setDate(editing.date);
        setAmount(String(editing.amount));
        setGoalId(editing.goalId ?? "");
        setNote(editing.note ?? "");
      } else {
        setDate(todayKey(db.settings.timezone));
        setAmount("");
        setGoalId(defaultGoalId ?? "");
        setNote("");
      }
    });
  }, [open, editing, defaultGoalId, db.settings.timezone]);

  const amountNum = parseFloat(amount);
  const canSave = date !== "" && isFinite(amountNum) && amountNum > 0;

  const selGoal = goalId ? db.savingsGoals.find((g) => g.id === goalId) : undefined;
  // In modalità edit escludo il deposito in modifica: il preview (sotto) lo somma a parte.
  const goalDeposited = goalId
    ? db.savingsDeposits
        .filter((d) => d.goalId === goalId && d.id !== editing?.id)
        .reduce((s, d) => s + d.amount, 0)
    : 0;
  const goalRemaining = selGoal ? Math.max(0, selGoal.target - goalDeposited - (isFinite(amountNum) ? amountNum : 0)) : null;

  const save = () => {
    if (!canSave) return;
    const record: SavingsDeposit = {
      id: editing?.id ?? uid(),
      goalId: goalId || null,
      amount: Math.round(amountNum * 100) / 100,
      date,
      note: note.trim() || undefined,
      createdAt: editing?.createdAt ?? nowISO(),
    };
    updateDB((d) => ({ ...d, savingsDeposits: upsert(d.savingsDeposits, record) }));
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Modifica versamento" : "Nuovo versamento"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={save} disabled={!canSave}>
            {editing ? "Salva" : "Aggiungi versamento"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Data">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={`Importo · in ${base}`}>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="tnum"
          />
        </Field>
        <Field label="Obiettivo (opzionale)" className="sm:col-span-2">
          <Select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
            <option value="">Generico — nessun obiettivo</option>
            {db.savingsGoals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
                {g.active ? "" : " · in pausa"}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nota (opzionale)" className="sm:col-span-2">
          <TextArea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Es. prima tranche investimento"
            className="min-h-0 resize-y"
          />
        </Field>
      </div>

      {selGoal && goalRemaining != null && isFinite(amountNum) && amountNum > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-muted px-3 py-2.5">
          <span className="text-xs text-secondary-text">Versato dopo questo versamento</span>
          <span className="tnum text-xs font-medium text-foreground">
            {hidden ? maskMoney() : formatMoney(goalDeposited + amountNum, base, locale)}
            <span className="mx-1 text-muted-foreground/60">/</span>
            <span className="text-secondary-text">
              {hidden ? maskMoney() : formatMoney(selGoal.target, base, locale)}
            </span>
          </span>
        </div>
      )}
      {selGoal && goalRemaining != null && goalRemaining === 0 && isFinite(amountNum) && amountNum > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-success">
          <Icon name="sparkles" size={14} />
          Con questo versamento l&apos;obiettivo è completo.
        </p>
      )}
    </Modal>
  );
}
