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
// ART-DIRECTION (myfundedbook rich/animato):
//   1) KPI sempre insieme: Performance (spark risultati periodo +
//      AnimatedNumber, hairline per segno) e Disciplina % (anello
//      circolare + ProgressBar, tone success/warning/danger su 50/80).
//   2) "No Setup" come card warning con count/% mascherati da privacy.
//   3) Setup list: regole come pill numerate (01, 02…), attive con glow,
//      testo editabile inline, frecce su/giù.
//   4) Trade row: dot disciplina verde/rossa + badge setup.
//   5) SectionHeader con kicker + sezioni in <Reveal>.
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
import type { DB, Setup, SetupRule, Trade } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, StatusDot } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { Field, Input, Select } from "@/components/ui/Field";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { EmptyState, SectionHeader, Toggle, ProgressBar } from "@/components/ui/Misc";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Reveal } from "@/components/ui/Reveal";
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
// Color + tone Disciplina — soglie 50 / 80
// ------------------------------------------------------------
type DiscTone = "success" | "warning" | "danger";
const DISC_COLOR: Record<DiscTone, string> = {
  success: "#2ddf9e",
  warning: "#f0b429",
  danger: "#ff5c5c",
};
const DISC_TEXT: Record<DiscTone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

function disciplineToneOf(pct: number | null): DiscTone | null {
  if (pct == null) return null;
  if (pct >= 80) return "success";
  if (pct >= 50) return "warning";
  return "danger";
}

// ------------------------------------------------------------
// Spark Serie — cumulata giornaliera del P&L del periodo
// ------------------------------------------------------------
function buildPerfSeries(trades: Trade[], db: DB, tz: string, base: string): number[] | null {
  if (trades.length === 0) return null;
  const byDay = new Map<string, number>();
  for (const t of trades) {
    const acc = db.accounts.find((a) => a.id === t.accountId);
    const v = t.resultNative * (acc ? accountBaseRate(acc, base) : 1);
    const dk = isoToDayKey(t.closeDate, tz);
    byDay.set(dk, (byDay.get(dk) ?? 0) + v);
  }
  const days = [...byDay.keys()].sort();
  let run = 0;
  const series = days.map((d) => (run += byDay.get(d) ?? 0));
  // campionamento: evita poligoni giganti su periodi lunghi
  if (series.length <= 48) return series;
  const step = series.length / 48;
  const sampled: number[] = [];
  for (let i = 0; i < series.length; i += step) sampled.push(series[Math.floor(i)]);
  if (sampled[sampled.length - 1] !== series[series.length - 1]) sampled.push(series[series.length - 1]);
  return sampled;
}

// ------------------------------------------------------------
// Ring — progress circolare (Disciplina)
// ------------------------------------------------------------
function Ring({ pct, size = 46, stroke = 5, color }: { pct: number | null; size?: number; stroke?: number; color: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = pct == null ? 0 : Math.min(100, Math.max(0, pct)) / 100;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - p)}
        className="transition-[stroke-dashoffset] duration-700 ease-out"
      />
    </svg>
  );
}

// ------------------------------------------------------------
// Icone inline (chevron su/giù)
// ------------------------------------------------------------
function ChevronIcon({ dir }: { dir: "up" | "down" }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {dir === "up" ? <path d="M6 15l6-6 6 6" /> : <path d="M6 9l6 6 6-6" />}
    </svg>
  );
}

// ------------------------------------------------------------
// SectionLabel — titolo di sezione secondario (ricco)
// ------------------------------------------------------------
function SectionLabel({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
        <span className="grid h-6 w-6 place-items-center rounded-md border border-border bg-elevated text-xs">{icon}</span>
        {title}
      </h2>
      {hint && <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{hint}</span>}
    </div>
  );
}

