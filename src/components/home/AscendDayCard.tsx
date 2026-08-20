"use client";

// ============================================================
// ASCEND — Home · Ascend Day
// "X/Y vinti questa settimana" + dots dei 7 giorni + stato di oggi.
// ============================================================

import { ascordWeek, ascordDay } from "@/lib/compute";
import type { DB } from "@/lib/types";
import { todayKey, addDaysKey, weekStartKey } from "@/lib/dates";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/Misc";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Icon } from "@/components/ui/Icon";

export function AscendDayCard({ db }: { db: DB }) {
  const asc = ascordWeek(db);
  const today = asc.today;
  const tz = db.settings.timezone;
  const weekStart = weekStartKey(todayKey(tz), db.settings.weekStart);
  const days = Array.from({ length: 7 }, (_, i) => addDaysKey(weekStart, i));
  const todayKeyResult = todayKey(tz);

  return (
    <Card hairline="success" className="flex flex-col gap-4">
      <CardHeader>
        <div>
          <CardTitle>Ascend Day</CardTitle>
          <CardSubtitle>{asc.total > 0 ? `Settimana: ${asc.won} vinti su ${asc.total}` : "Nessun obiettivo configurato"}</CardSubtitle>
        </div>
        <div className="text-right">
          <AnimatedNumber
            value={asc.won}
            className={`tnum text-3xl font-bold leading-none ${asc.total > 0 && asc.won === asc.total ? "text-success" : "text-accent"}`}
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
              const d = asc.total > 0 ? ascordWeekWin(db, dk) : null;
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
    </Card>
  );
}

function ascordWeekWin(db: DB, dayKey: string): boolean | null {
  if (dayKey > todayKey(db.settings.timezone)) return null;
  const r = ascordDay(db, dayKey);
  return r.total > 0 ? r.met : null;
}
