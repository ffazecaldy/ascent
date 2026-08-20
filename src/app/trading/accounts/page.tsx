"use client";
// ============================================================
// ASCEND — Gestione account di trading (specifica §4.3)
// CRUD account prop/personali: capitale, valuta nativa, stato,
// firm, trading day (timezone + rollover), limiti daily/max,
// saldo live = capitale + Σ resultNative dei trade chiusi.
// Cascade delete su trades, firmExpenses, payouts, tradeSetupRules.
// Toggle archivio: gli archivi sono nascosti e NON contano nei totali.
// Tasso FX nativo→base: quota con quoteFx() (API) o inserimento manuale.
//
// ART-DIRECTION (stile myfundedbook, ricco/animato):
// - Card con hairline colorata per stato (accent/success/danger),
//   badge stato con pulse per finanziato/superato;
// - saldo live grande tnum con AnimatedNumber (count-up) colorato,
//   delta = P&L dei trade chiusi colorato + contatore;
// - componentini: capitale, valuta (badge), limiti con mini progress
//   di utilizzo (distanza dal limite; "—" se account senza trade);
// - bottone "Quota tasso" con glow;
// - modal curata a sezioni, [color-scheme:dark], grid 2 colonne;
// - card "confine trading day" con timezone/rollover in evidenza;
// - SectionHeader con kicker "Trading · Account".
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { nowISO, uid, updateDB, upsert, useDB } from "@/lib/storage";
import type { AccountStatus, AccountType, Trade, TradingAccount } from "@/lib/types";
import { COMMON_CURRENCIES, quoteFx } from "@/lib/fx";
import { accountBaseRate, evalProgress } from "@/lib/compute";
import type { EvalProgress } from "@/lib/compute";
import { formatMoney, formatPercent, formatSignedMoney } from "@/lib/format";
import { maskMoney, moneyMasked } from "@/lib/privacy";
import { isoToDayKey, labelDayKey, monthKeyOf, todayKey, tradingDayKey } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { TrendArrow } from "@/components/ui/Arrow";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Field, Input, Select } from "@/components/ui/Field";
import { EmptyState, ProgressBar, SectionHeader, Toggle } from "@/components/ui/Misc";
import { StatCard } from "@/components/ui/StatCard";
import { Reveal } from "@/components/ui/Reveal";

// ------------------------------------------------------------
// Costanti & helper di dominio
// ------------------------------------------------------------

const TZ_OPTIONS = [
  "Europe/Rome",
  "Europe/London",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Tokyo",
  "UTC",
];

type Tone = "default" | "info" | "success" | "danger" | "warning";
type Hairline = "accent" | "success" | "danger" | "none";

const STATUS_META: Record<AccountStatus, { label: string; tone: Tone }> = {
  eval: { label: "In eval", tone: "warning" },
  superato: { label: "Superata", tone: "success" },
  finanziato: { label: "Finanziato", tone: "success" },
  bruciato: { label: "Bruciato", tone: "danger" },
};

const TYPE_META: Record<AccountType, { label: string; tone: Tone }> = {
  prop: { label: "Prop", tone: "info" },
  personal: { label: "Personale", tone: "default" },
};

/** Hairline della card in base allo stato: attivo → accent, finanziato/superato → success, bruciato → danger. */
const statusHairline = (s: AccountStatus): Hairline =>
  s === "bruciato" ? "danger" : s === "finanziato" || s === "superato" ? "success" : "accent";

const parseNum = (s: string): number | null => {
  const v = parseFloat(s.trim().replace(",", "."));
  return Number.isFinite(v) ? v : null;
};

/** Numero nullable (vuoto → null). */
const nullableNum = (s: string): number | null | undefined => {
  if (!s.trim()) return null;
  return parseNum(s);
};

const formatRate = (r: number): string =>
  r.toLocaleString("it-IT", { maximumFractionDigits: 5, minimumFractionDigits: 2 });

/** Importo consapevole della privacy: cifre mascherate → ••• (segno preservato). */
function Amount({
  value,
  currency,
  masked,
  signed = false,
}: {
  value: number;
  currency: string;
  masked: boolean;
  signed?: boolean;
}) {
  if (masked) {
    const sign = signed && value > 0 ? "+" : signed && value < 0 ? "−" : "";
    return (
      <span className="tnum">
        {sign}
        {maskMoney()}
      </span>
    );
  }
  return (
    <span className="tnum">{signed ? formatSignedMoney(value, currency) : formatMoney(value, currency)}</span>
  );
}

/**
 * Saldo "live": count-up animato con AnimatedNumber (grazie al key il
 * conteggio riparte a ogni variazione sostanziale del valore).
 */
