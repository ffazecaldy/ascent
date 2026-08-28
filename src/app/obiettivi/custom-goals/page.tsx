"use client";

// ============================================================
// ASCEND — Obiettivi Personalizzati (gestione completa)
// Pagina dedicata: lista, creazione/editing modale, toggle
// attivo, elimina con conferma. Self-contained: nessun
// import da /app/obiettivi/.
// ============================================================

import { useState, useMemo } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { useDB, updateDB, uid, removeById, nowISO } from "@/lib/storage";
import { checkedOn, streakOf, completionRate, isDueOn } from "@/lib/custom-goals";
import { todayKey } from "@/lib/dates";
import type { DB, CustomGoal, CustomGoalCheck } from "@/lib/types";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProgressBar, EmptyState } from "@/components/ui/Misc";
import { Badge, StatusDot } from "@/components/ui/Badge";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Input, Select, Field, TextArea } from "@/components/ui/Field";

// ------------------------------------------------------------
// Costanti locali
// ------------------------------------------------------------

const GRAY = "#52525b";

const FREQUENCY_OPTIONS: [CustomGoal["frequency"], string][] = [
  ["daily", "Giornaliero"],
  ["weekdays", "Lun-Ven"],
  ["weekly", "Giorni scelti"],
];

const WEEK_DAY_LABELS = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

const COLOR_SWATCH: { label: string; value: string }[] = [
  { label: "Blu", value: "#4c7eff" },
  { label: "Verde", value: "#2ddf9e" },
  { label: "Giallo", value: "#f0b429" },
  { label: "Viola", value: "#8b5cf6" },
  { label: "Rosa", value: "#f472b6" },
];

const FREQ_ICONS: Record<CustomGoal["frequency"], IconName> = {
  daily: "calendar",
  weekdays: "calendar",
  weekly: "calendar",
};

const FREQ_LABELS: Record<CustomGoal["frequency"], string> = {
  daily: "Giornaliero",
  weekdays: "Lun-Ven",
  weekly: "Settimanale",
};

// ------------------------------------------------------------
// Toggle attivo (stesso look di obiettivi/page.tsx)
// ------------------------------------------------------------

function GoalToggle({
  checked,
  onChange,
  label = "Attivo",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="group flex items-center gap-2"
    >
      <span
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-[background-color,border-color,box-shadow] duration-300",
          checked
            ? "bg-gradient-to-r from-accent to-accent-2 shadow-[0_0_14px_-2px_var(--accent-glow)]"
            : "border border-border-strong bg-elevated group-hover:border-accent/40"
        )}
      >
        <span
          className={cn(
            "inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-sm transition-transform duration-300",
            checked ? "translate-x-[23px]" : "translate-x-[3px]"
          )}
        />
      </span>
      <span className="text-sm text-secondary-text">{label}</span>
    </button>
  );
}

// ------------------------------------------------------------
// Badge frequenza (Icon + label)
// ------------------------------------------------------------

function CustomGoalFreqBadge({ goal }: { goal: CustomGoal }) {
  return (
    <Badge tone="info">
      <Icon name={FREQ_ICONS[goal.frequency]} size={9} strokeWidth={2.5} />
      {FREQ_LABELS[goal.frequency]}
    </Badge>
  );
}

// ------------------------------------------------------------
// Form creazione/editing — modale
// ------------------------------------------------------------

