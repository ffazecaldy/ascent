"use client";

// ============================================================
// Zona Studio — form crea/modifica sessione (modal)
// Data (default oggi tz) · Materia (preset + salvate + nuove
// personalizzabili: al salvataggio la nuova materia finisce in
// db.studySubjects e resta disponibile) · Durata (min) · Nota ·
// Allegati: file/PDF via IndexedDB (blob in 'ascend-files',
// metadati nella sessione). Editing: rimozione allegati.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { useDB, updateDB, upsert, uid, nowISO } from "@/lib/storage";
import type { StudyAttachment, StudySession } from "@/lib/types";
import { todayKey } from "@/lib/dates";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Label, Select, TextArea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { SUBJECT_PRESETS } from "./constants";
import { putFile, deleteFile, checkFileSize, fmtBytes } from "@/lib/file-store";

const MAX_ATTACHMENTS = 10;

export function StudyForm({
  open,
  onClose,
  editing,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  editing: StudySession | null;
  onSave: (p: {
    date: string;
    subject: string;
    minutes: number;
    note?: string;
    attachments?: StudyAttachment[];
  }) => void;
}) {
  const db = useDB();
  const today = todayKey(db.settings.timezone);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Materie salvate dall'utente (escluse quelle già nei preset)
  const savedSubjects = useMemo(
    () =>
      db.studySubjects
        .map((s) => s.name)
        .filter((n) => !!n && !SUBJECT_PRESETS.includes(n)),
    [db.studySubjects]
  );

  // Materie già usate nei log ma mai salvate (retro-compatibilità)
  const derivedCustoms = useMemo(
    () =>
      Array.from(
        new Set(
          db.studySessions.map((s) => s.subject).filter((t) => !!t && !SUBJECT_PRESETS.includes(t))
        )
      ),
    [db.studySessions]
  );

  const [fDate, setFDate] = useState(today);
  const [fSubject, setFSubject] = useState(SUBJECT_PRESETS[0]);
  const [fMin, setFMin] = useState("");
  const [fNote, setFNote] = useState("");
  const [addingCustom, setAddingCustom] = useState(false);
  const [customDraft, setCustomDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);

  // Sincronizza i campi a ogni apertura/switch crea↔modifica
  useEffect(() => {
    if (!open) return;
    // Reset/init in microtask: nessun setState sincrono nel corpo dell'effect.
    queueMicrotask(() => {
      if (editing) {
        setFDate(editing.date);
        setFSubject(editing.subject);
        setFMin(String(editing.minutes));
        setFNote(editing.note ?? "");
        setRemovedIds([]);
      } else {
        setFDate(today);
        setFSubject(SUBJECT_PRESETS[0]);
        setFMin("");
        setFNote("");
        setRemovedIds([]);
      }
      setPendingFiles([]);
      setAddingCustom(false);
      setCustomDraft("");
    });
  }, [open, editing, today]);

  const subjectOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    [...SUBJECT_PRESETS, ...savedSubjects, ...derivedCustoms, editing ? editing.subject : ""].forEach(
      (t) => {
        if (t && !seen.has(t)) {
          seen.add(t);
          out.push(t);
        }
      }
    );
    return out;
  }, [savedSubjects, derivedCustoms, editing]);

  /** Salva la nuova materia nel DB (persistente) e la seleziona. */
  function addCustom() {
    const t = customDraft.trim();
    if (!t) return;
    if (!SUBJECT_PRESETS.includes(t) && !db.studySubjects.some((s) => s.name === t)) {
      updateDB((d) => ({
        ...d,
        studySubjects: upsert(d.studySubjects, { id: uid(), name: t, createdAt: nowISO() }),
      }));
    }
    setFSubject(t);
    setCustomDraft("");
    setAddingCustom(false);
  }

  /** Nuovi file selezionati: validazione dimensione + limite numero allegati. */
  function onFilesPicked(files: FileList | null) {
    if (!files) return;
    const existing = editing?.attachments?.length ?? 0;
    const remaining = [...pendingFiles];
    for (const f of Array.from(files)) {
      if (existing + remaining.length >= MAX_ATTACHMENTS) break;
      const err = checkFileSize(f);
      if (err) continue; // file troppo grande: ignorato silenziosamente
      remaining.push(f);
    }
    setPendingFiles(remaining);
  }

  function removePending(i: number) {
    setPendingFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  function removeExisting(id: string) {
    setRemovedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  const canSave = fDate.trim() !== "" && fSubject.trim() !== "" && Number(fMin) > 0;

  async function submit() {
    if (!canSave) return;
    const attachments: StudyAttachment[] = [
      ...(editing?.attachments ?? []).filter((a) => !removedIds.includes(a.id)),
    ];
    // blob rimossi in edit → cancella dal file store (best effort)
    for (const id of removedIds) {
      void deleteFile(id);
    }
    // nuovi file → IndexedDB + metadati
    for (const f of pendingFiles) {
      const id = uid();
      try {
        await putFile(id, f);
        attachments.push({
          id,
          name: f.name,
          mime: f.type || "application/octet-stream",
          size: f.size,
          createdAt: nowISO(),
        });
      } catch {
        // storage bloccato/quota: il file non viene allegato, gli altri sì
      }
    }
    onSave({
      date: fDate,
      subject: fSubject.trim(),
      minutes: Math.round(Number(fMin)),
      note: fNote.trim() || undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Modifica sessione" : "Nuova sessione di studio"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={submit} disabled={!canSave}>
            {editing ? "Salva" : "Aggiungi"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data">
          <Input type="date" value={fDate} max={today} onChange={(e) => setFDate(e.target.value)} />
        </Field>
        <Field label="Durata (min)">
          <Input
            type="number"
            min={1}
            placeholder="es. 60"
            value={fMin}
            onChange={(e) => setFMin(e.target.value)}
          />
        </Field>
      </div>

      <div className="mt-3">
        <Label>Materia</Label>
        <Select value={fSubject} onChange={(e) => setFSubject(e.target.value)}>
          {subjectOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        {addingCustom ? (
          <div className="mt-1.5 flex gap-2">
            <Input
              value={customDraft}
              placeholder="Nome della nuova materia"
              onChange={(e) => setCustomDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                }
              }}
            />
            <Button size="sm" onClick={addCustom} disabled={!customDraft.trim()}>
              Salva materia
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setAddingCustom(false);
                setCustomDraft("");
              }}
            >
              Annulla
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingCustom(true)}
            className="mt-1.5 text-xs font-medium text-accent hover:underline"
          >
            + nuova materia (la salvi per le prossime sessioni)
          </button>
        )}
        {!addingCustom && savedSubjects.includes(fSubject) && (
          <p className="mt-1 text-[11px] text-success">Materia salvata ✓</p>
        )}
      </div>

      <div className="mt-3">
        <Field label="Nota">
          <TextArea
            placeholder="Argomento, obiettivo, appunti…"
            value={fNote}
            onChange={(e) => setFNote(e.target.value)}
          />
        </Field>
      </div>

      {/* ——— Allegati (file/PDF, IndexedDB) ——— */}
      <div className="mt-3">
        <Label>Allegati ({MAX_ATTACHMENTS} max)</Label>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept="application/pdf,.doc,.docx,.txt,.md,.csv,.xls,.xlsx,.ppt,.pptx,image/*,.zip"
          onChange={(e) => {
            onFilesPicked(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="space-y-1.5">
          {/* allegati già presenti (modifica) */}
          {(editing?.attachments ?? [])
            .filter((a) => !removedIds.includes(a.id))
            .map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-elevated/40 px-2.5 py-1.5 text-xs"
              >
                <Icon name="clipboard" size={13} className="shrink-0 text-accent" />
                <span className="min-w-0 flex-1 truncate font-medium">{a.name}</span>
                <span className="shrink-0 text-[10px] tnum text-muted-foreground">
                  {fmtBytes(a.size)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Rimuovi ${a.name}`}
                  onClick={() => removeExisting(a.id)}
                >
                  <Icon name="x" size={13} />
                </Button>
              </div>
            ))}
          {/* nuovi file in attesa */}
          {pendingFiles.map((f, i) => (
            <div
              key={`${f.name}-${i}`}
              className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1.5 text-xs"
            >
              <Icon name="clipboard" size={13} className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
              <span className="shrink-0 text-[10px] tnum text-muted-foreground">
                {fmtBytes(f.size)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Rimuovi ${f.name}`}
                onClick={() => removePending(i)}
              >
                <Icon name="x" size={13} />
              </Button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
        >
          <Icon name="upload" size={12} />
          aggiungi file (PDF, immagini, documenti…)
        </button>
        <p className="mt-1 text-[10px] text-muted-foreground">
          I file restano solo su questo dispositivo (fino a 25 MB l&apos;uno) e sono scaricabili dal log.
        </p>
      </div>
    </Modal>
  );
}