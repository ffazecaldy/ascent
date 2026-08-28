"use client";

// ============================================================
// ASCEND — Study Vault: lista materiali (master-detail, sinistra)
// Righe con icona per tipo, filtri materia/tipo, badge "Riassunto".
// Solo selezione: la cancellazione vive nel dettaglio.
// ============================================================

import { useMemo, useState } from "react";
import { useDB } from "@/lib/storage";
import type { StudyMaterial } from "@/lib/types";
import { fmtBytes } from "@/lib/file-store";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Select } from "@/components/ui/Field";
import AddMaterialDialog from "./AddMaterialDialog";

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function rowIcon(m: StudyMaterial): IconName {
  if (m.kind === "link") return m.provider === "youtube" ? "play" : "compass";
  return "clipboard"; // file (pdf/txt/md)
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

function Row({ m, selected, onSelect }: { m: StudyMaterial; selected: boolean; onSelect: () => void }) {
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
        <Icon name={rowIcon(m)} size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium text-foreground">{m.title}</span>
          {m.summary && <Badge tone="success">Riassunto</Badge>}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
          {[
            m.subject,
            m.kind === "file" ? (m.size != null ? fmtBytes(m.size) : "File") : m.provider === "youtube" ? "YouTube" : "Web",
            fmtDate(m.updatedAt),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
    </div>
  );
}

export function MaterialList({ selectedId, onSelect }: Props) {
  const db = useDB();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | "file" | "link">("");

  const subjects = useMemo(
    () =>
      Array.from(new Set(db.studyMaterials.map((m) => m.subject).filter((s): s is string => !!s))).sort(),
    [db.studyMaterials]
  );

  const visible = useMemo(() => {
    return db.studyMaterials
      .filter((m) => (subjectFilter ? m.subject === subjectFilter : true))
      .filter((m) => (typeFilter ? m.kind === typeFilter : true))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }, [db.studyMaterials, subjectFilter, typeFilter]);

  return (
    <div className="space-y-3">
      <Button variant="primary" glow className="w-full" onClick={() => setDialogOpen(true)}>
        <Icon name="plus" size={15} />
        Aggiungi materiale
      </Button>

      {db.studyMaterials.length > 0 && (
        <div className="grid grid-cols-1 gap-2">
          <Select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="h-8 py-0 text-[12px]"
            aria-label="Filtra per materia"
          >
            <option value="">Tutte le materie</option>
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as "" | "file" | "link")}
            className="h-8 py-0 text-[12px]"
            aria-label="Filtra per tipo"
          >
            <option value="">Tutti i tipi</option>
            <option value="file">File</option>
            <option value="link">Link</option>
          </Select>
        </div>
      )}

      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          I tuoi materiali
        </p>
        {visible.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-strong px-3 py-4 text-center text-xs text-muted-foreground">
            {db.studyMaterials.length === 0
              ? "Nessun materiale — carica un PDF o aggiungi un link"
              : "Nessun materiale con questi filtri"}
          </p>
        ) : (
          <div className="max-h-[62vh] space-y-1.5 overflow-y-auto pr-0.5">
            {visible.map((m) => (
              <Row key={m.id} m={m} selected={selectedId === m.id} onSelect={() => onSelect(m.id)} />
            ))}
          </div>
        )}
      </div>

      {dialogOpen && (
        <AddMaterialDialog
          open
          onClose={() => setDialogOpen(false)}
          onAdded={(id) => onSelect(id)}
        />
      )}
    </div>
  );
}