function CustomGoalForm({
  goal,
  open,
  onClose,
}: {
  goal: CustomGoal | null; // null = creazione, CustomGoal = editing
  open: boolean;
  onClose: () => void;
}) {
  const isEdit = goal !== null;

  const [title, setTitle] = useState(goal?.title ?? "");
  const [note, setNote] = useState(goal?.note ?? "");
  const [target, setTarget] = useState(goal?.target != null ? String(goal.target) : "");
  const [unit, setUnit] = useState(goal?.unit ?? "");
  const [frequency, setFrequency] = useState<CustomGoal["frequency"]>(goal?.frequency ?? "daily");
  const [weekDays, setWeekDays] = useState<number[]>(goal?.weekDays ?? []);
  const [dueDate, setDueDate] = useState(goal?.dueDate ?? "");
  const [color, setColor] = useState(goal?.color ?? "");
  const [active, setActive] = useState(goal?.active ?? true);

  const save = () => {
    const n = Number(target);
    const tgt = Number.isFinite(n) && n >= 0 ? n : undefined;
    const now = nowISO();

    if (isEdit) {
      updateDB((d) => ({
        ...d,
        customGoals: d.customGoals.map((g) =>
          g.id === goal.id
            ? {
                ...g,
                title,
                note: note || undefined,
                target: tgt,
                unit: unit || undefined,
                frequency,
                weekDays: frequency === "weekly" ? weekDays : undefined,
                dueDate: dueDate || null,
                color: color || undefined,
                active,
                updatedAt: now,
              }
            : g
        ),
      }));
    } else {
      updateDB((d) => ({
        ...d,
        customGoals: [
          ...d.customGoals,
          {
            id: uid(),
            title,
            note: note || undefined,
            target: tgt,
            unit: unit || undefined,
            frequency,
            weekDays: frequency === "weekly" ? weekDays : undefined,
            dueDate: dueDate || null,
            color: color || undefined,
            active,
            createdAt: now,
            updatedAt: now,
          },
        ],
      }));
    }
    onClose();
  };

  const toggleWeekDay = (day: number) => {
    setWeekDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  };

  const valid = title.trim().length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Modifica obiettivo" : "Nuovo obiettivo"}
      width="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={save} disabled={!valid}>
            {isEdit ? "Salva" : "Crea obiettivo"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Titolo">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Es. Allenamento mattutino"
            aria-label="Titolo"
          />
        </Field>

        <Field label="Nota (opzionale)">
          <TextArea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Dettaglio, istruzioni, motivazione..."
            aria-label="Nota"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Obiettivo (opzionale)">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="Es. 20"
              aria-label="Valore obiettivo"
            />
          </Field>
          <Field label="Unità">
            <Input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="Es. esercizi, pagine"
              aria-label="Unità"
            />
          </Field>
        </div>

        <Field label="Frequenza">
          <Select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as CustomGoal["frequency"])}
            aria-label="Frequenza"
          >
            {FREQUENCY_OPTIONS.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        {frequency === "weekly" && (
          <Field label="Giorni della settimana">
            <div className="flex flex-wrap gap-1.5">
              {WEEK_DAY_LABELS.map((day, i) => {
                const selected = weekDays.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleWeekDay(i)}
                    className={cn(
                      "flex h-8 w-10 items-center justify-center rounded-lg border text-xs font-medium transition-all",
                      selected
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-border-strong bg-elevated text-secondary-text hover:border-accent/40"
                    )}
                    aria-pressed={selected}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        <Field label="Scadenza (opzionale)">
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            aria-label="Scadenza"
          />
        </Field>

        <Field label="Colore">
          <div className="flex items-center gap-2">
            {COLOR_SWATCH.map((c) => {
              const selected = color === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(selected ? "" : c.value)}
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                    selected
                      ? "border-white scale-110"
                      : "border-border-strong hover:border-accent"
                  )}
                  aria-label={c.label}
                  aria-pressed={selected}
                  title={c.label}
                >
                  <span className="h-5 w-5 rounded-full" style={{ backgroundColor: c.value }} />
                </button>
              );
            })}
            {color && (
              <button
                type="button"
                onClick={() => setColor("")}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                aria-label="Rimuovi colore"
                title="Rimuovi colore"
              >
                <Icon name="x" size={10} />
              </button>
            )}
          </div>
        </Field>

        <Field label="Attivo" className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Disattiva per nascondere questo obiettivo</span>
          <GoalToggle checked={active} onChange={setActive} />
        </Field>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------
// Riga CustomGoal (lista completa con gestione)
// ------------------------------------------------------------

function CustomGoalRow({
  goal,
  onEdit,
  today,
  checks,
}: {
  goal: CustomGoal;
  onEdit: () => void;
  today: string;
  checks: CustomGoalCheck[];
}) {
  const [confirmDel, setConfirmDel] = useState(false);

  const isDue = useMemo(() => isDueOn(goal, today), [goal, today]);
  const isChecked = useMemo(
    () => (isDue ? checkedOn(checks, goal.id, today) : false),
    [isDue, goal, checks, today]
  );
  const streak = useMemo(() => streakOf(goal, checks, today), [goal, checks, today]);
  const pct = useMemo(() => completionRate(goal, checks, today, 30), [goal, checks, today]);

  const pastDue = goal.dueDate != null && today > goal.dueDate;

  const patchGoal = (patch: Partial<CustomGoal>) =>
    updateDB((d) => ({
      ...d,
      customGoals: d.customGoals.map((g) => (g.id === goal.id ? { ...g, ...patch } : g)),
    }));

  const toggleCheck = () => {
    if (!isDue) return;
    const existing = checks.find((c) => c.goalId === goal.id && c.date === today);
    if (existing) {
      updateDB((d) => ({ ...d, customGoalChecks: removeById(d.customGoalChecks, existing.id) }));
    } else {
      updateDB((d) => ({
        ...d,
        customGoalChecks: [
          ...d.customGoalChecks,
          { id: uid(), goalId: goal.id, date: today, createdAt: nowISO() },
        ],
      }));
    }
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-card p-3 transition-[border-color,background-color] duration-300",
        goal.active ? "border-accent/25 hover:border-accent/40" : "border-border bg-muted/40"
      )}
    >
      {goal.active && (
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* Check manuale per oggi (solo se dovuto oggi) */}
        {isDue ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={isChecked}
            aria-label={isChecked ? "Segna come non fatto" : "Segna come fatto"}
            onClick={toggleCheck}
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors",
              isChecked
                ? "border-accent bg-accent text-white"
                : "border-border-strong text-transparent hover:border-accent hover:bg-accent/10"
            )}
          >
            {isChecked && <Icon name="check" size={13} strokeWidth={3} />}
          </button>
        ) : (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-strong bg-elevated">
            <StatusDot color={goal.color ?? GRAY} />
          </span>
        )}

        {/* Titolo */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {goal.color && <StatusDot color={goal.color} />}
            <p
              className={cn(
                "text-sm font-medium",
                pastDue ? "line-through text-muted-foreground" : "text-foreground",
                isChecked && "line-through opacity-60"
              )}
              title={goal.note}
            >
              {goal.title}
            </p>
          </div>
          {goal.note && (
            <p className="mt-0.5 max-w-xs text-[11px] text-muted-foreground line-clamp-2">
              {goal.note}
            </p>
          )}
        </div>

        {/* Badge frequenza */}
        <CustomGoalFreqBadge goal={goal} />

        {/* Target / unità */}
        {goal.target != null && goal.target > 0 && (
          <span className="shrink-0 tnum text-xs text-secondary-text">
            {goal.target}
            {goal.unit ? ` ${goal.unit}` : ""}
          </span>
        )}

        {/* Streak */}
        {streak > 0 && (
          <span className="flex items-center gap-1 shrink-0 text-xs text-secondary-text">
            <Icon name="target" size={12} />
            <span className="tnum">{streak}</span>
          </span>
        )}

        {/* % completamento 30gg — mini progress bar */}
        <div className="flex w-28 shrink-0 items-end gap-1.5">
          <span className="tnum text-[10px] text-muted-foreground">{pct}%</span>
          <ProgressBar className="h-1.5" value={pct} max={100} tone={pct >= 100 ? "success" : "accent"} shimmer={false} />
        </div>

        {/* Azioni */}
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={onEdit}
            aria-label="Modifica"
            className="text-secondary-text hover:text-accent"
          >
            <Icon name="pencil" size={14} />
          </Button>

          <GoalToggle checked={goal.active} onChange={(v) => patchGoal({ active: v })} label="Attivo" />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setConfirmDel(true)}
            aria-label="Elimina"
            className="text-muted-foreground hover:text-danger"
          >
            <Icon name="trash" size={15} />
          </Button>
        </div>
      </div>

      {/* Scadenza (se presente) */}
      {goal.dueDate && (
        <div className="mt-2.5 flex items-center gap-2">
          <Badge tone={pastDue ? "danger" : "warning"}>
            <Icon name="calendar" size={9} strokeWidth={2.5} />
            {pastDue ? "scaduto" : "in corso"}
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            {new Date(goal.dueDate + "T00:00:00").toLocaleDateString("it-IT", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
      )}

      <ConfirmDialog
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        onConfirm={() => {
          updateDB((d) => ({
            ...d,
            customGoals: removeById(d.customGoals, goal.id),
            customGoalChecks: d.customGoalChecks.filter((c) => c.goalId !== goal.id),
          }));
          setConfirmDel(false);
        }}
        title="Eliminare l'obiettivo?"
        message="Verranno rimossi anche tutti i check registrati. Questa azione non può essere annullata."
      />
    </div>
  );
}

