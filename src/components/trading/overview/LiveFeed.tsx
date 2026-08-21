"use client";

// ============================================================
// ASCEND — Trading overview: "Ultima chiusura" (feed live)
// Ultimo trade chiuso con ticker "ultimo aggiornamento" (tempo
// relativo, aggiornato ogni minuto) e dot pulse. Card con effetto
// scan-line "live". Rispetta la privacy: P&L mascherato (money) e
// risultato R (kpi).
// ============================================================

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import type { DB } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Misc";
import { Icon } from "@/components/ui/Icon";
import { setupName } from "@/lib/db";
import { formatR, formatSignedMoney } from "@/lib/format";
import { moneyMasked, kpiMasked, maskMoney, maskKpi } from "@/lib/privacy";

/** Tempo relativo rispetto ad "ora" nella timezone utente. */
function timeAgo(iso: string, tz: string, locale: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (mins < 1) return "adesso";
  if (mins < 60) return `${mins} min fa`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h fa`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ieri";
  if (days < 30) return `${days} gg fa`;
  return new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export function LiveFeed({ db }: { db: DB }) {
  const tz = db.settings.timezone;
  const locale = db.settings.locale;
  const moneyHide = moneyMasked(db.settings.privacyMode);
  const kpiHide = kpiMasked(db.settings.privacyMode);

  // ticker "ultimo aggiornamento": si aggiorna ogni minuto.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Ultimo trade chiuso: full sort del log → memoizzato; il tick del feed
  // (re-render ogni minuto) non deve riordinare tutti i trade.
  const last = useMemo(() => {
    if (!db.trades.length) return null;
    return [...db.trades].sort((a, b) => b.closeDate.localeCompare(a.closeDate))[0];
  }, [db]);
  const lastAcc = last ? db.accounts.find((a) => a.id === last.accountId) : null;
  const lastCurrency = lastAcc?.nativeCurrency ?? db.settings.baseCurrency;

  return (
    <Card scan className="flex flex-col">
      <CardHeader>
        <div>
          <CardTitle>Ultima chiusura</CardTitle>
          <CardSubtitle>
            {last ? (
              <>
                Ultimo aggiornamento{" "}
                <span className="text-secondary-text tnum">
                  {timeAgo(last.closeDate, tz, locale)}
                </span>
              </>
            ) : (
              "Nessun trade chiuso"
            )}
          </CardSubtitle>
        </div>
        <span
          className="relative flex h-2.5 w-2.5 shrink-0"
          title="feed live"
        >
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
        </span>
      </CardHeader>
      {!last ? (
        <EmptyState
          icon={<Icon name="list" size={32} />}
          title="Nessun trade chiuso"
          description="Il feed live mostrerà qui l'ultima operazione con il risultato in tempo reale."
        />
      ) : (
        <div className="flex flex-1 flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold leading-tight">
                {last.instrument}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {setupName(db, last.setupId) || "Senza setup"}
              </p>
            </div>
            <Badge tone={last.direction === "long" ? "info" : "default"}>
              {last.direction === "long" ? "▲ Long" : "▼ Short"}
            </Badge>
          </div>
          <div className="flex items-end justify-between gap-3 border-t border-border/60 pt-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-secondary-text">
                Risultato
              </p>
              <p
                className={cn(
                  "text-sm font-semibold tnum",
                  kpiHide
                    ? "text-muted-foreground"
                    : last.resultR > 0
                      ? "text-success"
                      : last.resultR < 0
                        ? "text-danger"
                        : "text-muted-foreground"
                )}
              >
                {kpiHide ? maskKpi() : formatR(last.resultR)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-medium uppercase tracking-wide text-secondary-text">
                P&L
              </p>
              <p
                className={cn(
                  "text-sm font-semibold tnum",
                  moneyHide
                    ? "text-secondary-text"
                    : last.resultNative > 0
                      ? "text-success"
                      : last.resultNative < 0
                        ? "text-danger"
                        : "text-muted-foreground"
                )}
              >
                {moneyHide
                  ? maskMoney()
                  : formatSignedMoney(
                      last.resultNative,
                      lastCurrency,
                      locale
                    )}
              </p>
            </div>
          </div>
          <Link
            href="/trading/trades"
            className="text-center text-xs font-medium text-accent hover:underline"
          >
            Vai al trade log →
          </Link>
        </div>
      )}
    </Card>
  );
}
