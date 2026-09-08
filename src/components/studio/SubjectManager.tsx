"use client";

// ============================================================
// Zona Studio — "Le tue materie": TUTTE le materie in uso
// (preset usate nei log + custom salvate in studySubjects).
// Per ognuna: chip colore, minuti ultimi 7gg, ProgressBar verso
// il target settimanale, badge esame, edit via Modal. Le materie
// archiviate vivono in sezione separata con Ripristina; i log
// storici restano sempre intatti (delete/remove solo la riga
// studySubjects, mai le sessioni).
// ============================================================

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDB, updateDB, removeById, upsert, uid, nowISO } from "@/lib/storage";
import type { StudySubject } from "@/lib/types";
import { addDaysKey, parseDateKey, todayKey } from "@/lib/dates";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Field, Input, Label } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, ProgressBar, Toggle } from "@/components/ui/Misc";
import { SUBJECT_PRESETS, SUBJECT_PALETTE, subjectColor, subjectIcon } from "./constants";

/** Differenza in giorni tra due day key "yyyy-MM-dd" (to - from). */
function daysBetween(fromKey: string, toKey: string): number {
  const a = parseDateKey(fromKey);
  const b = parseDateKey(toKey);
  const ms = Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d);
  return Math.round(ms / 86400000);
}

export function SubjectManager() {
  const db = useDB();
  const router = useRouter();
  const today = todayKey(db.settings.timezone);
  const cutoff = addDaysKey(today, -6);

  const rowByName = useMemo(
    () => new Map(db.studySubjects.map((s) => [s.name, s] as const)),
    [db.studySubjects]
  );

  // Preset usate nei log (ordine stabile dei preset), escluse le archiviate.
  const activeNames = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    const usedInLogs = new Set(
      db.studySessions.map((s) => s.subject).filter((t) => !!t && SUBJECT_PRESETS.includes(t))
    );
    for (const n of SUBJECT_PRESETS) {
      if (!usedInLogs.has(n)) continue;
      if (rowByName.get(n)?.archived === true) continue;
      out.push(n);
      seen.add(n);
    }
    for (const s of db.studySubjects) {
      if (SUBJECT_PRESETS.includes(s.name)) continue;
      if (s.archived === true) continue;
      if (seen.has(s.name)) continue;
      seen.add(s.name);
      out.push(s.name);
    }
    return out;
  }, [db.studySessions, db.studySubjects, rowByName]);

  const archivedRows = useMemo(
    () => db.studySubjects.filter((s) => s.archived === true),
    [db.studySubjects]
  );

  // Minuti per materia negli ultimi 7gg (oggi incluso).
  const minutes7 = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of db.studySessions) {
      if (s.date < cutoff || s.date > today) continue;
      m.set(s.subject, (m.get(s.subject) ?? 0) + (s.minutes || 0));
    }
    return m;
  }, [db.studySessions, cutoff, today]);

  const [editingName, setEditingName] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StudySubject | null>(null);

  function confirmDelete() {
    if (!deleteTarget) return;
    updateDB((d) => ({
      ...d,
      studySubjects: removeById(d.studySubjects, deleteTarget.id),
    }));
    setDeleteTarget(null);
  }

  function restore(id: string) {
    updateDB((d) => ({
      ...d,
      studySubjects: d.studySubjects.map((s) =>
        s.id === id ? { ...s, archived: false, updatedAt: nowISO() } : s
      ),
    }));
  }

  if (activeNames.length === 0 && archivedRows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Le tue materie</CardTitle>
            <CardSubtitle>Obiettivi settimanali, esami e colori per materia.</CardSubtitle>
          </div>
        </CardHeader>
        <EmptyState
          title="Nessuna materia ancora — registra una sessione"
          description="Le materie che usi nelle sessioni compariranno qui: potrai fissare un obiettivo settimanale, la data dell'esame e un colore."
        />
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Le tue materie</CardTitle>
            <CardSubtitle>
              Preset usate nei log + materie salvate — obiettivi, esami e colori.
            </CardSubtitle>
          </div>
          <Badge tone="default">
            <span className="tnum">{activeNames.length}</span>
          </Badge>
        </CardHeader>
        <ul className="space-y-2">
          {activeNames.map((name) => {
            const row = rowByName.get(name);
            const color = row?.color ?? subjectColor(name);
            const mins = minutes7.get(name) ?? 0;
            const target = row?.weeklyTargetMin ?? null;
            const exam = row?.examDate ?? null;
            const examDays = exam ? daysBetween(today, exam) : null;
            const isCustom = !SUBJECT_PRESETS.includes(name);
            return (
              <li
                key={name}
                className="rounded-xl border border-border bg-elevated/40 px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span style={{ color }}>
                    <Icon name={subjectIcon(name)} size={13} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
                    {name}
                  </span>
                  {examDays != null && examDays > 0 && (
                    <Badge tone="info">
                      esame tra <span className="tnum">{examDays}gg</span>
                    </Badge>
                  )}
                  {examDays === 0 && <Badge tone="warning">esame oggi</Badge>}
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    <span className="tnum">{mins}</span> min · 7gg
                  </span>
                  <button
                    type="button"
                    onClick={() => router.push(`/studio?materia=${encodeURIComponent(name)}`)}
                    aria-label={`Filtra sessioni per ${name}`}
                    title={`Filtra sessioni per ${name}`}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/15 hover:text-accent"
                  >
                    <Icon name="tag" size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingName(name)}
                    aria-label={`Modifica materia ${name}`}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/15 hover:text-accent"
                  >
                    <Icon name="pencil" size={13} />
                  </button>
                  {isCustom && row && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(row)}
                      aria-label={`Elimina materia ${name}`}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-danger/15 hover:text-danger"
                    >
                      <Icon name="x" size={13} />
                    </button>
                  )}
                </div>
                {target != null && target > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <ProgressBar value={mins} max={target} className="flex-1" />
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      <span className="tnum">
                        {mins}/{target}
                      </span>{" "}
                      min
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {archivedRows.length > 0 && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Archiviate</CardTitle>
              <CardSubtitle>
                Nascoste dal menù delle sessioni — lo storico resta intatto.
              </CardSubtitle>
            </div>
            <Badge tone="default">
              <span className="tnum">{archivedRows.length}</span>
            </Badge>
          </CardHeader>
          <ul className="space-y-2">
            {archivedRows.map((s) => {
              const color = s.color ?? subjectColor(s.name);
              const isCustom = !SUBJECT_PRESETS.includes(s.name);
              return (
                <li
                  key={s.id}
                  className="flex items-center gap-2 rounded-xl border border-border bg-elevated/40 px-3 py-2"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full opacity-60"
                    style={{ backgroundColor: color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-muted-foreground">
                    {s.name}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => restore(s.id)}>
                    <Icon name="refresh" size={12} />
                    Ripristina
                  </Button>
                  <button
                    type="button"
                    onClick={() => setEditingName(s.name)}
                    aria-label={`Modifica materia ${s.name}`}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/15 hover:text-accent"
                  >
                    <Icon name="pencil" size={13} />
                  </button>
                  {isCustom && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(s)}
                      aria-label={`Elimina materia ${s.name}`}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-danger/15 hover:text-danger"
                    >
                      <Icon name="x" size={13} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {editingName && (
        <SubjectEditModal
          key={editingName}
          name={editingName}
          row={rowByName.get(editingName)}
          onClose={() => setEditingName(null)}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Eliminare la materia?"
        message={`"${deleteTarget?.name ?? ""}" sparisce dal menù. Le sessioni già registrate con questa materia restano nel log.`}
        confirmLabel="Elimina"
      />
    </>
  );
}

function SubjectEditModal({
  name,
  row,
  onClose,
}: {
  name: string;
  row: StudySubject | undefined;
  onClose: () => void;
}) {
  const [fTarget, setFTarget] = useState(
    row?.weeklyTargetMin != null ? String(row.weeklyTargetMin) : ""
  );
  const [fExam, setFExam] = useState(row?.examDate ?? "");
  const [fColor, setFColor] = useState<string | null>(row?.color ?? null);
  const [fArchived, setFArchived] = useState(row?.archived ?? false);

  function save() {
    const raw = fTarget.trim() === "" ? null : Math.max(0, Math.round(Number(fTarget)));
    const target = raw == null || Number.isNaN(raw) ? null : raw;
    const exam = fExam.trim() === "" ? null : fExam.trim();
    const base: StudySubject = row ?? { id: uid(), name, createdAt: nowISO() };
    updateDB((d) => ({
      ...d,
      studySubjects: upsert(d.studySubjects, {
        ...base,
        color: fColor,
        weeklyTargetMin: target,
        examDate: exam,
        archived: fArchived,
        updatedAt: nowISO(),
      }),
    }));
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Modifica materia — ${name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={save}>Salva</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Obiettivo settimanale (min)">
          <Input
            type="number"
            min={0}
            placeholder="es. 300"
            value={fTarget}
            onChange={(e) => setFTarget(e.target.value)}
          />
        </Field>
        <Field label="Data esame">
          <Input type="date" value={fExam} onChange={(e) => setFExam(e.target.value)} />
        </Field>
      </div>

      <div className="mt-3">
        <Label>Colore</Label>
        <div className="flex flex-wrap items-center gap-2">
          {SUBJECT_PALETTE.slice(0, 6).map((c) => {
            const selected = fColor === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setFColor(selected ? null : c)}
                aria-label={`Colore ${c}`}
                aria-pressed={selected}
                title={c}
                className={`h-7 w-7 rounded-full transition-transform ${
                  selected
                    ? "ring-2 ring-accent ring-offset-2 ring-offset-card"
                    : "hover:scale-110"
                }`}
                style={{ backgroundColor: c }}
              />
            );
          })}
          <button
            type="button"
            onClick={() => setFColor(null)}
            aria-pressed={fColor == null}
            className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold transition-colors ${
              fColor == null
                ? "border-accent text-accent"
                : "border-border-strong text-muted-foreground hover:text-foreground"
            }`}
          >
            <span
              className="h-3 w-3 rounded-full"
              style={{
                background: `conic-gradient(from 0deg, ${SUBJECT_PALETTE.slice(0, 6).join(", ")})`,
              }}
            />
            Auto
          </button>
        </div>
      </div>

      <div className="mt-4">
        <Toggle
          checked={fArchived}
          onChange={setFArchived}
          label="Archiviata (nascosta dal menù, storico conservato)"
        />
      </div>
    </Modal>
  );
}
