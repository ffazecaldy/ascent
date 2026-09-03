"use client";

// ============================================================
// ASCEND — Milestone (gestione completa)
// Pagina dedicata: lista aperte/completate, creazione/editing
// modale, toggle done manuale, elimina con conferma.
// Self-contained: nessun import da /app/obiettivi/.
// ============================================================

import { useState, useMemo } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { useDB, updateDB, uid, nowISO, removeById, upsert } from "@/lib/storage";
import { todayKey } from "@/lib/dates";
import { openMilestones, urgencyOf, dueLabel } from "@/lib/milestones";
import type { Milestone } from "@/lib/types";
import { Icon } from "@/components/ui/Icon";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState, SectionHeader } from "@/components/ui/Misc";
import { Reveal } from "@/components/ui/Reveal";
import { Badge, StatusDot } from "@/components/ui/Badge";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Input, Field, TextArea } from "@/components/ui/Field";

// ------------------------------------------------------------
// Costanti locali (stesso swatch di custom-goals)
// ------------------------------------------------------------

const COLOR_SWATCH: { label: string; value: string }[] = [
  { label: "Blu", value: "#4c7eff" },
  { label: "Verde", value: "#2ddf9e" },
  { label: "Giallo", value: "#f0b429" },
  { label: "Viola", value: "#8b5cf6" },
  { label: "Rosa", value: "#f472b6" },
];

const URGENCY_TONE: Record<string, "default" | "info" | "warning" | "danger"> = {
  overdue: "danger",
  soon: "warning",
  week: "info",
  future: "default",
};

function formatDateIT(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date + "T00:00:00"));
}

// ------------------------------------------------------------
// Form creazione/editing — modale
// ------------------------------------------------------------

function MilestoneForm({
  milestone,
  open,
  onClose,
  today,
}: {
  milestone: Milestone | null; // null = creazione, Milestone = editing
  open: boolean;
  onClose: () => void;
  today: string;
}) {
  const isEdit = milestone !== null;

  const [title, setTitle] = useState(milestone?.title ?? "");
  const [note, setNote] = useState(milestone?.note ?? "");
  const [date, setDate] = useState(milestone?.date ?? today);
  const [color, setColor] = useState(milestone?.color ?? "");

  const save = () => {
    const cleanTitle = title.trim();
    if (cleanTitle.length === 0 || !isValidDate(date)) return;
    const now = nowISO();

    if (isEdit) {
      updateDB((d) => ({
        ...d,
        milestones: upsert(d.milestones, {
          ...milestone,
          title: cleanTitle,
          note: note.trim() || undefined,
          date,
          color: color || undefined,
          updatedAt: now,
        }),
      }));
    } else {
      updateDB((d) => ({
        ...d,
        milestones: upsert(d.milestones, {
          id: uid(),
          title: cleanTitle,
          note: note.trim() || undefined,
          date,
          color: color || undefined,
          done: false,
          doneAt: null,
          createdAt: now,
          updatedAt: now,
        }),
      }));
    }
    onClose();
  };

  const valid = title.trim().length > 0 && isValidDate(date);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Modifica milestone" : "Nuova milestone"}
      width="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={save} disabled={!valid}>
            {isEdit ? "Salva" : "Crea milestone"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Titolo">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Es. Esame di reti"
            maxLength={80}
            aria-label="Titolo"
          />
        </Field>

        <Field label="Nota (opzionale)">
          <TextArea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Dettaglio, criteri di completamento..."
            rows={2}
            maxLength={240}
            aria-label="Nota"
          />
        </Field>

        <Field label="Data">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Data"
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
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------
// Riga milestone aperta (checkbox manuale + edit + delete)
// ------------------------------------------------------------

function MilestoneRow({
  milestone,
  today,
  onEdit,
}: {
  milestone: Milestone;
  today: string;
  onEdit: () => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);

  const urgency = urgencyOf(milestone, today);

  const toggleDone = () => {
    const now = nowISO();
    const done = !milestone.done;
    updateDB((d) => ({
      ...d,
      milestones: d.milestones.map((m) =>
        m.id === milestone.id
          ? { ...m, done, doneAt: done ? now : null, updatedAt: now }
          : m
      ),
    }));
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-3 transition-[border-color,background-color] duration-300 hover:border-accent/40">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* Check manuale */}
        <button
          type="button"
          role="checkbox"
          aria-checked={milestone.done}
          aria-label={milestone.done ? "Segna come non completata" : "Segna come completata"}
          onClick={toggleDone}
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors",
            milestone.done
              ? "border-accent bg-accent text-white"
              : "border-border-strong text-transparent hover:border-accent hover:bg-accent/10"
          )}
        >
          {milestone.done && <Icon name="check" size={13} strokeWidth={3} />}
        </button>

        {/* Titolo */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {milestone.color && <StatusDot color={milestone.color} />}
            <p
              className={cn(
                "text-sm font-medium",
                milestone.done ? "line-through text-muted-foreground" : "text-foreground"
              )}
              title={milestone.note}
            >
              {milestone.title}
            </p>
          </div>
          {milestone.note && (
            <p className="mt-0.5 max-w-xs text-[11px] text-muted-foreground line-clamp-2">
              {milestone.note}
            </p>
          )}
        </div>

        {/* Badge urgenza */}
        <Badge tone={URGENCY_TONE[urgency] ?? "default"}>
          <Icon name="flag" size={9} strokeWidth={2.5} />
          {dueLabel(milestone.date, today)}
        </Badge>

        {/* Data */}
        <span className="tnum shrink-0 text-[11px] text-muted-foreground">
          {formatDateIT(milestone.date)}
        </span>

        {/* Azioni */}
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={onEdit}
            aria-label="Modifica"
            className="text-secondary-text hover:text-accent"
          >
            <Icon name="pen" size={14} />
          </Button>
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

      <ConfirmDialog
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        onConfirm={() => {
          updateDB((d) => ({
            ...d,
            milestones: removeById(d.milestones, milestone.id),
          }));
          setConfirmDel(false);
        }}
        title="Eliminare la milestone?"
        message="Questa azione non può essere annullata."
      />
    </div>
  );
}

// ------------------------------------------------------------
// Riga milestone completata (riapri + elimina)
// ------------------------------------------------------------

function DoneMilestoneRow({
  milestone,
  onEdit,
}: {
  milestone: Milestone;
  onEdit: () => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);

  const reopen = () => {
    updateDB((d) => ({
      ...d,
      milestones: d.milestones.map((m) =>
        m.id === milestone.id ? { ...m, done: false, doneAt: null, updatedAt: nowISO() } : m
      ),
    }));
  };

  const completedOn =
    milestone.doneAt != null
      ? new Date(milestone.doneAt).toLocaleDateString("it-IT", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : null;

  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {milestone.color && <StatusDot color={milestone.color} />}
            <p className="text-sm font-medium line-through text-muted-foreground" title={milestone.note}>
              {milestone.title}
            </p>
          </div>
          {completedOn && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">Completata il {completedOn}</p>
          )}
        </div>

        <span className="tnum shrink-0 text-[11px] text-muted-foreground">
          {formatDateIT(milestone.date)}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={onEdit} aria-label="Modifica">
            <Icon name="pen" size={13} />
            Modifica
          </Button>
          <Button variant="outline" size="sm" onClick={reopen}>
            Riapri
          </Button>
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

      <ConfirmDialog
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        onConfirm={() => {
          updateDB((d) => ({
            ...d,
            milestones: removeById(d.milestones, milestone.id),
          }));
          setConfirmDel(false);
        }}
        title="Eliminare la milestone?"
        message="Questa azione non può essere annullata."
      />
    </div>
  );
}

