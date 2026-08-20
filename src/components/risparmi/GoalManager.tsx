"use client";
// ============================================================
// ASCEND — Risparmi · Gestione Obiettivi (SavingsGoal)
// CRUD: nome, target, deadline opzionale, attivo, elimina (con
// conferma). Card per goal: anello di progresso + "X / Y · %" +
// giorni alla scadenza. Payoff "classe": a 100% badge success
// pulse + messaggio + hairline/card verde.
// Eliminando un goal i versamenti collegati RESTANO e diventano
// "generici" (FK goalId → null).
// ============================================================

import { useMemo, useState } from "react";
import { useDB, updateDB, removeById } from "@/lib/storage";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Toggle, ProgressBar } from "@/components/ui/Misc";
import { ConfirmDialog } from "@/components/ui/Modal";
import { CircularProgress } from "./CircularProgress";
import { formatMoney, formatPercent } from "@/lib/format";
import { todayKey } from "@/lib/dates";
import { moneyMasked, kpiMasked, maskMoney, maskKpi } from "@/lib/privacy";
import { cn } from "@/lib/cn";
import type { SavingsGoal } from "@/lib/types";

function daysUntil(deadline: string, tz: string): number {
  const today = new Date(todayKey(tz) + "T00:00:00").getTime();
  const target = new Date(deadline + "T00:00:00").getTime();
  return Math.round((target - today) / 86400000);
}

function DeadlineBadge({ days }: { days: number }) {
  const tone = days < 0 ? "danger" : days <= 7 ? "warning" : "info";
  const text =
    days < 0 ? `Scaduto · ${-days} gg fa` : days === 0 ? "Scade oggi" : `Scadenza · ${days} gg`;
  return (
    <Badge tone={tone} className="mt-1.5">
      <Icon name="timer" size={13} />
      {text}
    </Badge>
  );
}

