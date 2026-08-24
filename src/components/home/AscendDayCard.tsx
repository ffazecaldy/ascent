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

/**
 * Geometria calendario — la misura effettiva è FLUIDa (ResizeObserver sulla
 * colonna): le celle riempiono tutta la larghezza disponibile. Questa costante
 * è solo il fallback pre-misurazione (SSR e primo render client identici).
 */
const CELL_SIZE = 13;
const DAY_COL_W = 16 + 4; // larghezza totale colonna lettere giorni

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

  // --- Calendario attività stile GitHub: finestra RULLANTE di 26 settimane
  // (≈6 mesi) che termina con la settimana corrente. Colonne = settimane
  // lun→dom; label del mese sopra la prima colonna che lo apre, centrata sul
  // suo blocco (in % della griglia: mai sforamenti a qualsiasi larghezza).
  const calendar = useMemo(() => {
    const today = todayKey(db.settings.timezone);
    const [y0, m0, d0] = today.split("-").map(Number);
    const todayDow = new Date(y0, m0 - 1, d0).getDay(); // 0=dom
    const mondayOfThisWeek = addDaysKey(today, -((todayDow + 6) % 7));
    const start = addDaysKey(mondayOfThisWeek, -25 * 7); // 26 colonne esatte
    type Cell = { dk: string; level: number; count: number };
    const weeks: Cell[][] = [];
    let activeDays = 0;
    let totalActions = 0;
    let cursor = start;
    while (cursor <= today) {
      const col: Cell[] = [];
      for (let i = 0; i < 7; i++) {
        const dk = addDaysKey(cursor, i);
        const count = actionsOnDay(db, dk).length;
        if (count > 0) activeDays++;
        totalActions += count;
        const level = count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count === 3 ? 3 : 4;
        col.push({ dk, level, count });
      }
      weeks.push(col);
      cursor = addDaysKey(cursor, 7);
    }
    // label mesi: sopra la prima colonna che apre un mese nuovo; ogni label
    // copre lo span di colonne fino alla successiva (centrata nel blocco).
    const monthLabels: { col: number; label: string; span: number }[] = [];
    let lastMonth = -1;
    weeks.forEach((col, ci) => {
      const m2 = Number(col[0].dk.slice(5, 7)) - 1;
      if (m2 !== lastMonth) {
        monthLabels.push({ col: ci, label: MONTH_LABELS[m2], span: 1 });
        if (monthLabels.length > 1) {
          const prev = monthLabels[monthLabels.length - 2];
          prev.span = ci - prev.col;
        }
        lastMonth = m2;
      }
    });
    if (monthLabels.length > 0) {
      monthLabels[monthLabels.length - 1].span =
        weeks.length - monthLabels[monthLabels.length - 1].col;
    }
    return { weeks, monthLabels, activeDays, totalActions };
  }, [db]);
  const days = Array.from({ length: 7 }, (_, i) => addDaysKey(weekStart, i));

  // Griglia FLUIDA via CSS puro: colonne `repeat(N, minmax(CELL_SIZE px, 1fr))`
  // + celle aspect-square → il browser distribuisce da solo TUTTA la larghezza
  // disponibile (nessuna misura JS, zero mismatch, si adatta a ogni viewport).
  const N = calendar.weeks.length;
  const FLUID_GAP = 4;

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
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Attività · ultimi 6 mesi
            </p>
            <p className="tnum text-xs text-secondary-text">
              {calendar.activeDays} giorni attivi · {calendar.totalActions} azioni
            </p>
          </div>
          <div className="overflow-x-auto pb-1">
            <div className="inline-block w-full">
              {/* label mesi — absolute, centrate sullo span di colonne; left in %
                  sulla larghezza della griglia (margine lettere a parte), nessun
                  accumulo di larghezze → mai sforamento. Prima label flush a
                  sinistra, mai troncata. */}
              <div className="relative" style={{ marginLeft: DAY_COL_W, height: 12 }}>
                {calendar.monthLabels.map((lbl, i) => (
                  <span
                    key={lbl.col}
                    className="absolute top-0 block whitespace-nowrap text-[11px] leading-[12px] text-muted-foreground"
                    style={
                      i === 0
                        ? { left: 0 }
                        : { left: `${((lbl.col + lbl.span / 2) / N) * 100}%`, transform: "translateX(-50%)" }
                    }
                  >
                    {lbl.label}
                  </span>
                ))}
              </div>
              <div className="flex items-stretch" style={{ gap: FLUID_GAP }}>
                {/* lettere giorni — riempiono l'intera altezza della griglia */}
                <div className="flex w-4 shrink-0 flex-col" style={{ gap: FLUID_GAP }}>
                  {DAY_LETTERS.map((l, i) => (
                    <span
                      key={i}
                      className="flex flex-1 items-center justify-center text-[11px] leading-none text-muted-foreground"
                    >
                      {l}
                    </span>
                  ))}
                </div>
                {/* colonne settimane — celle quadrate: 1fr distribuisce tutta la
                    larghezza disponibile, aspect-ratio rende la cella quadrata */}
                <div
                  className="grid min-w-0 flex-1"
                  style={{ gridTemplateColumns: `repeat(${N}, minmax(${CELL_SIZE}px, 1fr))`, gap: FLUID_GAP }}
                >
                  {calendar.weeks.map((col) =>
                    col.map((cell) => (
                      <div
                        key={cell.dk}
                        title={`${cell.dk.split("-").reverse().join("/")} · ${cell.count} ${cell.count === 1 ? "azione" : "azioni"}`}
                        style={{ aspectRatio: "1 / 1" }}
                        className={
                          "rounded-[4px] transition-colors duration-300 " + LEVEL_BG[cell.level]
                        }
                      />
                    ))
                  )}
                </div>
              </div>
              {/* legenda — riga propria sotto le celle, mai a contatto con esse */}
              <div className="mt-2 flex flex-wrap items-center justify-end gap-x-1.5 gap-y-1">
                <span className="text-[11px] leading-none text-muted-foreground">meno</span>
                {LEVEL_BG.map((bg, i) => (
                  <span key={i} className={`h-[10px] w-[10px] shrink-0 rounded-[3px] ${bg}`} />
                ))}
                <span className="text-[11px] leading-none text-muted-foreground">più</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
