"use client";

// ============================================================
// ASCEND — Trading overview: ultimi 10 trade chiusi (tabella)
// Data · strumento · direzione · risultato R · P&L nativo
// colorato · setup. Rispetta la privacy (moneyMasked/kpiMasked).
// ============================================================

import Link from "next/link";
import { cn } from "@/lib/cn";
import type { DB } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Misc";
import { setupName } from "@/lib/db";
import { formatR, formatSignedMoney } from "@/lib/format";
import { moneyMasked, kpiMasked, maskMoney, maskKpi } from "@/lib/privacy";

/** ISO → "12 ago · 14:05" nella timezone utente (non browser). */
function formatClose(iso: string, tz: string, locale: string): string {
  const dt = new Date(iso);
  const day = new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    day: "numeric",
    month: "short",
  }).format(dt);
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);
  return `${day} · ${time}`;
}

export function RecentTrades({ db }: { db: DB }) {
  const tz = db.settings.timezone;
  const locale = db.settings.locale;
  const moneyHide = moneyMasked(db.settings.privacyMode);
  const kpiHide = kpiMasked(db.settings.privacyMode);
  const baseCurrency = db.settings.baseCurrency;

  const recent = [...db.trades]
    .sort((a, b) => b.closeDate.localeCompare(a.closeDate))
    .slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Ultimi trade</CardTitle>
          <CardSubtitle>
            {db.trades.length === 0
              ? "Registra il primo trade per vederlo qui"
              : `Gli ultimi ${recent.length} trade chiusi`}
          </CardSubtitle>
        </div>
        {db.trades.length > 0 && (
          <Link
            href="/trading/trades"
            className="text-xs font-medium text-accent hover:underline"
          >
            Tutti →
          </Link>
        )}
      </CardHeader>
      {recent.length === 0 ? (
        <EmptyState
          icon="🕹"
          title="Nessun trade"
          description="I trade chiusi compariranno qui con risultato e setup."
          action={
            <Link href="/trading/trades">
              <Button size="sm" variant="primary">
                Registra un trade
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 pr-3">Data</th>
                <th className="pb-2 pr-3">Strumento</th>
                <th className="pb-2 pr-3">Direzione</th>
                <th className="pb-2 pr-3 text-right">Risultato</th>
                <th className="pb-2 pr-3 text-right">P&L</th>
                <th className="pb-2">Setup</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((t) => {
                const acc = db.accounts.find((a) => a.id === t.accountId);
                const currency = acc?.nativeCurrency ?? baseCurrency;
                return (
                  <tr
                    key={t.id}
                    className="border-b border-border/60 last:border-0 hover:bg-elevated/40"
                  >
                    <td className="py-2.5 pr-3 whitespace-nowrap text-muted-foreground tnum">
                      {formatClose(t.closeDate, tz, locale)}
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap font-medium">
                      {t.instrument}
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      <Badge tone={t.direction === "long" ? "info" : "default"}>
                        {t.direction === "long" ? "▲ Long" : "▼ Short"}
                      </Badge>
                    </td>
                    <td
                      className={cn(
                        "py-2.5 pr-3 text-right whitespace-nowrap font-medium tnum",
                        kpiHide
                          ? "text-muted-foreground"
                          : t.resultR > 0
                            ? "text-success"
                            : t.resultR < 0
                              ? "text-danger"
                              : "text-muted-foreground"
                      )}
                    >
                      {kpiHide ? maskKpi() : formatR(t.resultR)}
                    </td>
                    <td
                      className={cn(
                        "py-2.5 pr-3 text-right whitespace-nowrap font-semibold tnum",
                        moneyHide
                          ? "text-secondary-text"
                          : t.resultNative > 0
                            ? "text-success"
                            : t.resultNative < 0
                              ? "text-danger"
                              : "text-muted-foreground"
                      )}
                    >
                      {moneyHide
                        ? maskMoney()
                        : formatSignedMoney(t.resultNative, currency, locale)}
                    </td>
                    <td className="py-2.5 whitespace-nowrap text-secondary-text">
                      {setupName(db, t.setupId)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
