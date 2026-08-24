"use client";

// ============================================================
// ASCEND — Home · Benessere Card
// Sonno della notte scorsa + peso attuale con link alla Zona
// Benessere. CTA "Log di oggi" quando manca il dato odierno.
// ============================================================

import { useMemo } from "react";
import Link from "next/link";
import type { DB } from "@/lib/types";
import { todayKey, addDaysKey } from "@/lib/dates";
import { sleepOn, lastWeight, logForDay } from "@/lib/wellness";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";

export function WellnessTodayCard({ db }: { db: DB }) {
  const tz = db.settings.timezone;
  const today = todayKey(tz);

  const sleep = useMemo(() => sleepOn(db, addDaysKey(today, -1)), [db, today]);
  const weight = useMemo(() => lastWeight(db), [db]);
  const loggedToday = useMemo(() => logForDay(db, today), [db, today]);
  const hasTodayData =
    loggedToday != null &&
    (loggedToday.sleepHours != null ||
      loggedToday.weightKg != null ||
      loggedToday.mood != null);

  return (
    <Link href="/benessere" className="block">
      <Card hairline={hasTodayData ? undefined : "accent"} className="transition-colors">
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-accent/15 text-accent">
                <Icon name="moon" size={14} />
              </span>
              Benessere
            </CardTitle>
            <CardSubtitle>
              {sleep != null
                ? `Sonno: ${sleep.toFixed(1)}h · Peso: ${weight ? weight.value.toFixed(1) + " kg" : "—"}`
                : weight != null
                  ? `Peso: ${weight.value.toFixed(1)} kg`
                  : "Sonno, umore e peso, un giorno alla volta"}
            </CardSubtitle>
          </div>
          <Badge tone={hasTodayData ? "success" : "info"} pulse={!hasTodayData}>
            {hasTodayData ? "Loggato oggi" : "Da registrare"}
          </Badge>
        </CardHeader>
      </Card>
    </Link>
  );
}