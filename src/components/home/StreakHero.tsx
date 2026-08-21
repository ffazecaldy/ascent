"use client";

// ============================================================
// ASCEND — Home · Hero Activity Streak
// Grande contatore con COUNT-UP + anello di progresso verso il
// prossimo traguardo (7/14/30/60/100/365) + glow quando attivo.
// Persistenza automatica del freeze (1 al mese).
// ============================================================

import { useEffect, useMemo } from "react";
import { useDB, updateDB } from "@/lib/storage";
import { activityStreak, claimFreeze } from "@/lib/compute";
import { labelDayKey } from "@/lib/dates";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Icon } from "@/components/ui/Icon";

const MILESTONES = [7, 14, 30, 60, 100, 365];

function nextMilestone(days: number): number {
  return MILESTONES.find((m) => m > days) ?? days;
}

export function StreakHero() {
  const db = useDB();
  // Activity Streak: scansione di tutte le attività (transazioni, trade,
  // workout, log PC, studio, libri) → memoizzato su db.
  const streak = useMemo(() => activityStreak(db), [db]);

  useEffect(() => {
    if (!streak.freezeUsed) return;
    const updated = claimFreeze(db);
    if (!updated) return;
    updateDB((d) =>
      d.settings.lastFreezeMonth === updated.lastFreezeMonth ? d : { ...d, settings: updated }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, streak.freezeUsed]);

  const locale = db.settings.locale;
  const milestone = nextMilestone(streak.days);
  const pct = milestone === streak.days ? 100 : Math.min(99, (streak.days / milestone) * 100);
  const grad = streak.days > 0 ? "from-accent via-accent-2 to-accent-3" : "from-border-strong to-border-strong";

  return (
    <Card hairline="accent" scan className="relative flex flex-col items-center gap-6 overflow-hidden py-8 sm:flex-row sm:justify-between">
      {/* anello di progresso */}
      <div className="relative h-32 w-32 shrink-0">
        <div
          className="absolute inset-0 rounded-full opacity-80 blur-md"
          style={{ background: `conic-gradient(#4c7eff ${pct}%, rgba(255,255,255,0.06) 0)` }}
        />
        <div
          className="absolute inset-0 rounded-full transition-[background] duration-1000"
          style={{ background: `conic-gradient(#4c7eff ${pct}%, rgba(255,255,255,0.06) 0)` }}
        />
        <div className="absolute inset-[9px] flex flex-col items-center justify-center rounded-full bg-card">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Streak</span>
          <AnimatedNumber
            value={streak.days}
            className="tnum text-4xl font-bold leading-tight"
            fmt={(n) => String(Math.round(n))}
          />
          <span className="text-[11px] text-muted-foreground">{streak.days === 1 ? "giorno" : "giorni"}</span>
        </div>
      </div>

      <div className="min-w-0 flex-1 text-center sm:text-left">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary-text">Activity Streak</p>
        <p className="mt-1 text-2xl font-semibold leading-tight tracking-tight">
          {streak.days === 0 ? (
            "Inizia da zero."
          ) : (
            <>
              Streak di <span className="grad-text inline-flex items-center gap-1"><Icon name="flame" size={19} /> {streak.days}</span> {streak.days === 1 ? "giorno" : "giorni"}
            </>
          )}
        </p>
        {streak.streakStart && streak.days > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">La striscia è viva da {labelDayKey(streak.streakStart, locale)}</p>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
          {streak.todayActive ? (
            <Badge tone="success" pulse>● Oggi attivo</Badge>
          ) : streak.freezeUsed ? (
            <Badge tone="info" pulse><Icon name="shield" size={12} /> Freeze · oggi coperto</Badge>
          ) : (
            <Badge tone="warning" pulse><Icon name="zap" size={12} /> Registra qualcosa oggi</Badge>
          )}
          {streak.days > 0 && milestone > streak.days && (
            <Badge>
              prossimo traguardo <span className="tnum ml-0.5">{milestone}</span> gg
            </Badge>
          )}
        </div>
      </div>

      <div className="w-full max-w-[180px] sm:w-40">
        <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
          <span>verso {milestone} gg</span>
          <span className="tnum">{Math.round(pct)}%</span>
        </div>
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-elevated">
          <div className={`absolute inset-y-0 left-0 h-full rounded-full bg-gradient-to-r ${grad} transition-[background-color,box-shadow] duration-700`} style={{ width: `${pct}%` }}>
            <div className="shimmer absolute inset-0" />
          </div>
        </div>
      </div>
    </Card>
  );
}
