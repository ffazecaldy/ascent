"use client";
// ============================================================
// ASCEND — Playbook & Disciplina (specifica v3 §4.3)
// - Gestione setup: crea / rinomina / elimina (con conferma).
//   Eliminando un setup i trade che lo riferivano RESTANO, ma perdono
//   il collegamento (setupId → null) ed entrano nel conteggio "No Setup".
// - Ogni setup ha regole a ID stabile (SetupRule): testo, sortOrder,
//   toggle attivo. Le regole si aggiungono/rimuovono/riordinano per ID,
//   MAI per posizione in array → modificare il playbook non corrompe
//   lo storico dei trade.
// - Selettori: periodo (settimana / mese / ultimi 3 mesi / tutto) e
//   account (tutti o singolo).
// - Doppio KPI sempre insieme: Performance (somma resultNative → base
//   per account, colorata) e Disciplina (% trade con setup che rispettano
//   TUTTE le regole attive, formatPercent; '—' se non valutabile).
// - Metrica separata "No Setup": conteggio e % trade del periodo
//   eseguiti senza setup + callout.
// - Lista trade del periodo con setup: dot verde/rosso se rispettato/
//   violato (tradeRespected), grigio se non valutabile.
// ============================================================

import { useEffect, useState } from "react";
import { useDB, updateDB, upsert, uid, nowISO } from "@/lib/storage";
import { rulesOfSetup, tradeRespected, disciplineStats, accountBaseRate } from "@/lib/compute";
import {
  todayKey,
  weekStartKey,
  monthKeyOf,
  monthRange,
  parseDateKey,
  dateKey,
  isoToDayKey,
} from "@/lib/dates";
import { formatSignedMoney, formatPercent, formatR } from "@/lib/format";
import { moneyMasked, kpiMasked, maskMoney, maskKpi, maskCompact } from "@/lib/privacy";
import { setupName } from "@/lib/db";
import type { DB, Setup, SetupRule } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, StatusDot } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { Field, Input, Select } from "@/components/ui/Field";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { EmptyState, SectionHeader, Toggle } from "@/components/ui/Misc";
import { cn } from "@/lib/cn";

// ------------------------------------------------------------
// Periodi
// ------------------------------------------------------------
type PeriodId = "week" | "month" | "month3" | "all";

const PERIOD_OPTIONS: { id: PeriodId; label: string }[] = [
  { id: "week", label: "Settimana corrente" },
  { id: "month", label: "Mese corrente" },
  { id: "month3", label: "Ultimi 3 mesi" },
  { id: "all", label: "Tutto" },
];

function periodRange(db: DB, period: PeriodId): { from: string | null; to: string | null } {
  const tz = db.settings.timezone;
  const today = todayKey(tz);
  if (period === "all") return { from: null, to: null };
  if (period === "week") {
    return { from: weekStartKey(today, db.settings.weekStart), to: today };
  }
  if (period === "month") {
    return { from: monthRange(monthKeyOf(today)).start, to: today };
  }
  // ultimi 3 mesi: dal primo giorno del mese di due mesi fa a oggi
  const { y, m } = parseDateKey(today);
  let my = y;
  let mm = m - 2;
  if (mm < 1) {
    mm += 12;
    my -= 1;
  }
  return { from: dateKey(my, mm, 1), to: today };
}

function dayLabel(iso: string, tz: string): string {
  const { y, m, d } = parseDateKey(isoToDayKey(iso, tz));
  return new Date(y, m - 1, d).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

function pnlCls(v: number): string {
  return v > 0 ? "text-success" : v < 0 ? "text-danger" : "text-muted-foreground";
}

// ------------------------------------------------------------
// RuleRow — regola singola (ID stabile, mai indice dell'array)
// ------------------------------------------------------------
function RuleRow({
  rule,
  index,
  total,
  onToggle,
  onText,
  onRemove,
  onMove,
}: {
  rule: SetupRule;
  index: number;
  total: number;
  onToggle: (v: boolean) => void;
  onText: (text: string) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [draft, setDraft] = useState(rule.text);
  useEffect(() => setDraft(rule.text), [rule.text]);
  const commit = () => {
    if (draft.trim() !== "" && draft !== rule.text) onText(draft);
    else setDraft(rule.text);
  };
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2 py-1.5",
        !rule.active && "opacity-55"
      )}
    >
      {/* Sposta su / giù */}
      <div className="flex shrink-0 flex-col">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => onMove(-1)}
          aria-label="Sposta regola su"
          className="flex h-4 w-6 items-center justify-center rounded text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          ↑
        </button>
        <button
          type="button"
          disabled={index === total - 1}
          onClick={() => onMove(1)}
          aria-label="Sposta regola giù"
          className="flex h-4 w-6 items-center justify-center rounded text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          ↓
        </button>
      </div>
      <span className="w-4 shrink-0 text-center text-[10px] tnum text-muted-foreground">{index + 1}</span>
      <Toggle checked={rule.active} onChange={onToggle} />
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label="Testo della regola"
        className={cn(
          "min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-accent/50",
          !rule.active && "line-through"
        )}
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Elimina regola"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-danger/10 hover:text-danger"
      >
        ✕
      </button>
    </div>
  );
}

