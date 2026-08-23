"use client";

// ============================================================
// ASCEND — Sport Zone · Wizard prima configurazione (3 step)
// Step 1: scelta sport da preset multipli (+ campo libero "Altro")
// Step 2: per ogni sport scelto, selezione giorni della settimana
// Step 3: mini-obiettivi (sessioni/settimana, minuti/settimana)
// Salvato in db.sportProfile → il wizard non viene più mostrato
// (riapribile precompilato con "Modifica profilo").
// ============================================================

import { useMemo, useState } from "react";
import type { SportDiscipline, SportProfile } from "@/lib/types";
import { uid, nowISO } from "@/lib/storage";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Input, Label } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import { SPORT_PRESETS, weekdayOrder } from "./sport-meta";
import { hoursToMinutes, minutesToHoursLabel } from "@/lib/sport-meta";

const SESSIONS_MIN = 1;
const SESSIONS_MAX = 14;

export function SportSetupWizard({
  initial,
  onSave,
}: {
  /** profilo esistente → wizard precompilato (modalità "modifica") */
  initial?: SportProfile | null;
  onSave: (profile: SportProfile) => void;
}) {
  const editing = !!initial;

  // ---------- stato step ----------
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // step 1: nomi scelti (preset + custom), ordine di selezione
  const [selected, setSelected] = useState<string[]>(() =>
    initial ? initial.disciplines.map((d) => d.name) : []
  );
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherDraft, setOtherDraft] = useState("");

  // step 2: giorni per disciplina — keyed per nome, così aggiungere/togliere
  // sport nello step 1 non richiede sincronizzazioni imperative.
  const [daysByName, setDaysByName] = useState<Record<string, number[]>>(() => {
    if (!initial) return {};
    return Object.fromEntries(initial.disciplines.map((d) => [d.name, [...d.weekDays]]));
  });

  // step 3: obiettivi (default 3 sessioni / 2.5h = 150 min). Lo slider è in ORE,
  // la persistenza resta in minuti (weeklyMinutesTarget) per compatibilità.
  const [sessionsTarget, setSessionsTarget] = useState<number>(
    initial?.weeklySessionsTarget ?? 3
  );
  const [minutesTarget, setMinutesTarget] = useState<number>(
    initial?.weeklyMinutesTarget ?? 150
  );
  // Display in ore (slider step 0.5h), persistenza in minuti: le due viste
  // derivano SEMPRE dallo stesso minutesTarget via helper condivise di
  // @/lib/sport-meta, così riepilogo e valore salvato coincidono.
  const hoursTarget = Math.round((minutesTarget / 60) * 2) / 2; // step 0.5h per il display
  function setHoursTarget(h: number) {
    setMinutesTarget(hoursToMinutes(h));
  }

  function togglePreset(name: string) {
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }

  function addCustom() {
    const t = otherDraft.trim();
    if (!t || selected.includes(t)) return;
    setSelected((prev) => [...prev, t]);
    setOtherDraft("");
    setOtherOpen(false);
  }

  const weekdays = useMemo(() => weekdayOrder(), []);

  function toggleDay(name: string, dow: number) {
    setDaysByName((prev) => {
      const cur = prev[name] ?? [];
      const next = cur.includes(dow) ? cur.filter((x) => x !== dow) : [...cur, dow];
      return { ...prev, [name]: next };
    });
  }

  const canFinish =
    selected.length > 0 && sessionsTarget >= SESSIONS_MIN && minutesTarget >= 30;

  function save() {
    if (!canFinish) return;
    const disciplines: SportDiscipline[] = selected.map((name) => ({
      id:
        initial?.disciplines.find((d) => d.name === name)?.id ?? uid(),
      name,
      weekDays: (daysByName[name] ?? []).slice().sort((a, b) => a - b),
    }));
    onSave({
      disciplines,
      weeklySessionsTarget: Math.round(sessionsTarget),
      weeklyMinutesTarget: Math.round(minutesTarget),
      onboardedAt: initial?.onboardedAt ?? nowISO(),
    });
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-5 flex flex-col items-center gap-3 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-accent/30 bg-accent/10 shadow-[0_0_28px_-8px_rgba(76,126,255,0.6)]">
          <Icon
            name={step === 1 ? "plus" : step === 2 ? "calendar" : "target"}
            size={24}
            className="text-accent"
          />
        </div>
        <div className="flex items-center justify-center gap-1.5">
          {([1, 2, 3] as const).map((s) => (
            <span
              key={s}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                s === step ? "w-6 bg-accent" : "w-1.5 bg-elevated-2"
              )}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {editing ? "Modifica del tuo profilo sportivo" : "Prima configurazione"} · step{" "}
          {step} di 3
        </p>
      </div>

      {/* ——— STEP 1: scelta sport ——— */}
      {step === 1 && (
        <div className="animate-rise space-y-4">
          <div className="text-center">
            <h2 className="text-lg font-semibold tracking-tight">Che sport pratichi?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Seleziona uno o più sport — i giorni li scegli al passo successivo.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {SPORT_PRESETS.map((p) => {
              const active = selected.includes(p.name);
              return (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => togglePreset(p.name)}
                  aria-pressed={active}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-all",
                    active
                      ? "border-accent/60 bg-accent/10 text-foreground shadow-[0_0_18px_-6px_rgba(76,126,255,0.55)]"
                      : "border-border bg-elevated/40 text-secondary-text hover:border-border-strong hover:text-foreground"
                  )}
                >
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                    style={{ backgroundColor: `${p.color}1f`, color: p.color }}
                  >
                    <Icon name={p.icon} size={15} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {active && (
                    <Icon name="check" size={14} strokeWidth={2.4} className="shrink-0 text-accent" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Campo libero "Altro" */}
          <div className="rounded-xl border border-dashed border-border-strong p-3">
            {!otherOpen ? (
              <button
                type="button"
                onClick={() => setOtherOpen(true)}
                className="flex items-center gap-2 text-sm font-medium text-accent hover:underline"
              >
                <Icon name="plus" size={14} /> Altro… aggiungi uno sport personalizzato
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  autoFocus
                  value={otherDraft}
                  placeholder="Nome dello sport (es. Padel)"
                  onChange={(e) => setOtherDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustom();
                    }
                  }}
                />
                <Button size="sm" onClick={addCustom} disabled={!otherDraft.trim()}>
                  Aggiungi
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setOtherOpen(false);
                    setOtherDraft("");
                  }}
                >
                  Annulla
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end pt-1">
            <Button onClick={() => setStep(2)} disabled={selected.length === 0}>
              Avanti <Icon name="arrow-right" size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* ——— STEP 2: giorni della settimana ——— */}
      {step === 2 && (
        <div className="animate-rise space-y-4">
          <div className="text-center">
            <h2 className="text-lg font-semibold tracking-tight">Quando ti alleni?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Scegli i giorni previsti per ogni sport selezionato.
            </p>
          </div>

          <div className="space-y-3">
            {selected.map((name) => {
              const days = daysByName[name] ?? [];
              return (
                <div key={name} className="rounded-xl border border-border bg-elevated/40 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{name}</p>
                    <span className="tnum text-[11px] text-muted-foreground">
                      {days.length} giorno{days.length === 1 ? "" : "i"}/settimana
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {weekdays.map(({ dow, label, long }) => {
                      const on = days.includes(dow);
                      return (
                        <button
                          key={dow}
                          type="button"
                          title={long}
                          aria-label={`${name} · ${long}`}
                          aria-pressed={on}
                          onClick={() => toggleDay(name, dow)}
                          className={cn(
                            "grid h-9 w-9 place-items-center rounded-full border text-xs font-semibold transition-all",
                            on
                              ? "border-accent/70 bg-accent text-white shadow-[0_0_14px_-4px_rgba(76,126,255,0.7)]"
                              : "border-border-strong bg-muted text-muted-foreground hover:border-accent/50 hover:text-secondary-text"
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-1">
            <Button variant="ghost" onClick={() => setStep(1)}>
              <Icon name="arrow-right" size={14} className="rotate-180" /> Indietro
            </Button>
            <Button onClick={() => setStep(3)}>
              Avanti <Icon name="arrow-right" size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* ——— STEP 3: mini-obiettivi ——— */}
      {step === 3 && (
        <div className="animate-rise space-y-5">
          <div className="text-center">
            <h2 className="text-lg font-semibold tracking-tight">I tuoi mini-obiettivi</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Obiettivi settimanali realistici: la costanza batte l&apos;intensità.
            </p>
          </div>

          {/* Slider sessioni/settimana */}
          <div className="rounded-xl border border-border bg-elevated/40 p-4">
            <Label>Sessioni a settimana</Label>
            <div className="mt-1 flex items-center gap-3">
              <input
                type="range"
                min={SESSIONS_MIN}
                max={SESSIONS_MAX}
                value={sessionsTarget}
                onChange={(e) => setSessionsTarget(Number(e.target.value))}
                className="sport-range h-1.5 w-full cursor-pointer appearance-none rounded-full bg-elevated-2"
                aria-label="Sessioni a settimana"
              />
              <span className="w-16 shrink-0 rounded-lg border border-border-strong bg-card py-1 text-center text-sm font-semibold tnum text-accent">
                {sessionsTarget}/sett
              </span>
            </div>
          </div>

          {/* Slider ore/settimana (persistito in minuti) */}
          <div className="rounded-xl border border-border bg-elevated/40 p-4">
            <Label>Ore a settimana</Label>
            <div className="mt-1 flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={12}
                step={0.5}
                value={hoursTarget}
                onChange={(e) => setHoursTarget(Number(e.target.value))}
                className="sport-range h-1.5 w-full cursor-pointer appearance-none rounded-full bg-elevated-2"
                aria-label="Ore a settimana"
              />
              <span className="w-20 shrink-0 rounded-lg border border-border-strong bg-card py-1 text-center text-sm font-semibold tnum text-accent">
                {minutesToHoursLabel(minutesTarget)}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-accent/25 bg-accent/5 p-3 text-xs leading-relaxed text-muted-foreground">
            <span className="font-semibold text-secondary-text">Riepilogo:</span>{" "}
            {selected.join(", ")} · {sessionsTarget} sessioni/settimana ·{" "}
            {minutesToHoursLabel(minutesTarget)}/settimana.
          </div>

          <div className="flex items-center justify-between pt-1">
            <Button variant="ghost" onClick={() => setStep(2)}>
              <Icon name="arrow-right" size={14} className="rotate-180" /> Indietro
            </Button>
            <Button onClick={save} disabled={!canFinish} glow>
              <Icon name="check" size={15} /> {editing ? "Salva modifiche" : "Inizia ora"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