// ------------------------------------------------------------
// Pagina
// ------------------------------------------------------------

export default function MilestonesPage() {
  const db = useDB();
  const today = useMemo(() => todayKey(db.settings.timezone), [db.settings.timezone]);

  const [formOpen, setFormOpen] = useState(false);
  const [formMilestone, setFormMilestone] = useState<Milestone | null>(null);

  const openCreate = () => {
    setFormMilestone(null);
    setFormOpen(true);
  };

  const openEdit = (m: Milestone) => {
    setFormMilestone(m);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setFormMilestone(null);
  };

  const open = useMemo(() => openMilestones(db.milestones), [db.milestones]);
  const done = useMemo(
    () =>
      db.milestones
        .filter((m) => m.done)
        .slice()
        .sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? "")),
    [db.milestones]
  );

  return (
    <div className="space-y-6">
      <Link
        href="/obiettivi"
        className="flex items-center gap-1.5 text-sm text-secondary-text transition-colors hover:text-accent"
      >
        {"< Obiettivi"}
      </Link>

      <SectionHeader
        kicker="Obiettivi"
        title="Milestone"
        subtitle="Traguardi con deadline: appaiono nel reminder in Home."
        action={
          <Button onClick={openCreate}>
            <Icon name="plus" size={14} />
            + Nuova milestone
          </Button>
        }
      />

      {db.milestones.length === 0 ? (
        <EmptyState
          icon={<Icon name="trophy" size={34} className="text-accent" />}
          title="Nessuna milestone"
          description="Crea traguardi con una deadline: appariranno nel reminder in Home."
          action={
            <Button onClick={openCreate}>
              <Icon name="plus" size={14} />
              + Nuova milestone
            </Button>
          }
        />
      ) : (
        <>
          <Reveal>
            <Card hairline="accent">
              <CardHeader>
                <div>
                  <CardTitle>Aperte ({open.length})</CardTitle>
                  <CardSubtitle>Spunta la casella quando raggiungi il traguardo.</CardSubtitle>
                </div>
              </CardHeader>
              {open.length > 0 ? (
                <div className="space-y-2">
                  {open.map((m) => (
                    <MilestoneRow key={m.id} milestone={m} today={today} onEdit={() => openEdit(m)} />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Nessuna milestone aperta.</p>
              )}
            </Card>
          </Reveal>

          {done.length > 0 && (
            <Reveal delay={80}>
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Completate ({done.length})</CardTitle>
                    <CardSubtitle>Traguardi raggiunti — i dati vengono conservati.</CardSubtitle>
                  </div>
                </CardHeader>
                <div className="space-y-2">
                  {done.map((m) => (
                    <DoneMilestoneRow key={m.id} milestone={m} onEdit={() => openEdit(m)} />
                  ))}
                </div>
              </Card>
            </Reveal>
          )}
        </>
      )}

      <MilestoneForm
        key={formMilestone?.id ?? "new"}
        milestone={formMilestone}
        open={formOpen}
        onClose={closeForm}
        today={today}
      />
    </div>
  );
}
