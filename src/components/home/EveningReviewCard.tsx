"use client";

// ============================================================
// ASCEND — Home · Evening Review Card («Chiudi la giornata»)
// Riepilogo serale visibile SOLO dalle 20:00 alle 23:59 nell'ora
// dell'utente (da settings.timezone, calcolo lato client) e solo
// con onboarding completato. Ogni riga: icona coerente + valore,
// ✓ verde se presente / cerchio vuoto se mancante. Footer con
// frase motivazionale variabile in base ad Ascend Day met/not-met.
// Stile myfundedbook: hairline accent, glow leggero, denso.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { accountBaseRate, actionsOnDay, ascordDay } from "@/lib/compute";
import { isoToDayKey, todayKey } from "@/lib/dates";
import type { DB } from "@/lib/types";
import { Card, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Icon, type IconName } from "@/components/ui/Icon";
import { formatSignedMoney } from "@/lib/format";
import { cn } from "@/lib/cn";

/** Ora corrente nella timezone utente (fallback: orologio del browser). */
function hourInUserTZ(tz: string): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hour12: false });
    let h = Number(fmt.format(new Date()));
    if (Number.isNaN(h)) return new Date().getHours();
    if (h === 24) h = 0;
    return h;
  } catch {
    return new Date().getHours();
  }
}

/** Finestra di visibilità: 20:00 → 23:59 incluse. */
const EVENING_FROM = 20;

const ACTION_META: Record<string, { label: string; icon: IconName }> = {
  transazione: { label: "Transazione", icon: "wallet" },
  trade: { label: "Trade", icon: "chart-line" },
  allenamento: { label: "Allenamento", icon: "dumbbell" },
  pc: { label: "PC", icon: "monitor" },
  studio: { label: "Studio", icon: "pen" },
  lettura: { label: "Lettura", icon: "book-open" },
};

const PHRASES_MET = [
  "Ascend Day vinto — il processo paga, sempre.",
  "Tutte le caselle giuste spuntate. Domani si riparte da qui.",
  "Giornata piena, sistema rispettato. Chiudi e riposa.",
];

const PHRASES_NOT_MET = [
  "Manca ancora qualcosa in oggi: c'è tempo fino a mezzanotte.",
  "Il sistema non giudica, registra. Chiudi con un'azione.",
  "Giornata incompleta — una sola azione ora cambia il segno.",
];

interface Row {
  key: string;
  icon: IconName;
  label: string;
  /** Dettaglio già formattato; null → riga mancante (cerchio vuoto). */
  value: string | null;
}

