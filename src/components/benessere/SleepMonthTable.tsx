"use client";

// ============================================================
// Zona Benessere — tabella sonno del mese: per ogni giorno con
// log mostra ore, qualità, in/fuori fascia (7-9h) e media mese.
// Navigazione mese precedente/successivo/oggi.
// ============================================================

import { useMemo, useState } from "react";
import { useDB } from "@/lib/storage";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { todayKey, monthKeyOf, monthRange, parseDateKey, labelDayKey } from "@/lib/dates";

export function SleepMonthTable() {
  const db = useDB();
  const tz = db.settings.timezone;
  const locale = db.settings.locale || "it-IT";
  const today = todayKey(tz);

  // Mese corrente di default; l'utente può navigare indietro/avanti.
  const [month, setMonth] = useState(() => monthKeyOf(today));

  const monthLabel = useMemo(() => {
    const { y, m } = parseDateKey(`${month}-01`);
    return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });
  }, [month, locale]);

  // Giorni del mese con log (ordinati crescente), solo sonno registrato.
  const rows = useMemo(() => {
    const { start, end } = monthRange(month);
    return db.wellnessLogs
      .filter((w) => w.date >= start && w.date <= end && w.sleepHours != null)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [db.wellnessLogs, month]);

  const stats = useMemo(() => {
    const vals = rows.map((r) => r.sleepHours!);
    if (vals.length === 0) return null;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const inRange = vals.filter((v) => v >= 7 && v <= 9).length;
    return {
      avg: Math.round(avg * 10) / 10,
      min: Math.min(...vals),
      max: Math.max(...vals),
      inRange,
      total: vals.length,
      pct: Math.round((inRange / vals.length) * 100),
    };
  }, [rows]);

  function shiftMonth(delta: number) {
    const { y, m } = parseDateKey(`${month}-01`);
    const dt = new Date(y, m - 1 + delta, 1);
    setMonth(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`);
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Sonno · Riepilogo mensile</CardTitle>
          <CardSubtitle>
            {stats
              ? `Media ${stats.avg.toFixed(1)}h · ${stats.inRange}/${stats.total} notti in fascia (${stats.pct}%)`
              : "Nessuna notte registrata questo mese"}
          </CardSubtitle>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" onClick={() => shiftMonth(-1)} aria-label="Mese precedente">
            <Icon name="arrow-left" size={16} />
          </Button>
          <span className="min-w-[110px] text-center text-sm font-medium capitalize">{monthLabel}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => shiftMonth(1)}
            disabled={month >= monthKeyOf(today)}
            aria-label="Mese successivo"
          >
            <Icon name="arrow-right" size={16} />
          </Button>
        </div>
      </CardHeader>

      {rows.length === 0 ? (
        <p className="px-4 pb-4 text-center text-xs text-muted-foreground">
          Nessuna notte con sonno registrato in {monthLabel}. Registra il sonno nel log giornaliero per
          vederlo qui.
        </p>
      ) : (
        <div className="overflow-x-auto px-1 pb-3">
          <table className="w-full min-w-[420px] text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="pb-2 pl-3 pr-3 font-medium">Data</th>
                <th className="pb-2 pr-3 text-right font-medium">Ore</th>
                <th className="pb-2 pr-3 text-right font-medium">Qualità</th>
                <th className="pb-2 pr-3 text-center font-medium">Fascia 7–9h</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => {
                const v = w.sleepHours!;
                const inRange = v >= 7 && v <= 9;
                return (
                  <tr key={w.id} className="border-b border-border/50 last:border-0 hover:bg-elevated/70">
                    <td className="tnum whitespace-nowrap py-2 pl-3 pr-3 text-secondary-text">
                      {labelDayKey(w.date, locale)}
                    </td>
                    <td className="tnum py-2 pr-3 text-right font-semibold">
                      <span className={inRange ? "text-accent" : "text-secondary-text"}>{v.toFixed(1)}h</span>
                    </td>
                    <td className="tnum py-2 pr-3 text-right text-muted-foreground">
                      {w.sleepQuality ? `${w.sleepQuality}/5` : "—"}
                    </td>
                    <td className="py-2 pr-3 text-center">
                      {inRange ? (
                        <Badge tone="success">
                          <Icon name="check" size={11} /> sì
                        </Badge>
                      ) : (
                        <Badge tone={v < 7 ? "warning" : "default"}>{v < 7 ? "poco" : "molto"}</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {stats && (
              <tfoot>
                <tr className="border-t border-border text-[13px] font-semibold">
                  <td className="py-2 pl-3 pr-3">Media</td>
                  <td className="tnum py-2 pr-3 text-right text-accent">{stats.avg.toFixed(1)}h</td>
                  <td className="py-2 pr-3" />
                  <td className="tnum py-2 pr-3 text-center text-[12px] text-muted-foreground">
                    {stats.inRange}/{stats.total}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </Card>
  );
}
