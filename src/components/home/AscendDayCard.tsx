"use client";

// ============================================================
// ASCEND — Home · Ascend Day
// "X/Y vinti questa settimana" + dots dei 7 giorni + stato di oggi.
// Full-width: su desktop layout a 2 colonne (stato | calendario).
// ============================================================

import { useMemo } from "react";
import { ascordWeek, ascordDay, actionsOnDay } from "@/lib/compute";
import type { DB } from "@/lib/types";
import { todayKey, addDaysKey, weekStartKey } from "@/lib/dates";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/Misc";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Icon } from "@/components/ui/Icon";

/** Livelli intensità calendario (stile contribution graph). */
const LEVEL_BG = [
  "bg-border/60",
  "bg-success/25",
  "bg-success/45",
  "bg-success/70",
  "bg-success shadow-[0_0_6px_rgba(45,223,158,0.55)]",
];
const DAY_LETTERS = ["L", "M", "M", "G", "V", "S", "D"];
const MONTH_LABELS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

export function AscendDayCard({ db }: { db: DB }) {
  const tz = db.settings.timezone;
  const todayKeyResult = todayKey(tz);

  // Selettori pesanti: ascordWeek lancia ascordDay per ogni giorno <= oggi, e i
  // dots rilanciano ascordDay per ciascuno dei 7 giorni → raggruppati in un solo
  // giro memoizzato su db (risultati identici a prima).
  const { asc, weekStart, dayStates } = useMemo(() => {
    const asc = ascordWeek(db);
    const weekStart = weekStartKey(todayKey(db.settings.timezone), db.settings.weekStart);
    const dayStates = new Map<string, boolean | null>();
    for (let i = 0; i < 7; i++) {
      const dk = addDaysKey(weekStart, i);
      if (dk > todayKey(db.settings.timezone)) {
        dayStates.set(dk, null);
        continue;
      }
      const r = ascordDay(db, dk);
      dayStates.set(dk, r.total > 0 ? r.met : null);
    }
    return { asc, weekStart, dayStates };
  }, [db]);

  const today = asc.today;

  // --- Calendario attività stile GitHub: ultimi ~3 mesi, orizzontale largo ---
  const calendar = useMemo(() => {
    const today = todayKey(db.settings.timezone);
    // ~90 giorni fa allineato a lunedì
    const startRaw = addDaysKey(today, -90);
    const { y, m, d } = (() => {
      const [yy, mm, dd] = startRaw.split("-").map(Number);
      return { y: yy, m: mm, d: dd };
    })();
    const dow = new Date(y, m - 1, d).getDay(); // 0=dom
    const monIndex = (dow + 6) % 7; // 0=lun
    const start = addDaysKey(startRaw, -monIndex);
    type Cell = { dk: string; level: number; count: number; future: boolean };
    const weeks: Cell[][] = [];
    let activeDays = 0;
    let totalActions = 0;
    let cursor = start;
    while (cursor <= today) {
      const col: Cell[] = [];
      for (let i = 0; i < 7; i++) {
        const dk = addDaysKey(cursor, i);
        const future = dk > today;
        const count = future ? 0 : actionsOnDay(db, dk).length;
        if (count > 0) activeDays++;
        totalActions += count;
        const level = future ? -1 : count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count === 3 ? 3 : 4;
        col.push({ dk, level, count, future });
      }
      weeks.push(col);
      cursor = addDaysKey(cursor, 7);
    }
    // label mesi: sopra la prima colonna che inizia un mese nuovo
    const monthLabels: { col: number; label: string }[] = [];
    let lastMonth = -1;
    weeks.forEach((col, ci) => {
      const m2 = Number(col[0].dk.slice(5, 7)) - 1;
      if (m2 !== lastMonth) {
        monthLabels.push({ col: ci, label: MONTH_LABELS[m2] });
        lastMonth = m2;
      }
    });
    return { weeks, monthLabels, activeDays, totalActions };
  }, [db]);
  const days = Array.from({ length: 7 }, (_, i) => addDaysKey(weekStart, i));

  return (
    <Card hairline="success" className="flex flex-col gap-4 p-5 lg:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-0">
        {/* ——— Colonna sinistra · header + stato settimana + oggi ——— */}
        <div className="flex flex-col gap-4 lg:w-[40%] lg:shrink-0 lg:pr-6">
          <CardHeader className="mb-0">
            <div>
              <CardTitle className="text-sm">Ascend Day</CardTitle>
              <CardSubtitle>{asc.total > 0 ? `Settimana: ${asc.won} vinti su ${asc.total}` : "Nessun obiettivo configurato"}</CardSubtitle>
            </div>
            <div className="text-right">
              <AnimatedNumber
                value={asc.won}
                className={`tnum text-4xl font-bold leading-none ${asc.total > 0 && asc.won === asc.total ? "text-success" : "text-accent"}`}
                fmt={(n) => String(Math.round(n))}
              />
              <span className="tnum text-sm text-muted-foreground">/{asc.total}</span>
            </div>
          </CardHeader>

          {asc.total === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong py-12 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl border border-accent/30 bg-accent/10 shadow-[0_0_28px_-8px_rgba(76,126,255,0.6)]">
                <Icon name="target" size={30} className="text-accent" />
              </div>
              <p className="text-sm font-medium text-secondary-text">Nessun obiettivo quotidiano</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Configura i tuoi obiettivi nella sezione Obiettivi per iniziare a vincere gli Ascend Day.
              </p>
            </div>
          ) : (
            <>
              <ProgressBar value={asc.won} max={asc.total} />

              {/* dots dei 7 giorni */}
              <div className="flex justify-between gap-1">
                {days.map((dk) => {
                  const d = asc.total > 0 ? (dayStates.get(dk) ?? null) : null;
                  const isToday = dk === todayKeyResult;
                  return (
                    <div key={dk} className="flex flex-1 flex-col items-center gap-1">
                      <div
                        className={
                          "h-2.5 w-full rounded-full transition-colors duration-500 " +
                          (d === true ? "bg-gradient-to-r from-success to-emerald-400 shadow-[0_0_8px_rgba(45,223,158,0.5)]" :
                           d === false ? "bg-elevated" : "bg-border")
                        }
                      />
                      <span className={"text-[11px] tnum " + (isToday ? "font-bold text-accent" : "text-muted-foreground")}>
                        {["L","M","M","G","V","S","D"][new Date(dk + "T12:00:00").getDay()]}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-xl border border-border bg-elevated/60 p-3">
                {today ? (
                  today.met ? (
                    <div className="flex items-center gap-2">
                      <span className="animate-pulse-dot h-2 w-2 rounded-full bg-success" />
                      <p className="flex items-center gap-1.5 text-sm font-medium text-success">
                        <Icon name="check" size={13} className="text-success" />
                        Ascend Day conquistato ({today.done}/{today.total})
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm font-medium">
                      <span className="tnum text-accent">{today.done}</span>
                      <span className="text-muted-foreground">/{today.total}</span> completati — ancora qualcosa da fare oggi
                    </p>
                  )
                ) : (
                  <p className="text-xs text-muted-foreground">Oggi non rientra ancora nella settimana.</p>
                )}
              </div>
            </>
          )}
        </div>

        {/* ——— Colonna destra · calendario attività stile GitHub (full width disponibile) ——— */}
        <div className="flex min-w-0 flex-1 flex-col lg:border-l lg:border-l-border lg:pl-6">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Attività · ultime 13 settimane
            </p>
            <p className="tnum text-xs text-secondary-text">
              {calendar.activeDays} giorni attivi · {calendar.totalActions} azioni
            </p>
          </div>
          <div className="overflow-x-auto pb-1">
            <div className="inline-block min-w-full">
              {/* label mesi */}
              <div className="ml-6 flex gap-[3px]">
                {calendar.weeks.map((_, ci) => {
                  const lbl = calendar.monthLabels.find((m) => m.col === ci);
                  return (
                    <div key={ci} className="w-[13px] text-left">
                      {lbl && <span className="block whitespace-nowrap text-[9px] text-muted-foreground">{lbl.label}</span>}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-[3px]">
                {/* lettere giorni */}
                <div className="mr-1 flex w-4 flex-col gap-[3px]">
                  {DAY_LETTERS.map((l, i) => (
                    <span key={i} className="flex h-[13px] items-center text-[8px] leading-none text-muted-foreground">{l}</span>
                  ))}
                </div>
                {/* colonne settimane */}
                {calendar.weeks.map((col, ci) => (
                  <div key={ci} className="flex flex-col gap-[3px]">
                    {col.map((cell) => (
                      <div
                        key={cell.dk}
                        title={
                          cell.future
                            ? undefined
                            : `${cell.dk.split("-").reverse().join("/")} · ${cell.count} ${cell.count === 1 ? "azione" : "azioni"}`
                        }
                        className={
                          "h-[13px] w-[13px] rounded-[3px] transition-colors duration-300 " +
                          (cell.future ? "bg-transparent" : LEVEL_BG[cell.level])
                        }
                      />
                    ))}
                  </div>
                ))}
              </div>
              {/* legenda */}
              <div className="mt-2 flex items-center justify-end gap-1.5">
                <span className="text-[9px] text-muted-foreground">meno</span>
                {LEVEL_BG.map((bg, i) => (
                  <span key={i} className={`h-[10px] w-[10px] rounded-[3px] ${bg}`} />
                ))}
                <span className="text-[9px] text-muted-foreground">più</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
