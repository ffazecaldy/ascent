"use client";

// ============================================================
// ASCEND — Home · Radar dell'equilibrio
// Grafico a 8 assi (zero-dep): ogni categoria è un punto che si
// sposta verso il bordo quanto più la categoria è forte.
// Ogni asso ha un colore proprio vivace; al centro la media.
// ============================================================

import { useMemo } from "react";
import { weeklyReviewStats } from "@/lib/compute";
import type { DB } from "@/lib/types";
import { todayKey, weekStartKey } from "@/lib/dates";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";

const SIZE = 380;
const C = SIZE / 2;
const R_MAX = 132;
const R_LABEL = R_MAX + 30; // offset etichette esterne
const R_MIN_FRAC = 0.12; // minimo visivo: il poligono esiste sempre

/** Assi del radar con colore proprio vivace per categoria. */
const AXES = [
  { key: "trading", label: "Trading", color: "var(--accent)" },
  { key: "finanze", label: "Finanze", color: "var(--success)" },
  { key: "risparmi", label: "Risparmi", color: "var(--warning)" },
  { key: "studio", label: "Studio", color: "#a78bfa" }, // viola
  { key: "libri", label: "Libri", color: "#22d3ee" }, // ciano
  { key: "sport", label: "Sport", color: "#ec4899" }, // magenta
  { key: "pc", label: "PC", color: "var(--accent-2)" },
  { key: "obiettivi", label: "Obiettivi", color: "#fbbf24" }, // ambra
] as const;

type AxisKey = (typeof AXES)[number]["key"];

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

/** Valore 0..1 per ogni asso a partire dalle stats settimanali/mensili. */
function axisValues(db: DB): Record<AxisKey, number> {
  const tz = db.settings.timezone;
  const today = todayKey(tz);
  const weekStart = weekStartKey(today, db.settings.weekStart);
  const st = weeklyReviewStats(db, weekStart);

  const month = today.slice(0, 7);
  let income = 0, expense = 0;
  db.transactions.forEach((t) => {
    if (t.date.startsWith(month)) {
      const amt = t.amount * (t.exchangeRate || 1);
      if (t.type === "income") income += amt; else expense += amt;
    }
  });

  // Risparmi: % completamento dell'obiettivo più vicino al traguardo
  let savingsPct = 0;
  for (const g of db.savingsGoals ?? []) {
    const dep = (db.savingsDeposits ?? [])
      .filter((d) => d.goalId === g.id)
      .reduce((s, d) => s + d.amount, 0);
    const pct = g.target > 0 ? dep / g.target : 0;
    if (pct > savingsPct) savingsPct = pct;
  }

  // Studio: minuti della settimana vs meta 300min (5h) — nessun weeklyGoal studio esiste nel modello
  let studioMin = 0;
  const weekEnd = addDaysLocal(weekStart, 6);
  db.studySessions.forEach((s) => {
    if (s.date >= weekStart && s.date <= weekEnd) studioMin += s.minutes;
  });
  const studioGoal = 300;

  return {
    trading: safe01((st.totalR / 10) * 0.5 + 0.5), // ±10R → 0..1
    finanze: safe01(Math.max(-500, Math.min(500, st.net || 0)) / 1000 + 0.5), // netto settimana ±500 → 0..1
    risparmi: safe01(savingsPct),
    studio: safe01(studioMin / studioGoal),
    libri: safe01(st.pagesRead / 50),
    sport: safe01(st.workouts / Math.max(1, db.sportProfile?.weeklySessionsTarget ?? 3)),
    pc: safe01(st.pcMinutes / (7 * 120)), // 2h/giorno produttive in settimana
    obiettivi: st.ascordTotal > 0 ? safe01(st.ascordWon / st.ascordTotal) : 0,
  };
}

