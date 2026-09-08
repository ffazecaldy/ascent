"use client";

// ============================================================
// Zona Studio — mini chart: BarsChart minuti per giorno degli
// ultimi 7 giorni + Donut per materia del mese (colori per
// materia, palette gradient).
// ============================================================

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useDB } from "@/lib/storage";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Reveal } from "@/components/ui/Reveal";
import { ActivityHeatmap, BarsChart, DonutChart, HEATMAP_COLORS } from "@/components/charts";
import { addDaysKey, todayKey, monthKeyOf, weekStartKey } from "@/lib/dates";
import { last7Minutes, subjectColor } from "./constants";

export function StudyCharts() {
  const db = useDB();
  const router = useRouter();
  const tz = db.settings.timezone;
  const locale = db.settings.locale || "it-IT";
  const today = todayKey(tz);
  const monthKey = today.slice(0, 7);
  const sessions = db.studySessions;

  const last7 = useMemo(() => last7Minutes(sessions, today, locale), [sessions, today, locale]);
  const weekTotal = last7.reduce((a, d) => a + d.y, 0);

  const donut = useMemo(() => {
    const by = new Map<string, number>();
    for (const s of sessions) {
      if (monthKeyOf(s.date) === monthKey) by.set(s.subject, (by.get(s.subject) || 0) + (s.minutes || 0));
    }
    return Array.from(by.entries())
      .map(([name, minutes]) => ({ label: name, value: minutes, color: subjectColor(name) }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  }, [sessions, monthKey]);
  const monthTotal = donut.reduce((a, d) => a + d.value, 0);

  // Heatmap ultime 12 settimane (84 celle Lun..Dom): 12 colonne da lunedì,
  // l'ultima contiene oggi; i giorni futuri restano vuoti (livello 0).
  const heat = useMemo(() => {
    const monday0 = addDaysKey(weekStartKey(today, 1), -77);
    const perDay = new Map<string, number>();
    for (const s of sessions) perDay.set(s.date, (perDay.get(s.date) ?? 0) + (s.minutes || 0));
    const days: { date: string; min: number }[] = [];
    let max = 0;
    for (let i = 0; i < 84; i++) {
      const d = addDaysKey(monday0, i);
      const min = d > today ? 0 : (perDay.get(d) ?? 0);
      days.push({ date: d, min });
      if (min > max) max = min;
    }
    const levelOf = (min: number): 0 | 1 | 2 | 3 | 4 => {
      if (min <= 0 || max <= 0) return 0;
      const r = min / max;
      if (r >= 0.75) return 4;
      if (r >= 0.5) return 3;
      if (r >= 0.25) return 2;
      return 1;
    };
    const weeks: { date: string; level: 0 | 1 | 2 | 3 | 4; value: number }[][] = [];
    for (let w = 0; w < 12; w++) {
      weeks.push(days.slice(w * 7, w * 7 + 7).map((c) => ({ date: c.date, level: levelOf(c.min), value: c.min })));
    }
    // Etichetta mese solo sulla colonna in cui il mese cambia.
    const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
    const colMonth = weeks.map((w) => Number(w[0].date.slice(5, 7)) - 1);
    const monthLabels = colMonth.map((m, i) => (i === 0 || m !== colMonth[i - 1] ? MONTHS[m] : null));
    const activeDays = weeks.flat().filter((c) => c.level > 0).length;
    return { weeks, total: days.reduce((a, d) => a + d.min, 0), monthLabels, activeDays };
  }, [sessions, today]);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Reveal delay={20}>
        <Card hairline="accent" className="h-full">
          <CardHeader>
            <div>
              <CardTitle>Ultimi 7 giorni</CardTitle>
              <CardSubtitle>Minuti di studio per giorno</CardSubtitle>
            </div>
            <Badge tone="info">
              <span className="tnum">{weekTotal} min</span>
            </Badge>
          </CardHeader>
          <BarsChart data={last7.map((d) => ({ x: d.x, y: d.y }))} height={150} color="#4C7EFF" />
        </Card>
      </Reveal>

      <Reveal delay={60}>
        <Card hairline="accent" className="h-full">
          <CardHeader>
            <div>
              <CardTitle>Materie del mese</CardTitle>
              <CardSubtitle>Ripartizione per minuti · {monthKey}</CardSubtitle>
            </div>
            <Badge tone="default">
              <span className="tnum">{monthTotal} min</span>
            </Badge>
          </CardHeader>
          {donut.length > 0 ? (
            <>
              <DonutChart
                data={donut}
                size={150}
                thickness={24}
                centerLabel="min"
                centerValue={String(monthTotal)}
              />
              <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Filtra per materia">
                {donut.map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    onClick={() => router.push(`/studio?materia=${encodeURIComponent(d.label)}`)}
                    title={`Filtra sessioni per ${d.label}`}
                    aria-label={`Filtra sessioni per ${d.label}`}
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                    style={{ color: d.color, borderColor: `${d.color}40` }}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: d.color }}
                    />
                    {d.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-secondary-text">Nessuna sessione questo mese.</p>
          )}
        </Card>
      </Reveal>

      <Reveal delay={100} className="lg:col-span-2">
        <Card hairline="accent" className="h-full">
          <CardHeader>
            <div>
              <CardTitle>Calendario studio</CardTitle>
              <CardSubtitle>
                {heat.activeDays > 0
                  ? `${heat.activeDays} giorni attivi · ${heat.total} min totali`
                  : "Nessuna sessione nel periodo"}
              </CardSubtitle>
            </div>
            <Badge tone="info">
              <span className="tnum">{heat.total} min</span>
            </Badge>
          </CardHeader>
          <ActivityHeatmap
            weeks={heat.weeks}
            size={20}
            gap={4}
            monthLabels={heat.monthLabels}
            todayKey={today}
          />
          <div className="mt-3 flex items-center justify-end gap-1.5">
            <span className="mr-1 text-[11px] text-muted-foreground">Meno</span>
            {HEATMAP_COLORS.map((c) => (
              <span key={c} className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: c }} />
            ))}
            <span className="ml-1 text-[11px] text-muted-foreground">Più</span>
          </div>
        </Card>
      </Reveal>
    </div>
  );
}