function LiveAmount({
  value,
  currency,
  masked,
  signed = false,
  className,
}: {
  value: number;
  currency: string;
  masked: boolean;
  signed?: boolean;
  className?: string;
}) {
  if (masked) {
    const sign = signed && value > 0 ? "+" : signed && value < 0 ? "−" : "";
    return (
      <span className={cn("tnum", className)}>
        {sign}
        {maskMoney()}
      </span>
    );
  }
  return (
    <AnimatedNumber
      key={`${Math.round(value * 100)}-${signed ? "s" : "u"}-${currency}`}
      value={value}
      className={cn("tnum", className)}
      fmt={(n) => (signed ? formatSignedMoney(n, currency) : formatMoney(n, currency))}
    />
  );
}

/** Mini voce stat: etichetta piccola sopra, valore sotto. */
function MiniStat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <div className="mt-1 font-medium">{value}</div>
      {sub && <div className="mt-0.5">{sub}</div>}
    </div>
  );
}

/** Utilizzo di un limite: importo usato, limite e distanza restante. */
type LimitUtil = { used: number; limit: number; distance: number } | null;

/** Decimali della percentuale di utilizzo (0 = intero, 1 se <10%). */
const dtype = (pct: number) => (pct > 0 && pct < 10 ? 1 : 0);

/** Componentino limite con mini progress: mostra il limite impostato con
 * utilizzo, progress e distanza rimanente (anche a 0 trade chiusi → 0%).
 * Se il limite è assente (null) mostra "—". */
