"use client";
// ============================================================
// Finanze — Saldo totale (patrimonio) + Saldo iniziale.
//  - Hero "Punto di partenza" quando initialBalance NON è impostato
//    e non esistono transazioni: empty-state con form dedicato
//    ("Inserisci il tuo punto di partenza", es. 2500) e CTA "Salva".
//  - Board KPI: SALDO TOTALE = financesToDate(db).net
//    (= capitale iniziale + entrate − uscite, valuta base) come KPI
//    principale con AnimatedNumber + formatMoney e hairline
//    success/danger per segno; accanto entrate/uscite del mese
//    (financesMonth) e "da inizio" (cumulati di sempre).
//  - Card "Saldo iniziale" sempre accessibile con edit inline:
//    salva su settings.initialBalance via updateDB.
//  - Tutto deriva da useDB (nessuna cache): il patrimonio si
//    aggiorna LIVE a ogni transazione aggiunta/eliminata e compare
//    anche senza transazioni (solo capitale iniziale).
// ============================================================

import { useState } from "react";
import { useDB, updateDB, nowISO } from "@/lib/storage";
import { financesMonth, financesToDate } from "@/lib/compute";
import { todayKey } from "@/lib/dates";
import { formatMoney, currencySymbol } from "@/lib/format";
import { moneyMasked, maskMoney } from "@/lib/privacy";
import { cn } from "@/lib/cn";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Reveal } from "@/components/ui/Reveal";

// ------------------------------------------------------------------
// Hero empty-state: "Punto di partenza" (nessun saldo iniziale, zero tx)
// ------------------------------------------------------------------
function PuntoDiPartenza({ base }: { base: string }) {
  const [draft, setDraft] = useState("2500");
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const v = parseFloat(draft.replace(",", "."));
    if (!Number.isFinite(v) || v < 0) {
      setError("Inserisci un importo valido (es. 2500).");
      return;
    }
    updateDB((d) => ({
      ...d,
      settings: { ...d.settings, initialBalance: Math.round(v * 100) / 100, updatedAt: nowISO() },
    }));
  };

  return (
    <Card hairline="accent" texture className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_220px_at_50%_-30%,rgba(76,126,255,0.18),transparent_70%)]" />
      <div className="relative flex flex-col items-center gap-4 py-10 text-center sm:py-14">
        <div className="relative">
          <span className="absolute inset-0 -m-3 rounded-full bg-accent/10 blur-md animate-pulse-dot" />
          <div className="relative grid h-16 w-16 place-items-center rounded-2xl border border-accent/25 bg-accent/5 text-3xl shadow-[0_0_32px_-8px_var(--accent-glow)]">
            💰
          </div>
        </div>
        <div className="max-w-md">
          <p className="mb-1 flex items-center justify-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
            <span className="h-1 w-1 rounded-full bg-accent" />
            Primo passo
          </p>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Punto di partenza</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Inserisci il tuo punto di partenza: il saldo iniziale del conto personale in{" "}
            <b className="text-secondary-text">{base}</b>. Da lì il patrimonio si calcola in automatico.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="flex w-full max-w-sm flex-col gap-2 sm:flex-row sm:items-center"
        >
          <div className="relative flex-1">
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="h-10 pr-10 text-center tnum [color-scheme:dark]"
              placeholder="es. 2500"
              autoFocus
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
              {currencySymbol(base)}
            </span>
          </div>
          <Button type="submit" size="lg" glow className="shrink-0">
            Salva
          </Button>
        </form>
        {error && <p className="text-xs text-danger">{error}</p>}
        <p className="text-[11px] text-muted-foreground">
          Lo potrai modificare in qualsiasi momento nella card “Saldo iniziale”.
        </p>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------
