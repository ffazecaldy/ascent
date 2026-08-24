"use client";

// ============================================================
// Zona Studio — Timer: sessione veloce start/stop.
// Al fermo assegna durata = minuti trascorsi e salva subito
// una sessione (data oggi tz, materia scelta) via useDB.
// Un solo campo semplice: la materia.
// L'epoch di start è persistito in localStorage (ascend:study-timer-start):
// la sessione sopravvive a reload/navigazione e riprende al mount.
// stop() calcola i minuti da Date.now() - startRef (mai dallo stato
// elapsed, che con la tab in background resta indietro) ed è protetto
// da doppio click (busy) per non duplicare la sessione.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { useDB, updateDB, uid, nowISO } from "@/lib/storage";
import { todayKey } from "@/lib/dates";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { SUBJECT_PRESETS } from "./constants";
import { Icon } from "@/components/ui/Icon";

const START_KEY = "ascend:study-timer-start";

/** Epoch di partenza persistito (0 se assente/corrotto). */
function readStoredStart(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(START_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function StudyTimer() {
  const db = useDB();
  const today = todayKey(db.settings.timezone);

  // running parte da false: l'eventuale sessione persistita viene ripresa
  // nel useEffect di mount (dopo l'idratazione, niente mismatch SSR).
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0); // secondi
  const [subject, setSubject] = useState(SUBJECT_PRESETS[0]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); // disabilita "Stop e salva" durante il salvataggio
  const startRef = useRef(0);
  const savedTimer = useRef<number | null>(null);
  const busyRef = useRef(false); // guardia sincrona anti doppio click

  // Riprendi una sessione persistita (reload, navigazione, riapertura tab).
  // Lettura one-shot di localStorage: pattern "sync da sistema esterno" —
  // non si può usare un lazy initializer (causerebbe hydration mismatch SSR).
  useEffect(() => {
    const stored = readStoredStart();
    if (stored > 0) {
      startRef.current = stored;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setElapsed(Math.max(0, Math.floor((Date.now() - stored) / 1000)));
      setRunning(true);
    }
  }, []);

  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startRef.current) / 1000)));
    }, 1000);
    return () => window.clearInterval(t);
  }, [running]);

  // Avviso se si lascia la pagina con il timer attivo (reload/chiusura tab):
  // la sessione resta comunque recuperabile da localStorage al ritorno.
  useEffect(() => {
    if (!running) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [running]);

  function start() {
    if (busyRef.current) return;
    startRef.current = Date.now();
    try {
      window.localStorage.setItem(START_KEY, String(startRef.current));
    } catch {
      // best-effort: senza persistenza il timer funziona comunque in sessione
    }
    setElapsed(0);
    setSavedAt(null);
    setRunning(true);
  }

  function stop() {
    if (!running || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    // Minuti dall'epoch DI PARTENZA, mai dallo stato elapsed: con la tab in
    // background l'intervallo non gira e elapsed resta indietro.
    const start = startRef.current;
    const minutes = Math.max(1, Math.round((Date.now() - start) / 60000));
    updateDB((d) => ({
      ...d,
      studySessions: [
        ...d.studySessions,
        { id: uid(), date: today, subject, minutes, createdAt: nowISO() },
      ],
    }));
    try {
      window.localStorage.removeItem(START_KEY);
    } catch {
      // best-effort
    }
    setRunning(false);
    setElapsed(0);
    setSavedAt(`Sessione salvata · ${minutes} min`);
    if (savedTimer.current) window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSavedAt(null), 3500);
    setBusy(false);
    busyRef.current = false;
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <Card hairline={running ? "accent" : "none"} scan={running}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-1.5">
            <Icon name="timer" size={16} />
            Timer — sessione veloce
          </CardTitle>
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
                  {s}
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
            <Button variant="danger" onClick={stop} disabled={busy}>
              <Icon name="pause" size={14} /> Stop e salva
            </Button>
          ) : (
            <Button onClick={start} glow>
              <Icon name="play" size={14} /> Avvia
            </Button>
          )}
        </div>
      </div>

      {savedAt && (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-success">
          <Icon name="check" size={13} strokeWidth={3} />
          {savedAt} · alimenta lo streak
        </p>
      )}
    </Card>
  );
}
