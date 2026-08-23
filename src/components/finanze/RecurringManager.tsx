"use client";

// ============================================================
// ASCEND — Finanze · Gestione transazioni ricorrenti
// Regole mensili (affitto, abbonamenti...) che generano
// automaticamente la transazione il giorno prefissato.
// ============================================================

import { useMemo, useState } from "react";
import { useDB, updateDB, uid, nowISO } from "@/lib/storage";
import type { RecurringRule, TransactionType } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Select } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export function RecurringManager() {
  const db = useDB();
  const base = db.settings.baseCurrency;
  const rules = db.recurringRules ?? [];
  const categories = db.categories.filter((c) => c.type === "expense" || c.type === "income");

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<TransactionType>("expense");
  const [categoryId, setCategoryId] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("1");

  function reset() {
    setEditId(null);
    setName("");
    setAmount("");
    setType("expense");
    setCategoryId("");
    setDayOfMonth("1");
  }

  function saveRule() {
    const amt = Number(amount);
    if (!name.trim() || !amt || amt <= 0 || !categoryId) return;
    const day = Math.max(1, Math.min(28, Number(dayOfMonth) || 1));
    updateDB((d) => {
      if (editId) {
        return {
          ...d,
          recurringRules: d.recurringRules.map((r) =>
            r.id === editId
              ? {
                  ...r,
                  name: name.trim(),
                  amount: amt,
                  type,
                  categoryId,
                  dayOfMonth: day,
                }
              : r
          ),
        };
      }
      const rule: RecurringRule = {
        id: uid(),
        name: name.trim(),
        amount: amt,
        currency: base,
        exchangeRate: 1,
        type,
        categoryId,
        dayOfMonth: day,
        active: true,
        lastAppliedMonth: null,
        createdAt: nowISO(),
      };
      return { ...d, recurringRules: [...(d.recurringRules ?? []), rule] };
    });
    reset();
    setOpen(false);
  }

  function toggleActive(r: RecurringRule) {
    updateDB((d) => ({
      ...d,
      recurringRules: d.recurringRules.map((x) => (x.id === r.id ? { ...x, active: !x.active } : x)),
    }));
  }

  function del(r: RecurringRule) {
    updateDB((d) => ({ ...d, recurringRules: d.recurringRules.filter((x) => x.id !== r.id) }));
  }

  const catName = useMemo(
    () => Object.fromEntries(db.categories.map((c) => [c.id, c.name])),
    [db.categories]
  );

  const monthlyTotal = rules
    .filter((r) => r.active)
    .reduce((s, r) => s + r.amount * r.exchangeRate * (r.type === "expense" ? -1 : 1), 0);

  return (
    <>
      <Card hairline="accent">
        <CardHeader>
          <div>
            <CardTitle>Ricorrenti</CardTitle>
            <CardSubtitle>
              {rules.length === 0
                ? "Affitto, abbonamenti... generati automaticamente ogni mese"
                : `${rules.filter((r) => r.active).length} attive · bilancio mensile ${monthlyTotal >= 0 ? "+" : ""}${monthlyTotal.toFixed(2)} ${base}`}
            </CardSubtitle>
          </div>
          <Button
            size="sm"
            onClick={() => {
              reset();
              setOpen(true);
            }}
          >
            + Nuova regola
          </Button>
        </CardHeader>

        {rules.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong px-3 py-6 text-center text-xs text-muted-foreground">
            Nessuna regola. Creane una e la transazione verrà registrata da sola ogni mese.
          </p>
        ) : (
          <div className="space-y-1">
            {rules.map((r) => (
              <div
                key={r.id}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm",
                  !r.active && "opacity-50"
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Icon
                    name={r.type === "income" ? "arrow-up" : "arrow-down"}
                    size={13}
                    className={r.type === "income" ? "text-success" : "text-danger"}
                  />
                  <span className="truncate font-medium">{r.name}</span>
                  <Badge tone="default">{catName[r.categoryId] ?? "?"}</Badge>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={cn("tnum font-medium", r.type === "income" ? "text-success" : "text-danger")}>
                    {r.type === "income" ? "+" : "−"}
                    {(r.amount * r.exchangeRate).toFixed(2)} {base}
                  </span>
                  <span className="tnum text-[11px] text-muted-foreground">giorno {r.dayOfMonth}</span>
                  <button
                    onClick={() => toggleActive(r)}
                    title={r.active ? "Sospendi" : "Riattiva"}
                    aria-label={r.active ? "Sospendi regola" : "Riattiva regola"}
                    className={cn(
                      "transition-colors",
                      r.active ? "text-success hover:text-danger" : "text-muted-foreground hover:text-accent"
                    )}
                  >
                    <Icon name={r.active ? "check" : "x"} size={14} />
                  </button>
                  <button
                    onClick={() => {
                      setEditId(r.id);
                      setName(r.name);
                      setAmount(String(r.amount));
                      setType(r.type);
                      setCategoryId(r.categoryId);
                      setDayOfMonth(String(r.dayOfMonth));
                      setOpen(true);
                    }}
                    aria-label="Modifica"
                    className="text-muted-foreground transition-colors hover:text-accent"
                  >
                    <Icon name="pencil" size={13} />
                  </button>
                  <button
                    onClick={() => del(r)}
                    aria-label="Elimina"
                    className="text-muted-foreground transition-colors hover:text-danger"
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Modal crea/modifica */}
      <Modal open={open} onClose={() => setOpen(false)} title={editId ? "Modifica regola" : "Nuova regola ricorrente"} width="max-w-md">
        <div className="space-y-3">
          <Field label="Nome">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="es. Affitto, Netflix" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Importo (${base})`}>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="Giorno del mese">
              <Select value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)}>
                {Array.from({ length: 28 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Tipo">
            <Select value={type} onChange={(e) => setType(e.target.value as TransactionType)}>
              <option value="expense">Uscita</option>
              <option value="income">Entrata</option>
            </Select>
          </Field>
          <Field label="Categoria">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">— scegli —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <p className="rounded-lg border border-accent/25 bg-accent/5 p-2 text-[11px] leading-relaxed text-muted-foreground">
            La transazione viene creata automaticamente quando apri l&apos;app nel giorno scelto
            (o nei giorni successivi se non entri). Una sola per mese, mai doppioni.
          </p>
          <div className="flex items-center justify-between pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annulla
            </Button>
            <Button onClick={saveRule} disabled={!name.trim() || !Number(amount)} glow>
              {editId ? "Salva modifiche" : "Crea regola"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}