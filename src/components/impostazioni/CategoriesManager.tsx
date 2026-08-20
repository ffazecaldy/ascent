"use client";
// ============================================================
// ASCEND — Impostazioni · Gestione Categorie Finanza (CRUD)
// nome · tipo (entrata/uscite) · icona (emoji) · colore (dot grid).
// Avviso: le modifiche non si applicano retroattivamente ai dati esistenti.
// ============================================================

import { useState } from "react";
import { useDB, updateDB, upsert, removeById, uid } from "@/lib/storage";
import type { Category, TransactionType } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, StatusDot } from "@/components/ui/Badge";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { Field, Input, Select } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/Misc";
import { CATEGORY_TYPES, COLOR_PALETTE, EMOJI_SUGGESTIONS } from "./constants";

const DEFAULT_COLOR = "#4C7EFF";
const DEFAULT_ICON = "🧾";

export function CategoriesManager() {
  const db = useDB();
  const categories = db.categories;
  const txCountByCategory = (id: string) => db.transactions.filter((t) => t.categoryId === id).length;

  // --- modal form ------------------------------------------------
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<TransactionType>("expense");
  const [icon, setIcon] = useState(DEFAULT_ICON);
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [error, setError] = useState<string | null>(null);

  // --- delete confirm --------------------------------------------
  const [deleting, setDeleting] = useState<Category | null>(null);

  const openCreate = () => {
    setEditingId(null);
    setName("");
    setType("expense");
    setIcon(DEFAULT_ICON);
    setColor(DEFAULT_COLOR);
    setError(null);
    setOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditingId(cat.id);
    setName(cat.name);
    setType(cat.type);
    setIcon(cat.icon || DEFAULT_ICON);
    setColor(cat.color || DEFAULT_COLOR);
    setError(null);
    setOpen(true);
  };

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Il nome è obbligatorio.");
      return;
    }
    const id = editingId ?? uid();
    updateDB((d) => ({
      ...d,
      categories: upsert(d.categories, {
        id,
        name: trimmed,
        type,
        icon: icon || DEFAULT_ICON,
        color,
      }),
    }));
    setOpen(false);
  };

  const confirmDelete = () => {
    if (!deleting) return;
    updateDB((d) => ({ ...d, categories: removeById(d.categories, deleting.id) }));
    setDeleting(null);
  };

  const groups: { type: TransactionType; label: string }[] = [
    { type: "income", label: "Entrate" },
    { type: "expense", label: "Uscite" },
  ];

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Categorie Finanza</CardTitle>
          <CardSubtitle>
            Usate per classificare transazioni, payout e voci. Sono {categories.length} in totale.
          </CardSubtitle>
        </div>
        <Button onClick={openCreate}>➕ Nuova</Button>
      </CardHeader>

      {categories.length === 0 ? (
        <EmptyState
          icon="🏷"
          title="Nessuna categoria"
          description="Crea la prima categoria per iniziare a classificare entrate e uscite."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {groups.map((g) => {
            const list = categories.filter((c) => c.type === g.type);
            return (
              <div key={g.type}>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-secondary-text">
                    {g.label}
                  </h4>
                  <Badge tone={g.type === "income" ? "default" : "warning"}>{list.length}</Badge>
                </div>
                <div className="space-y-1.5">
                  {list.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border-strong px-3 py-2 text-xs text-muted-foreground">
                      Nessuna categoria {g.type === "income" ? "di entrata" : "di uscita"}.
                    </p>
                  ) : (
                    list.map((cat) => (
                      <div
                        key={cat.id}
                        className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-2"
                      >
                        <span className="text-lg leading-none">{cat.icon}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{cat.name}</span>
                        <span className="hidden text-[11px] text-muted-foreground sm:inline tnum">
                          {txCountByCategory(cat.id)} trans
                        </span>
                        <StatusDot color={cat.color} />
                        <Button variant="ghost" size="icon" onClick={() => openEdit(cat)} aria-label="Modifica">
                          ✏️
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleting(cat)}
                          aria-label="Elimina"
                          className="text-danger hover:text-danger"
                        >
                          🗑
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 rounded-lg border border-border-strong bg-muted/40 px-3 py-2.5 text-xs leading-relaxed text-secondary-text">
        <span className="font-semibold text-foreground">⚠️ I vecchi dati restano com&apos;erano.</span>{" "}
        Modificare nome, icona o colore non ri-classifica le transazioni esistenti: ognuna conserva la
        categoria originale con cui è stata salvata. Eliminare una categoria lascia i vecchi riferimenti
        orfani.
      </div>

      {/* ---- Modal create/edit ---- */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? "Modifica categoria" : "Nuova categoria"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annulla
            </Button>
            <Button onClick={save}>Salva</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nome">
            <Input
              value={name}
              placeholder="Es. Affitto, Trading…"
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && save()}
              autoFocus
            />
            {error && <p className="mt-1 text-xs text-danger">{error}</p>}
          </Field>

          <Field label="Tipo">
            <Select value={type} onChange={(e) => setType(e.target.value as TransactionType)}>
              {CATEGORY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Icona (emoji)">
            <Input
              value={icon}
              maxLength={8}
              onChange={(e) => setIcon(e.target.value)}
              className="w-24 text-center text-lg"
            />
            <div className="mt-2 flex flex-wrap gap-1">
              {EMOJI_SUGGESTIONS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setIcon(em)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md text-base transition-colors",
                    icon === em
                      ? "bg-accent/20 ring-2 ring-accent"
                      : "bg-elevated hover:bg-border-strong"
                  )}
                  aria-label={`Icona ${em}`}
                >
                  {em}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Colore">
            <div className="grid grid-cols-8 gap-1.5">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "aspect-square w-full rounded-full transition-transform",
                    color === c && "ring-2 ring-white/80 scale-110"
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`Colore ${c}`}
                />
              ))}
            </div>
          </Field>
        </div>
      </Modal>

      {/* ---- Confirm delete ---- */}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Eliminare la categoria?"
        confirmLabel="Elimina"
        message={
          deleting
            ? `«${deleting.name}» verrà rimossa. ${
                txCountByCategory(deleting.id) > 0
                  ? `È riferita da ${txCountByCategory(deleting.id)} transazione/i che resteranno senza categoria. `
                  : ""
              }L'operazione non può essere annullata.`
            : ""
        }
      />
    </Card>
  );
}