function LimitChip({
  label,
  util,
  currency,
  masked,
}: {
  label: string;
  util: LimitUtil;
  currency: string;
  masked: boolean;
}) {
  const pct = util ? Math.min(100, (util.used / util.limit) * 100) : 0;
  const tone = !util ? "accent" : pct >= 100 ? "danger" : pct >= 75 ? "warning" : "accent";
  const pctCls = !util ? "text-muted-foreground" : pct >= 100 ? "text-danger" : pct >= 75 ? "text-warning" : "text-accent";
  return (
    <div className="min-w-0">
      {!util && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <p className="mt-1 text-sm text-muted-foreground">—</p>
        </>
      )}
      {util && (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
            <span className={cn("tnum text-xs font-semibold", pctCls)}>{formatPercent(pct, dtype(pct))}</span>
          </div>
          <ProgressBar value={util.used} max={util.limit} tone={tone} className="mt-1.5 h-1.5" />
          <p className="mt-1 truncate text-[10px] text-muted-foreground">
            dist. <Amount value={util.distance} currency={currency} masked={masked} /> · lim.{" "}
            <Amount value={util.limit} currency={currency} masked={masked} />
          </p>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Progresso verso l'obiettivo eval (solo account in 'eval')
// ------------------------------------------------------------

/**
 * Blocco progresso all'interno della card: barra saldo→obiettivo con
 * 'saldo X / obiettivo Y' (tnum). Se l'account è in eval ma senza target
 * mostra un badge di avviso 'manca obiettivo'.
 */
function EvalProgressRow({ progress, currency, masked }: { progress: EvalProgress; currency: string; masked: boolean }) {
  // Eval senza obiettivo → avviso
  if (progress.target == null) {
    return (
      <div className="mt-3 rounded-xl border border-warning/25 bg-warning/[0.07] px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="warning">Manca obiettivo</Badge>
          <span className="text-[11px] text-warning/80">Imposta l'obiettivo eval per tracciare la promozione.</span>
        </div>
      </div>
    );
  }

  const pct = progress.progressPct ?? 0;
  const reached = progress.reached;
  const pctDigits = pct > 0 && pct < 10 ? 1 : 0;

  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Obiettivo eval</span>
        <span className={cn("tnum text-xs font-semibold", reached ? "text-success" : "text-accent")}>
          {formatPercent(pct, pctDigits)}
          {reached ? " 🎉" : ""}
        </span>
      </div>
      <ProgressBar value={progress.saldo} max={progress.target} tone={reached ? "success" : "accent"} className="mt-1.5 h-2" />
      <p className="mt-1 flex flex-wrap items-baseline gap-x-1 text-[11px] text-muted-foreground">
        saldo <Amount value={progress.saldo} currency={currency} masked={masked} /> / obiettivo{" "}
        <Amount value={progress.target} currency={currency} masked={masked} />
        {reached && <span className="font-semibold text-success">· raggiunto</span>}
      </p>
    </div>
  );
}

// ------------------------------------------------------------
// Form (creazione/editing) — Modal curata a sezioni
// ------------------------------------------------------------

type FormDraft = {
  name: string;
  type: AccountType;
  nativeCurrency: string;
  capital: string;
  status: AccountStatus;
  firm: string;
  tradingDayTimezone: string;
  tradingDayRolloverTime: string;
  dailyLossLimit: string;
  maxLossLimit: string;
  evalTarget: string;
};

type AccountPayload = Omit<TradingAccount, "id" | "createdAt" | "baseRate" | "archived">;

/** Promozione automatica EVAL → FINANZIATO appena registrata. */
type Promotion = {
  id: string;
  name: string;
  saldo: number;
  target: number;
  currency: string;
  at: string;
};

function AccountFormModal({
  open,
  account,
  base,
  defaultTz,
  onClose,
  onSave,
}: {
  open: boolean;
  account: TradingAccount | null;
  base: string;
  defaultTz: string;
  onClose: () => void;
  onSave: (payload: AccountPayload) => void;
}) {
  const [form, setForm] = useState<FormDraft>({
    name: "",
    type: "prop",
    nativeCurrency: base,
    capital: "0",
    status: "eval",
    firm: "",
    tradingDayTimezone: defaultTz,
    tradingDayRolloverTime: "17:00",
    dailyLossLimit: "",
    maxLossLimit: "",
    evalTarget: "",
  });
  const [tzTouched, setTzTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset del form ad ogni apertura (nuovo o editing)
  useEffect(() => {
    if (!open) return;
    setError(null);
    setTzTouched(false);
    setForm({
      name: account?.name ?? "",
      type: account?.type ?? "prop",
      nativeCurrency: account?.nativeCurrency ?? base,
      capital: account != null ? String(account.capital) : "0",
      status: account?.status ?? "eval",
      firm: account?.firm ?? "",
      tradingDayTimezone: account?.tradingDayTimezone ?? defaultTz,
      tradingDayRolloverTime: account?.tradingDayRolloverTime ?? "17:00",
      dailyLossLimit: account?.dailyLossLimit != null ? String(account.dailyLossLimit) : "",
      maxLossLimit: account?.maxLossLimit != null ? String(account.maxLossLimit) : "",
      evalTarget: account?.evalTarget != null ? String(account.evalTarget) : "",
    });
  }, [open, account, base, defaultTz]);

  const set = (patch: Partial<FormDraft>) => setForm((f) => ({ ...f, ...patch }));

  // Firma futures CME → trading day in America/Chicago (export CME).
  const setFirm = (v: string) => {
    setForm((f) => ({ ...f, firm: v }));
    if (!tzTouched && /cme/i.test(v)) {
      setForm((f) => ({ ...f, firm: v, tradingDayTimezone: "America/Chicago" }));
    }
  };

  const submit = () => {
    const name = form.name.trim();
    if (!name) {
      setError("Inserisci un nome per l'account.");
      return;
    }
    const capital = parseNum(form.capital);
    if (capital == null || capital < 0) {
      setError("Capitale non valido: deve essere un numero ≥ 0.");
      return;
    }
    const dailyLossLimit = nullableNum(form.dailyLossLimit);
    const maxLossLimit = nullableNum(form.maxLossLimit);
    if ((dailyLossLimit != null && dailyLossLimit <= 0) || (maxLossLimit != null && maxLossLimit <= 0)) {
      setError("I limiti di loss devono essere positivi (o vuoti).");
      return;
    }
    // Obiettivo eval: solo per stato 'eval'; altrimenti viene azzerato.
    const evalTarget = form.status === "eval" ? nullableNum(form.evalTarget) : null;
    if (evalTarget != null && evalTarget <= 0) {
      setError("L'obiettivo eval deve essere positivo (o vuoto).");
      return;
    }
    onSave({
      name,
      type: form.type,
      nativeCurrency: form.nativeCurrency,
      capital,
      status: form.status,
      firm: form.firm.trim() || undefined,
      tradingDayTimezone: form.tradingDayTimezone.trim() || defaultTz,
      tradingDayRolloverTime: form.tradingDayRolloverTime || "17:00",
      dailyLossLimit,
      maxLossLimit,
      evalTarget,
    });
    onClose();
  };

  const GroupLabel = ({ children }: { children: ReactNode }) => (
    <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-accent sm:col-span-2">
      <span className="h-1 w-1 rounded-full bg-accent" />
      {children}
    </p>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={account ? "Modifica account" : "Nuovo account"}
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={submit}>{account ? "Salva modifiche" : "Crea account"}</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 [color-scheme:dark]">
        <GroupLabel>Identità</GroupLabel>
        <Field label="Nome" className="sm:col-span-2">
          <Input
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="es. Apex 50k"
            autoFocus
          />
        </Field>

        <Field label="Tipo">
          <Select value={form.type} onChange={(e) => set({ type: e.target.value as AccountType })}>
            <option value="prop">Prop</option>
            <option value="personal">Personale</option>
          </Select>
        </Field>

        <Field label="Firma">
          <Input
            value={form.firm}
            onChange={(e) => setFirm(e.target.value)}
            placeholder="es. Apex, Topstep…"
          />
          {form.type === "prop" && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Per firm futures CME la timezone scatta a America/Chicago.
            </p>
          )}
        </Field>

        <GroupLabel>Valuta &amp; capitale</GroupLabel>
        <Field label="Valuta nativa">
          <Select value={form.nativeCurrency} onChange={(e) => set({ nativeCurrency: e.target.value })}>
            {COMMON_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Capitale iniziale">
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={form.capital}
            onChange={(e) => set({ capital: e.target.value })}
          />
        </Field>

        <Field label="Stato" className="sm:col-span-2">
          <Select value={form.status} onChange={(e) => set({ status: e.target.value as AccountStatus })}>
            {(Object.keys(STATUS_META) as AccountStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </Select>
        </Field>

        {/* Obiettivo eval: visibile SOLO quando lo stato è 'eval' */}
        {form.status === "eval" && (
          <Field label="Obiettivo eval (saldo da raggiungere)" className="sm:col-span-2">
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={form.evalTarget}
              placeholder="es. 52.000"
              onChange={(e) => set({ evalTarget: e.target.value })}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Saldo (capitale + P&amp;L chiusi) da raggiungere per la promozione automatica a Finanziato. In valuta
              nativa ({form.nativeCurrency}). Vuoto = nessun obiettivo.
            </p>
          </Field>
        )}

        <GroupLabel>Limiti &amp; rischio</GroupLabel>
        <Field label="Limite loss giornaliero">
          <Input
            type="number"
            inputMode="decimal"
            step="any"
            value={form.dailyLossLimit}
            placeholder="vuoto = nessun limite"
            onChange={(e) => set({ dailyLossLimit: e.target.value })}
          />
        </Field>

        <Field label="Limite loss massimo">
          <Input
            type="number"
            inputMode="decimal"
            step="any"
            value={form.maxLossLimit}
            placeholder="vuoto = nessun limite"
            onChange={(e) => set({ maxLossLimit: e.target.value })}
          />
        </Field>

        <GroupLabel>Trading day</GroupLabel>
        <Field label="Timezone trading day">
          <Input
            list="tz-options"
            value={form.tradingDayTimezone}
            placeholder="es. America/Chicago"
            onChange={(e) => {
              setTzTouched(true);
              set({ tradingDayTimezone: e.target.value });
            }}
          />
          <datalist id="tz-options">
            {TZ_OPTIONS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>

        <Field label="Rollover trading day">
          <Input
            type="time"
            value={form.tradingDayRolloverTime}
            onChange={(e) => set({ tradingDayRolloverTime: e.target.value })}
          />
        </Field>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Importi in valuta nativa dell'account ({form.nativeCurrency}).
      </p>
      {error && <p className="mt-3 text-xs font-medium text-danger">{error}</p>}
    </Modal>
  );
}

// ------------------------------------------------------------
// Riga tasso FX nativo→base (quota API + inserimento manuale)
// ------------------------------------------------------------

function FxRateRow({
  account,
  base,
  quoting,
  fxError,
  onQuote,
}: {
  account: TradingAccount;
  base: string;
  quoting: boolean;
  fxError: boolean;
  onQuote: () => void;
}) {
  const [draft, setDraft] = useState<string>(account.baseRate != null ? String(account.baseRate) : "");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(account.baseRate != null ? String(account.baseRate) : "");
  }, [account.baseRate, editing]);

  const saveManual = () => {
    const v = parseNum(draft);
    if (v == null || v <= 0) return;
    updateDB((d) => ({ ...d, accounts: upsert(d.accounts, { ...account, baseRate: v }) }));
    setEditing(false);
  };

  const draftValid = (() => {
    const v = parseNum(draft);
    return v != null && v > 0;
  })();

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tasso FX</span>
      <span className="text-xs text-secondary-text tnum">
        1 {account.nativeCurrency} → {base}
      </span>

      {editing ? (
        <>
          <Input
            type="number"
            inputMode="decimal"
            step="0.0001"
            min="0"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-28"
            aria-label="Tasso di cambio nativo→base"
          />
          <Button size="sm" onClick={saveManual} disabled={!draftValid}>
            Salva
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Annulla
          </Button>
        </>
      ) : (
        <>
          <span className="text-xs tnum text-secondary-text">
            = {account.baseRate != null ? formatRate(account.baseRate) : "n/d (usa 1)"} {base}
            {account.baseRate != null && (
              <span className="text-muted-foreground"> · usato negli aggregati</span>
            )}
          </span>
          <Button size="sm" variant="primary" glow onClick={onQuote} disabled={quoting}>
            {quoting ? "Quotazione…" : "⚡ Quota tasso"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)} title="Inserisci a mano">
            ✎
          </Button>
        </>
      )}

      {fxError && (
        <span className="w-full text-[11px] text-danger">
          Tasso non disponibile (API offline) — inseriscilo manualmente con ✎.
        </span>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Card account (articolata: saldo live, componentini, trading day)
// ------------------------------------------------------------

function AccountCard({
  acc,
  pnl,
  live,
  closed,
  daily,
  maxUtil,
  evalP,
  monthPnl,
  monthCount,
  masked,
  base,
  muted,
  quoting,
  fxError,
  onEdit,
  onDelete,
  onArchive,
  onQuote,
}: {
  acc: TradingAccount;
  pnl: number;
  live: number;
  closed: number;
  daily: LimitUtil;
  maxUtil: LimitUtil;
  evalP: EvalProgress;
  monthPnl: number;
  monthCount: number;
  masked: boolean;
  base: string;
  muted?: boolean;
  quoting: boolean;
  fxError: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onQuote: () => void;
}) {
  const needsFx = acc.nativeCurrency.toUpperCase() !== base.toUpperCase();
  const isFunded = acc.status === "finanziato" || acc.status === "superato";
  const blown = acc.status === "bruciato";
  const liveCls = live > acc.capital ? "text-success" : live < acc.capital ? "text-danger" : "text-foreground";
  const pnlCls = pnl > 0 ? "text-success" : pnl < 0 ? "text-danger" : "text-muted-foreground";

  return (
    <Card
      hairline={statusHairline(acc.status)}
      scan={!muted && !blown}
      className={cn("flex h-full flex-col", muted && "opacity-60")}
    >
      {/* Intestazione */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-sm font-semibold text-foreground">{acc.name}</h3>
            <Badge tone={TYPE_META[acc.type].tone}>{TYPE_META[acc.type].label}</Badge>
            <Badge tone={STATUS_META[acc.status].tone} pulse={isFunded}>
              {STATUS_META[acc.status].label}
              {acc.status === "superato" ? " 🎯" : ""}
            </Badge>
            {acc.archived && <Badge tone="default">Archiviato</Badge>}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {[acc.firm, acc.type === "prop" ? "account firm" : "account personale"].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="icon" variant="ghost" onClick={onEdit} title="Modifica">
            ✏️
          </Button>
          <Button size="icon" variant="ghost" onClick={onArchive} title={acc.archived ? "Ripristina" : "Archivia"}>
            {acc.archived ? "↩️" : "📦"}
          </Button>
          <Button size="icon" variant="ghost" onClick={onDelete} title="Elimina" className="text-danger hover:text-danger">
            🗑️
          </Button>
        </div>
      </div>

      {/* Saldo live: capitale + Σ risultato dei trade chiusi */}
      <div className="mt-4 rounded-xl border border-border-strong/60 bg-muted/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Saldo live
          </span>
          <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <span className={cn("h-1.5 w-1.5 rounded-full", blown ? "bg-danger animate-pulse" : "bg-success animate-pulse-dot")} />
            {acc.nativeCurrency}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <LiveAmount
            value={live}
            currency={acc.nativeCurrency}
            masked={masked}
            className={cn("text-[30px] font-bold leading-none tracking-tight", liveCls)}
          />
          {/* Frecce movimento: delta saldo − capitale = P&L chiuso */}
          <TrendArrow value={pnl} size={15} className="mt-0.5" />
        </div>
        {/* Delta: P&L dei trade chiusi, colorato (+ variazione mensile dove ha senso) */}
        <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
          <span className="text-muted-foreground">P&amp;L trade chiusi</span>
          <LiveAmount
            value={pnl}
            currency={acc.nativeCurrency}
            masked={masked}
            signed
            className={cn("font-semibold", pnlCls)}
          />
          <span className="text-muted-foreground">·</span>
          <span className="tnum text-muted-foreground">
            {closed === 0 ? "nessun trade" : closed === 1 ? "1 trade chiuso" : `${closed} trade chiusi`}
          </span>
          {monthCount > 0 && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="flex items-center gap-1" title="Variazione di questo mese">
                <TrendArrow value={monthPnl} size={11} />
                <LiveAmount
                  value={monthPnl}
                  currency={acc.nativeCurrency}
                  masked={masked}
                  signed
                  className="font-semibold text-muted-foreground"
                />
                <span className="hidden text-muted-foreground sm:inline">mese</span>
              </span>
            </>
          )}
        </div>

        {/* Progresso obiettivo eval (solo in eval; avviso se manca il target) */}
        {acc.status === "eval" && (
          <EvalProgressRow progress={evalP} currency={acc.nativeCurrency} masked={masked} />
        )}
      </div>

      {/* Componentini: capitale, valuta, limiti con mini progress */}
      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3">
        <MiniStat
          label="Capitale iniziale"
          value={
            <span className={cn(live < acc.capital ? "text-danger/80" : "text-foreground")}>
              <Amount value={acc.capital} currency={acc.nativeCurrency} masked={masked} />
            </span>
          }
        />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Valuta</p>
          <div className="mt-1.5">
            <Badge tone="info">{acc.nativeCurrency}</Badge>
          </div>
        </div>
        <LimitChip label="Limite daily" util={daily} currency={acc.nativeCurrency} masked={masked} />
        <LimitChip label="Limite max" util={maxUtil} currency={acc.nativeCurrency} masked={masked} />
      </div>

      {/* Confine trading day: timezone + rollover in evidenza */}
      <div className="mt-4 rounded-xl border border-accent/25 bg-accent-dim/40 p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-secondary-text">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          Confine trading day
        </div>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold tnum text-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            {acc.tradingDayTimezone || "UTC"}
          </span>
          <span className="rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent tnum">
            rollover {acc.tradingDayRolloverTime}
          </span>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Trading day corrente ·{" "}
          <span className="tnum text-secondary-text">{labelDayKey(tradingDayKey(new Date().toISOString(), acc))}</span>
        </p>
      </div>

      {needsFx && (
        <FxRateRow account={acc} base={base} quoting={quoting} fxError={fxError} onQuote={onQuote} />
      )}
    </Card>
  );
}

// ------------------------------------------------------------
// Pagina
// ------------------------------------------------------------

export default function AccountsPage() {
  const db = useDB();
  const base = db.settings.baseCurrency;
  const masked = moneyMasked(db.settings.privacyMode);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TradingAccount | null>(null);
  const [toDelete, setToDelete] = useState<TradingAccount | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [quotingId, setQuotingId] = useState<string | null>(null);
  const [fxErrorId, setFxErrorId] = useState<string | null>(null);

  const active = useMemo(() => db.accounts.filter((a) => !a.archived), [db.accounts]);
  const archived = useMemo(() => db.accounts.filter((a) => a.archived), [db.accounts]);

  const withData = (list: TradingAccount[], trades: Trade[]) =>
    list.map((a) => {
      const accTrades = trades.filter((t) => t.accountId === a.id);
      const pnl = accTrades.reduce((s, t) => s + t.resultNative, 0);
      const live = a.capital + pnl;
      const closed = accTrades.length;
      const rate = accountBaseRate(a, base);

      // Variazione mensile (per la freccia "questo mese" — solo se sensata)
      const tz = db.settings.timezone;
      const monthKey = monthKeyOf(todayKey(tz));
      const monthTrades = accTrades.filter((t) => monthKeyOf(isoToDayKey(t.closeDate, tz)) === monthKey);
      const monthPnl = monthTrades.reduce((s, t) => s + t.resultNative, 0);

      // Utilizzo limiti. Con trade chiusi: utilizzo reale. Senza trade chiusi ma
      // con limite impostato: used=0, distance=limit → le chip devono comunque
      // comparire (0% di utilizzo, distanza = limite). Limite assente → null → "—".
      let daily: LimitUtil = null;
      let maxUtil: LimitUtil = null;
      if (closed > 0) {
        if (a.dailyLossLimit != null) {
          const tdk = tradingDayKey(new Date().toISOString(), a);
          const dayPnl = accTrades
            .filter((t) => tradingDayKey(t.closeDate, a) === tdk)
            .reduce((s, t) => s + t.resultNative, 0);
          const used = Math.max(0, -dayPnl);
          daily = { used, limit: a.dailyLossLimit, distance: Math.max(0, a.dailyLossLimit - used) };
        }
        if (a.maxLossLimit != null) {
          const used = Math.max(0, a.capital - live);
          maxUtil = { used, limit: a.maxLossLimit, distance: Math.max(0, a.maxLossLimit - used) };
        }
      } else {
        if (a.dailyLossLimit != null) daily = { used: 0, limit: a.dailyLossLimit, distance: a.dailyLossLimit };
        if (a.maxLossLimit != null) maxUtil = { used: 0, limit: a.maxLossLimit, distance: a.maxLossLimit };
      }

      return {
        acc: a,
        pnl,
        live,
        rate,
        closed,
        daily,
        maxUtil,
        eval: evalProgress(db, a),
        monthPnl,
        monthCount: monthTrades.length,
      };
    });

  const activeRows = useMemo(() => withData(active, db.trades), [active, db.trades, base]);
  const archivedRows = useMemo(() => withData(archived, db.trades), [archived, db.trades, base]);

  // ------------------------------------------------------
  // PROMOZIONE AUTOMATICA EVAL → FINANZIATO
  // Quando evalProgress.reached === true per un account in 'eval',
  // questa effect (guardata da un ref per farlo UNA volta per ciclo)
  // aggiorna status='finanziato' + evalTarget=null e mostra il banner 🎉.
  // Essendo tutto derivato da useDB(), scatta anche subito dopo il
  // salvataggio di un trade che supera il target (qualsiasi pagina lo
  // appenda al DB — qui la rotta è sotto).
  const [promoted, setPromoted] = useState<Promotion[]>([]);
  const [toast, setToast] = useState<Promotion | null>(null);
  const promoHandledRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const evalIds = new Set(activeRows.filter((r) => r.acc.status === "eval").map((r) => r.acc.id));
    // Libera i guard per account non più in eval → un nuovo ciclo di eval
    // (es. modifica manuale) può promuovere di nuovo.
    for (const id of Array.from(promoHandledRef.current)) {
      if (!evalIds.has(id)) promoHandledRef.current.delete(id);
    }
    const hits = activeRows.filter(
      (r) => r.acc.status === "eval" && r.eval.reached && !promoHandledRef.current.has(r.acc.id)
    );
    if (hits.length === 0) return;

    for (const r of hits) {
      promoHandledRef.current.add(r.acc.id);
      updateDB((d) => ({
        ...d,
        accounts: upsert(d.accounts, { ...r.acc, status: "finanziato", evalTarget: null }),
      }));
    }
    const news: Promotion[] = hits.map((r) => ({
      id: r.acc.id,
      name: r.acc.name,
      saldo: r.eval.saldo,
      target: r.eval.target ?? 0,
      currency: r.acc.nativeCurrency,
      at: nowISO(),
    }));
    setPromoted((prev) => [...news, ...prev].slice(0, 5));
    setToast(news[0]);
  }, [activeRows]);

  // Autodismiss del toast celebrativo
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const totals = useMemo(() => {
    let count = 0,
      capital = 0,
      live = 0,
      pnl = 0;
    for (const { acc, pnl: p, live: l, rate } of activeRows) {
      count += 1;
      capital += acc.capital * rate;
      live += l * rate;
      pnl += p * rate;
    }
    return { count, capital, live, pnl };
  }, [activeRows]);

  // Contatori per il messaggio di conferma delete
  const deleteCounts = useMemo(() => {
    if (!toDelete) return null;
    const tradeIds = db.trades.filter((t) => t.accountId === toDelete.id).map((t) => t.id);
    return {
      trades: tradeIds.length,
      firmExpenses: db.firmExpenses.filter((f) => f.accountId === toDelete.id).length,
      payouts: db.payouts.filter((p) => p.accountId === toDelete.id).length,
      rules: db.tradeSetupRules.filter((r) => tradeIds.includes(r.tradeId)).length,
    };
  }, [toDelete, db]);

  const deleteMessage = useMemo(() => {
    if (!toDelete || !deleteCounts) return "";
    const bits: string[] = [];
    if (deleteCounts.trades) bits.push(`${deleteCounts.trades} trade`);
    if (deleteCounts.firmExpenses) bits.push(`${deleteCounts.firmExpenses} spese firm`);
    if (deleteCounts.payouts) bits.push(`${deleteCounts.payouts} payout`);
    if (deleteCounts.rules) bits.push(`${deleteCounts.rules} regole setup`);
    return `Eliminerai “${toDelete.name}” e, in cascata, ${
      bits.length ? bits.join(", ") : "nessun dato collegato"
    }. Azione irreversibile.`;
  }, [toDelete, deleteCounts]);

  // ------------------------------------------------------
  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (acc: TradingAccount) => {
    setEditing(acc);
    setModalOpen(true);
  };

  const handleSave = (payload: AccountPayload) => {
    updateDB((d) => {
      const existing = editing ? d.accounts.find((a) => a.id === editing.id) : undefined;
      const account: TradingAccount = {
        ...payload,
        id: existing?.id ?? uid(),
        baseRate:
          existing && existing.nativeCurrency === payload.nativeCurrency ? (existing.baseRate ?? null) : null,
        archived: existing?.archived ?? false,
        createdAt: existing?.createdAt ?? nowISO(),
      };
      return { ...d, accounts: upsert(d.accounts, account) };
    });
  };

  const handleArchive = (acc: TradingAccount) => {
    updateDB((d) => ({ ...d, accounts: upsert(d.accounts, { ...acc, archived: !acc.archived }) }));
  };

  const handleDelete = () => {
    if (!toDelete) return;
    updateDB((d) => {
      const tradeIds = new Set(d.trades.filter((t) => t.accountId === toDelete.id).map((t) => t.id));
      return {
        ...d,
        accounts: d.accounts.filter((a) => a.id !== toDelete.id),
        trades: d.trades.filter((t) => t.accountId !== toDelete.id),
        firmExpenses: d.firmExpenses.filter((f) => f.accountId !== toDelete.id),
        payouts: d.payouts.filter((p) => p.accountId !== toDelete.id),
        tradeSetupRules: d.tradeSetupRules.filter((r) => !tradeIds.has(r.tradeId)),
      };
    });
    setToDelete(null);
  };

  const handleQuote = async (acc: TradingAccount) => {
    setQuotingId(acc.id);
    setFxErrorId(null);
    const q = await quoteFx(acc.nativeCurrency, db.settings.baseCurrency);
    if (q) {
      updateDB((d) => ({ ...d, accounts: upsert(d.accounts, { ...acc, baseRate: q.rate }) }));
    } else {
      setFxErrorId(acc.id);
    }
    setQuotingId(null);
  };

  // ------------------------------------------------------
  const renderCard = (r: (typeof activeRows)[number], muted?: boolean) => (
    <AccountCard
      acc={r.acc}
      pnl={r.pnl}
      live={r.live}
      closed={r.closed}
      daily={r.daily}
      maxUtil={r.maxUtil}
      evalP={r.eval}
      monthPnl={r.monthPnl}
      monthCount={r.monthCount}
      masked={masked}
      base={base}
      muted={muted}
      quoting={quotingId === r.acc.id}
      fxError={fxErrorId === r.acc.id}
      onEdit={() => openEdit(r.acc)}
      onDelete={() => setToDelete(r.acc)}
      onArchive={() => handleArchive(r.acc)}
      onQuote={() => handleQuote(r.acc)}
    />
  );

  return (
    <div className="space-y-6">
      {/* Banner celebrativo promozione EVAL → FINANZIATO (resta finché non chiuso) */}
      {promoted.length > 0 && (
        <Reveal>
          <div className="animate-pop relative flex items-start gap-3.5 overflow-hidden rounded-[--radius] border border-success/40 bg-success/[0.08] px-4 py-3.5 shadow-[0_0_45px_-12px_rgba(45,223,158,0.55)]">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-success/15 text-xl shadow-[0_0_18px_-4px_rgba(45,223,158,0.7)]">
              🎉
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-success">
                Obiettivo raggiunto: {promoted.length === 1 ? "account promosso a Finanziato" : `${promoted.length} account promossi a Finanziato`}
              </p>
              <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                {promoted.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                    <span className="font-semibold text-secondary-text">“{p.name}”</span>
                    <span>
                      saldo <Amount value={p.saldo} currency={p.currency} masked={masked} /> / obiettivo{" "}
                      <Amount value={p.target} currency={p.currency} masked={masked} />
                    </span>
                    <Badge tone="success" pulse>
                      Finanziato
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => setPromoted([])}
              className="ml-auto shrink-0 rounded-md p-1 text-xs text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
              aria-label="Chiudi avviso"
              title="Chiudi"
            >
              ✕
            </button>
          </div>
        </Reveal>
      )}

      {/* Toast celebrativo (auto-dismiss) */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex justify-center px-4">
          <div className="animate-pop pointer-events-auto flex items-center gap-3 rounded-2xl border border-success/40 bg-card px-4 py-3 shadow-[0_0_50px_-10px_rgba(45,223,158,0.6)]">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-success/15 text-lg">🎉</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-success">
                Obiettivo raggiunto: account promosso a Finanziato
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                “{toast.name}” ha superato il target ·{" "}
                <span className="tnum">
                  <Amount value={toast.saldo} currency={toast.currency} masked={masked} />
                </span>
              </p>
            </div>
            <button
              onClick={() => setToast(null)}
              className="ml-2 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
              aria-label="Chiudi"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <SectionHeader
        kicker="Trading · Account"
        title="Account di trading"
        subtitle="Account prop & personali: capitale, saldo live con i trade chiusi, limiti e confine del trading day."
        action={
          <Button onClick={openNew} glow>
            <span aria-hidden>＋</span> Nuovo account
          </Button>
        }
      />

      {/* Riepilogo (solo account attivi — gli archiviati non contano) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Account attivi"
          value={
            <AnimatedNumber value={totals.count} fmt={(n) => String(Math.round(n))} className="tnum" />
          }
          icon="🏦"
        />
        <StatCard
          label={`Capitale${base ? ` (${base})` : ""}`}
          value={<LiveAmount value={totals.capital} currency={base} masked={masked} />}
        />
        <StatCard
          label={`Saldo live${base ? ` (${base})` : ""}`}
          value={<LiveAmount value={totals.live} currency={base} masked={masked} />}
          delta={<LiveAmount value={totals.pnl} currency={base} masked={masked} signed />}
          deltaTone={totals.pnl > 0 ? "positive" : totals.pnl < 0 ? "negative" : "neutral"}
        />
      </div>

      {/* Elenco attivi */}
      {activeRows.length === 0 ? (
        <EmptyState
          icon="🏦"
          title="Nessun account di trading"
          description="Crea il primo account prop o personale per tracciare capitale, trade e limiti."
          action={
            <Button variant="outline" size="sm" onClick={openNew}>
              ＋ Crea account
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {activeRows.map((r, i) => (
            <Reveal key={r.acc.id} delay={i * 70}>
              {renderCard(r)}
            </Reveal>
          ))}
        </div>
      )}

      {/* Archiviati (nascosti di default, non contano nei totali) */}
      {archived.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between border-t border-border pt-5">
            <div>
              <h2 className="text-sm font-semibold text-secondary-text">Archiviati</h2>
              <p className="text-xs text-muted-foreground">
                Esclusi dai totali e dal saldo live aggregato.
              </p>
            </div>
            <Toggle checked={showArchived} onChange={setShowArchived} label={`Mostra (${archived.length})`} />
          </div>
          {showArchived && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {archivedRows.map((r) => (
                <Reveal key={r.acc.id}>{renderCard(r, true)}</Reveal>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal creazione/editing */}
      <AccountFormModal
        open={modalOpen}
        account={editing}
        base={base}
        defaultTz={db.settings.timezone}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
      />

      {/* Conferma eliminazione con cascata */}
      <ConfirmDialog
        open={toDelete != null}
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
        title="Eliminare l'account?"
        message={deleteMessage}
        confirmLabel="Elimina account"
      />
    </div>
  );
}