// ------------------------------------------------------------
// Pagina
// ------------------------------------------------------------

export default function CustomGoalsPage() {
  const db = useDB();
  const today = useMemo(() => todayKey(db.settings.timezone), [db.settings.timezone]);

  const [formOpen, setFormOpen] = useState(false);
  const [formGoal, setFormGoal] = useState<CustomGoal | null>(null);

  const openCreate = () => {
    setFormGoal(null);
    setFormOpen(true);
  };

  const openEdit = (g: CustomGoal) => {
    setFormGoal(g);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setFormGoal(null);
  };

  const activeGoals = useMemo(() => db.customGoals.filter((g) => g.active), [db.customGoals]);
  const inactiveGoals = useMemo(() => db.customGoals.filter((g) => !g.active), [db.customGoals]);

  const listChecks = db.customGoalChecks;

  return (
    <div className="space-y-6">
      {/* Header con link indietro */}
      <div className="flex items-center gap-3">
        <Link
          href="/obiettivi"
          className="flex items-center gap-1.5 text-sm text-secondary-text transition-colors hover:text-accent"
        >
          ← Indietro
        </Link>
        <h1 className="text-2xl font-semibold text-foreground">Obiettivi personalizzati</h1>
      </div>

      {/* Subheader */}
      <div>
        <p className="text-sm text-muted-foreground">
          Obiettivi con check manuale: spunta quando li completi. Il progresso è calcolato sugli
          ultimi 30 giorni rispetto ai giorni dovuti.
        </p>
      </div>

      {/* Add button */}
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Icon name="plus" size={14} />
          + Aggiungi obiettivo
        </Button>
      </div>

      {/* Lista obiettivi attivi */}
      {activeGoals.length > 0 ? (
        <Card hairline="accent">
          <CardHeader>
            <div>
              <CardTitle>Attivi ({activeGoals.length})</CardTitle>
              <CardSubtitle>Spunta il check quando li completi oggi; il toggle Attivo li nasconde.</CardSubtitle>
            </div>
          </CardHeader>
          <div className="space-y-2">
            {activeGoals.map((g) => (
              <CustomGoalRow
                key={g.id}
                goal={g}
                onEdit={() => openEdit(g)}
                today={today}
                checks={listChecks}
              />
            ))}
          </div>
        </Card>
      ) : (
        <EmptyState
          icon={<Icon name="target" size={34} className="text-accent" />}
          title="Nessun obiettivo attivo"
          description="Aggiungi obiettivi personalizzati e spunta la casella quando li completi."
          action={
            <Button onClick={openCreate}>
              <Icon name="plus" size={14} />
              + Aggiungi obiettivo
            </Button>
          }
        />
      )}

      {/* Lista obiettivi inattivi */}
      {inactiveGoals.length > 0 && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Spenti ({inactiveGoals.length})</CardTitle>
              <CardSubtitle>Obiettivi disattivati — i dati vengono conservati.</CardSubtitle>
            </div>
          </CardHeader>
          <div className="space-y-2">
            {inactiveGoals.map((g) => (
              <CustomGoalRow
                key={g.id}
                goal={g}
                onEdit={() => openEdit(g)}
                today={today}
                checks={listChecks}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Form modale (crea / modifica) */}
      <CustomGoalForm
        key={formGoal?.id ?? "new"}
        goal={formGoal}
        open={formOpen}
        onClose={closeForm}
      />
    </div>
  );
}
