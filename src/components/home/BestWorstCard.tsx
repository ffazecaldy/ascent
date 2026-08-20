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
import { Icon, type IconName } from "@/components/ui/Icon";
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
      icon: "arrow-up" as IconName,
      item: best,
      tone: "text-success",
    },
    {
      title: "Peggiore",
      icon: "arrow-down" as IconName,
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
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong py-12 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-accent/30 bg-accent/10 shadow-[0_0_28px_-8px_rgba(76,126,255,0.6)]">
            <Icon name="chart-line" size={30} className="text-accent" />
          </div>
          <p className="text-sm font-medium text-secondary-text">Nessun trade registrato</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Una volta chiuso il primo trade comparirà qui la tua settimana migliore e peggiore.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((row) => (
            <div
              key={row.title}
              className="rounded-lg border border-border bg-elevated/40 p-3"
            >
              <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <Icon name={row.icon} size={12} />
                Settimana {row.title.toLowerCase()}
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
