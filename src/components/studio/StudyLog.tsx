"use client";

// ============================================================
// Zona Studio — log sessioni (lista densa con badge materia,
// durata, nota, data) + eliminazione con conferma.
// ============================================================

import { useMemo, useState } from "react";
import { useDB, updateDB, removeById } from "@/lib/storage";
import type { StudySession } from "@/lib/types";
import { labelDayKey } from "@/lib/dates";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Reveal } from "@/components/ui/Reveal";
import { fmtDur, subjectColor, subjectGradient, subjectEmoji } from "./constants";

export function StudyLog({ onEdit }: { onEdit: (s: StudySession) => void }) {
  const db = useDB();
  const locale = db.settings.locale || "it-IT";
  const [deleteTarget, setDeleteTarget] = useState<StudySession | null>(null);

  const sorted = useMemo(
    () =>
      [...db.studySessions].sort(
        (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
      ),
    [db.studySessions]
  );

  function confirmDelete() {
    if (!deleteTarget) return;
    updateDB((d) => ({
      ...d,
      studySessions: removeById(d.studySessions, deleteTarget.id),
    }));
    setDeleteTarget(null);
  }

  return (
    <Reveal delay={40}>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Log sessioni</CardTitle>
            <CardSubtitle>
              {db.studySessions.length} sessione{db.studySessions.length === 1 ? "" : "i"} di
              studio registrate
            </CardSubtitle>
          </div>
          <Badge tone="default">
            <span className="tnum">{db.studySessions.length}</span>
          </Badge>
        </CardHeader>
        <div className="space-y-1.5">
          {sorted.map((s) => {
            const color = subjectColor(s.subject);
            return (
              <div
                key={s.id}
                className="group flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-elevated/40 px-3 py-2 transition-colors hover:border-border-strong hover:bg-elevated/70"
              >
                {/* chip materia con gradiente di palette */}
                <span
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                  style={{
                    color,
                    backgroundImage: subjectGradient(s.subject),
                    borderColor: `${color}40`,
                  }}
                >
                  <span>{subjectEmoji(s.subject)}</span>
                  {s.subject}
                </span>

                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5">
                  {s.note && (
                    <span className="max-w-[320px] truncate text-[11px] text-muted-foreground">
                      {s.note}
                    </span>
                  )}
                </div>

                <span className="text-[11px] tnum text-muted-foreground">
                  {labelDayKey(s.date, locale)}
                </span>
                <span className="shrink-0 text-sm font-semibold tnum text-accent">
                  {fmtDur(s.minutes)}
                </span>
                <div className="flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                  <Button variant="ghost" size="icon" onClick={() => onEdit(s)} aria-label="Modifica sessione">
                    ✏️
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(s)}
                    aria-label="Elimina sessione"
                  >
                    🗑️
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Conferma eliminazione */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Eliminare la sessione?"
        message={
          deleteTarget
            ? `${subjectEmoji(deleteTarget.subject)} ${deleteTarget.subject} del ${labelDayKey(
                deleteTarget.date,
                locale
              )} (${fmtDur(deleteTarget.minutes)}) — questa azione non può essere annullata.`
            : ""
        }
        confirmLabel="Elimina"
      />
    </Reveal>
  );
}