// ------------------------------------------------------------
// RuleRow — regola singola (ID stabile, mai indice dell'array)
// Pill numerata (01, 02…) · glow se attiva · testo inline
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
        "group flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-all duration-200",
        rule.active
          ? "border-accent/25 bg-accent/[0.05] shadow-[0_0_16px_-8px_var(--accent-glow)]"
          : "border-border bg-muted/40 opacity-60"
      )}
    >
      {/* Pill numerata */}
      <span
        className={cn(
          "grid h-7 w-8 shrink-0 place-items-center rounded-lg border text-[10px] font-semibold tnum",
          rule.active
            ? "border-accent/30 bg-accent/15 text-accent shadow-[0_0_12px_-4px_var(--accent-glow)]"
            : "border-border bg-elevated text-muted-foreground"
        )}
      >
        {String(index + 1).padStart(2, "0")}
      </span>

      {/* Sposta su / giù */}
      <div className="flex shrink-0 flex-col gap-0.5">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => onMove(-1)}
          aria-label="Sposta regola su"
          className="flex h-4 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground disabled:opacity-25 disabled:hover:bg-transparent"
        >
          <ChevronIcon dir="up" />
        </button>
        <button
          type="button"
          disabled={index === total - 1}
          onClick={() => onMove(1)}
          aria-label="Sposta regola giù"
          className="flex h-4 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground disabled:opacity-25 disabled:hover:bg-transparent"
        >
          <ChevronIcon dir="down" />
        </button>
      </div>

      <Toggle checked={rule.active} onChange={onToggle} />

      {/* Testo editabile inline */}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label="Testo della regola"
        className={cn(
          "min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-sm text-foreground outline-none transition-colors focus:ring-1 focus:ring-accent/50",
          !rule.active && "line-through"
        )}
      />

      <button
        type="button"
        onClick={onRemove}
        aria-label="Elimina regola"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
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
  const evaluated = activeCount > 0;
  return (
    <Card hairline={evaluated ? "accent" : "none"} className="space-y-3">
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="truncate">{setup.name}</CardTitle>
          <CardSubtitle>
            {rules.length === 0
              ? "Nessuna regola ancora"
              : `${rules.length} regole in totale · ${activeCount} attive`}
          </CardSubtitle>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
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
  const perfSeries = buildPerfSeries(periodTrades, db, tz, baseCurrency);
  const perfSparkColor =
    perfBase > 0 ? DISC_COLOR.success : perfBase < 0 ? DISC_COLOR.danger : "#4C7EFF";

  const setupTrades = periodTrades
    .filter((t) => t.setupId)
    .map((t) => ({ trade: t, respected: tradeRespected(db, t.id), name: setupName(db, t.setupId) }));

  const accountLabel =
    accountId === "all" ? "Tutti gli account" : db.accounts.find((a) => a.id === accountId)?.name ?? "—";

  // ---- Disciplina: tone/colori per anello e barra (soglie 50/80)
  const discTone = disciplineToneOf(dStats.disciplinePct);
  const discColor = discTone ? DISC_COLOR[discTone] : "#6f6f78";
  const discHairline: "success" | "danger" | "accent" =
    discTone === "success" ? "success" : discTone === "danger" ? "danger" : "accent";

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
      <Reveal>
        <SectionHeader
          kicker="Trading · Playbook"
          title="Playbook & Disciplina"
          subtitle="Definisci i tuoi setup e controlla quanto li rispetti."
          action={
            <Button onClick={() => setCreateOpen(true)}>+ Nuovo setup</Button>
          }
        />
      </Reveal>

      {/* Selettori */}
      <Reveal delay={60}>
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
      </Reveal>

      {/* KPI: Performance + Disciplina — SEMPRE insieme, affiancate */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Reveal delay={120}>
          <StatCard
            label="Performance"
            hairline={perfBase > 0 ? "success" : perfBase < 0 ? "danger" : "accent"}
            value={
              <span className={cn("tnum", pnlCls(perfBase))}>
                {moneyMasked(privacy) ? (
                  maskMoney()
                ) : (
                  <AnimatedNumber value={perfBase} fmt={(n) => formatSignedMoney(n, baseCurrency)} />
                )}
              </span>
            }
            delta={`${periodTrades.length} trade nel periodo · ${accountLabel}`}
            spark={perfSeries ?? undefined}
            sparkColor={perfSparkColor}
          />
        </Reveal>
        <Reveal delay={180}>
          <StatCard
            label="Disciplina"
            hairline={discHairline}
            value={
              <div className="flex items-center gap-3">
                <Ring pct={dStats.disciplinePct} color={discColor} />
                <span className={cn("text-[26px] font-semibold leading-none tracking-tight tnum", discTone ? DISC_TEXT[discTone] : "text-muted-foreground")}>
                  {kpiMasked(privacy) ? (
                    maskKpi()
                  ) : (
                    <AnimatedNumber
                      value={dStats.disciplinePct ?? 0}
                      fmt={(n) => (dStats.disciplinePct == null ? "—" : formatPercent(n))}
                    />
                  )}
                </span>
              </div>
            }
            delta={
              <div className="flex w-full flex-col gap-1.5">
                <ProgressBar
                  value={dStats.disciplinePct ?? 0}
                  tone={discTone ?? "accent"}
                  shimmer
                />
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <StatusDot color={kpiMasked(privacy) ? "#6b6b72" : discColor} className={!kpiMasked(privacy) && discTone === "success" ? "animate-pulse-dot" : ""} />
                  {dStats.respected} / {dStats.count} trade con setup rispettati
                  {discTone === "danger" && <span className="text-danger">· sotto soglia</span>}
                </span>
              </div>
            }
          />
        </Reveal>
      </div>

      {/* Metrica separata: No Setup — card warning (count/% mascherati da privacy) */}
      <Reveal delay={240}>
        <Card className="relative overflow-hidden border-warning/25 bg-warning/[0.04]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-warning to-transparent" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-warning/30 bg-warning/10 text-base shadow-[0_0_16px_-6px_rgba(240,180,41,0.5)]">
                ⚠️
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-warning">No Setup</p>
                <p className="text-xs text-muted-foreground">trade chiusi senza piano nel periodo</p>
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="tnum text-2xl font-semibold leading-tight">
                {kpiMasked(privacy) ? maskKpi() : dStats.noSetupCount}
              </span>
              <span className="tnum text-sm font-medium text-warning">
                {kpiMasked(privacy)
                  ? maskKpi()
                  : dStats.noSetupPct != null
                    ? formatPercent(dStats.noSetupPct)
                    : "—"}
              </span>
            </div>
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/[0.07] px-3 py-2 text-xs text-warning">
            <span aria-hidden>⚠️</span>
            <span>Tradare senza piano è indisciplina.</span>
          </div>
        </Card>
      </Reveal>

      {/* Playbook */}
      <Reveal delay={300}>
        <div>
          <SectionLabel
            icon="📋"
            title="Playbook"
            hint={db.setups.length > 0 ? `${db.setups.length} setup` : undefined}
          />
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
      </Reveal>

      {/* Trade del periodo con setup */}
      <Reveal delay={360}>
        <div>
          <SectionLabel
            icon="🕹️"
            title="Trade del periodo"
            hint={setupTrades.length > 0 ? `${setupTrades.length} trade con setup` : undefined}
          />
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
                  const dotColor =
                    respected === true
                      ? DISC_COLOR.success
                      : respected === false
                        ? DISC_COLOR.danger
                        : "#6b6b72";
                  return (
                    <li key={t.id} className="flex items-center gap-3 py-3">
                      <StatusDot
                        color={dotColor}
                        className={respected === true ? "animate-pulse-dot" : ""}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {t.instrument}
                          <span className="text-xs font-normal text-muted-foreground">
                            {" "}· {dayLabel(t.closeDate, tz)}
                          </span>
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge
                            tone={respected === true ? "success" : respected === false ? "danger" : "default"}
                          >
                            {respected === true
                              ? "Rispettato"
                              : respected === false
                                ? "Violato"
                                : "Non valutabile"}
                          </Badge>
                          <Badge tone="info">{name}</Badge>
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {t.direction === "long" ? "long" : "short"}
                          </span>
                        </div>
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
                <StatusDot color={DISC_COLOR.success} /> Rispettato
              </span>
              <span className="flex items-center gap-1.5">
                <StatusDot color={DISC_COLOR.danger} /> Violato
              </span>
              <span className="flex items-center gap-1.5">
                <StatusDot color="#6b6b72" /> Non valutabile (nessuna regola attiva)
              </span>
            </div>
          </Card>
        </div>
      </Reveal>

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
