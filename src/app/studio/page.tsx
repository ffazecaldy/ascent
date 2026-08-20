"use client";

// ============================================================
// ASCEND — Zona Studio (sezione v3 · art-direct v2)
// CRUD sessioni di studio, KPI con AnimatedNumber + sparkline,
// bars 7 giorni, donut materie, badge streak e timer veloce.
// Tutto scrive/legge da db.studySessions via useDB/updateDB.
// ============================================================

import { useState } from "react";
import { useDB, updateDB, upsert, uid, nowISO } from "@/lib/storage";
import type { StudySession } from "@/lib/types";
import { SectionHeader } from "@/components/ui/Misc";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Reveal } from "@/components/ui/Reveal";
import { StudyForm } from "@/components/studio/StudyForm";
import { StudyLog } from "@/components/studio/StudyLog";
import { StudyTimer } from "@/components/studio/StudyTimer";
import { StudyKpis } from "@/components/studio/StudyKpis";
import { StudyCharts } from "@/components/studio/StudyCharts";
import { Icon } from "@/components/ui/Icon";

export default function StudioPage() {
  const db = useDB();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StudySession | null>(null);

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(s: StudySession) {
    setEditing(s);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
  }

  function save(p: { date: string; subject: string; minutes: number; note?: string }) {
    const s: StudySession = editing
      ? {
          ...editing,
          date: p.date,
          subject: p.subject,
          minutes: p.minutes,
          note: p.note,
        }
      : {
          id: uid(),
          date: p.date,
          subject: p.subject,
          minutes: p.minutes,
          note: p.note,
          createdAt: nowISO(),
        };
    updateDB((d) => ({ ...d, studySessions: upsert(d.studySessions, s) }));
    closeForm();
  }

  const hasSessions = db.studySessions.length > 0;

  return (
    <div className="space-y-6">
      <Reveal>
        <SectionHeader
          kicker="Personale · Studio"
          title="Zona Studio. Mente affilata."
          subtitle="Sessioni di studio registrate materia per materia — la costanza alimenta lo streak."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="success" pulse>
                <Icon name="check" size={12} />
                alimenta lo streak
              </Badge>
              <Button onClick={openNew} variant="primary" glow>
                + Aggiungi sessione
              </Button>
            </div>
          }
        />
      </Reveal>

      <Reveal delay={20}>
        <StudyTimer />
      </Reveal>

      {!hasSessions ? (
        <Reveal delay={40}>
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong py-12 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl border border-accent/30 bg-accent/10 shadow-[0_0_28px_-8px_rgba(76,126,255,0.6)]">
              <Icon name="book-open" size={30} className="text-accent" />
            </div>
            <p className="text-sm font-medium text-secondary-text">Prima sessione di studio</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Registra la prima sessione per vedere minuti, materie e il contributo all'Activity Streak.
            </p>
            <div className="mt-2">
              <Button onClick={openNew}>Aggiungi sessione</Button>
            </div>
          </div>
        </Reveal>
      ) : (
        <>
          <Reveal delay={30}>
            <StudyKpis />
          </Reveal>
          <StudyCharts />
          <StudyLog onEdit={openEdit} />
        </>
      )}

      <StudyForm open={formOpen} onClose={closeForm} editing={editing} onSave={save} />
    </div>
  );
}
