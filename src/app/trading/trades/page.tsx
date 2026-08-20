"use client";

// ============================================================
// ASCEND — Trade log (specifica 4.3)
// Lista trade + filtro account/mese · saldo live · CRUD + regole setup
// Art-direction: kicker "Trading", reveal on scroll, StatCard saldo
// con sparkline (ultimi N trade) + hairline, barra filtri stile Select.
// ============================================================

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Trade } from "@/lib/types";
import { useDB, updateDB, upsert, removeById, uid, nowISO } from "@/lib/storage";
import { getAccount } from "@/lib/db";
import { isoToDayKey, monthKeyOf, todayKey } from "@/lib/dates";
import { formatR, formatSignedMoney, formatMoney, currencySymbol } from "@/lib/format";
import { kpiMasked, moneyMasked, maskMoney, maskKpi } from "@/lib/privacy";
import { SectionHeader, EmptyState } from "@/components/ui/Misc";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { Reveal } from "@/components/ui/Reveal";
import { ConfirmDialog } from "@/components/ui/Modal";
import { TradeForm, type TradePayload } from "@/components/trading/trades/TradeForm";
import { TradeList } from "@/components/trading/trades/TradeList";
import { monthLabel, shiftMonth } from "@/components/trading/trades/trade-utils";

const ALL = "__all__";
const SPARK_N = 12;

