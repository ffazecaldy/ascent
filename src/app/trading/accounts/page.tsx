"use client";
// ============================================================
// ASCEND — Gestione account di trading (specifica §4.3)
// CRUD account prop/personali: capitale, valuta nativa, stato,
// firm, trading day (timezone + rollover), limiti daily/max,
// saldo live = capitale + Σ resultNative dei trade chiusi.
// Cascade delete su trades, firmExpenses, payouts, tradeSetupRules.
// Toggle archivio: gli archivi sono nascosti e NON contano nei totali.
// Tasso FX nativo→base: quota con quoteFx() (API) o inserimento manuale.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { nowISO, uid, updateDB, upsert, useDB } from "@/lib/storage";
import type { AccountStatus, AccountType, Trade, TradingAccount } from "@/lib/types";
import { COMMON_CURRENCIES, quoteFx } from "@/lib/fx";
import { accountBaseRate } from "@/lib/compute";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { maskMoney, moneyMasked } from "@/lib/privacy";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Field, Input, Select } from "@/components/ui/Field";
import { EmptyState, SectionHeader, Toggle } from "@/components/ui/Misc";
import { StatCard } from "@/components/ui/StatCard";

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

// ------------------------------------------------------------
// Form (creazione/editing) — Modal
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
};

type AccountPayload = Omit<TradingAccount, "id" | "createdAt" | "baseRate" | "archived">;

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
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={account ? "Modifica account" : "Nuovo account"}
      width="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={submit}>{account ? "Salva modifiche" : "Crea account"}</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

        <Field label="Stato">
          <Select value={form.status} onChange={(e) => set({ status: e.target.value as AccountStatus })}>
            {(Object.keys(STATUS_META) as AccountStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Firma" className="sm:col-span-2">
          <Input
            value={form.firm}
            onChange={(e) => setFirm(e.target.value)}
            placeholder="es. Apex, Topstep…"
          />
          {form.type === "prop" && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Suggerimento: per firm futures CME la timezone del trading day scatta a America/Chicago.
            </p>
          )}
        </Field>

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
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
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
          <Button size="sm" variant="outline" onClick={onQuote} disabled={quoting}>
            {quoting ? "Quotazione…" : "Quota tasso"}
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
// Card account
// ------------------------------------------------------------

function AccountCard({
  acc,
  pnl,
  live,
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
  const pnlCls = pnl > 0 ? "text-success" : pnl < 0 ? "text-danger" : "text-foreground";

  return (
    <Card className={muted ? "opacity-60" : undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-sm font-semibold">{acc.name}</h3>
            <Badge tone={TYPE_META[acc.type].tone}>{TYPE_META[acc.type].label}</Badge>
            <Badge tone={STATUS_META[acc.status].tone}>
              {STATUS_META[acc.status].label}
              {acc.status === "superato" ? " 🎯" : ""}
            </Badge>
            {acc.archived && <Badge tone="default">Archiviato</Badge>}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {[acc.firm, `${acc.nativeCurrency} · ${acc.type === "prop" ? "capitale firm" : "capitale personale"}`]
              .filter(Boolean)
              .join(" · ")}
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
      <div className="mt-4">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Saldo live</span>
        <div className={`text-3xl font-semibold leading-tight ${pnlCls}`}>
          <Amount value={live} currency={acc.nativeCurrency} masked={masked} />
        </div>
        <div className="mt-0.5 text-xs tnum text-muted-foreground">
          <span>capitale </span>
          <Amount value={acc.capital} currency={acc.nativeCurrency} masked={masked} />
          <span> · P&L </span>
          <span className={pnlCls}>
            <Amount value={pnl} currency={acc.nativeCurrency} masked={masked} signed />
          </span>
        </div>
      </div>

      {/* Dettagli */}
      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs lg:grid-cols-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Valuta</p>
          <p className="mt-0.5 font-medium">{acc.nativeCurrency}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Capitale iniziale</p>
          <p className="mt-0.5">
            <Amount value={acc.capital} currency={acc.nativeCurrency} masked={masked} />
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Limite daily</p>
          <p className="mt-0.5">
            {acc.dailyLossLimit != null ? (
              <Amount value={acc.dailyLossLimit} currency={acc.nativeCurrency} masked={masked} />
            ) : (
              "—"
            )}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Limite max</p>
          <p className="mt-0.5">
            {acc.maxLossLimit != null ? (
              <Amount value={acc.maxLossLimit} currency={acc.nativeCurrency} masked={masked} />
            ) : (
              "—"
            )}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span>🕑 {acc.tradingDayTimezone} · rollover {acc.tradingDayRolloverTime}</span>
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
      const pnl = trades
        .filter((t) => t.accountId === a.id)
        .reduce((s, t) => s + t.resultNative, 0);
      return { acc: a, pnl, live: a.capital + pnl, rate: accountBaseRate(a, base) };
    });

  const activeRows = useMemo(() => withData(active, db.trades), [active, db.trades, base]);
  const archivedRows = useMemo(() => withData(archived, db.trades), [archived, db.trades, base]);

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
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Account di trading"
        subtitle="Account prop & personali: capitale, saldo live con i trade chiusi, limiti. Un account superato sblocca il badge 🎯 Eval superata (calcolato altrove)."
        action={
          <Button onClick={openNew}>
            <span aria-hidden>＋</span> Nuovo account
          </Button>
        }
      />

      {/* Riepilogo (solo account attivi — gli archiviati non contano) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Account attivi" value={<span className="tnum">{totals.count}</span>} icon="🏦" />
        <StatCard
          label={`Capitale${base ? ` (${base})` : ""}`}
          value={<Amount value={totals.capital} currency={base} masked={masked} />}
        />
        <StatCard
          label={`Saldo live${base ? ` (${base})` : ""}`}
          value={<Amount value={totals.live} currency={base} masked={masked} />}
          delta={<Amount value={totals.pnl} currency={base} masked={masked} signed />}
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
          {activeRows.map(({ acc, pnl, live }) => (
            <AccountCard
              key={acc.id}
              acc={acc}
              pnl={pnl}
              live={live}
              masked={masked}
              base={base}
              quoting={quotingId === acc.id}
              fxError={fxErrorId === acc.id}
              onEdit={() => openEdit(acc)}
              onDelete={() => setToDelete(acc)}
              onArchive={() => handleArchive(acc)}
              onQuote={() => handleQuote(acc)}
            />
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
              {archivedRows.map(({ acc, pnl, live }) => (
                <AccountCard
                  key={acc.id}
                  acc={acc}
                  pnl={pnl}
                  live={live}
                  masked={masked}
                  base={base}
                  muted
                  quoting={quotingId === acc.id}
                  fxError={fxErrorId === acc.id}
                  onEdit={() => openEdit(acc)}
                  onDelete={() => setToDelete(acc)}
                  onArchive={() => handleArchive(acc)}
                  onQuote={() => handleQuote(acc)}
                />
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