// Card "Saldo iniziale" — valore + edit inline (updateDB → settings.initialBalance)
// ------------------------------------------------------------------
function SaldoInizialeCard({ money }: { money: (v: number) => string }) {
  const db = useDB();
  const base = db.settings.baseCurrency.toUpperCase();
  const locale = db.settings.locale;
  const masked = moneyMasked(db.settings.privacyMode);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const bal = db.settings.initialBalance ?? 0;

  const startEdit = () => {
    setDraft(db.settings.initialBalance != null ? String(db.settings.initialBalance) : "");
    setError(null);
    setEditing(true);
  };
  const save = () => {
    const v = parseFloat(draft.replace(",", "."));
    if (!Number.isFinite(v) || v < 0) {
      setError("Inserisci un importo valido.");
      return;
    }
    updateDB((d) => ({
      ...d,
      settings: { ...d.settings, initialBalance: Math.round(v * 100) / 100, updatedAt: nowISO() },
    }));
    setEditing(false);
  };

  return (
    <Card hairline="accent" className="flex flex-col">
      <CardHeader className="mb-2">
        <div>
          <CardTitle>Saldo iniziale</CardTitle>
          <CardSubtitle>Punto di partenza del conto · {base}</CardSubtitle>
        </div>
        {!editing && (
          <Button variant="subtle" size="sm" onClick={startEdit}>
            Modifica
          </Button>
        )}
      </CardHeader>

      {editing ? (
        <div className="mt-auto space-y-2">
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
            className="tnum [color-scheme:dark]"
            placeholder="es. 2500"
            autoFocus
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={save}>
              Salva
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
              Annulla
            </Button>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      ) : (
        <div className="mt-auto flex items-baseline justify-between gap-2">
          <span
            className={cn(
              "tnum text-2xl font-semibold tracking-tight",
              bal >= 0 ? "text-foreground" : "text-danger"
            )}
          >
            {masked ? maskMoney() : formatMoney(bal, base, locale)}
          </span>
          <span className="text-[11px] text-muted-foreground">nel totale</span>
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------
// Board principale: saldo totale + da inizio + KPI mese
// ------------------------------------------------------------------
export function BalanceOverview() {
  const db = useDB();
  const base = db.settings.baseCurrency.toUpperCase();
  const locale = db.settings.locale;
  const masked = moneyMasked(db.settings.privacyMode);
  const currentMonth = todayKey(db.settings.timezone).slice(0, 7);

  // Tutto derivato live da useDB — nessuna cache: si aggiorna a ogni
  // transazione aggiunta/eliminata e compare anche senza transazioni.
  const fm = financesMonth(db, currentMonth); // entrate/uscite del mese corrente
  const toDate = financesToDate(db); // { start, income, expense, net }
  const noTx = db.transactions.length === 0;
  const showHero = db.settings.initialBalance == null && noTx;

  const money = (v: number) => (masked ? maskMoney() : formatMoney(v, base, locale));
  const netPos = toDate.net >= 0;

  if (showHero) {
    return (
      <Reveal delay={0}>
        <PuntoDiPartenza base={base} />
      </Reveal>
    );
  }

  return (
    <div className="space-y-4">
      <Reveal delay={0}>
        <div className="grid gap-4 lg:grid-cols-3">
          {/* KPI principale: SALDO TOTALE (patrimonio) */}
          <Card
            hairline={netPos ? "success" : "danger"}
            texture
            className="relative flex flex-col justify-between gap-5 overflow-hidden lg:col-span-2"
          >
            <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(76,126,255,0.14),transparent)]" />
            <div className="relative">
              <p
                className={cn(
                  "mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em]",
                  netPos ? "text-success" : "text-danger"
                )}
              >
                <span className={cn("h-1 w-1 rounded-full", netPos ? "bg-success" : "bg-danger")} />
                Saldo totale · patrimonio
              </p>
              <AnimatedNumber
                value={toDate.net}
                fmt={(n) => money(n)}
                duration={900}
                className={cn(
                  "tnum block text-4xl font-semibold leading-none tracking-tight sm:text-5xl",
                  netPos ? "text-success" : "text-danger"
                )}
              />
            </div>
            <div className="relative">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="flex items-center gap-1 text-secondary-text">
                  capitale <b className="tnum text-foreground">{money(toDate.start)}</b>
                </span>
                <span className="text-muted-foreground">+</span>
                <span className="flex items-center gap-1 text-secondary-text">
                  entrate <b className="tnum text-success">{money(toDate.income)}</b>
                </span>
                <span className="text-muted-foreground">−</span>
                <span className="flex items-center gap-1 text-secondary-text">
                  uscite <b className="tnum text-danger">{money(toDate.expense)}</b>
                </span>
              </div>
              {noTx && (
                <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-border bg-elevated px-2.5 py-1 text-[11px] text-secondary-text">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-dot" />
                  Nessuna transazione: il totale coincide con il capitale iniziale
                </p>
              )}
            </div>
          </Card>

          {/* Da inizio — entrate/uscite cumulate */}
          <Card hairline="accent" className="flex flex-col">
            <CardHeader className="mb-2">
              <div>
                <CardTitle>Da inizio</CardTitle>
                <CardSubtitle>Entrate e uscite cumulate · {base}</CardSubtitle>
              </div>
            </CardHeader>
            <div className="mt-auto space-y-2">
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted px-3 py-2.5">
                <span className="flex items-center gap-1.5 text-xs text-secondary-text">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-success">
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                  Entrate
                </span>
                <AnimatedNumber value={toDate.income} fmt={(n) => money(n)} duration={700} className="tnum font-semibold text-success" />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted px-3 py-2.5">
                <span className="flex items-center gap-1.5 text-xs text-secondary-text">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-danger">
                    <path d="M12 5v14M5 12l7 7 7-7" />
                  </svg>
                  Uscite
                </span>
                <AnimatedNumber value={toDate.expense} fmt={(n) => money(n)} duration={700} className="tnum font-semibold text-danger" />
              </div>
            </div>
          </Card>
        </div>
      </Reveal>

      <Reveal delay={80}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Entrate del mese"
            value={<AnimatedNumber value={fm.income} fmt={(n) => money(n)} duration={700} />}
            valueClassName="text-success"
            hairline="success"
          />
          <StatCard
            label="Uscite del mese"
            value={<AnimatedNumber value={fm.expense} fmt={(n) => money(n)} duration={700} />}
            valueClassName="text-danger"
            hairline="danger"
          />
          <div className="sm:col-span-2 lg:col-span-1">
            <SaldoInizialeCard money={money} />
          </div>
        </div>
      </Reveal>
    </div>
  );
}
