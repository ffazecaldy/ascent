"use client";

// ============================================================
// ASCEND — Trading overview: "Andamento mensile"
// BarsChart del P&L trading in valuta base degli ultimi 6 mesi
// (fonte: monthPnlTrades). Barre verdi/rosse col segno, etichette
// mm/aa. Valori mascherati in privacy (moneyMasked), come nel resto
// del modulo. Footer: totale semestre e mesi positivi.
// ============================================================

import { cn } from "@/lib/cn";
import type { DB } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { BarsChart } from "@/components/charts";
import { monthPnlTrades } from "@/lib/compute";
import { monthKeyOf, todayKey, parseDateKey } from "@/lib/dates";
import { formatSignedMoney } from "@/lib/format";
import { moneyMasked, maskMoney } from "@/lib/privacy";

const POS = "var(--success)"; // verde P&L
const NEG = "var(--danger)"; // rosso P&L

/** "2026-08" → "08/26" (mm/aa) */
function mmLabel(monthKey: string): string {
  return `${monthKey.slice(5)}/${monthKey.slice(2, 4)}`;
}

/** Month key "yyyy-MM" spostata di `offset` mesi (negativo = indietro). */
function monthOffsetKey(monthKey: string, offset: number): string {
  const { y, m } = parseDateKey(monthKey + "-01");
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function MonthlyPnl({ db }: { db: DB }) {
  const tz = db.settings.timezone;
  const locale = db.settings.locale;
  const baseCurrency = db.settings.baseCurrency;
  const moneyHide = moneyMasked(db.settings.privacyMode);

  const curKey = monthKeyOf(todayKey(tz));
  const months = Array.from({ length: 6 }, (_, i) => monthOffsetKey(curKey, i - 5));
  const data = months.map((k) => ({ x: mmLabel(k), y: monthPnlTrades(db, k).base }));

  const total = data.reduce((s, d) => s + d.y, 0);
  const positive = data.filter((d) => d.y > 0).length;
  const totalTone =
    total > 0 ? "text-success" : total < 0 ? "text-danger" : "text-foreground";

  const hasPnl = data.some((d) => d.y !== 0);

  return (
    <Card texture>
      <CardHeader>
        <div>
          <CardTitle>Andamento mensile</CardTitle>
          <CardSubtitle>
            P&L trading in {baseCurrency} · ultimi 6 mesi
          </CardSubtitle>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Totale semestre
          </p>
          <p
            className={cn(
              "text-base font-semibold tnum leading-tight",
              moneyHide ? "text-secondary-text" : totalTone
            )}
          >
            {moneyHide ? maskMoney() : formatSignedMoney(total, baseCurrency, locale)}
          </p>
        </div>
      </CardHeader>
      {!hasPnl ? (
        <p className="py-8 text-center text-xs text-muted-foreground">
          Nessun P&L registrato nei mesi precedenti.
        </p>
      ) : (
        <>
          <BarsChart
            data={data}
            height={180}
            color={POS}
            negativeColor={NEG}
            showValue={!moneyHide}
          />
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: POS }} />
              profitto
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: NEG }} />
              perdita
            </span>
            <span className="ml-auto tnum">
              {positive} di 6 mesi positivi
            </span>
          </div>
        </>
      )}
    </Card>
  );
}
