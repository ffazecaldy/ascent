"use client";
// ============================================================
// ASCEND — Risparmi · Gestione Versamenti (SavingsDeposit)
// CRUD: data, importo (valuta base), obiettivo (select opz.),
// nota, elimina (con conferma). Tabella DENSE tnum con righe
// hover, badge obiettivo (goalId vuoto o orfano → "generico"),
// totale in coda. Ordinata per data + createdAt desc.
// ============================================================

import { useMemo, useState } from "react";
import { useDB, updateDB, removeById } from "@/lib/storage";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Misc";
import { ConfirmDialog } from "@/components/ui/Modal";
import { formatMoney } from "@/lib/format";
import { labelDayKey } from "@/lib/dates";
import { moneyMasked, maskMoney } from "@/lib/privacy";
import type { SavingsDeposit } from "@/lib/types";

export function DepositManager({
  onNew,
  onEdit,
}: {
  onNew: (goalId?: string) => void;
  onEdit: (deposit: SavingsDeposit) => void;
}) {
  const db = useDB();
  const base = db.settings.baseCurrency;
  const locale = db.settings.locale;
  const hidden = moneyMasked(db.settings.privacyMode);
  const [confirmDel, setConfirmDel] = useState<SavingsDeposit | null>(null);

  const goalById = useMemo(
    () => new Map(db.savingsGoals.map((g) => [g.id, g])),
    [db.savingsGoals]
  );

  const deposits = useMemo(
    () =>
      [...db.savingsDeposits].sort(
        (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
      ),
    [db.savingsDeposits]
  );

  const total = deposits.reduce((s, d) => s + d.amount, 0);

  const confirmDelete = () => {
    if (!confirmDel) return;
    updateDB((d) => ({ ...d, savingsDeposits: removeById(d.savingsDeposits, confirmDel.id) }));
    setConfirmDel(null);
  };

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Versamenti</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {deposits.length > 0
              ? `${deposits.length} versamento${deposits.length === 1 ? "" : "i"} · ogni goccia conta per la tua curva.`
              : "Registra i versamenti che alimentano i tuoi obiettivi."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => onNew()}>
          ＋ Versamento
        </Button>
      </div>

      {deposits.length === 0 ? (
        <EmptyState
          icon="🪙"
          title="Nessun versamento"
          description="Registra il primo versamento per iniziare la tua curva di accumulo — anche senza obiettivo (generico)."
          action={
            <Button size="sm" glow onClick={() => onNew()}>
              ＋ Registra il primo versamento
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Data</th>
                  <th className="px-4 py-2.5 font-medium">Obiettivo</th>
                  <th className="px-4 py-2.5 font-medium">Nota</th>
                  <th className="px-4 py-2.5 text-right font-medium">Importo</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {deposits.map((d) => {
                  const goal = d.goalId ? goalById.get(d.goalId) : undefined;
                  return (
                    <tr
                      key={d.id}
                      className="group/row transition-colors hover:bg-elevated"
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 text-secondary-text">
                        {labelDayKey(d.date, locale)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        {goal ? (
                          <span className="flex flex-wrap items-center gap-1.5">
                            <Badge tone={goal.active ? "info" : "default"}>{goal.name}</Badge>
                            {!goal.active && <Badge tone="default">in pausa</Badge>}
                          </span>
                        ) : (
                          <Badge tone="default">generico</Badge>
                        )}
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-2.5 text-muted-foreground">
                        {d.note || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="tnum font-semibold text-foreground">
                          {hidden ? maskMoney() : formatMoney(d.amount, base, locale)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-50 transition-opacity group-hover/row:opacity-100">
                          <button
                            onClick={() => onEdit(d)}
                            className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-elevated-2 hover:text-foreground"
                            aria-label="Modifica versamento"
                            title="Modifica"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setConfirmDel(d)}
                            className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                            aria-label="Elimina versamento"
                            title="Elimina"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14ZM10 11v6M14 11v6" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border">
                  <td colSpan={3} className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Totale versato
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="tnum font-semibold text-accent">
                      {hidden ? maskMoney() : formatMoney(total, base, locale)}
                    </span>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={confirmDel != null}
        onClose={() => setConfirmDel(null)}
        onConfirm={confirmDelete}
        title="Eliminare il versamento?"
        message={`Il versamento del ${confirmDel ? labelDayKey(confirmDel.date, locale) : ""} verrà rimosso dall'accumulo.`}
        confirmLabel="Elimina versamento"
      />
    </section>
  );
}
