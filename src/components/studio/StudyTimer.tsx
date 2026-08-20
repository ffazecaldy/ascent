"use client";

// ============================================================
// Zona Studio — ⏱ Timer: sessione veloce start/stop.
// Al fermo assegna durata = minuti trascorsi e salva subito
// una sessione (data oggi tz, materia scelta) via useDB.
// Un solo campo semplice: la materia.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { useDB, updateDB, uid, nowISO } from "@/lib/storage";
import { todayKey } from "@/lib/dates";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { SUBJECT_PRESETS, subjectEmoji } from "./constants";

export function StudyTimer() {
  const db = useDB();
  const today = todayKey(db.settings.timezone);

  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0); // secondi
  const [subject, setSubject] = useState(SUBJECT_PRESETS[0]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const startRef = useRef(0);
  const savedTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startRef.current) / 1000)));
    }, 1000);
    return () => window.clearInterval(t);
  }, [running]);

  function start() {
    startRef.current = Date.now();
    setElapsed(0);
    setSavedAt(null);
    setRunning(true);
  }

  function stop() {
    // assegniamo i minuti trascorsi (minimo 1)
    const minutes = Math.max(1, Math.round(elapsed / 60));
    updateDB((d) => ({
      ...d,
      studySessions: [
        ...d.studySessions,
        { id: uid(), date: today, subject, minutes, createdAt: nowISO() },
      ],
    }));
    setRunning(false);
    setElapsed(0);
    setSavedAt(`Sessione salvata · ${minutes} min`);
    if (savedTimer.current) window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSavedAt(null), 3500);
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <Card hairline={running ? "accent" : "none"} scan={running}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <CardTitle>⏱ Timer — sessione veloce</CardTitle>
          <CardSubtitle>
            Avvia, studia, ferma: i minuti trascorsi diventano una sessione registrata.
          </CardSubtitle>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[170px]">
            <Select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              aria-label="Materia del timer"
            >
              {SUBJECT_PRESETS.map((s) => (
                <option key={s} value={s}>
                  {subjectEmoji(s)} {s}
                </option>
              ))}
            </Select>
          </div>

          <div
            className={`tnum text-2xl font-semibold tracking-tight ${
              running ? "text-accent" : "text-secondary-text"
            }`}
          >
            {mm}:{ss}
          </div>

          {running ? (
            <Button variant="danger" onClick={stop}>
              ■ Stop e salva
            </Button>
          ) : (
            <Button onClick={start} glow>
              ▶ Avvia
            </Button>
          )}
        </div>
      </div>

      {savedAt && (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-success">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          {savedAt} · alimenta lo streak ✓
        </p>
      )}
    </Card>
  );
}
