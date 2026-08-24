"use client";

// ============================================================
// Zona Studio — "Le tue materie": materie personalizzate salvate
// dall'utente (collezione studySubjects). Eliminazione con
// conferma: i log storici con quella materia restano intatti.
// ============================================================

import { useState } from "react";
import { useDB, updateDB, removeById } from "@/lib/storage";
import type { StudySubject } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/Icon";
import { SUBJECT_PRESETS, subjectColor, subjectIcon } from "./constants";

export function SubjectManager() {
  const db = useDB();
  const [deleteTarget, setDeleteTarget] = useState<StudySubject | null>(null);

  const mine = db.studySubjects.filter((s) => !SUBJECT_PRESETS.includes(s.name));

  if (mine.length === 0) return null;

  function confirmDelete() {
    if (!deleteTarget) return;
    updateDB((d) => ({
      ...d,
      studySubjects: removeById(d.studySubjects, deleteTarget.id),
    }));
    setDeleteTarget(null);
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Le tue materie</CardTitle>
          <CardSubtitle>
            Le materie che hai salvato dal form — compaiono nel menù delle sessioni.
          </CardSubtitle>
        </div>
        <Badge tone="default">
          <span className="tnum">{mine.length}</span>
        </Badge>
      </CardHeader>
      <div className="flex flex-wrap gap-1.5 px-1 pb-2">
        {mine.map((m) => {
          const color = subjectColor(m.name);
          return (
            <span
              key={m.id}
              className="group inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-2.5 pr-1 text-[11px] font-semibold"
              style={{ color, borderColor: `${color}40`, backgroundImage: `linear-gradient(135deg, ${color}20, ${color}0d)` }}
            >
              <Icon name={subjectIcon(m.name)} size={12} />
              {m.name}
              <button
                type="button"
                onClick={() => setDeleteTarget(m)}
                aria-label={`Elimina materia ${m.name}`}
                className="grid h-4 w-4 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-danger/15 hover:text-danger"
              >
                <Icon name="x" size={10} />
              </button>
            </span>
          );
        })}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Eliminare la materia?"
        message={`"${deleteTarget?.name ?? ""}" sparisce dal menù. Le sessioni già registrate con questa materia restano nel log.`}
        confirmLabel="Elimina"
      />
    </Card>
  );
}