export function GoalManager({
  onNewGoal,
  onEditGoal,
  onNewDeposit,
}: {
  onNewGoal: () => void;
  onEditGoal: (goal: SavingsGoal) => void;
  /** apre il form versamento pre-popolato con questo goalId */
  onNewDeposit: (goalId: string) => void;
}) {
  const db = useDB();
  const base = db.settings.baseCurrency;
  const locale = db.settings.locale;
  const hidden = moneyMasked(db.settings.privacyMode);
  const kpiHidden = kpiMasked(db.settings.privacyMode);
  const [confirmDel, setConfirmDel] = useState<SavingsGoal | null>(null);

  const activeGoals = db.savingsGoals.filter((g) => g.active).length;

  const rows = useMemo(() => {
    const depByGoal = new Map<string, number>();
    for (const d of db.savingsDeposits) {
      if (d.goalId) depByGoal.set(d.goalId, (depByGoal.get(d.goalId) ?? 0) + d.amount);
    }
    return db.savingsGoals
      .map((goal) => {
        const deposited = depByGoal.get(goal.id) ?? 0;
        const pct =
          goal.target > 0 ? Math.min(100, (deposited / goal.target) * 100) : deposited > 0 ? 100 : 0;
        return { goal, deposited, pct, done: pct >= 100 };
      })
      .sort((a, b) => {
        if (a.goal.active !== b.goal.active) return a.goal.active ? -1 : 1;
        return b.pct - a.pct;
      });
  }, [db.savingsGoals, db.savingsDeposits]);

  const toggleActive = (g: SavingsGoal, active: boolean) => {
    updateDB((d) => ({
      ...d,
      savingsGoals: d.savingsGoals.map((x) => (x.id === g.id ? { ...x, active } : x)),
    }));
  };

  const confirmDelete = () => {
    if (!confirmDel) return;
    const id = confirmDel.id;
    updateDB((d) => ({
      ...d,
      savingsGoals: removeById(d.savingsGoals, id),
      // i versamenti riferiti restano ma cadono nel bucket "generico"
      savingsDeposits: d.savingsDeposits.map((dp) => (dp.goalId === id ? { ...dp, goalId: null } : dp)),
    }));
    setConfirmDel(null);
  };

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Obiettivi</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {activeGoals > 0
              ? `${activeGoals} obiettivo${activeGoals === 1 ? "" : "i"} attiv${activeGoals === 1 ? "o" : "i"} · accumulo progressivo verso il target.`
              : "Obiettivi di accumulo per i tuoi investimenti futuri."}
          </p>
        </div>
        <Button size="sm" onClick={onNewGoal}>
          ＋ Nuovo obiettivo
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong py-12 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-accent/30 bg-accent/10 shadow-[0_0_28px_-8px_rgba(76,126,255,0.6)]">
            <Icon name="target" size={30} className="text-accent" />
          </div>
          <p className="text-sm font-medium text-secondary-text">Nessun obiettivo</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Crea il tuo primo obiettivo di accumulo: dai un nome, un target e un&apos;eventuale scadenza.
          </p>
          <div className="mt-2">
            <Button size="sm" glow onClick={onNewGoal}>
              ＋ Crea obiettivo
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ goal, deposited, pct, done }) => {
            const dl = goal.deadline ? daysUntil(goal.deadline, db.settings.timezone) : null;
            const gap = goal.target - deposited;
            return (
              <Card
                key={goal.id}
                hairline={done ? "success" : goal.active ? "accent" : "none"}
                className={cn("group flex flex-col gap-3", done && "overflow-hidden")}
              >
                {done && (
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-success/15 to-transparent" />
                )}

                {/* Header: nome + azioni */}
                <div className="relative flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-semibold tracking-tight">{goal.name}</h3>
                      {goal.active ? (
                        <Badge tone="info">attivo</Badge>
                      ) : (
                        <Badge tone="default">in pausa</Badge>
                      )}
                    </div>
                    {dl != null && <DeadlineBadge days={dl} />}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onEditGoal(goal)}
                      className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-elevated-2 hover:text-foreground"
                      aria-label={`Modifica ${goal.name}`}
                      title="Modifica"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setConfirmDel(goal)}
                      className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                      aria-label={`Elimina ${goal.name}`}
                      title="Elimina"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14ZM10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Progresso: anello + X/Y · % + barra */}
                <div className="relative flex items-center gap-4">
                  <CircularProgress
                    pct={pct}
                    done={done}
                    label={kpiHidden ? maskKpi() : `${Math.round(pct)}%`}
                  />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="tnum text-xs text-secondary-text">
                      {hidden ? maskMoney() : formatMoney(deposited, base, locale)}
                      <span className="mx-1 text-muted-foreground/50">/</span>
                      <span className="font-semibold text-secondary-text">
                        {hidden ? maskMoney() : formatMoney(goal.target, base, locale)}
                      </span>
                      <span className="ml-1.5 text-[11px] text-muted-foreground/60">
                        {kpiHidden ? maskKpi() : `· ${formatPercent(pct, 0)}`}
                      </span>
                    </div>
                    <ProgressBar value={pct} tone={done ? "success" : "accent"} className="h-1.5" />
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">
                        {done ? "raggiunto" : `${Math.round(pct)}% completato`}
                      </span>
                      <span className="tnum text-muted-foreground">
                        {done ? (
                          <span className="inline-flex items-center gap-1">
                            <Icon name="sparkles" size={12} />
                            target pieno
                          </span>
                        ) : hidden ? (
                          maskMoney()
                        ) : (
                          `mancano ${formatMoney(Math.max(0, gap), base, locale)}`
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Payoff 'classe' — obiettivo raggiunto */}
                {done && (
                  <div className="relative flex flex-wrap items-center gap-2 rounded-xl border border-success/25 bg-success/10 px-3 py-2">
                    <Badge tone="success" pulse>
                      <Icon name="sparkles" size={13} />
                      Raggiunto
                    </Badge>
                    <p className="text-[11px] text-success/90">
                      Obiettivo completo — il tuo capitale è pronto per il prossimo passo.
                    </p>
                  </div>
                )}

                {/* Footer: stato + versa */}
                <div className="relative mt-auto flex items-center justify-between border-t border-border pt-2.5">
                  <Toggle checked={goal.active} onChange={(v) => toggleActive(goal, v)} />
                  <Button variant="subtle" size="sm" onClick={() => onNewDeposit(goal.id)}>
                    ＋ Versa
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={confirmDel != null}
        onClose={() => setConfirmDel(null)}
        onConfirm={confirmDelete}
        title="Eliminare l'obiettivo?"
        message={`"${confirmDel?.name ?? ""}" verrà rimosso. I versamenti collegati restano ma diventano generici.`}
        confirmLabel="Elimina obiettivo"
      />
    </section>
  );
}