export default function TradesPage() {
  const db = useDB();

  const [accountFilter, setAccountFilter] = useState<string>(() => {
    const first = db.accounts.find((a) => !a.archived) ?? db.accounts[0];
    return first ? first.id : ALL;
  });
  const [month, setMonth] = useState(() => monthKeyOf(todayKey(db.settings.timezone)));
  const currentMonth = monthKeyOf(todayKey(db.settings.timezone));

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Trade | null>(null);
  const [deleting, setDeleting] = useState<Trade | null>(null);

  const moneyHidden = moneyMasked(db.settings.privacyMode);
  const kpiHidden = kpiMasked(db.settings.privacyMode);

  const accounts = db.accounts;
  const selAccount = accountFilter === ALL ? null : getAccount(db, accountFilter);

  const baseTrades = useMemo(
    () => (selAccount ? db.trades.filter((t) => t.accountId === selAccount.id) : db.trades),
    [db.trades, selAccount]
  );

  const monthTrades = useMemo(
    () =>
      baseTrades
        .filter((t) => monthKeyOf(isoToDayKey(t.closeDate, db.settings.timezone)) === month)
        .sort((a, b) => b.closeDate.localeCompare(a.closeDate)),
    [baseTrades, month, db.settings.timezone]
  );

  // ---- saldo live + KPIs ----
  const liveBalance = selAccount ? selAccount.capital + baseTrades.reduce((s, t) => s + t.resultNative, 0) : null;
  const monthR = monthTrades.reduce((s, t) => s + t.resultR, 0);
  const monthNative = monthTrades.reduce((s, t) => s + t.resultNative, 0);

  // sparkline: risultati (valuta nativa) degli ultimi N trade dell'account selezionato, in ordine cronologico
  const liveSpark = useMemo(() => {
    const sorted = [...baseTrades]
      .sort((a, b) => a.closeDate.localeCompare(b.closeDate))
      .slice(-SPARK_N);
    return sorted.map((t) => t.resultNative);
  }, [baseTrades]);

  const sparkPresent = liveSpark.length > 1;
  const sparkColor =
    monthNative > 0 ? "#2ddf9e" : monthNative < 0 ? "#ff5c5c" : "#4c7eff";

  // ---- CRUD ----
  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (t: Trade) => {
    setEditing(t);
    setFormOpen(true);
  };

  const handleSave = (input: { trade: TradePayload; rules: { ruleId: string; respected: boolean }[] }) => {
    const tradeId = input.trade.id ?? uid();
    const trade: Trade = {
      ...input.trade,
      id: tradeId,
      createdAt: input.trade.createdAt ?? nowISO(),
    } as Trade;
    updateDB((d) => {
      const kept = d.tradeSetupRules.filter((r) => r.tradeId !== tradeId);
      const newRules = input.rules.map((r) => ({ id: uid(), tradeId, ruleId: r.ruleId, respected: r.respected }));
      return {
        ...d,
        trades: upsert(d.trades, trade),
        tradeSetupRules: [...kept, ...newRules],
      };
    });
    setEditing(null);
    setFormOpen(false);
  };

  const confirmDelete = () => {
    if (!deleting) return;
    const id = deleting.id;
    updateDB((d) => ({
      ...d,
      trades: removeById(d.trades, id),
      tradeSetupRules: d.tradeSetupRules.filter((r) => r.tradeId !== id),
    }));
    setDeleting(null);
  };

  const noAccounts = accounts.length === 0;

  return (
    <div className="space-y-6">
      <SectionHeader
        kicker="Trading"
        title="Trade log"
        subtitle="Tutti i trade, con risultato, R e disciplina del setup."
        action={
          <Button onClick={openNew} disabled={noAccounts}>
            + Nuovo trade
          </Button>
        }
      />

      {/* Saldo live + riepilogo mese */}
      <Reveal>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {selAccount && (
            <StatCard
              label={`Saldo · ${selAccount.name}`}
              value={moneyHidden ? maskMoney() : formatMoney(liveBalance ?? 0, selAccount.nativeCurrency, db.settings.locale)}
              delta={
                moneyHidden
                  ? maskKpi()
                  : formatSignedMoney(monthNative, selAccount.nativeCurrency, db.settings.locale)
              }
              deltaTone={monthNative > 0 ? "positive" : monthNative < 0 ? "negative" : "neutral"}
              icon={<span className="text-sm">{currencySymbol(selAccount.nativeCurrency)}</span>}
              valueClassName={moneyHidden ? "" : (liveBalance ?? 0) < 0 ? "text-danger" : ""}
              spark={sparkPresent ? liveSpark : undefined}
              sparkColor={sparkColor}
              hairline={monthNative > 0 ? "success" : monthNative < 0 ? "danger" : "accent"}
            />
          )}

          <StatCard label="Trade · mese" value={monthTrades.length} icon={<span>🕹</span>} />
          <StatCard
            label="R · mese"
            value={kpiHidden ? maskKpi() : formatR(monthR)}
            valueClassName={!kpiHidden ? (monthR > 0 ? "text-success" : monthR < 0 ? "text-danger" : "") : ""}
            icon={<span>📈</span>}
          />
          {selAccount && (
            <StatCard
              label={`P&L · mese · ${currencySymbol(selAccount.nativeCurrency)}`}
              value={
                moneyHidden
                  ? maskMoney()
                  : formatSignedMoney(monthNative, selAccount.nativeCurrency, db.settings.locale)
              }
              valueClassName={
                !moneyHidden ? (monthNative > 0 ? "text-success" : monthNative < 0 ? "text-danger" : "") : ""
              }
              deltaTone={monthNative > 0 ? "positive" : monthNative < 0 ? "negative" : "neutral"}
              icon={<span>💰</span>}
            />
          )}
        </div>
      </Reveal>

      {/* Filtri: account + mese — barra stile Select */}
      {!noAccounts && (
        <Reveal delay={60}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card px-3 py-2.5 shadow-[--shadow-card]">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <span className="shrink-0 pl-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Account
              </span>
              <div className="min-w-0 max-w-full flex-1 sm:flex-none sm:w-52">
                <Select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
                  <option value={ALL}>Tutti gli account</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.archived ? " (archiviato)" : ""}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="hidden h-6 w-px bg-border sm:block" />

            <div className="flex items-center gap-2.5">
              <span className="shrink-0 pl-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Mese
              </span>
              <div className="flex items-center gap-0.5 rounded-lg border border-border-strong bg-muted p-0.5">
                <button
                  onClick={() => setMonth((m) => shiftMonth(m, -1))}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
                  aria-label="Mese precedente"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
                <span className="min-w-32 text-center text-[13px] font-semibold capitalize tnum">
                  {monthLabel(month, db.settings.locale)}
                </span>
                <button
                  onClick={() => setMonth((m) => shiftMonth(m, 1))}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
                  aria-label="Mese successivo"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </div>
              {month !== currentMonth && (
                <button
                  onClick={() => setMonth(currentMonth)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/10"
                >
                  Oggi
                </button>
              )}
            </div>
          </div>
        </Reveal>
      )}

      {/* Contenuto */}
      <Reveal delay={120}>
        {noAccounts ? (
          <EmptyState
            icon="🏦"
            title="Nessun account"
            description="Prima di registrare trade serve almeno un account di trading."
            action={
              <Link href="/trading/accounts">
                <Button variant="outline" size="sm">
                  Crea un account
                </Button>
              </Link>
            }
          />
        ) : monthTrades.length === 0 ? (
          <EmptyState
            icon="📭"
            title={`Nessun trade in ${monthLabel(month, db.settings.locale).toLowerCase()}`}
            description="Registra il primo trade del periodo per iniziare."
            action={
              <Button size="sm" onClick={openNew}>
                + Nuovo trade
              </Button>
            }
          />
        ) : (
          <TradeList
            db={db}
            trades={monthTrades}
            onEdit={openEdit}
            onDelete={setDeleting}
            showAccount={accountFilter === ALL}
          />
        )}
      </Reveal>

      {/* Footer meta: bottone rapido quando il mese è vuoto ma ci sono trade altrove */}
      {!noAccounts && monthTrades.length === 0 && db.trades.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Ci sono trade in altri periodi — usa le frecce per navigare i mesi.
        </p>
      )}

      <TradeForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        initial={editing}
        db={db}
        onSave={handleSave}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Eliminare il trade?"
        message={
          deleting
            ? `Verrà rimosso "${deleting.instrument}" con le relative regole del setup.`
            : "Questa azione non può essere annullata."
        }
        confirmLabel="Elimina"
      />
    </div>
  );
}
