"use client";

// ============================================================
// ASCEND — Mappe di conoscenza: elenco mappe + modelli
// Due sezioni ("Le tue mappe" / "Modelli"), pannello di creazione
// inline con i 3 modelli built-in + mappa vuota, semina dei
// modelli una tantum via ensureBuiltinTemplates.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { useDB, updateDB, upsert, removeById, uid, nowISO } from "@/lib/storage";
import type { KnowledgeMap } from "@/lib/types";
import { BUILTIN_TEMPLATES, makeTemplate, ensureBuiltinTemplates } from "./map-templates";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Icon, type IconName } from "@/components/ui/Icon";

function mapIcon(m: KnowledgeMap): IconName {
  const def = BUILTIN_TEMPLATES.find((t) => m.id.startsWith(t.id));
  if (def) {
    // Le icone dei template sono nomi Icon validi di proposito (definite in
    // map-templates.ts); il cast è locale e verificato da tsc.
    return def.icon as IconName;
  }
  return "book-open";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

interface MapRowProps {
  map: KnowledgeMap;
  selected: boolean;
  deletable: boolean;
  onSelect: () => void;
  onRequestDelete: () => void;
}

function MapRow({ map, selected, deletable, onSelect, onRequestDelete }: MapRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`group flex cursor-pointer items-center gap-2.5 rounded-lg border p-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
        selected
          ? "border-accent bg-accent/5"
          : "border-border hover:border-accent/50 hover:bg-elevated/60"
      }`}
    >
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${
          selected ? "border-accent/40 bg-accent/10 text-accent" : "border-border bg-elevated text-secondary-text"
        }`}
      >
        <Icon name={mapIcon(map)} size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium text-foreground">{map.name}</span>
          {map.isTemplate && <Badge tone="warning">Modello</Badge>}
        </span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">
          <span className="tnum">{map.nodes.length}</span> nodi ·{" "}
          <span className="tnum">{map.edges.length}</span> link · {formatDate(map.updatedAt)}
        </span>
      </span>
      {deletable && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRequestDelete();
          }}
          aria-label={`Elimina mappa ${map.name}`}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-colors group-hover:opacity-100 hover:bg-danger/15 hover:text-danger focus-visible:opacity-100 focus-visible:outline-none"
        >
          <Icon name="trash" size={14} />
        </button>
      )}
    </div>
  );
}

interface MapListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function MapList({ selectedId, onSelect }: MapListProps) {
  const db = useDB();
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeMap | null>(null);
  const [showNewPanel, setShowNewPanel] = useState(false);
  // Ref anti-loop: la semina dei modelli deve scattare UNA volta per sessione.
  const seededRef = useRef(false);

  // Semina i modelli built-in (tmpl-*) se assenti. Dipendenza SOLO sulla
  // lunghezza: updateDB riscrive knowledgeMaps e farebbe ripartire l'effect.
  useEffect(() => {
    if (seededRef.current) return;
    const seeded = ensureBuiltinTemplates(db.knowledgeMaps, nowISO);
    if (seeded !== db.knowledgeMaps) {
      seededRef.current = true;
      updateDB((d) => ({ ...d, knowledgeMaps: ensureBuiltinTemplates(d.knowledgeMaps, nowISO) }));
    }
    seededRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.knowledgeMaps.length]);

  const all = db.knowledgeMaps;
  const mine = all
    .filter((m) => !m.isTemplate)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const templates = all.filter((m) => m.isTemplate);

  function createFromTemplate(defIndex: number) {
    const def = BUILTIN_TEMPLATES[defIndex];
    const ts = nowISO();
    // Copia utente: id nodi/edges rigenerati (uid), isTemplate assente.
    const tpl = makeTemplate(def, uid, () => ts);
    const map: KnowledgeMap = {
      id: uid(),
      name: def.name,
      nodes: tpl.nodes,
      edges: tpl.edges,
      createdAt: ts,
      updatedAt: ts,
    };
    updateDB((d) => ({ ...d, knowledgeMaps: upsert(d.knowledgeMaps, map) }));
    setShowNewPanel(false);
    onSelect(map.id);
  }

  function createEmpty() {
    const ts = nowISO();
    const map: KnowledgeMap = {
      id: uid(),
      name: "Mappa senza nome",
      nodes: [{ id: uid(), label: "Argomento centrale", x: 0, y: 0 }],
      edges: [],
      createdAt: ts,
      updatedAt: ts,
    };
    updateDB((d) => ({ ...d, knowledgeMaps: upsert(d.knowledgeMaps, map) }));
    setShowNewPanel(false);
    onSelect(map.id);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    updateDB((d) => ({ ...d, knowledgeMaps: removeById(d.knowledgeMaps, target.id) }));
    setDeleteTarget(null);
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Le tue mappe
        </p>
        {mine.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-strong px-3 py-4 text-center text-xs text-muted-foreground">
            Nessuna mappa — creane una con un modello
          </p>
        ) : (
          <div className="space-y-1.5">
            {mine.map((m) => (
              <MapRow
                key={m.id}
                map={m}
                selected={selectedId === m.id}
                deletable
                onSelect={() => onSelect(m.id)}
                onRequestDelete={() => setDeleteTarget(m)}
              />
            ))}
          </div>
        )}
      </div>

      {templates.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Modelli
          </p>
          <div className="space-y-1.5">
            {templates.map((m) => (
              <MapRow
                key={m.id}
                map={m}
                selected={selectedId === m.id}
                deletable={!m.id.startsWith("tmpl-")}
                onSelect={() => onSelect(m.id)}
                onRequestDelete={() => setDeleteTarget(m)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="pt-1">
        {showNewPanel ? (
          <div className="rounded-xl border border-border-strong bg-elevated/40 p-2.5">
            <p className="mb-2 text-[11px] font-semibold text-secondary-text">Crea una nuova mappa</p>
            <div className="grid grid-cols-2 gap-2">
              {BUILTIN_TEMPLATES.map((def, i) => (
                <button
                  key={def.id}
                  type="button"
                  onClick={() => createFromTemplate(i)}
                  className="rounded-lg border border-border bg-card p-2.5 text-left transition-colors hover:border-accent/60 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  <span className="mb-1 flex items-center gap-1.5 text-accent">
                    <Icon name={def.icon as IconName} size={14} />
                  </span>
                  <span className="block text-[12px] font-semibold text-foreground">{def.name}</span>
                  <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-muted-foreground">
                    {def.children.join(", ")}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={createEmpty}
                className="rounded-lg border border-border bg-card p-2.5 text-left transition-colors hover:border-accent/60 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <span className="mb-1 flex items-center gap-1.5 text-accent">
                  <Icon name="plus" size={14} />
                </span>
                <span className="block text-[12px] font-semibold text-foreground">Mappa vuota</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                  Parti da zero con un solo nodo centrale
                </span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowNewPanel(false)}
              className="mt-2 w-full rounded-lg py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-elevated hover:text-secondary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              Annulla
            </button>
          </div>
        ) : (
          <Button variant="outline" className="w-full" onClick={() => setShowNewPanel(true)}>
            <Icon name="plus" size={15} />
            Nuova mappa
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Eliminare la mappa?"
        message={`"${deleteTarget?.name ?? ""}" e tutti i suoi nodi verranno rimossi definitivamente.`}
        confirmLabel="Elimina"
      />
    </div>
  );
}