/** Come clamp01 ma NaN/Infinity/undefined → 0 (mai "NaN%" nel centro). */
function safe01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function addDaysLocal(dk: string, n: number): string {
  const d = new Date(dk + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function RadarCard({ db }: { db: DB }) {
  const values = useMemo(() => axisValues(db), [db]);

  const overall = useMemo(() => {
    const vals = AXES.map((a) => values[a.key]);
    const sum = vals.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
    return sum / vals.length;
  }, [values]);

  // punti poligono (angolo parte da -90° = alto, senso orario)
  const points = AXES.map((a, i) => {
    const ang = (Math.PI * 2 * i) / AXES.length - Math.PI / 2;
    const r = R_MAX * Math.max(R_MIN_FRAC, values[a.key]);
    return { x: C + r * Math.cos(ang), y: C + r * Math.sin(ang), ang, r };
  });

  const polygon = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  const hasData = Object.values(values).some((v) => v > R_MIN_FRAC + 0.001);

  return (
    <Card hairline="accent" className="flex flex-col gap-3">
      <CardHeader>
        <div>
          <CardTitle>Equilibrio</CardTitle>
          <CardSubtitle>Ogni categoria verso il suo bordo</CardSubtitle>
        </div>
        <Icon name="activity" size={18} className="text-accent" />
      </CardHeader>

      {hasData ? (
        <div className="flex justify-center">
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Radar equilibrio categorie">
            {/* griglia ottagonale a 4 livelli */}
            {[0.25, 0.5, 0.75, 1].map((f) => (
              <polygon
                key={f}
                points={AXES.map((_, i) => {
                  const ang = (Math.PI * 2 * i) / AXES.length - Math.PI / 2;
                  const r = R_MAX * f;
                  return `${(C + r * Math.cos(ang)).toFixed(1)},${(C + r * Math.sin(ang)).toFixed(1)}`;
                }).join(" ")}
                fill={f === 1 ? "var(--bg-elevated)" : "none"}
                stroke="var(--border)"
                strokeWidth="1"
              />
            ))}
            {/* raggi */}
            {AXES.map((a, i) => {
              const ang = (Math.PI * 2 * i) / AXES.length - Math.PI / 2;
              return (
                <line
                  key={a.key}
                  x1={C}
                  y1={C}
                  x2={C + R_MAX * Math.cos(ang)}
                  y2={C + R_MAX * Math.sin(ang)}
                  stroke="var(--border)"
                  strokeWidth="1"
                />
              );
            })}
            {/* sfumatura interna: dal centro (accent tenue) verso i punti (trasparente) */}
            <defs>
              <radialGradient id="radar-fill" cx="50%" cy="50%" r="65%">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.34" />
                <stop offset="70%" stopColor="var(--accent)" stopOpacity="0.12" />
                <stop offset="100%" stopColor="var(--accent-2)" stopOpacity="0.05" />
              </radialGradient>
            </defs>
            {/* poligono dati — punti collegati, fill sfumato */}
            <polygon
              points={polygon}
              fill="url(#radar-fill)"
              stroke="var(--accent)"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            {/* punti per asse, ognuno col suo colore */}
            {AXES.map((a, i) => (
              <circle
                key={a.key}
                cx={points[i].x}
                cy={points[i].y}
                r={4.5}
                fill={a.color}
                stroke="var(--bg)"
                strokeWidth="1.5"
              >
                <title>{`${a.label}: ${Math.round(values[a.key] * 100)}%`}</title>
              </circle>
            ))}
            {/* etichette esterne — anchor intelligente per lato, niente accavallamento */}
            {AXES.map((a, i) => {
              const ang = (Math.PI * 2 * i) / AXES.length - Math.PI / 2;
              const cos = Math.cos(ang);
              const sin = Math.sin(ang);
              const lx = C + R_LABEL * cos;
              const ly = C + R_LABEL * sin;
              // destra: anchor start; sinistra: end; alto/basso: middle
              let anchor: "start" | "middle" | "end" = "middle";
              if (cos > 0.35) anchor = "start";
              else if (cos < -0.35) anchor = "end";
              // spinta verticale per gli assi in alto/basso
              const dy = sin < -0.85 ? -4 : sin > 0.85 ? 8 : 0;
              return (
                <text
                  key={a.key}
                  x={lx}
                  y={ly + dy}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  fontSize="11"
                  fontWeight="500"
                  fill="var(--text-muted)"
                >
                  {a.label}
                </text>
              );
            })}
            {/* centro: media */}
            <text x={C} y={C - 4} textAnchor="middle" dominantBaseline="middle" fontSize="22" fontWeight="700" fill="var(--text-primary)" className="tnum">
              {Math.round(overall * 100)}%
            </text>
            <text x={C} y={C + 14} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="var(--text-muted)">
              equilibrio
            </text>
          </svg>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong py-10 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-accent/30 bg-accent/10 shadow-[0_0_28px_-8px_rgba(76,126,255,0.6)]">
            <Icon name="activity" size={30} className="text-accent" />
          </div>
          <p className="text-sm font-medium text-secondary-text">Non abbastanza dati</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Registra attività nelle diverse aree per vedere il tuo equilibrio prendere forma.
          </p>
        </div>
      )}
    </Card>
  );
}