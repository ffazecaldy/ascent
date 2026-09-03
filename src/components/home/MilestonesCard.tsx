"use client";

// ============================================================
// ASCEND — Home · Milestone (prossime scadenze)
// Reminder della Home con le milestone APERTE ordinate per data
// + spunta manuale (completa). Derivato da db prop +
// updateDB diretto (nessun useDB nel componente).
// ============================================================

import { useMemo } from "react";
import Link from "next/link";
import { openMilestones, nextMilestone, urgencyOf, dueLabel } from "@/lib/milestones";
import { todayKey } from "@/lib/dates";
import { updateDB, nowISO } from "@/lib/storage";
import type { DB, Milestone } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge, StatusDot } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Misc";
import { Icon } from "@/components/ui/Icon";

function shortDateIT(date: string): string {
  const d = new Date(date + "T00:00:00");
  if (Number.isNaN(d.getTime())) {
    const parts = date.split("-");
    return parts.length === 3 ? `${parts[2]}/${parts[1]}` : date;
  }
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "numeric" });
}

export function MilestonesCard({ db }: { db: DB }) {
  const today = useMemo(() => todayKey(db.settings.timezone), [db.settings.timezone]);
  const open = useMemo(() => openMilestones(db.milestones), [db.milestones]);
  const next = useMemo(() => nextMilestone(db.milestones), [db.milestones]);
  const nextUrgency = next ? urgencyOf(next, today) : null;
  const showHero = next != null && (nextUrgency === "soon" || nextUrgency === "overdue");
  const visible = open.slice(0, 5);
  const extra = open.length - visible.length;

  const complete = (m: Milestone) => {
    const now = nowISO();
    updateDB((d) => ({
      ...d,
      milestones: d.milestones.map((x) =>
        x.id === m.id ? { ...x, done: true, doneAt: now, updatedAt: now } : x
      ),
    }));
  };

  return (
    <Card hairline="accent" className="flex flex-col gap-3">
      <CardHeader>
        <div>
          <CardTitle>Prossime scadenze</CardTitle>
          <CardSubtitle>
            {open.length > 0
              ? `${open.length} ${open.length === 1 ? "aperta" : "aperte"}`
              : "Nessuna scadenza"}
          </CardSubtitle>
        </div>
        <Link
          href="/obiettivi/milestones"
          className="shrink-0 text-xs font-medium text-secondary-text transition-colors hover:text-accent"
        >
          Gestisci →
        </Link>
      </CardHeader>

      {db.milestones.length === 0 ? (
        <EmptyState
          icon={<Icon name="flag" size={34} className="text-accent" />}
          title="Nessuna milestone"
          description="Aggiungi le date importanti dei tuoi obiettivi e trovale qui in evidenza."
          action={
            <Link
              href="/obiettivi/milestones"
              className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
            >
              <Icon name="plus" size={12} />
              + milestone
            </Link>
          }
        />
      ) : open.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-center">
          <Icon name="flag" size={22} className="text-muted-foreground/60" />
          <p className="text-sm text-secondary-text">Nessuna scadenza aperta</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {showHero && next && (
            <div className="flex items-center gap-2 rounded-lg border border-danger/50 bg-danger/5 p-2.5">
              <Icon name="alert" size={16} className="shrink-0 text-danger" />
              <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                {next.title}: {dueLabel(next.date, today)}
              </p>
            </div>
          )}
          <ul className="space-y-2">
            {visible.map((m) => {
              const urgency = urgencyOf(m, today);
              const tone =
                urgency === "overdue"
                  ? ("danger" as const)
                  : urgency === "soon"
                    ? ("warning" as const)
                    : urgency === "week"
                      ? ("info" as const)
                      : ("default" as const);
              return (
                <li
                  key={m.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-elevated/40 p-2.5"
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={false}
                    aria-label={`Completa "${m.title}"`}
                    onClick={() => complete(m)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-strong text-transparent transition-colors hover:border-accent hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <Icon name="check" size={13} strokeWidth={3} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {m.color ? (
                        <StatusDot color={m.color} />
                      ) : (
                        <Icon name="flag" size={13} className="shrink-0 text-muted-foreground" />
                      )}
                      <p
                        className={cn(
                          "truncate text-[13px] font-medium",
                          urgency === "overdue" ? "text-danger" : "text-foreground"
                        )}
                      >
                        {m.title}
                      </p>
                    </div>
                    {m.note && (
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{m.note}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={tone}>{dueLabel(m.date, today)}</Badge>
                    <span className="text-[11px] text-muted-foreground">{shortDateIT(m.date)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
          {extra > 0 && (
            <Link
              href="/obiettivi/milestones"
              className="text-center text-xs font-medium text-secondary-text transition-colors hover:text-accent"
            >
              Vedi tutte ({open.length})
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}
