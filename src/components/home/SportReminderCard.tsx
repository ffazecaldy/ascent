"use client";

// ============================================================
// ASCEND — Home · Sport Reminder Card
// Se oggi è un giorno di allenamento (∈ weekDays di qualche
// disciplina) mostra la card evidenziata con check rapido che
// registra un allenamento standard da 45 min.
// Se oggi non è previsto nulla ma mancano sessioni nella
// settimana, mostra la versione soft ("Questa settimana: 1/3").
// Non renderizza nulla senza profilo sport.
// ============================================================

import { useMemo } from "react";
import { updateDB, uid, nowISO } from "@/lib/storage";
import { sportTodayDisciplines, sportWeekStats } from "@/lib/compute";
import { weekStartKey, todayKey } from "@/lib/dates";
import type { DB, Workout } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { sportColorFor, sportIconFor } from "@/components/sport/sport-meta";

/** Durata dell'allenamento "standard" registrato dal check rapido. */
const QUICK_SESSION_MIN = 45;

function fmtDur(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function SportReminderCard({ db }: { db: DB }) {
  const tz = db.settings.timezone;
  const today = todayKey(tz);
  const weekStart = weekStartKey(today, db.settings.weekStart);

  const todayDisciplines = useMemo(() => sportTodayDisciplines(db), [db]);
  const weekStats = useMemo(() => sportWeekStats(db, weekStart), [db, weekStart]);

  // Allenamenti già fatti oggi (uno qualsiasi soddisfa il promemoria del giorno)
  const doneToday = useMemo(
    () => db.workouts.some((w) => w.date === today),
    [db.workouts, today]
  );

  const profile = db.sportProfile;
  if (!profile || profile.disciplines.length === 0) return null;

  async function quickCheck() {
    const first = todayDisciplines[0];
    const w: Workout = {
      id: uid(),
      date: todayKey(db.settings.timezone),
      type: first ? first.name : "Altro",
      durationMin: QUICK_SESSION_MIN,
      note: "Sessione rapida",
      createdAt: nowISO(),
    };
    updateDB((d) => ({ ...d, workouts: [...d.workouts, w] }));
  }

  // ——— Versione EVIDENZIATA: oggi è giorno di allenamento ———
  if (todayDisciplines.length > 0) {
    const names = todayDisciplines.map((d) => d.name);
    return (
      <Card hairline="accent" texture className="border-accent/40 shadow-[0_0_36px_-10px_rgba(76,126,255,0.55)]">
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-accent/15 text-accent">
                <Icon name={sportIconFor(names[0])} size={14} />
              </span>
              Oggi ti alleni: {names.join(" + ")}
            </CardTitle>
            <CardSubtitle>
              Sessione standard {QUICK_SESSION_MIN} min · spunta quando hai finito
            </CardSubtitle>
          </div>
          <Badge tone={doneToday ? "success" : "info"} pulse={!doneToday}>
            {doneToday ? "Fatto" : "Oggi"}
          </Badge>
        </CardHeader>

        <div className="flex flex-wrap items-center gap-2">
          {todayDisciplines.map((d) => {
            const color = sportColorFor(d.name);
            return (
              <span
                key={d.id}
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                style={{ color, backgroundColor: `${color}14`, borderColor: `${color}40` }}
              >
                <Icon name={sportIconFor(d.name)} size={12} className="shrink-0" />
                {d.name}
                {d.weekDays.length > 0 && (
                  <span className="tnum opacity-70">· {d.weekDays.length}×/sett</span>
                )}
              </span>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className={cn("text-xs", doneToday ? "text-success" : "text-muted-foreground")}>
            {doneToday ? (
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Icon name="check" size={13} strokeWidth={2.5} /> Allenamento registrato — ottimo.
              </span>
            ) : (
              <>
                Settimana: <span className="tnum text-secondary-text">{weekStats.sessions}/{profile.weeklySessionsTarget}</span>{" "}
                · {fmtDur(weekStats.minutes)} su {fmtDur(profile.weeklyMinutesTarget)}
              </>
            )}
          </p>
          {!doneToday && (
            <Button size="sm" onClick={quickCheck} glow>
              <Icon name="check" size={14} strokeWidth={2.4} /> Spunta rapida ({QUICK_SESSION_MIN}m)
            </Button>
          )}
        </div>
      </Card>
    );
  }

  // ——— Versione SOFT: oggi riposo ma mancano sessioni in settimana ———
  const remaining = Math.max(0, profile.weeklySessionsTarget - weekStats.sessions);
  if (remaining > 0) {
    return (
      <Card className="border-border">
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-elevated text-secondary-text">
                <Icon name="calendar" size={14} />
              </span>
              Questa settimana:{" "}
              <span className="tnum">
                {weekStats.sessions}/{profile.weeklySessionsTarget}
              </span>
            </CardTitle>
            <CardSubtitle>
              Ti restan{remaining === 1 ? "o" : "o"} {remaining} sessione{remaining === 1 ? "" : "i"} ·{" "}
              {fmtDur(Math.max(0, profile.weeklyMinutesTarget - weekStats.minutes))} da recuperare
            </CardSubtitle>
          </div>
          <Badge tone="default">Sport</Badge>
        </CardHeader>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Oggi niente sessioni in programma — il riposo programmato non rompe lo streak attività.
          Recupera nei prossimi giorni:{" "}
          <a href="/sport" className="font-medium text-accent hover:underline">
            apri Sport →
          </a>
        </p>
      </Card>
    );
  }

  // Tutto fatto e oggi riposo: nessun promemoria necessario
  return null;
}
