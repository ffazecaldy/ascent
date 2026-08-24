"use client";

// ============================================================
// Zona Studio — form crea/modifica sessione (modal)
// Data (default oggi tz) · Materia (preset + personalizzato,
// come in Sport) · Durata (min) · Nota.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { useDB } from "@/lib/storage";
import type { StudySession } from "@/lib/types";
import { todayKey } from "@/lib/dates";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Label, Select, TextArea } from "@/components/ui/Field";
import { SUBJECT_PRESETS } from "./constants";

export function StudyForm({
  open,
  onClose,
  editing,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  editing: StudySession | null;
  onSave: (p: { date: string; subject: string; minutes: number; note?: string }) => void;
}) {
  const db = useDB();
  const today = todayKey(db.settings.timezone);

  // Materie già usate ma non preset (persistono da db.studySessions)
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
  const [localCustoms, setLocalCustoms] = useState<string[]>([]);

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
      } else {
        setFDate(today);
        setFSubject(SUBJECT_PRESETS[0]);
        setFMin("");
        setFNote("");
      }
      setAddingCustom(false);
      setCustomDraft("");
    });
  }, [open, editing, today]);

  const subjectOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    [...SUBJECT_PRESETS, ...derivedCustoms, ...localCustoms, editing ? editing.subject : ""].forEach(
      (t) => {
        if (t && !seen.has(t)) {
          seen.add(t);
          out.push(t);
        }
      }
    );
    return out;
  }, [derivedCustoms, localCustoms, editing]);

  function addCustom() {
    const t = customDraft.trim();
    if (!t) return;
    setLocalCustoms((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setFSubject(t);
    setCustomDraft("");
    setAddingCustom(false);
  }

  const canSave = fDate.trim() !== "" && fSubject.trim() !== "" && Number(fMin) > 0;

  function submit() {
    if (!canSave) return;
    onSave({
      date: fDate,
      subject: fSubject.trim(),
      minutes: Math.round(Number(fMin)),
      note: fNote.trim() || undefined,
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
              placeholder="Nome della materia"
              onChange={(e) => setCustomDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                }
              }}
            />
            <Button size="sm" onClick={addCustom} disabled={!customDraft.trim()}>
              Aggiungi
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
            + aggiungi personalizzato
          </button>
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
    </Modal>
  );
}