// ------------------------------------------------------------
// SetupCard
// ------------------------------------------------------------
function SetupCard({
  setup,
  rules,
  onRename,
  onDelete,
  onAddRule,
  onRuleText,
  onRuleToggle,
  onRuleRemove,
  onRuleMove,
}: {
  setup: Setup;
  rules: SetupRule[];
  onRename: () => void;
  onDelete: () => void;
  onAddRule: () => void;
  onRuleText: (ruleId: string, text: string) => void;
  onRuleToggle: (ruleId: string, v: boolean) => void;
  onRuleRemove: (ruleId: string) => void;
  onRuleMove: (ruleId: string, dir: -1 | 1) => void;
}) {
  const activeCount = rules.filter((r) => r.active).length;
  return (
    <Card className="space-y-3">
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="truncate">{setup.name}</CardTitle>
          <CardSubtitle>
            {rules.length === 0
              ? "Nessuna regola ancora"
              : `${rules.length} regole in totale · ${activeCount} attive`}
          </CardSubtitle>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Badge tone={activeCount > 0 ? "info" : "default"}>{activeCount} attive</Badge>
          <Button variant="ghost" size="sm" onClick={onRename}>
            Rinomina
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-muted-foreground hover:bg-danger/10 hover:text-danger"
          >
            Elimina
          </Button>
        </div>
      </CardHeader>

      <div className="space-y-1.5">
        {rules.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nessuna regola. Aggiungi la prima per definire il tuo edge.
          </p>
        )}
        {rules.map((r, i) => (
          <RuleRow
            key={r.id}
            rule={r}
            index={i}
            total={rules.length}
            onToggle={(v) => onRuleToggle(r.id, v)}
            onText={(t) => onRuleText(r.id, t)}
            onRemove={() => onRuleRemove(r.id)}
            onMove={(dir) => onRuleMove(r.id, dir)}
          />
        ))}
      </div>

      <Button variant="subtle" size="sm" className="w-full" onClick={onAddRule}>
        + Aggiungi regola
      </Button>
    </Card>
  );
}

