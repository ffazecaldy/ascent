"use client";

// ============================================================
// ASCEND — Home · Migliore / Peggiore settimana (bestWorstWeek)
// ============================================================

import { bestWorstWeek } from "@/lib/compute";
import { formatSignedMoney } from "@/lib/format";
import { moneyMasked, maskMoney } from "@/lib/privacy";
import { parseDateKey } from "@/lib/dates";
import type { DB } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Misc";
import { cn } from "@/lib/cn";

export function BestWorstCard({ db }: { db: DB }) {
  const { best, worst } = bestWorstWeek(db);
  const masked = moneyMasked(db.settings.privacyMode);
  const currency = db.settings.baseCurrency;

  const weekLabel = (weekKey: string) => {
    const { y, m, d } = parseDateKey(weekKey);
    return new Date(y, m - 1, d).toLocaleDateString(db.settings.locale, {
      day: "numeric",
      month: "short",
    });
  };

  const rows = [
    {
      title: "Migliore",
      icon: "🚀",
      item: best,
      tone: "text-success",
    },
    {
      title: "Peggiore",
      icon: "🕳",
      item: worst,
      tone: "text-danger",
    },
  ] as const;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Migliore / Peggiore settimana</CardTitle>
          <CardSubtitle>P&L per settimana (ultime 12)</CardSubtitle>
        </div>
      </CardHeader>

      {!best && !worst ? (
        <EmptyState
          icon="📊"
          title="Nessun trade registrato"
          description="Una volta chiuso il primo trade comparirà qui la tua settimana migliore e peggiore."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((row) => (
            <div
              key={row.title}
              className="rounded-lg border border-border bg-elevated/40 p-3"
            >
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {row.icon} Settimana {row.title.toLowerCase()}
              </p>
              {row.item ? (
                <>
                  <p
                    className={cn(
                      "mt-1 text-2xl font-semibold tnum leading-tight",
                      row.tone
                    )}
                  >
                    {masked
                      ? maskMoney()
                      : formatSignedMoney(row.item.pnl, currency, db.settings.locale)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Settimana del {weekLabel(row.item.weekKey)}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">—</p>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
