"use client";

// ============================================================
// ASCEND — Home · Card "Scadenze"
// Prossime 4 scadenze degli obiettivi (upcomingDeadlines):
// giorni mancanti grandi (tnum), label, badge kind daily/weekly,
// barra urgenza: >3 gg accent, <=3 warning, scaduto danger.
// Link a /obiettivi. Nessuna scadenza → mini empty discreto.
// ============================================================

import Link from "next/link";
import { upcomingDeadlines } from "@/lib/compute";
import type { DB } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

const URGENCY_WINDOW = 14; // giorni → scala della barra (più corto = più urgente)

type Urgency = "calm" | "warning" | "danger";

function urgencyOf(daysLeft: number): Urgency {
  if (daysLeft <= 0) return "danger"; // scaduto / scade oggi
  if (daysLeft <= 3) return "warning";
  return "calm";
}

const numColor: Record<Urgency, string> = {
  calm: "text-foreground",
  warning: "text-warning",
  danger: "text-danger",
};

const barCls: Record<Urgency, string> = {
  calm: "bg-gradient-to-r from-accent to-accent-3",
  warning: "bg-gradient-to-r from-warning to-amber-400",
  danger: "bg-gradient-to-r from-danger to-rose-400",
};

export function DeadlinesCard({ db }: { db: DB }) {
  const deadlines = upcomingDeadlines(db).slice(0, 4);

  return (
    <Card className="flex flex-col gap-3">
      <CardHeader>
        <div>
          <CardTitle>Scadenze</CardTitle>
          <CardSubtitle>
            {deadlines.length > 0
              ? `${deadlines.length} obiettivo${deadlines.length === 1 ? "" : "i"} con scadenza`
              : "Obiettivi"}
          </CardSubtitle>
        </div>
        {deadlines.length > 0 && (
          <Link
            href="/obiettivi"
            className="shrink-0 text-xs font-medium text-secondary-text transition-colors hover:text-accent"
          >
            Vedi tutti →
          </Link>
        )}
      </CardHeader>

      {deadlines.length === 0 ? (
        <div className="flex items-center gap-2.5 rounded-lg border border-dashed border-border-strong px-3 py-2.5">
          <Icon name="target" size={15} className="text-accent" />
          <p className="text-xs text-secondary-text">
            Nessuna scadenza imminente — tutto sotto controllo.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {deadlines.map((d) => {
            const urgency = urgencyOf(d.daysLeft);
            const pct = Math.max(8, Math.min(100, (d.daysLeft / URGENCY_WINDOW) * 100));
            const suffix = d.daysLeft === 0 ? "scade oggi" : d.daysLeft === 1 ? "giorno" : "giorni";
            return (
              <li key={d.id}>
                <Link
                  href="/obiettivi"
                  className="group block rounded-lg border border-border bg-elevated/40 p-2.5 transition-colors hover:border-accent/40 hover:bg-elevated/70"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-baseline gap-1.5">
                      <span className={cn("tnum text-2xl font-bold leading-none", numColor[urgency])}>
                        {d.daysLeft}
                      </span>
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {suffix}
                      </span>
                    </div>
                    <Badge tone={d.kind === "daily" ? "info" : "default"}>
                      {d.kind === "daily" ? "daily" : "weekly"}
                    </Badge>
                  </div>

                  <p className="mt-1 truncate text-sm font-medium text-foreground">{d.label}</p>

                  {/* barra urgenza */}
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-elevated">
                    <div
                      className={cn("h-full rounded-full transition-[background-color,box-shadow] duration-700", barCls[urgency])}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
