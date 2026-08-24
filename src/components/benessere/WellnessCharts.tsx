"use client";

// ============================================================
// Zona Benessere — grafici: barre sonno ultimi 14gg (fascia
// 7-9h evidenziata, tooltip con qualità/umore) + linea peso
// con pallini sui punti registrati.
// ============================================================

import { useMemo } from "react";
import { useDB } from "@/lib/storage";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { todayKey, addDaysKey, labelDayKey } from "@/lib/dates";
import { logForDay } from "@/lib/wellness";

const ACCENT = "var(--accent, #4C7EFF)";
const MUTED = "var(--border-strong, #3b4252)";

export function WellnessCharts() {
  const db = useDB();
  const tz = db.settings.timezone;
  const locale = db.settings.locale || "it-IT";
  const today = todayKey(tz);

  // Ultimi 14 giorni: sonno + peso per giorno
  const days = useMemo(() => {
    const out: { dk: string; label: string; sleep: number | null; weight: number | null }[] = [];
    for (let i = 13; i >= 0; i--) {
      const dk = addDaysKey(today, -i);
      const w = logForDay(db, dk);
      out.push({
        dk,
        label: labelDayKey(dk, locale),
        sleep: w?.sleepHours ?? null,
        weight: w?.weightKg ?? null,
      });
    }
    return out;
  }, [db, today, locale]);

  const weights = days.filter((d) => d.weight != null);
  const maxSleep = 10; // scala fissa 0-10h
  const weightMin = weights.length
    ? Math.min(...weights.map((d) => d.weight!)) - 1
    : 0;
  const weightMax = weights.length
    ? Math.max(...weights.map((d) => d.weight!)) + 1
    : 1;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Sonno · 14 giorni</CardTitle>
        </CardHeader>
        <div className="space-y-1 px-4 pb-4">
          <div className="flex items-end justify-between gap-1" style={{ height: 120 }}>
            {days.map((d) => (
              <div
                key={d.dk}
                title={
                  d.sleep != null
                    ? `${d.label}: ${d.sleep.toFixed(1)}h`
                    : `${d.label}: non registrato`
                }
                className="group relative flex h-full flex-1 flex-col justify-end"
              >
                <div
                  className={`w-full rounded-t-md transition-opacity group-hover:opacity-80 ${
                    d.sleep != null
                      ? d.sleep >= 7 && d.sleep <= 9
                        ? "bg-accent"
                        : "bg-accent/40"
                      : "bg-border-strong/30"
                  }`}
                  style={{ height: d.sleep != null ? `${(d.sleep / maxSleep) * 100}%` : "6%" }}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-accent" /> fascia 7–9h
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-accent/40" /> fuori fascia
            </span>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Peso · 14 giorni</CardTitle>
        </CardHeader>
        <div className="px-4 pb-4">
          {weights.length < 2 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Registra il peso in almeno 2 giorni diversi per vedere la tendenza.
            </p>
          ) : (
            <svg viewBox="0 0 100 44" className="h-28 w-full" role="img" aria-label="Andamento peso">
              <line x1="0" y1="12" x2="100" y2="12" stroke={MUTED} strokeWidth="0.4" strokeDasharray="1.5 2" />
              <line x1="0" y1="24" x2="100" y2="24" stroke={MUTED} strokeWidth="0.4" strokeDasharray="1.5 2" />
              <line x1="0" y1="36" x2="100" y2="36" stroke={MUTED} strokeWidth="0.4" strokeDasharray="1.5 2" />
              {weights.map((d, i) => {
                const x = 4 + (i / Math.max(weights.length - 1, 1)) * 92;
                const y = 40 - ((d.weight! - weightMin) / Math.max(weightMax - weightMin, 0.1)) * 34;
                const prev = i > 0 ? weights[i - 1] : null;
                return (
                  <g key={d.dk}>
                    {prev && (
                      <line
                        x1={4 + ((i - 1) / Math.max(weights.length - 1, 1)) * 92}
                        y1={40 - ((prev.weight! - weightMin) / Math.max(weightMax - weightMin, 0.1)) * 34}
                        x2={x}
                        y2={y}
                        stroke={ACCENT}
                        strokeWidth="0.8"
                      />
                    )}
                    <circle cx={x} cy={y} r="1.6" fill={ACCENT}>
                      <title>{`${d.label}: ${d.weight!.toFixed(1)} kg`}</title>
                    </circle>
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </Card>
    </div>
  );
}