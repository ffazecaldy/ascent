"use client";
// ============================================================
// ASCEND — Risparmi · Form Obiettivo (crea / modifica)
// Campi: nome, target (valuta base), scadenza (opzionale), attivo.
// Persistenza live via updateDB → upsert su db.savingsGoals.
// ============================================================

import { useEffect, useState } from "react";
import { useDB, updateDB, upsert, uid, nowISO } from "@/lib/storage";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Toggle } from "@/components/ui/Misc";
import type { SavingsGoal } from "@/lib/types";

export function GoalForm({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: SavingsGoal | null;
  onClose: () => void;
}) {
  const db = useDB();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    // Reset/init in microtask: nessun setState sincrono nel corpo dell'effect.
    queueMicrotask(() => {
      if (editing) {
        setName(editing.name);
        setTarget(String(editing.target));
        setDeadline(editing.deadline ?? "");
        setActive(editing.active);
      } else {
        setName("");
        setTarget("");
        setDeadline("");
        setActive(true);
      }
    });
  }, [open, editing]);

  const targetNum = parseFloat(target);
  const canSave = name.trim() !== "" && isFinite(targetNum) && targetNum > 0;

  const save = () => {
    if (!canSave) return;
    const record: SavingsGoal = {
      id: editing?.id ?? uid(),
      name: name.trim(),
      target: Math.round(targetNum * 100) / 100,
      deadline: deadline || null,
      active,
      createdAt: editing?.createdAt ?? nowISO(),
    };
    updateDB((d) => ({ ...d, savingsGoals: upsert(d.savingsGoals, record) }));
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Modifica obiettivo · ${editing.name}` : "Nuovo obiettivo"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={save} disabled={!canSave}>
            {editing ? "Salva" : "Crea obiettivo"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nome" className="sm:col-span-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Es. Fondo emergenza"
            autoFocus
          />
        </Field>
        <Field label={`Obiettivo · in ${db.settings.baseCurrency}`}>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="0.00"
            className="tnum"
          />
        </Field>
        <Field label="Scadenza (opzionale)">
          <Input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </Field>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-muted px-3 py-2.5">
        <div>
          <p className="text-sm text-secondary-text">Obiettivo attivo</p>
          <p className="text-[11px] text-muted-foreground">
            Solo i goal attivi contano per il KPI e la % di completamento.
          </p>
        </div>
        <Toggle checked={active} onChange={setActive} />
      </div>
      {targetNum > 0 && isFinite(targetNum) && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Target totale — {db.settings.baseCurrency} · accumulerai finché lo raggiungi.
        </p>
      )}
    </Modal>
  );
}
