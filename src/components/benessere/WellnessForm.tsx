"use client";

// ============================================================
// Zona Benessere — form crea/modifica log giornaliero (modal)
// Data (default oggi tz) · Sonno (ore) · Qualità sonno (1-5) ·
// Umore (1-5) · Peso (kg) · Nota. Una riga per giorno (upsert).
// ============================================================

import { useEffect, useState } from "react";
import { useDB } from "@/lib/storage";
import { todayKey } from "@/lib/dates";
import { logForDay } from "@/lib/wellness";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Label, Select, TextArea } from "@/components/ui/Field";

export const MOOD_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "1 · Pessimo" },
  { value: 2, label: "2 · Stanco/a" },
  { value: 3, label: "3 · Nella norma" },
  { value: 4, label: "4 · Bene" },
  { value: 5, label: "5 · Ottimo" },
];

export const QUALITY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "1 · Molto disturbato" },
  { value: 2, label: "2 · Scarso" },
  { value: 3, label: "3 · Discreto" },
  { value: 4, label: "4 · Buono" },
  { value: 5, label: "5 · Riposante" },
];

export function WellnessForm({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (p: {
    date: string;
    sleepHours: number | null;
    sleepQuality: 1 | 2 | 3 | 4 | 5 | null;
    mood: 1 | 2 | 3 | 4 | 5 | null;
    weightKg: number | null;
    note?: string;
  }) => void;
}) {
  const db = useDB();
  const today = todayKey(db.settings.timezone);

  const [fDate, setFDate] = useState(today);
  const [fSleep, setFSleep] = useState("");
  const [fQuality, setFQuality] = useState("3");
  const [fMood, setFMood] = useState("3");
  const [fWeight, setFWeight] = useState("");
  const [fNote, setFNote] = useState("");

  // Sincronizza i campi a ogni apertura: precompila dal log di oggi (se c'è)
  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setFDate(today);
      const w = logForDay(db, today);
      setFSleep(w?.sleepHours != null ? String(w.sleepHours) : "");
      setFQuality(String(w?.sleepQuality ?? 3));
      setFMood(String(w?.mood ?? 3));
      setFWeight(w?.weightKg != null ? String(w.weightKg) : "");
      setFNote(w?.note ?? "");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, db.wellnessLogs.length]);

  function submit() {
    const sleep = fSleep.trim() === "" ? null : Number(fSleep.replace(",", "."));
    const weight = fWeight.trim() === "" ? null : Number(fWeight.replace(",", "."));
    if (sleep != null && (!Number.isFinite(sleep) || sleep <= 0 || sleep > 24)) return;
    if (weight != null && (!Number.isFinite(weight) || weight <= 20 || weight > 400)) return;
    onSave({
      date: fDate,
      sleepHours: sleep != null ? Math.round(sleep * 10) / 10 : null,
      sleepQuality: (Number(fQuality) as 1 | 2 | 3 | 4 | 5) || null,
      mood: (Number(fMood) as 1 | 2 | 3 | 4 | 5) || null,
      weightKg: weight != null ? Math.round(weight * 100) / 100 : null,
      note: fNote.trim() === "" ? undefined : fNote.trim(),
    });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Log benessere">
      <div className="space-y-4">
        <Field label="Data">
          <Input type="date" value={fDate} max={today} onChange={(e) => setFDate(e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Sonno (ore)">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={24}
              step={0.5}
              placeholder="es. 7.5"
              value={fSleep}
              onChange={(e) => setFSleep(e.target.value)}
            />
          </Field>
          <Field label="Peso (kg)">
            <Input
              type="number"
              inputMode="decimal"
              min={20}
              max={400}
              step={0.1}
              placeholder="es. 72.4"
              value={fWeight}
              onChange={(e) => setFWeight(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Qualità sonno">
            <Select value={fQuality} onChange={(e) => setFQuality(e.target.value)}>
              {QUALITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Umore">
            <Select value={fMood} onChange={(e) => setFMood(e.target.value)}>
              {MOOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Nota (facoltativa)">
          <TextArea
            rows={2}
            placeholder="es. sveglia alle 6, niente caffè dopo le 16"
            value={fNote}
            onChange={(e) => setFNote(e.target.value)}
          />
        </Field>

        <p className="text-xs text-muted-foreground">
          Solo sonno e peso alimentano il giorno d&apos;ascesa — l&apos;umore resta tuo.
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose} variant="ghost">
            Annulla
          </Button>
          <Button onClick={submit} variant="primary" glow>
            Salva
          </Button>
        </div>
        <Label className="sr-only">Benessere</Label>
      </div>
    </Modal>
  );
}