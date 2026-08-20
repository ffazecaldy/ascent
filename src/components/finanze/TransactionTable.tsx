"use client";
// ============================================================
// Tabella transazioni del mese (spec 4.2 §4) — ART DIRECTION
// Riga densa tnum con hover, icona categoria in chip colorato + dot,
// importi formatSignedMoney coloratti, badge "auto" con pulse,
// empty state curato. Logica invariata.
// ============================================================

import { useState } from "react";
import Link from "next/link";
import { useDB, updateDB, removeById } from "@/lib/storage";
import { monthKeyOf } from "@/lib/dates";
import { getCategory } from "@/lib/db";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { moneyMasked, maskMoney } from "@/lib/privacy";
import type { Transaction } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Modal";

export function TransactionTable({ month }: { month: string }) {
  const db = useDB();
  const base = db.settings.baseCurrency.toUpperCase();
  const locale = db.settings.locale;
  const masked = moneyMasked(db.settings.privacyMode);

  const [toDelete, setToDelete] = useState<Transaction | null>(null);

  const txs = db.transactions
    .filter((t) => monthKeyOf(t.date) === month)
    .sort((a, b) => `${b.date}|${b.createdAt}`.localeCompare(`${a.date}|${a.createdAt}`));

  const confirmDelete = () => {
    if (!toDelete) return;
    updateDB((d) => ({ ...d, transactions: removeById(d.transactions, toDelete.id) }));
    setToDelete(null);
  };

  const toggleRecurring = (t: Transaction) => {
    updateDB((d) => ({
      ...d,
      transactions: d.transactions.map((x) =>
        x.id === t.id ? { ...x, recurring: x.recurring ? undefined : true } : x
      ),
    }));
  };

  const signedBase = (t: Transaction) =>
    t.type === "income" ? t.amount * t.exchangeRate : -(t.amount * t.exchangeRate);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Transazioni {month}</CardTitle>
          <CardSubtitle>
            Importi convertiti in {base}
            {!masked && txs.length > 0 && ` · ${txs.length} movimenti`}
          </CardSubtitle>
        </div>
      </CardHeader>

      {txs.length === 0 ? (
        <div className="relative overflow-hidden rounded-xl border border-dashed border-border-strong bg-muted/40 grid-texture">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(400px_120px_at_50%_-20%,rgba(76,126,255,0.12),transparent_70%)]" />
          <div className="relative flex flex-col items-center justify-center gap-3 py-14 text-center">
            <div className="relative">
              <span className="absolute inset-0 -m-3 rounded-full bg-accent/10 blur-md animate-pulse-dot" />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/25 bg-accent/5 text-2xl shadow-[0_0_24px_-6px_var(--accent-glow)]">
                🪙
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-secondary-text">Nessuna transazione in questo mese</p>
              <p className="mt-1 max-w-xs text-xs text-secondary-text leading-relaxed">
                Questo mese è ancora tutto da scrivere: registra la prima voce dal form qui sopra e il
                saldo inizierà a raccontare la tua storia.
              </p>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5 rounded-full border border-border bg-elevated px-2 py-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-success" /> Entrate
              </span>
              <span className="flex items-center gap-1.5 rounded-full border border-border bg-elevated px-2 py-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-danger" /> Uscite
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[580px] text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="pb-2 pr-3 font-medium">Data</th>
                <th className="pb-2 pr-3 font-medium">Categoria</th>
                <th className="pb-2 pr-3 font-medium">Nota</th>
                <th className="pb-2 pr-3 text-right font-medium">Importo</th>
                <th className="pb-2 pr-3 text-right font-medium">Ric.</th>
                <th className="pb-2 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {txs.map((t) => {
                const cat = getCategory(db, t.categoryId);
                const catColor = cat?.color ?? "#64748b";
                const cross = t.currency.toUpperCase() !== base;
                const sb = signedBase(t);
                return (
                  <tr
                    key={t.id}
                    className="group border-b border-border/50 transition-colors last:border-0 hover:bg-elevated/70"
                  >
                    <td className="tnum whitespace-nowrap py-2 pr-3 text-secondary-text">
                      <span className="inline-flex items-center gap-1.5">
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="text-muted-foreground/70"
                        >
                          <rect x="3" y="4" width="18" height="18" rx="2" />
                          <path d="M16 2v4M8 2v4M3 10h18" />
                        </svg>
                        {new Date(t.date + "T12:00:00").toLocaleDateString(locale, {
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="flex items-center gap-2">
                        {/* icona in chip tinta colore categoria + dot colore */}
                        <span className="relative grid h-6 w-6 shrink-0 place-items-center rounded-md text-[13px] leading-none transition-transform group-hover:scale-105"
                          style={{ backgroundColor: catColor + "1e" }}
                        >
                          {cat?.icon ?? "🏷️"}
                          <span
                            className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full ring-2 ring-card"
                            style={{ backgroundColor: catColor }}
                          />
                        </span>
                        <span className="text-secondary-text">{cat?.name ?? "—"}</span>
                        {t.autoGenerated && (
                          <Link href="/trading/payouts" title={`Payout ${t.sourcePayoutId ?? ""}`}>
                            <Badge tone="info" pulse className="cursor-help">
                              auto
                            </Badge>
                          </Link>
                        )}
                      </span>
                    </td>
                    <td className="max-w-[190px] truncate py-2 pr-3 text-secondary-text" title={t.note}>
                      {t.note || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <div
                        className={cn(
                          "tnum font-semibold tracking-tight",
                          t.type === "income" ? "text-success" : "text-danger"
                        )}
                      >
                        {masked ? maskMoney() : formatSignedMoney(sb, base, locale)}
                      </div>
                      {cross && !masked && (
                        <div className="tnum text-[11px] text-muted-foreground">
                          {formatMoney(t.amount, t.currency, locale)}{" "}
                          <span className="opacity-70">· {t.currency}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <button
                        onClick={() => toggleRecurring(t)}
                        title={t.recurring ? "Ricorrente: disattiva" : "Ricorrente: attiva"}
                        className={cn(
                          "rounded-md p-1 transition-colors",
                          t.recurring
                            ? "text-accent hover:bg-accent/12"
                            : "text-muted-foreground opacity-60 hover:bg-elevated hover:text-foreground hover:opacity-100"
                        )}
                        aria-label="Toggle ricorrente"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
                        </svg>
                      </button>
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setToDelete(t)}
                        aria-label="Elimina transazione"
                        className="h-7 w-7 text-muted-foreground opacity-60 transition-opacity hover:opacity-100 hover:text-danger"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
                        </svg>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={toDelete != null}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Eliminare la transazione?"
        message={
          toDelete?.autoGenerated
            ? "Viene eliminata solo la transazione: il payout collegato in Trading resta invariato."
            : "Questa azione non può essere annullata."
        }
        confirmLabel="Elimina"
      />
    </Card>
  );
}
