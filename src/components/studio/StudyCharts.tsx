"use client";

// ============================================================
// Zona Studio — mini chart: BarsChart minuti per giorno degli
// ultimi 7 giorni + Donut per materia del mese (colori per
// materia, palette gradient).
// ============================================================

import { useMemo } from "react";
import { useDB } from "@/lib/storage";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Reveal } from "@/components/ui/Reveal";
import { BarsChart, DonutChart } from "@/components/charts";
import { todayKey, monthKeyOf } from "@/lib/dates";
import { last7Minutes, subjectColor } from "./constants";

export function StudyCharts() {
  const db = useDB();
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
            <DonutChart
              data={donut}
              size={150}
              thickness={24}
              centerLabel="min"
              centerValue={String(monthTotal)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Nessuna sessione questo mese.</p>
          )}
        </Card>
      </Reveal>
    </div>
  );
}
