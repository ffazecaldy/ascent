"use client";

// ============================================================
// Zona Benessere — log giornaliero (lista densa): data, sonno
// + qualità, umore, peso, nota + modifica/eliminazione confermata.
// ============================================================

import { useMemo, useState } from "react";
import { useDB, updateDB, removeById } from "@/lib/storage";
import type { WellnessLog } from "@/lib/types";
import { labelDayKey } from "@/lib/dates";
import { logsSorted } from "@/lib/wellness";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/Icon";

function moodLabel(m: number): string {
  return ["", "Pessimo", "Stanco/a", "Nella norma", "Bene", "Ottimo"][m] ?? "";
}

export function WellnessLog({ onEdit }: { onEdit: (w: WellnessLog) => void }) {
  const db = useDB();
  const locale = db.settings.locale || "it-IT";
  const [deleteTarget, setDeleteTarget] = useState<WellnessLog | null>(null);

  const sorted = useMemo(() => logsSorted(db), [db]);

  function confirmDelete() {
    if (!deleteTarget) return;
    updateDB((d) => ({
      ...d,
      wellnessLogs: removeById(d.wellnessLogs, deleteTarget.id),
    }));
    setDeleteTarget(null);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Storico</CardTitle>
          <CardSubtitle>Una riga per giorno — tocca i dati per modificarli.</CardSubtitle>
        </CardHeader>
        <div className="divide-y divide-border-strong/50 px-1 pb-2">
          {sorted.length === 0 && (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">
              Nessun log. Registra la prima notte di sonno o il primo peso.
            </p>
          )}
          {sorted.map((w) => (
            <button
              key={w.id}
              onClick={() => onEdit(w)}
              className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-elevated/60"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold">{labelDayKey(w.date, locale)}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                  {w.sleepHours != null && (
                    <Badge tone="default" className="gap-1">
                      <Icon name="moon" size={11} />
                      {w.sleepHours.toFixed(1)}h
                      {w.sleepQuality ? ` · q.${w.sleepQuality}` : ""}
                    </Badge>
                  )}
                  {w.mood != null && (
                    <Badge
                      tone={w.mood >= 4 ? "success" : w.mood === 3 ? "default" : "warning"}
                      className="gap-1"
                    >
                      <Icon name="heart" size={11} />
                      {moodLabel(w.mood)}
                    </Badge>
                  )}
                  {w.weightKg != null && (
                    <Badge tone="default" className="gap-1">
                      <Icon name="scale" size={11} />
                      {w.weightKg.toFixed(1)} kg
                    </Badge>
                  )}
                </div>
                {w.note && <p className="mt-1 truncate text-xs text-muted-foreground">{w.note}</p>}
              </div>
              <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                {w.sleepHours == null && w.weightKg == null && (
                  <Badge tone="warning" className="mr-1">
                    solo umore
                  </Badge>
                )}
                <Icon name="pen" size={13} />
              </span>
            </button>
          ))}
        </div>
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Eliminare il log?"
        message={
          deleteTarget
            ? `${labelDayKey(deleteTarget.date, locale)} — sonno, umore e peso di quel giorno verranno rimossi.`
            : undefined
        }
        confirmLabel="Elimina"
      />
    </>
  );
}