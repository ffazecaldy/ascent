"use client";

// ============================================================
// Zona Studio — Timer: sessione veloce start/stop.
// Al fermo assegna durata = minuti trascorsi e salva subito
// una sessione (data oggi tz, materia scelta) via useDB.
// La materia è scelta da preset + materie salvate
// (db.studySubjects) + materie derivate dai log — come StudyForm.
// L'epoch di start è persistito in localStorage (ascend:study-timer-start):
// la sessione sopravvive a reload/navigazione e riprende al mount.
// stop() calcola i minuti da Date.now() - startRef (mai dallo stato
// elapsed, che con la tab in background resta indietro) ed è protetto
// da doppio click (busy) per non duplicare la sessione.
// Soglia minima: sotto 1 minuto la sessione NON viene salvata.
// Pomodoro 25/5 (opt-in): a 25 min propone una pausa di 5 min che
// congela il conteggio e riprende da sola. La pausa è solo in-memoria:
// START_KEY resta invariato, quindi un reload durante la pausa
// riprende come sessione normale (la pausa in corso va persa).
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { useDB, updateDB, uid, nowISO } from "@/lib/storage";
import { todayKey } from "@/lib/dates";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { SUBJECT_PRESETS } from "./constants";
import { Icon } from "@/components/ui/Icon";

const START_KEY = "ascend:study-timer-start";
const MODE_KEY = "ascend:study-timer-mode";
const POMODORO_SEC = 25 * 60;
const BREAK_SEC = 5 * 60;
const MIN_SAVE_MS = 60_000;

type TimerMode = "libero" | "25/5";

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

/** Modalità persistita (default "libero" se assente/corrotto). */
function readStoredMode(): TimerMode {
  if (typeof window === "undefined") return "libero";
  try {
    return window.localStorage.getItem(MODE_KEY) === "25/5" ? "25/5" : "libero";
  } catch {
    return "libero";
  }
}

