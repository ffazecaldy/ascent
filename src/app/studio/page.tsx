"use client";

// ============================================================
// ASCEND — Zona Studio (sezione v3 · art-direct v2)
// CRUD sessioni di studio, KPI con AnimatedNumber + sparkline,
// bars 7 giorni, donut materie, badge streak e timer veloce.
// Tutto scrive/legge da db.studySessions via useDB/updateDB.
// Filtro globale v1 (?materia= + ?materialId=): copre banner +
// StudyLog; KPI/Charts/Stats restano globali (vedi report 2.1).
// ============================================================

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDB, updateDB, upsert, uid, nowISO } from "@/lib/storage";
import type { StudyAttachment, StudySession } from "@/lib/types";
import { SectionHeader } from "@/components/ui/Misc";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Reveal } from "@/components/ui/Reveal";
import { StudyForm } from "@/components/studio/StudyForm";
import { StudyLog } from "@/components/studio/StudyLog";
import { StudyTimer } from "@/components/studio/StudyTimer";
import { StudyKpis } from "@/components/studio/StudyKpis";
import { StudyStats } from "@/components/studio/StudyStats";
import { StudyCharts } from "@/components/studio/StudyCharts";
import { SubjectManager } from "@/components/studio/SubjectManager";
import { Icon } from "@/components/ui/Icon";
import { MilestonesCard } from "@/components/home/MilestonesCard";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/Card";

export default function StudioPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">Caricamento zona studio…</p>
        </div>
      }
    >
      <StudioContent />
    </Suspense>
  );
}

function StudioContent() {
  const db = useDB();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawMateria = (searchParams.get("materia") ?? "").trim();
  const subjectFilter = rawMateria !== "" ? rawMateria : null;
  const rawMaterialId = (searchParams.get("materialId") ?? "").trim();
  const selectedMaterial =
    rawMaterialId !== "" ? (db.studyMaterials.find((m) => m.id === rawMaterialId) ?? null) : null;
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

  function save(p: {
    date: string;
    subject: string;
    minutes: number;
    note?: string;
    attachments?: StudyAttachment[];
    focus?: 1 | 2 | 3 | 4 | 5 | null;
    energy?: 1 | 2 | 3 | 4 | 5 | null;
    materialId?: string | null;
    mapId?: string | null;
    subjectId?: string | null;
  }) {
    const s: StudySession = editing
      ? {
          ...editing,
          date: p.date,
          subject: p.subject,
          minutes: p.minutes,
          note: p.note,
          attachments: p.attachments,
          focus: p.focus ?? null,
          energy: p.energy ?? null,
          materialId: p.materialId ?? null,
          mapId: p.mapId ?? null,
          subjectId: p.subjectId ?? null,
          updatedAt: nowISO(),
        }
      : {
          id: uid(),
          date: p.date,
          subject: p.subject,
          minutes: p.minutes,
          note: p.note,
          attachments: p.attachments,
          focus: p.focus ?? null,
          energy: p.energy ?? null,
          materialId: p.materialId ?? null,
          mapId: p.mapId ?? null,
          subjectId: p.subjectId ?? null,
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

      {subjectFilter && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2">
          <span className="text-[12px] text-secondary-text">
            Filtro: <span className="font-semibold text-foreground">{subjectFilter}</span>
          </span>
          <Button variant="ghost" size="sm" onClick={() => router.push("/studio")} aria-label="Rimuovi filtro materia">
            <Icon name="x" size={13} />
            Rimuovi
          </Button>
        </div>
      )}

      {rawMaterialId !== "" && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-elevated/60 px-3 py-2">
          <span className="text-[12px] text-secondary-text">
            Materiale selezionato:{" "}
            <span className="font-semibold text-foreground">
              {selectedMaterial ? selectedMaterial.title : rawMaterialId}
            </span>
          </span>
          <Button variant="outline" size="sm" onClick={openNew}>
            Nuova sessione
          </Button>
        </div>
      )}

      <Reveal delay={20}>
        <StudyTimer />
      </Reveal>

      {/* Milestone reminder — visibile anche in Studio */}
      <Reveal delay={25}>
        <MilestonesCard db={db} />
      </Reveal>

      {!hasSessions ? (
        <>
          <Reveal delay={40}>
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong py-12 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl border border-accent/30 bg-accent/10 shadow-[0_0_28px_-8px_rgba(76,126,255,0.6)]">
                <Icon name="book-open" size={30} className="text-accent" />
              </div>
              <p className="text-sm font-medium text-secondary-text">Prima sessione di studio</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Registra la prima sessione per vedere minuti, materie e il contributo all&apos;Activity Streak.
              </p>
              <div className="mt-2">
                <Button onClick={openNew}>Aggiungi sessione</Button>
              </div>
            </div>
          </Reveal>
          <Reveal delay={30}>
            <SubjectManager />
          </Reveal>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Reveal delay={30}>
              <Card
                onClick={() => router.push("/studio/vault")}
                className="cursor-pointer hover:border-accent/50 transition-colors"
              >
                <CardTitle>Study Vault</CardTitle>
                <CardSubtitle>PDF, file e link con riassunti AI</CardSubtitle>
                <div className="mt-3 flex items-center gap-2 text-sm text-secondary-text">
                  <Icon name="book" size={16} className="text-accent" />
                  <span className="tnum">
                    {db.studyMaterials.length} materiali ·{" "}
                    {db.studyMaterials.filter((mat) => mat.summary).length} con riassunto
                  </span>
                </div>
              </Card>
            </Reveal>
            <Reveal delay={40}>
              <Card
                onClick={() => router.push("/studio/mappe")}
                className="cursor-pointer hover:border-accent/50 transition-colors"
              >
                <CardTitle>Mappe di conoscenza</CardTitle>
                <CardSubtitle>Schemi e collegamenti tra concetti</CardSubtitle>
                <div className="mt-3 flex items-center gap-2 text-sm text-secondary-text">
                  <Icon name="compass" size={16} className="text-accent" />
                  <span className="tnum">{db.knowledgeMaps.length} mappe</span>
                </div>
              </Card>
            </Reveal>
          </div>
        </>
      ) : (
        <>
          <Reveal delay={30}>
            <StudyKpis />
          </Reveal>
          <StudyStats />
          <StudyCharts />
          <Reveal delay={30}>
            <SubjectManager />
          </Reveal>
          <Reveal delay={30}>
            <Card
              onClick={() => router.push("/studio/vault")}
              className="cursor-pointer hover:border-accent/50 transition-colors"
            >
              <CardTitle>Study Vault</CardTitle>
              <CardSubtitle>PDF, file e link con riassunti AI</CardSubtitle>
              <div className="mt-3 flex items-center gap-2 text-sm text-secondary-text">
                <Icon name="book" size={16} className="text-accent" />
                <span className="tnum">
                  {db.studyMaterials.length} materiali ·{" "}
                  {db.studyMaterials.filter((mat) => mat.summary).length} con riassunto
                </span>
              </div>
            </Card>
          </Reveal>
          <StudyLog onEdit={openEdit} subjectFilter={subjectFilter} />
        </>
      )}

      <StudyForm open={formOpen} onClose={closeForm} editing={editing} onSave={save} />
    </div>
  );
}