// ------------------------------------------------------------
// Pagina
// ------------------------------------------------------------
export default function SetupsPage() {
  const db = useDB();
  const [period, setPeriod] = useState<PeriodId>("week");
  const [accountId, setAccountId] = useState<string>("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [renameTarget, setRenameTarget] = useState<Setup | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Setup | null>(null);

  const privacy = db.settings.privacyMode;
  const baseCurrency = db.settings.baseCurrency;
  const tz = db.settings.timezone;

  // ---- trade del periodo (account + date)
  const { from, to } = periodRange(db, period);
  const periodTrades = db.trades
    .filter((t) => (accountId === "all" ? true : t.accountId === accountId))
    .filter((t) => {
      if (!from || !to) return true;
      const dk = isoToDayKey(t.closeDate, tz);
      return dk >= from && dk <= to;
    })
    .sort((a, b) => b.closeDate.localeCompare(a.closeDate));

  const dStats = disciplineStats(db, periodTrades.map((t) => t.id));

  // Performance: somma resultNative convertita in valuta base per account
  let perfBase = 0;
  for (const t of periodTrades) {
    const acc = db.accounts.find((a) => a.id === t.accountId);
    perfBase += t.resultNative * (acc ? accountBaseRate(acc, baseCurrency) : 1);
  }

  const setupTrades = periodTrades
    .filter((t) => t.setupId)
    .map((t) => ({ trade: t, respected: tradeRespected(db, t.id), name: setupName(db, t.setupId) }));

  const accountLabel =
    accountId === "all" ? "Tutti gli account" : db.accounts.find((a) => a.id === accountId)?.name ?? "—";

  // ---- mutazioni
  const createSetup = () => {
    const name = newName.trim();
    if (!name) return;
    updateDB((d) => ({
      ...d,
      setups: upsert(d.setups, { id: uid(), name, createdAt: nowISO() }),
    }));
    setNewName("");
    setCreateOpen(false);
  };

  const renameSetup = () => {
    if (!renameTarget) return;
    const name = renameValue.trim();
    updateDB((d) => ({
      ...d,
      setups: d.setups.map((s) => (s.id === renameTarget.id ? { ...s, name } : s)),
    }));
    setRenameTarget(null);
  };

  const confirmDeleteSetup = () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    const ruleIds = new Set(rulesOfSetup(db, id).map((r) => r.id));
    updateDB((d) => ({
      ...d,
      // setup rimosso; i trade che lo usavano RESTANO ma senza setup
      setups: d.setups.filter((s) => s.id !== id),
      setupRules: d.setupRules.filter((r) => r.setupId !== id),
      tradeSetupRules: d.tradeSetupRules.filter((x) => !ruleIds.has(x.ruleId)),
      trades: d.trades.map((t) => (t.setupId === id ? { ...t, setupId: null } : t)),
    }));
    setDeleteTarget(null);
  };

  const addRule = (setupId: string) => {
    const rules = rulesOfSetup(db, setupId);
    const order = rules.length ? Math.max(...rules.map((r) => r.sortOrder)) + 1 : 1;
    updateDB((d) => ({
      ...d,
      setupRules: [
        ...d.setupRules,
        { id: uid(), setupId, text: "Nuova regola", sortOrder: order, active: true },
      ],
    }));
  };

  const setRuleText = (ruleId: string, text: string) =>
    updateDB((d) => ({
      ...d,
      setupRules: d.setupRules.map((r) => (r.id === ruleId ? { ...r, text } : r)),
    }));

  const toggleRule = (ruleId: string, active: boolean) =>
    updateDB((d) => ({
      ...d,
      setupRules: d.setupRules.map((r) => (r.id === ruleId ? { ...r, active } : r)),
    }));

  const removeRule = (ruleId: string) =>
    updateDB((d) => ({
      ...d,
      setupRules: d.setupRules.filter((r) => r.id !== ruleId),
      // elimino anche le valutazioni storiche di quella regola (tradeSetupRule)
      tradeSetupRules: d.tradeSetupRules.filter((x) => x.ruleId !== ruleId),
    }));

  // riordina scambiando i sortOrder dei due vicini → ID sempre stabili
  const moveRule = (setupId: string, ruleId: string, dir: -1 | 1) => {
    const rules = rulesOfSetup(db, setupId);
    const idx = rules.findIndex((r) => r.id === ruleId);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= rules.length) return;
    const a = rules[idx];
    const b = rules[target];
    updateDB((d) => ({
      ...d,
      setupRules: d.setupRules.map((r) =>
        r.id === a.id ? { ...r, sortOrder: b.sortOrder } : r.id === b.id ? { ...r, sortOrder: a.sortOrder } : r
      ),
    }));
  };

  // ---- render
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Playbook & Disciplina"
        subtitle="Definisci i tuoi setup e controlla quanto li rispetti."
        action={
          <Button onClick={() => setCreateOpen(true)}>+ Nuovo setup</Button>
        }
      />

      {/* Selettori */}
      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Periodo">
            <Select value={period} onChange={(e) => setPeriod(e.target.value as PeriodId)}>
              {PERIOD_OPTIONS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Account">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="all">Tutti gli account</option>
              {db.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.archived ? " (archiviato)" : ""}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      {/* KPI: Performance + Disciplina — sempre insieme */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Performance"
          value={
            <span className={cn("tnum", pnlCls(perfBase))}>
              {moneyMasked(privacy) ? maskMoney() : formatSignedMoney(perfBase, baseCurrency)}
            </span>
          }
          delta={`${periodTrades.length} trade nel periodo · ${accountLabel}`}
        />
        <StatCard
          label="Disciplina"
          value={
            <span className="tnum">
              {kpiMasked(privacy)
                ? maskKpi()
                : dStats.disciplinePct != null
                  ? formatPercent(dStats.disciplinePct)
                  : "—"}
            </span>
          }
          delta={`${dStats.respected} / ${dStats.count} trade con setup rispettati`}
        />
      </div>

      {/* Metrica separata: No Setup */}
      <Card className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            No Setup
          </span>
          <span className="text-[10px] text-muted-foreground">nel periodo</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tnum leading-tight">{dStats.noSetupCount}</span>
          <span className="text-sm tnum text-muted-foreground">
            {kpiMasked(privacy)
              ? maskKpi()
              : dStats.noSetupPct != null
                ? formatPercent(dStats.noSetupPct)
                : "—"}
          </span>
        </div>
        <p className="mt-1 rounded-lg border border-yellow-500/25 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-500">
          ⚠️ Tradare senza piano è indisciplina.
        </p>
      </Card>

      {/* Playbook */}
      <div>
        <h2 className="mb-2 text-lg font-semibold tracking-tight">Playbook</h2>
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-accent/20 bg-accent/[0.06] px-3 py-2.5 text-xs text-secondary-text">
          <span aria-hidden>💡</span>
          <span>
            Modificare il playbook non corrompe lo storico: ogni regola ha un ID stabile e i trade
            restano collegati per ID. Puoi rinominare, riordinare o disattivare le regole quando vuoi.
          </span>
        </p>
        {db.setups.length === 0 ? (
          <EmptyState
            icon="📋"
            title="Nessun setup nel playbook"
            description="Crea il primo setup con le regole che definiscono il tuo edge."
            action={
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                + Nuovo setup
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            {db.setups.map((s) => (
              <SetupCard
                key={s.id}
                setup={s}
                rules={rulesOfSetup(db, s.id)}
                onRename={() => {
                  setRenameValue(s.name);
                  setRenameTarget(s);
                }}
                onDelete={() => setDeleteTarget(s)}
                onAddRule={() => addRule(s.id)}
                onRuleText={setRuleText}
                onRuleToggle={toggleRule}
                onRuleRemove={removeRule}
                onRuleMove={(ruleId, dir) => moveRule(s.id, ruleId, dir)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Trade del periodo con setup */}
      <div>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Trade del periodo</h2>
        <Card>
          {setupTrades.length === 0 ? (
            <EmptyState
              icon="🕹️"
              title="Nessun trade con setup nel periodo"
              description={
                periodTrades.length === 0
                  ? "Non ci sono trade chiusi nel periodo selezionato."
                  : "I trade del periodo sono stati eseguiti senza setup."
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {setupTrades.map(({ trade: t, respected, name }) => {
                const acc = db.accounts.find((a) => a.id === t.accountId);
                const baseAmt = t.resultNative * (acc ? accountBaseRate(acc, baseCurrency) : 1);
                return (
                  <li key={t.id} className="flex items-center gap-3 py-2.5">
                    <StatusDot
                      color={
                        respected === true
                          ? "#22c55e"
                          : respected === false
                            ? "#ef4444"
                            : "#6b6b72"
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {t.instrument}
                        <span className="text-xs font-normal text-muted-foreground"> · {dayLabel(t.closeDate, tz)}</span>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {name} · {t.direction === "long" ? "long" : "short"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end">
                      <span className={cn("text-sm font-semibold tnum", pnlCls(t.resultR))}>
                        {kpiMasked(privacy) ? maskCompact() : formatR(t.resultR)}
                      </span>
                      <span className={cn("text-xs tnum", pnlCls(baseAmt))}>
                        {moneyMasked(privacy) ? maskMoney() : formatSignedMoney(baseAmt, baseCurrency)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <StatusDot color="#22c55e" /> Rispettato
            </span>
            <span className="flex items-center gap-1.5">
              <StatusDot color="#ef4444" /> Violato
            </span>
            <span className="flex items-center gap-1.5">
              <StatusDot color="#6b6b72" /> Non valutabile (nessuna regola attiva)
            </span>
          </div>
        </Card>
      </div>

      {/* Modali */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nuovo setup"
        width="max-w-sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Annulla
            </Button>
            <Button onClick={createSetup} disabled={!newName.trim()}>
              Crea
            </Button>
          </>
        }
      >
        <Field label="Nome setup">
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim()) createSetup();
            }}
            placeholder="Es. Momentum su timeframe 15m"
          />
        </Field>
      </Modal>

      <Modal
        open={renameTarget != null}
        onClose={() => setRenameTarget(null)}
        title="Rinomina setup"
        width="max-w-sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              Annulla
            </Button>
            <Button onClick={renameSetup} disabled={!renameValue.trim()}>
              Salva
            </Button>
          </>
        }
      >
        <Field label="Nuovo nome">
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && renameValue.trim()) renameSetup();
            }}
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteSetup}
        title="Eliminare questo setup?"
        message={`“${deleteTarget?.name ?? ""}” verrà rimosso dal playbook insieme alle sue regole. I trade che lo utilizzavano restano nel log ma senza setup.`}
        confirmLabel="Elimina setup"
      />
    </div>
  );
}