/** Secondi → "mm:ss". */
function fmtSec(total: number): string {
  const s = Math.max(0, Math.floor(total));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
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
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); // disabilita "Stop e salva" durante il salvataggio
  const [mode, setMode] = useState<TimerMode>("libero");
  const [onBreak, setOnBreak] = useState(false);
  const [breakLeft, setBreakLeft] = useState(0); // secondi di pausa rimanenti
  const startRef = useRef(0);
  const breakStartRef = useRef(0);
  const savedTimer = useRef<number | null>(null);
  const busyRef = useRef(false); // guardia sincrona anti doppio click

  // Materie salvate dall'utente (escluse quelle già nei preset) — come StudyForm.
  const savedSubjects = useMemo(
    () =>
      db.studySubjects
        .map((s) => s.name)
        .filter((n) => !!n && !SUBJECT_PRESETS.includes(n)),
    [db.studySubjects]
  );

  // Materie già usate nei log ma mai salvate (retro-compatibilità) — come StudyForm.
  const derivedCustoms = useMemo(
    () =>
      Array.from(
        new Set(
          db.studySessions.map((s) => s.subject).filter((t) => !!t && !SUBJECT_PRESETS.includes(t))
        )
      ),
    [db.studySessions]
  );

  // Opzioni unificate: preset + salvate + derivate; la materia corrente
  // resta sempre selezionabile anche se non più in lista.
  const subjectOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    [...SUBJECT_PRESETS, ...savedSubjects, ...derivedCustoms, subject].forEach((t) => {
      if (t && !seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    });
    return out;
  }, [savedSubjects, derivedCustoms, subject]);

  // Riprendi una sessione persistita (reload, navigazione, riapertura tab)
  // + modalità salvata. Lettura one-shot di localStorage: pattern "sync da
  // sistema esterno" — non si può usare un lazy initializer (causerebbe
  // hydration mismatch SSR).
  useEffect(() => {
    const stored = readStoredStart();
    if (stored > 0) {
      startRef.current = stored;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setElapsed(Math.max(0, Math.floor((Date.now() - stored) / 1000)));
      setRunning(true);
    }
    const storedMode = readStoredMode();
    if (storedMode !== "libero") {
      setMode(storedMode);
    }
  }, []);

  // Conteggio sessione: derivato da Date.now() - startRef (robusto al
  // background). Congelato durante la pausa pomodoro.
  useEffect(() => {
    if (!running || onBreak) return;
    const t = window.setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startRef.current) / 1000)));
    }, 1000);
    return () => window.clearInterval(t);
  }, [running, onBreak]);

  // Countdown della pausa: derivato da timestamp (robusto al background).
  // Alla scadenza sposta startRef in avanti della pausa reale così il
  // conteggio riprende da dove si era fermato, poi riprende da solo.
  useEffect(() => {
    if (!running || !onBreak) return;
    const t = window.setInterval(() => {
      const left = Math.max(0, Math.round((breakStartRef.current + BREAK_SEC * 1000 - Date.now()) / 1000));
      setBreakLeft(left);
      if (left <= 0) {
        startRef.current += Date.now() - breakStartRef.current;
        setOnBreak(false);
        setElapsed(Math.max(0, Math.floor((Date.now() - startRef.current) / 1000)));
      }
    }, 1000);
    return () => window.clearInterval(t);
  }, [running, onBreak]);

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

  function flashMessage(kind: "saved" | "notice", text: string) {
    if (kind === "saved") {
      setSavedAt(text);
    } else {
      setNotice(text);
    }
    if (savedTimer.current) window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => {
      setSavedAt(null);
      setNotice(null);
    }, 3500);
  }

  function clearPersistedStart() {
    try {
      window.localStorage.removeItem(START_KEY);
    } catch {
      // best-effort
    }
  }

  function changeMode(next: TimerMode) {
    setMode(next);
    try {
      window.localStorage.setItem(MODE_KEY, next);
    } catch {
      // best-effort: senza persistenza la modalità vale per la sessione
    }
  }

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
    setNotice(null);
    setOnBreak(false);
    setBreakLeft(0);
    setRunning(true);
  }

  function startBreak() {
    if (!running || onBreak) return;
    breakStartRef.current = Date.now();
    setBreakLeft(BREAK_SEC);
    setOnBreak(true);
  }

  function stop() {
    if (!running || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    // Millisecondi effettivi di studio: se in pausa, la pausa in corso
    // non conta (il conteggio era congelato).
    const endRef = onBreak ? breakStartRef.current : Date.now();
    const elapsedMs = endRef - startRef.current;
    if (elapsedMs < MIN_SAVE_MS) {
      clearPersistedStart();
      setRunning(false);
      setOnBreak(false);
      setBreakLeft(0);
      setElapsed(0);
      flashMessage("notice", "Sessione troppo breve (<1 min), non salvata");
      setBusy(false);
      busyRef.current = false;
      return;
    }
    // Minuti dall'epoch DI PARTENZA, mai dallo stato elapsed: con la tab in
    // background l'intervallo non gira e elapsed resta indietro.
    // elapsedMs >= 60s garantisce minutes >= 1 dopo l'arrotondamento.
    const minutes = Math.round(elapsedMs / 60000);
    updateDB((d) => ({
      ...d,
      studySessions: [
        ...d.studySessions,
        { id: uid(), date: today, subject, minutes, createdAt: nowISO() },
      ],
    }));
    clearPersistedStart();
    setRunning(false);
    setOnBreak(false);
    setBreakLeft(0);
    setElapsed(0);
    flashMessage("saved", `Sessione salvata · ${minutes} min`);
    setBusy(false);
    busyRef.current = false;
  }

  const pomodoroDue = mode === "25/5" && running && !onBreak && elapsed >= POMODORO_SEC;

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
              {subjectOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>

          <div className="min-w-[140px]">
            <Select
              value={mode}
              onChange={(e) => changeMode(e.target.value === "25/5" ? "25/5" : "libero")}
              aria-label="Modalità timer"
            >
              <option value="libero">Libero</option>
              <option value="25/5">Pomodoro 25/5</option>
            </Select>
          </div>

          <div
            className={`tnum text-2xl font-semibold tracking-tight ${
              running ? "text-accent" : "text-secondary-text"
            }`}
          >
            {fmtSec(elapsed)}
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

      {pomodoroDue && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-elevated/40 px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <Icon name="timer" size={13} className="text-accent" />
            25:00 — pausa 5:00?
          </span>
          <span className="flex-1" />
          <Button size="sm" variant="subtle" onClick={stop} disabled={busy}>
            Chiudi e salva
          </Button>
          <Button size="sm" onClick={startBreak}>
            Pausa 5 min
          </Button>
        </div>
      )}

      {running && onBreak && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-elevated/40 px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <Icon name="pause" size={13} className="text-accent" />
            In pausa {fmtSec(breakLeft)} — il conteggio riprende da solo
          </span>
          <span className="flex-1" />
          <Button size="sm" variant="subtle" onClick={stop} disabled={busy}>
            Chiudi e salva
          </Button>
          <Button size="sm" disabled>
            In pausa…
          </Button>
        </div>
      )}

      {savedAt && (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-success">
          <Icon name="check" size={13} strokeWidth={3} />
          {savedAt} · alimenta lo streak
        </p>
      )}

      {notice && (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon name="alert" size={13} />
          {notice}
        </p>
      )}
    </Card>
  );
}
