"use client";

// ============================================================
// Zona Studio — barra di focus in cima alla pagina: obiettivo
// settimanale di studio (minuti da inizio settimana a oggi)
// + streak di giorni consecutivi (calcolato su un anno per
// coprire serie lunghe). Una sola Card, grande e immediata.
// ============================================================

import { useMemo } from "react";
import type { DB } from "@/lib/types";
import { Card, CardTitle } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { studyStats } from "@/lib/compute";
import { todayKey, addDaysKey, weekStartKey } from "@/lib/dates";
import { cn } from "@/lib/cn";

// Obiettivo fisso per ora — da rendere configurabile
const WEEKLY_TARGET_MIN = 300;

/** Messaggio sotto la barra in base alla percentuale raggiunta. */
function weeklyMessage(pct: number): { text: string; className: string } {
  if (pct >= 100) {
    // Obiettivo centrato: feedback positivo
    return { text: "Obiettivo raggiunto — continua così", className: "text-success" };
  }
  if (pct >= 60) {
    // In carreggiata: tono neutro
    return { text: "Buon ritmo, l'obiettivo è a portata", className: "text-muted-foreground" };
  }
  if (pct < 40) {
    // Poco accumulato: tono di incoraggiamento
    return { text: "Ogni sessione conta: riparti da qui", className: "text-muted-foreground" };
  }
  // Fascia intermedia: incoraggiamento sobrio
  return { text: "Si costruisce giorno per giorno: mantieni il passo", className: "text-muted-foreground" };
}

export function StudyFocusBar({ db }: { db: DB }) {
  const tz = db.settings.timezone;
  const today = todayKey(tz);
  // Settimana corrente: da lunedì (weekStart = 1) a oggi
  const weekStart = weekStartKey(today, 1);

  // Minuti di studio della settimana corrente
  const weekMin = useMemo(
    () =>
      db.studySessions
        .filter((s) => s.date >= weekStart && s.date <= today)
        .reduce((a, s) => a + (s.minutes || 0), 0),
    [db.studySessions, weekStart, today]
  );

  // Streak fino a oggi: la funzione conta all'indietro da `to`,
  // quindi basta una finestra ampia (1 anno) a monte.
  const streakDays = useMemo(
    () => studyStats(db, addDaysKey(today, -365), today).streakDays,
    [db, today]
  );

  const ratio = WEEKLY_TARGET_MIN > 0 ? weekMin / WEEKLY_TARGET_MIN : 0;
  const pct = Math.round(ratio * 100);
  // La barra si satura al 100%, la percentuale a destra resta reale
  const fillPct = Math.min(100, Math.max(0, pct));
  const msg = weeklyMessage(pct);

  return (
    <Card hairline="accent" className="w-full">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
        {/* Obiettivo settimana */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon name="target" size={16} className="shrink-0 text-accent" />
            <CardTitle>Obiettivo settimana</CardTitle>
          </div>

          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5">
            <span className="tnum text-xl font-semibold text-foreground">
              <AnimatedNumber value={weekMin} fmt={(n) => String(Math.round(n))} />
              <span className="text-muted-foreground"> / </span>
              {WEEKLY_TARGET_MIN} min
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">questa settimana</span>
          </p>

          <div className="mt-3 flex items-center gap-3">
            <div
              role="progressbar"
              aria-label="Progresso obiettivo settimanale"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={fillPct}
              className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-elevated"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent to-accent-3 transition-[width] duration-700 ease-out"
                style={{ width: `${fillPct}%` }}
              />
            </div>
            <span className="tnum shrink-0 text-right text-sm font-semibold text-foreground">
              {pct}%
            </span>
          </div>

          <p className={cn("mt-2 text-[11px]", msg.className)}>{msg.text}</p>
        </div>

        {/* Divider: orizzontale su mobile, verticale da sm in su */}
        <div aria-hidden="true" className="h-px w-full bg-border sm:h-16 sm:w-px" />

        {/* Streak giorni consecutivi */}
        <div className="flex shrink-0 items-center gap-3 sm:justify-end">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-dim">
            <Icon name="flame" size={22} className="text-accent" />
          </div>
          <div>
            <p className="tnum flex items-baseline gap-1 text-2xl font-semibold text-foreground">
              <AnimatedNumber value={streakDays} fmt={(n) => String(Math.round(n))} />
              <span className="text-sm font-medium text-muted-foreground">gg</span>
            </p>
            <p className="text-[11px] text-muted-foreground">
              {streakDays > 0 ? "giorni consecutivi" : "nuova serie? inizia oggi"}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
