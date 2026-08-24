"use client";

// ============================================================
// ASCEND — Home · Heatmap attività (ultimi 3 mesi)
// Colonne = settimane (da lunedì), celle = {date, level 0..4}.
// Livello = numero di azioni del giorno (transazioni, trade,
// allenamenti, log PC, aggiornamenti libri), quantizzato.
// ============================================================

import { useMemo } from "react";
import {
  todayKey,
  addDaysKey,
  isoToDayKey,
  parseDateKey,
} from "@/lib/dates";
import type { DB } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { ActivityHeatmap } from "@/components/charts";

type Cell = { date: string; level: 0 | 1 | 2 | 3 | 4 };

function levelOf(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 7) return 3;
  return 4;
}

export function ActivityHeatmapCard({ db }: { db: DB }) {
  const { weeks, activeDays } = useMemo(() => {
    const tz = db.settings.timezone;
    const today = todayKey(tz);

    // conteggio azioni per giorno su ~3 mesi
    const counts = new Map<string, number>();
    const bump = (dk: string) => counts.set(dk, (counts.get(dk) ?? 0) + 1);

    db.transactions.forEach((t) => bump(t.date));
    db.trades.forEach((t) => bump(isoToDayKey(t.closeDate, tz)));
    db.workouts.forEach((w) => bump(w.date));
    db.pcUsageLogs.forEach((p) => bump(p.date));
    db.books.forEach((b) => bump(isoToDayKey(b.updatedAt, tz)));

    // inizio intervallo (~90 giorni fa) allineato a lunedì
    const start = addDaysKey(today, -90);
    const { y, m, d } = parseDateKey(start);
    const dow = new Date(y, m - 1, d).getDay(); // 0=dom
    const monIndex = (dow + 6) % 7; // 0=lun
    const weekStart = addDaysKey(start, -monIndex);

    const weeks: Cell[][] = [];
    let cursor = weekStart;
    while (cursor <= today) {
      const week: Cell[] = [];
      for (let i = 0; i < 7; i++) {
        const dk = addDaysKey(cursor, i);
        week.push({ date: dk, level: levelOf(counts.get(dk) ?? 0) });
      }
      weeks.push(week);
      cursor = addDaysKey(cursor, 7);
    }
    const activeDays = weeks.flat().filter((c) => c.level > 0).length;
    return { weeks, activeDays };
  }, [db]);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Attività · ultimi 3 mesi</CardTitle>
          <CardSubtitle>
            {activeDays > 0
              ? `${activeDays} giorni attivi nel periodo`
              : "Nessuna attività registrata"}
          </CardSubtitle>
        </div>
      </CardHeader>
      <ActivityHeatmap weeks={weeks} />
      <div className="mt-3 flex items-center justify-end gap-1.5">
        <span className="mr-1 text-[11px] text-muted-foreground">Meno</span>
        {["#1a1a1d", "#27282e", "#3a4c78", "#4C7EFF", "#8aadff"].map((c) => (
          <span
            key={c}
            className="h-3 w-3 rounded-[3px]"
            style={{ backgroundColor: c }}
          />
        ))}
        <span className="ml-1 text-[11px] text-muted-foreground">Più</span>
      </div>
    </Card>
  );
}
