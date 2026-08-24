"use client";

// ============================================================
// Zona Benessere — KPI in StatCard (AnimatedNumber):
// Sonno notte scorsa · Media sonno 7gg · Peso attuale (+delta
// vs ≥6gg fa) · Umore medio 7gg · Giorni registrati (30gg).
// ============================================================

import { useMemo } from "react";
import { useDB } from "@/lib/storage";
import { StatCard } from "@/components/ui/StatCard";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Icon } from "@/components/ui/Icon";
import { todayKey, addDaysKey } from "@/lib/dates";
import { sleepOn, avgSleep, avgMood, lastWeight, weightDelta, daysLogged } from "@/lib/wellness";

export function WellnessKpis() {
  const db = useDB();
  const tz = db.settings.timezone;
  const today = todayKey(tz);

  const sleepLast = useMemo(() => sleepOn(db, addDaysKey(today, -1)), [db, today]);
  const sleepAvg7 = useMemo(() => avgSleep(db, 7, today), [db, today]);
  const weight = useMemo(() => lastWeight(db), [db]);
  const delta = useMemo(() => weightDelta(db), [db]);
  const moodAvg7 = useMemo(() => avgMood(db, 7, today), [db, today]);
  const logged30 = useMemo(() => daysLogged(db, 30, today), [db, today]);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <StatCard
        label="Sonno notte scorsa"
        value={
          sleepLast != null ? (
            <span className="flex items-baseline gap-1">
              <AnimatedNumber value={sleepLast} fmt={(n) => n.toFixed(1)} />
              <span className="text-sm text-muted-foreground">h</span>
            </span>
          ) : (
            <span className="text-sm font-medium text-muted-foreground">—</span>
          )
        }
        icon={<Icon name="moon" size={16} className="text-accent" />}
        delta={
          sleepLast == null
            ? "Non registrato ieri"
            : sleepLast >= 7 && sleepLast <= 9
              ? "In fascia consigliata"
              : sleepLast < 7
                ? "Sotto le 7h"
                : "Oltre le 9h"
        }
        deltaTone={sleepLast != null && sleepLast >= 7 && sleepLast <= 9 ? "positive" : "neutral"}
      />
      <StatCard
        label="Media sonno · 7gg"
        value={
          sleepAvg7 != null ? (
            <span className="flex items-baseline gap-1">
              <AnimatedNumber value={sleepAvg7} fmt={(n) => n.toFixed(1)} />
              <span className="text-sm text-muted-foreground">h</span>
            </span>
          ) : (
            <span className="text-sm font-medium text-muted-foreground">—</span>
          )
        }
        icon={<Icon name="activity" size={16} className="text-accent" />}
        delta={sleepAvg7 == null ? "Servono dati" : "Target 7–9h"}
      />
      <StatCard
        label="Peso attuale"
        value={
          weight ? (
            <span className="flex items-baseline gap-1">
              <AnimatedNumber value={weight.value} fmt={(n) => n.toFixed(1)} />
              <span className="text-sm text-muted-foreground">kg</span>
            </span>
          ) : (
            <span className="text-sm font-medium text-muted-foreground">—</span>
          )
        }
        icon={<Icon name="scale" size={16} className="text-accent" />}
        delta={
          weight == null
            ? "Registra il primo peso"
            : delta.delta == null || delta.prev == null
              ? "Meno di 6gg di storico"
              : `${delta.delta > 0 ? "+" : ""}${delta.delta.toFixed(1)} kg vs ${delta.prev.toFixed(1)}`
        }
      />
      <StatCard
        label="Umore · 7gg"
        value={
          moodAvg7 != null ? (
            <span className="flex items-baseline gap-1">
              <AnimatedNumber value={moodAvg7} fmt={(n) => n.toFixed(1)} />
              <span className="text-sm text-muted-foreground">/5</span>
            </span>
          ) : (
            <span className="text-sm font-medium text-muted-foreground">—</span>
          )
        }
        icon={<Icon name="heart" size={16} className="text-accent" />}
        delta={moodAvg7 == null ? "Servono dati" : moodAvg7 >= 4 ? "Buon umore" : "Da tenere d'occhio"}
      />
      <StatCard
        label="Giorni registrati · 30gg"
        value={<AnimatedNumber value={logged30} fmt={(n) => String(n)} />}
        icon={<Icon name="check" size={16} className="text-accent" />}
        delta={logged30 === 0 ? "Inizia oggi" : logged30 >= 21 ? "Costanza top" : "Obiettivo: 21+"}
      />
    </div>
  );
}