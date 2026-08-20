"use client";

// ============================================================
// ASCEND — Home · Hero Activity Streak 🔥
// Grande contatore giorni + persistenza automatica del freeze
// (claimFreeze → settings.lastFreezeMonth, 1 al mese).
// ============================================================

import { useEffect } from "react";
import { useDB, updateDB } from "@/lib/storage";
import { activityStreak, claimFreeze } from "@/lib/compute";
import { labelDayKey } from "@/lib/dates";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export function StreakHero() {
  const db = useDB();
  const streak = activityStreak(db);

  // Persiste il freeze consumato (scrive settings.lastFreezeMonth).
  // claimFreeze ritorna null se già consumato questo mese → nessun loop.
  useEffect(() => {
    if (!streak.freezeUsed) return;
    const updated = claimFreeze(db);
    if (!updated) return;
    updateDB((d) =>
      d.settings.lastFreezeMonth === updated.lastFreezeMonth
        ? d
        : { ...d, settings: updated }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, streak.freezeUsed]);

  const locale = db.settings.locale;
  const streakStartLabel = streak.streakStart
    ? labelDayKey(streak.streakStart, locale)
    : null;

  return (
    <Card className="flex flex-col gap-5 overflow-hidden sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <div className="text-5xl leading-none">🔥</div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Activity Streak
          </p>
          <p className="text-5xl font-semibold leading-none tnum">
            {streak.days}
            <span className="ml-2 text-xl font-medium text-secondary-text">
              giorni
            </span>
          </p>
          {streakStartLabel && streak.days > 0 && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Da {streakStartLabel}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {streak.todayActive ? (
          <Badge tone="success">✓ Oggi attivo</Badge>
        ) : streak.freezeUsed ? (
          <Badge tone="info">❄ Freeze attivo · oggi coperto</Badge>
        ) : (
          <Badge>Qualcosa manca oggi</Badge>
        )}
        {streak.days === 0 && (
          <span className="text-xs text-muted-foreground">
            Registra la prima azione per iniziare la striscia.
          </span>
        )}
      </div>
    </Card>
  );
}
