"use client";
// ============================================================
// Gestione categorie inline (spec 4.2 §2)
// CRUD minimo su db.categories: upsert (crea/aggiorna) + removeById.
// Stesso dataset usato dalle Impostazioni (agent 18): qui solo un mini-form.
// ============================================================

import { useState } from "react";
import { useDB, updateDB, upsert, removeById, uid } from "@/lib/storage";
import type { Category, TransactionType } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select, Field } from "@/components/ui/Field";
import { ConfirmDialog } from "@/components/ui/Modal";
import { CATEGORY_COLORS } from "./helpers";

const byName = (a: Category, b: Category) => a.name.localeCompare(b.name, "it-IT");

export function CategoryManager() {
  const db = useDB();

  const income = db.categories.filter((c) => c.type === "income").sort(byName);
  const expense = db.categories.filter((c) => c.type === "expense").sort(byName);

  // form
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<TransactionType>("expense");
  const [icon, setIcon] = useState("");
  const [color, setColor] = useState(CATEGORY_COLORS[0]);
  const [err, setErr] = useState<string | null>(null);

  const [toDelete, setToDelete] = useState<Category | null>(null);

  const startNew = () => {
    setEditingId(null);
    setName("");
    setType(db.categories.some((c) => c.type === "income") ? "expense" : "income");
    setIcon("");
    setColor(CATEGORY_COLORS[CATEGORY_COLORS.length - 1]);
    setErr(null);
    setOpen(true);
  };

  const startEdit = (c: Category) => {
    setEditingId(c.id);
    setName(c.name);
    setType(c.type);
    setIcon(c.icon);
    setColor(c.color);
    setErr(null);
    setOpen(true);
  };

  const save = () => {
    if (!name.trim()) {
      setErr("Dai un nome alla categoria.");
      return;
    }
    const cat: Category = {
      id: editingId ?? uid(),
      name: name.trim(),
      type,
      icon: icon.trim() || "🏷️",
      color: color || CATEGORY_COLORS[0],
    };
    updateDB((d) => ({ ...d, categories: upsert(d.categories, cat) }));
    setOpen(false);
    setEditingId(null);
  };

  const confirmDelete = () => {
    if (!toDelete) return;
    updateDB((d) => ({ ...d, categories: removeById(d.categories, toDelete.id) }));
    setToDelete(null);
  };

  const usedBy = (id: string) =>
    db.transactions.filter((t) => t.categoryId === id).length;

  const renderList = (items: Category[]) => (
    <div className="space-y-1">
      {items.map((c) => (
        <div
          key={c.id}
          className="flex items-center gap-2 rounded-lg border border-border bg-muted px-2.5 py-2"
        >
          <span className="text-base leading-none">{c.icon}</span>
          <span className="min-w-0 flex-1 truncate text-sm text-secondary-text">{c.name}</span>
          {usedBy(c.id) > 0 && (
            <span className="tnum text-[11px] text-muted-foreground">{usedBy(c.id)}×</span>
          )}
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
          <button
            onClick={() => startEdit(c)}
            className="rounded p-1 text-muted-foreground hover:bg-elevated hover:text-foreground"
            aria-label={`Modifica ${c.name}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
          </button>
          <button
            onClick={() => setToDelete(c)}
            className="rounded p-1 text-muted-foreground hover:bg-danger/15 hover:text-danger"
            aria-label={`Elimina ${c.name}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
            </svg>
          </button>
        </div>
      ))}
      {items.length === 0 && (
        <p className="py-2 text-center text-xs text-muted-foreground">Nessuna.</p>
      )}
    </div>
  );

  return (
    <Card id="finanze-categorie">
      <CardHeader>
        <div>
          <CardTitle>Categorie</CardTitle>
          <CardSubtitle>Usate anche nelle Impostazioni.</CardSubtitle>
        </div>
        <Button size="sm" variant="outline" onClick={startNew}>
          + Nuova
        </Button>
      </CardHeader>

      {open && (
        <div className="mb-3 space-y-3 rounded-lg border border-accent/25 bg-accent/5 p-3">
          <Field label="Nome">
            <Input
              autoFocus
              placeholder="es. Farmacia"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setErr(null);
              }}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <Select value={type} onChange={(e) => setType(e.target.value as TransactionType)}>
                <option value="expense">Uscita</option>
                <option value="income">Entrata</option>
              </Select>
            </Field>
            <Field label="Icona (emoji)">
              <Input placeholder="🏷️" value={icon} onChange={(e) => setIcon(e.target.value)} />
            </Field>
          </div>
          <Field label="Colore">
            <div className="flex flex-wrap items-center gap-2">
              {CATEGORY_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-6 w-6 rounded-full transition-transform",
                    color === c && "ring-2 ring-white/80 ring-offset-2 ring-offset-card"
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`Colore ${c}`}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-7 w-9 cursor-pointer rounded border border-border-strong bg-transparent"
                aria-label="Colore personalizzato"
              />
            </div>
          </Field>
          {err && <p className="text-xs text-danger">{err}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Annulla
            </Button>
            <Button size="sm" onClick={save}>
              {editingId ? "Salva modifiche" : "Aggiungi"}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            Entrate
          </p>
          {renderList(income)}
        </div>
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            Uscite
          </p>
          {renderList(expense)}
        </div>
      </div>

      <ConfirmDialog
        open={toDelete != null}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title={toDelete ? `Eliminare “${toDelete.name}”?` : "Eliminare?"}
        message={
          toDelete && usedBy(toDelete.id) > 0
            ? `${usedBy(toDelete.id)} transazione/i la usa: mostrerà categoria “—”. Il payout resta invariato.`
            : "Gli eventuali payout restano invariati."
        }
        confirmLabel="Elimina"
      />
    </Card>
  );
}
