"use client";
// ============================================================
// ASCEND — Risparmi · Curva di accumulo
// LineChart da savingsSeries (cumulativa per data di versamento),
// linea + area in ACCENT blue. Empty state dedicato.
// ============================================================

import { useDB } from "@/lib/storage";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { LineChart, ACCENT } from "@/components/charts";
import { formatMoney } from "@/lib/format";
import { moneyMasked, maskMoney } from "@/lib/privacy";
import type { LinePoint } from "@/components/charts";

function shortDay(date: string, locale: string): string {
  const { y, m, d } = {
    y: date.slice(0, 4),
    m: Number(date.slice(5, 7)),
    d: Number(date.slice(8, 10)),
  };
  return new Date(Number(y), m - 1, d).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
  });
}

export function AccumulationChart({
  series,
  onNewDeposit,
}: {
  series: { date: string; value: number }[];
  onNewDeposit: () => void;
}) {
  const db = useDB();
  const base = db.settings.baseCurrency;
  const locale = db.settings.locale;
  const hidden = moneyMasked(db.settings.privacyMode);

  const total = series.length ? series[series.length - 1].value : 0;
  // Con un solo versamento (1 punto) la LineChart non disegna nulla:
  // prependiamo una baseline a 0 dalla data del primo versamento così la
  // curva di accumulo compare SUBITO al primo deposito e si aggiorna live.
  let display = series.map((p) => ({ date: p.date, value: p.value }));
  if (display.length === 1) {
    display = [{ date: display[0].date, value: 0 }, ...display];
  }
  const data: LinePoint[] = display.map((p) => ({ x: shortDay(p.date, locale), y: p.value }));

  return (
    <Card hairline="accent">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Curva di accumulo</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Totale versato nel tempo, aggiornato a ogni versamento.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Totale accumulato
          </div>
          <div className="tnum text-lg font-semibold text-accent">
            {hidden ? maskMoney() : formatMoney(total, base, locale)}
          </div>
        </div>
      </div>

      {data.length > 1 ? (
        <LineChart
          data={data}
          color={ACCENT}
          height={200}
          yFormatter={(n) => (hidden ? maskMoney() : formatMoney(n, base, locale))}
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong py-12 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-accent/30 bg-accent/10 shadow-[0_0_28px_-8px_rgba(76,126,255,0.6)]">
            <Icon name="chart-line" size={30} className="text-accent" />
          </div>
          <p className="text-sm font-medium text-secondary-text">Ancora nessun versamento</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Registra almeno due versamenti per vedere la tua parabola di accumulo.
          </p>
          <div className="mt-2">
            <Button variant="outline" size="sm" onClick={onNewDeposit}>
              ＋ Primo versamento
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
