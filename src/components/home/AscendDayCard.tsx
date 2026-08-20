"use client";

// ============================================================
// ASCEND — Home · Ascend Day
// "Ascend Day: X/Y questa settimana" + stato della giornata di oggi.
// ============================================================

import { ascordWeek } from "@/lib/compute";
import type { DB } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { ProgressBar, EmptyState } from "@/components/ui/Misc";

export function AscendDayCard({ db }: { db: DB }) {
  const asc = ascordWeek(db);
  const today = asc.today;

  return (
    <Card className="flex flex-col gap-3">
      <CardHeader>
        <div>
          <CardTitle>Ascend Day</CardTitle>
          <CardSubtitle>
            {asc.total > 0
              ? `${asc.won}/${asc.total} vinti questa settimana`
              : "Nessun obiettivo configurato"}
          </CardSubtitle>
        </div>
        <span
          className={`text-2xl font-semibold tnum leading-none ${
            asc.total > 0 && asc.won === asc.total ? "text-success" : "text-accent"
          }`}
        >
          {asc.won}/{asc.total}
        </span>
      </CardHeader>

      {asc.total === 0 ? (
        <EmptyState
          icon="🎯"
          title="Nessun obiettivo quotidiano"
          description="Configura i tuoi obiettivi nella sezione Obiettivi per iniziare a vincere gli Ascend Day."
        />
      ) : (
        <>
          <ProgressBar value={asc.won} max={asc.total} />

          <div className="rounded-lg border border-border bg-elevated/50 p-3">
            {today ? (
              <>
                <p className="text-xs text-muted-foreground">Stato di oggi</p>
                {today.met ? (
                  <p className="mt-1 text-sm font-medium text-success">
                    ✓ Ascend Day conquistato ({today.done}/{today.total})
                  </p>
                ) : (
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {today.done}/{today.total} completati — ancora qualcosa da fare
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Oggi non rientra ancora nella settimana.
              </p>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