export function EveningReviewCard({ db }: { db: DB }) {
  const tz = db.settings.timezone;

  // Gating orario lato client: niente rendering finché non siamo montati
  // (evita mismatch SSR/idratazione su un valore che cambia col tempo).
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setHour(hourInUserTZ(tz));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [tz]);

  const day = useMemo(() => todayKey(tz), [tz]);
  const visible = db.settings.onboardingDone && hour !== null && hour >= EVENING_FROM;

  const rows = useMemo<Row[]>(() => {
    if (!visible) return [];

    // 1) Ascend Day di oggi
    const asc = ascordDay(db, day);
    const ascendRow: Row | null =
      asc.total > 0
        ? {
            key: "ascend",
            icon: "target",
            label: "Ascend Day",
            value: `${asc.met ? "Vinto" : "In corso"} · ${asc.done}/${asc.total}`,
          }
        : null;

    // 2) Azioni registrate oggi
    const actions = actionsOnDay(db, day);
    const actionLabels = actions.map((a) => ACTION_META[a]?.label ?? a);
    const actionsValue =
      actionLabels.length > 4
        ? `${actionLabels.slice(0, 4).join(", ")} +${actionLabels.length - 4}`
        : actionLabels.join(", ");
    const actionsRow: Row = {
      key: "actions",
      icon: "clipboard",
      label: "Azioni registrate",
      value: actionsValue.length > 0 ? actionsValue : null,
    };

    // 3) P&L di oggi — trade chiusi nel giorno (timezone user).
    //    Somma nativa→base solo se tutti gli account sono già in valuta base;
    //    altrimenti mostriamo solo il conteggio.
    const tradesToday = db.trades.filter((t) => isoToDayKey(t.closeDate, tz) === day);
    let pnlBase: number | null = null;
    if (tradesToday.length > 0) {
      const sameCur = tradesToday.every((t) => {
        const acc = db.accounts.find((a) => a.id === t.accountId);
        return !!acc && acc.nativeCurrency.toUpperCase() === db.settings.baseCurrency.toUpperCase();
      });
      const simple = tradesToday.every((t) => {
        const acc = db.accounts.find((a) => a.id === t.accountId);
        return !!acc && accountBaseRate(acc, db.settings.baseCurrency) === 1;
      });
      if (sameCur && simple) {
        pnlBase = tradesToday.reduce((s, t) => s + t.resultNative, 0);
      }
    }
    const pnlRow: Row = {
      key: "pnl",
      icon: "banknote",
      label: "P&L di oggi",
      value:
        tradesToday.length === 0
          ? null
          : pnlBase !== null
            ? formatSignedMoney(pnlBase, db.settings.baseCurrency, db.settings.locale)
            : `${tradesToday.length} trade chius${tradesToday.length === 1 ? "o" : "i"}`,
    };

    // 4) Minuti PC oggi
    const pcMinutes = db.pcUsageLogs
      .filter((p) => p.date === day)
      .reduce((s, p) => s + p.minutes, 0);
    const pcRow: Row = {
      key: "pc",
      icon: "monitor",
      label: "Minuti PC",
      value: pcMinutes > 0 ? `${pcMinutes} min` : null,
    };

    // 5) Pagine libro aggiornate oggi (updatedAt nel giorno → pagesRead)
    const bStart = new Date(`${day}T00:00:00`);
    const bEnd = new Date(`${day}T23:59:59`);
    const pagesToday = db.books
      .filter((b) => {
        const u = new Date(b.updatedAt);
        return u >= bStart && u <= bEnd;
      })
      .reduce((s, b) => s + (b.pagesRead || 0), 0);
    const bookRow: Row = {
      key: "book",
      icon: "book-open",
      label: "Lettura",
      value: pagesToday > 0 ? `${pagesToday} pag.` : null,
    };

    return [ascendRow, actionsRow, pnlRow, pcRow, bookRow].filter((r): r is Row => r !== null);
  }, [visible, db, day, tz]);

  if (!visible) return null;

  const asc = ascordDay(db, day);
  const won = asc.total > 0 && asc.met;

  // Frase del footer deterministica sul giorno (niente flicker tra i re-render)
  const dayNum = Number(day.slice(8)) || 1;
  const phrases = won ? PHRASES_MET : PHRASES_NOT_MET;
  const footerPhrase = phrases[dayNum % phrases.length];

  return (
    <Card
      hairline="accent"
      texture
      data-testid="evening-review-card"
      className="border-accent/40 shadow-[0_0_36px_-10px_rgba(76,126,255,0.45)]"
    >
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2 text-sm">
            <span className="grid h-6 w-6 place-items-center rounded-lg bg-accent/15 text-accent">
              <Icon name="clipboard" size={14} />
            </span>
            Chiudi la giornata
          </CardTitle>
          <CardSubtitle>
            Riepilogo serale · tutto quello che oggi è realmente successo.
          </CardSubtitle>
        </div>
        {asc.total > 0 ? (
          <Badge tone={won ? "success" : "info"} pulse={!won}>
            {won ? "Vinto" : `In corso ${asc.done}/${asc.total}`}
          </Badge>
        ) : (
          <Badge tone="default">Serata</Badge>
        )}
      </CardHeader>

      <ul className="grid gap-1.5">
        {rows.map((r) => {
          const present = r.value !== null && r.value !== "";
          return (
            <li
              key={r.key}
              className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-elevated/70"
            >
              <span className="flex min-w-0 items-center gap-2.5 text-xs text-secondary-text">
                <span
                  className={cn(
                    "grid h-6 w-6 shrink-0 place-items-center rounded-lg",
                    present ? "bg-accent/10 text-accent" : "bg-elevated text-muted-foreground/60"
                  )}
                >
                  <Icon name={r.icon} size={13} />
                </span>
                <span className="truncate font-medium">{r.label}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {present && (
                  <span className="tnum max-w-[16rem] truncate text-xs font-semibold text-secondary-text">
                    {r.value}
                  </span>
                )}
                {present ? (
                  <Icon name="check" size={14} strokeWidth={2.5} className="shrink-0 text-success" />
                ) : (
                  <span
                    aria-hidden
                    className="inline-block h-[13px] w-[13px] shrink-0 rounded-full border-[1.5px] border-border-strong/70"
                  />
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <p
        className={cn(
          "mt-3 border-t border-border pt-2.5 text-xs font-medium leading-relaxed",
          won ? "text-success" : "text-muted-foreground"
        )}
      >
        {footerPhrase}
      </p>
    </Card>
  );
}
