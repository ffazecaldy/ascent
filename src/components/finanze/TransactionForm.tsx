"use client";
// ============================================================
// Form rapido transazione (spec 4.2 §1)
// Pipeline FX: se valuta ≠ base → quoteFx/convertAmountFx per precompilare
// un exchangeRate EDITABILE. API giù = inserimento manuale, MAI un blocco.
// Convention: 1 unità valuta = exchangeRate unità base (salvato sulla riga).
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { useDB, updateDB, upsert, uid, nowISO } from "@/lib/storage";
import { todayKey } from "@/lib/dates";
import { COMMON_CURRENCIES, convertAmountFx, quoteFx } from "@/lib/fx";
import { defaultCategories } from "@/lib/db";
import { formatMoney, currencySymbol } from "@/lib/format";
import { moneyMasked, maskMoney } from "@/lib/privacy";
import type { TransactionType } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select, Field, Label } from "@/components/ui/Field";
import { Toggle } from "@/components/ui/Misc";
import { Icon } from "@/components/ui/Icon";
import { formatRate } from "./helpers";

type FxState = "idle" | "loading" | "ok" | "down";

export function TransactionForm() {
  const db = useDB();
  const base = db.settings.baseCurrency.toUpperCase();
  const locale = db.settings.locale;
  const masked = moneyMasked(db.settings.privacyMode);

  const [type, setType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(base);
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(() => todayKey(db.settings.timezone));
  const [note, setNote] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [rate, setRate] = useState("");
  const [fx, setFx] = useState<{ state: FxState; text?: string }>({ state: "idle" });
  const [retryFx, setRetryFx] = useState(0); // bump per riquotare a mano
  const [error, setError] = useState<string | null>(null);

  const currencyOptions = useMemo(() => {
    const list = [...COMMON_CURRENCIES];
    if (!list.includes(base)) list.unshift(base);
    return list;
  }, [base]);

  const catsForType = useMemo(
    () =>
      db.categories
        .filter((c) => c.type === type)
        .sort((a, b) => a.name.localeCompare(b.name, locale)),
    [db.categories, type, locale]
  );

  // Se la categoria selezionata non è valida per il tipo corrente, ricadiamo sulla prima.
  useEffect(() => {
    if (catsForType.some((c) => c.id === categoryId)) return;
    setCategoryId(catsForType[0]?.id ?? "");
  }, [catsForType, categoryId]);

  // Pipeline FX: quotazione al cambio valuta (non a ogni tasto, per non martellare l'API).
  useEffect(() => {
    let cancelled = false;
    if (currency.toUpperCase() === base) {
      setRate("1");
      setFx({ state: "ok", text: "Stessa valuta: tasso 1." });
      return;
    }
    setFx({ state: "loading", text: "Quotazione tasso di cambio…" });
    const amt = parseFloat(amount);
    const p =
      Number.isFinite(amt) && amt > 0
        ? convertAmountFx(amt, currency, base)
        : quoteFx(currency, base);
    p.then((res) => {
      if (cancelled) return;
      if (!res) {
        setFx({ state: "down", text: "API tassi non raggiungibile — inserisci il tasso a mano." });
        return;
      }
      setRate(formatRate(res.rate));
      setFx({
        state: "ok",
        text:
          res.source === "api"
            ? `1 ${currency.toUpperCase()} = ${formatRate(res.rate)} ${base} (quotato)`
            : "Tasso manuale.",
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, base, retryFx]);

  const crossCurrency = currency.toUpperCase() !== base;
  const parsedRate = parseFloat(rate);
  const amt = parseFloat(amount);
  const preview =
    crossCurrency && Number.isFinite(parsedRate) && parsedRate > 0 && Number.isFinite(amt) && amt > 0
      ? amt * parsedRate
      : null;

  const seedCategories = () => {
    updateDB((d) => ({ ...d, categories: [...d.categories, ...defaultCategories()] }));
  };

  const submit = () => {
    setError(null);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Inserisci un importo valido.");
      return;
    }
    if (!categoryId) {
      setError("Scegli o crea prima una categoria.");
      return;
    }
    let r = 1;
    if (crossCurrency) {
      if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
        setError(`Inserisci il tasso di cambio (1 ${currency.toUpperCase()} = ? ${base}).`);
        return;
      }
      r = parsedRate;
    }
    updateDB((d) => ({
      ...d,
      transactions: upsert(d.transactions, {
        id: uid(),
        amount: Math.round(amt * 100) / 100,
        currency: currency.toUpperCase(),
        exchangeRate: r,
        type,
        categoryId,
        date,
        note: note.trim() || undefined,
        recurring: recurring || undefined,
        createdAt: nowISO(),
      }),
    }));
    setAmount("");
    setNote("");
    setRecurring(false);
    setError(null);
    setDate(todayKey(db.settings.timezone));
  };

  const scrollToCategories = () => {
    document.getElementById("finanze-categorie")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (db.categories.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nuova transazione</CardTitle>
          <CardSubtitle>Serve almeno una categoria per partire.</CardSubtitle>
        </CardHeader>
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong py-12 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-accent/30 bg-accent/10 shadow-[0_0_28px_-8px_rgba(76,126,255,0.6)]">
            <Icon name="tag" size={30} className="text-accent" />
          </div>
          <p className="text-sm font-medium text-secondary-text">Nessuna categoria presente</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Crea le categorie predefinite o aggiungine di tue nel pannello qui accanto.
          </p>
          <div className="mt-2">
            <Button onClick={seedCategories}>Crea le categorie predefinite</Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card hairline="accent">
      <CardHeader>
        <div>
          <CardTitle>Nuova transazione</CardTitle>
          <CardSubtitle>Importo nella valuta indicata; tasso salvato sulla riga (1 valuta = tasso base).</CardSubtitle>
        </div>
      </CardHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-border-strong bg-muted p-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]">
              <button
                type="button"
                onClick={() => setType("expense")}
                className={cn(
                  "rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
                  type === "expense"
                    ? "bg-danger/15 text-danger shadow-[0_0_12px_-4px_var(--danger)]"
                    : "text-muted-foreground hover:text-secondary-text"
                )}
              >
                Uscita
              </button>
              <button
                type="button"
                onClick={() => setType("income")}
                className={cn(
                  "rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
                  type === "income"
                    ? "bg-success/15 text-success shadow-[0_0_12px_-4px_var(--success)]"
                    : "text-muted-foreground hover:text-secondary-text"
                )}
              >
                Entrata
              </button>
            </div>
          </Field>
          <Field label="Importo">
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="[color-scheme:dark] tnum"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Valuta">
            <Select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="[color-scheme:dark]"
            >
              {currencyOptions.map((c) => (
                <option key={c} value={c}>
                  {c} · {currencySymbol(c)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Categoria">
            {catsForType.length > 0 ? (
              <Select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="[color-scheme:dark]"
              >
                {catsForType.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </Select>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-border-strong bg-muted px-3 py-2 text-sm text-secondary-text">
                Nessuna per “{type === "income" ? "Entrata" : "Uscita"}”
                <Button size="sm" variant="subtle" onClick={scrollToCategories}>
                  + Nuova
                </Button>
              </div>
            )}
          </Field>
        </div>

        <Field label="Data">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="[color-scheme:dark]"
          />
        </Field>

        {crossCurrency && (
          <div className="space-y-2 rounded-lg border border-accent/20 bg-elevated p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <div className="flex items-center justify-between gap-2">
              <Label className="mb-0">
                Tasso di cambio · 1 {currency.toUpperCase()} = ? {base}
              </Label>
              <Button
                size="sm"
                variant="subtle"
                onClick={() => setRetryFx((r) => r + 1)}
                disabled={fx.state === "loading"}
              >
                {fx.state === "loading" ? "…" : "Aggiorna"}
              </Button>
            </div>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder={fx.state === "down" ? "es. 0.92" : "Quotazione…"}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="[color-scheme:dark] tnum"
            />
            {fx.text && (
              <p
                className={cn(
                  "text-[11px]",
                  fx.state === "down" ? "text-yellow-500" : "text-muted-foreground"
                )}
              >
                {fx.text}
              </p>
            )}
            {preview != null && (
              <p className="tnum text-xs text-secondary-text">
                {masked
                  ? `≈ ${maskMoney()} in ${base}`
                  : `≈ ${formatMoney(preview, base, locale)} in ${base}`}
              </p>
            )}
          </div>
        )}

        <Field label="Nota (opzionale)">
          <Input
            placeholder="es. Spesa settimanale, stipendio ottobre…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="[color-scheme:dark]"
          />
        </Field>

        <div className="flex items-center justify-between gap-3">
          <Toggle checked={recurring} onChange={setRecurring} label="Ricorrente" />
          <Button onClick={submit} glow>
            Salva transazione
          </Button>
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </Card>
  );
}
