"use client";

// ============================================================
// Zona Studio — log sessioni (lista densa con badge materia,
// durata, nota, data) + eliminazione con conferma.
// ============================================================

import { useMemo, useState } from "react";
import { useDB, updateDB, removeById } from "@/lib/storage";
import type { StudySession } from "@/lib/types";
import { labelDayKey } from "@/lib/dates";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";
import { Input, Select } from "@/components/ui/Field";
import { fmtDur, subjectColor, subjectGradient, subjectIcon } from "./constants";
import { downloadAttachment, fmtBytes } from "@/lib/file-store";

type SortKey = "recenti" | "durata" | "focus";

export function StudyLog({ onEdit }: { onEdit: (s: StudySession) => void }) {
  const db = useDB();
  const locale = db.settings.locale || "it-IT";
  const [deleteTarget, setDeleteTarget] = useState<StudySession | null>(null);
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("Tutte");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sort, setSort] = useState<SortKey>("recenti");

  const subjects = useMemo(
    () => Array.from(new Set(db.studySessions.map((s) => s.subject))).sort((a, b) => a.localeCompare(b)),
    [db.studySessions]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = db.studySessions.filter(
      (s) =>
        (subject === "Tutte" || s.subject === subject) &&
        (fromDate === "" || s.date >= fromDate) &&
        (toDate === "" || s.date <= toDate) &&
        (q === "" ||
          s.subject.toLowerCase().includes(q) ||
          (s.note ?? "").toLowerCase().includes(q))
    );
    return [...rows].sort((a, b) => {
      if (sort === "durata") {
        return (
          b.minutes - a.minutes ||
          b.date.localeCompare(a.date) ||
          b.createdAt.localeCompare(a.createdAt)
        );
      }
      if (sort === "focus") {
        const fa = a.focus ?? -1;
        const fb = b.focus ?? -1;
        return (
          fb - fa ||
          b.date.localeCompare(a.date) ||
          b.createdAt.localeCompare(a.createdAt)
        );
      }
      return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
    });
  }, [db.studySessions, query, subject, fromDate, toDate, sort]);

  function confirmDelete() {
    if (!deleteTarget) return;
    updateDB((d) => ({
      ...d,
      studySessions: removeById(d.studySessions, deleteTarget.id),
    }));
    setDeleteTarget(null);
  }

  return (
    <Reveal delay={40}>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Log sessioni</CardTitle>
            <CardSubtitle>
              <span className="tnum">
                {filtered.length} di {db.studySessions.length}
              </span>{" "}
              sessione{db.studySessions.length === 1 ? "" : "i"} di studio
            </CardSubtitle>
          </div>
          <Badge tone="default">
            <span className="tnum">{db.studySessions.length}</span>
          </Badge>
        </CardHeader>
        <div className="grid grid-cols-2 gap-2 pb-2 sm:grid-cols-3 lg:grid-cols-5">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca nota o materia…"
            aria-label="Cerca nelle sessioni"
            className="col-span-2 sm:col-span-1"
          />
          <Select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Filtra per materia">
            <option value="Tutte">Tutte le materie</option>
            {subjects.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            aria-label="Da data"
          />
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            aria-label="A data"
          />
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Ordina sessioni"
          >
            <option value="recenti">Recenti</option>
            <option value="durata">Durata</option>
            <option value="focus">Focus</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          {filtered.length === 0 && (
            <p className="py-4 text-center text-sm text-secondary-text">
              Nessuna sessione con questi filtri.
            </p>
          )}
          {filtered.map((s) => {
            const color = subjectColor(s.subject);
            return (
              <div
                key={s.id}
                className="group flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-elevated/40 px-3 py-2 transition-colors hover:border-border-strong hover:bg-elevated/70"
              >
                {/* chip materia con gradiente di palette */}
                <span
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                  style={{
                    color,
                    backgroundImage: subjectGradient(s.subject),
                    borderColor: `${color}40`,
                  }}
                >
                  <Icon name={subjectIcon(s.subject)} size={13} className="shrink-0" />
                  {s.subject}
                </span>

                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5">
                  {s.note && (
                    <span className="max-w-[320px] truncate text-[11px] text-secondary-text">
                      {s.note}
                    </span>
                  )}
                  {/* allegati: download diretto dal log */}
                  {(s.attachments ?? []).map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => void downloadAttachment(a.id, a.name)}
                      title={`Scarica ${a.name} (${fmtBytes(a.size)})`}
                      className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent transition-colors hover:bg-accent/20"
                    >
                      <Icon name="clipboard" size={11} />
                      <span className="max-w-[140px] truncate">{a.name}</span>
                    </button>
                  ))}
                </div>

                <span className="text-[11px] tnum text-muted-foreground">
                  {labelDayKey(s.date, locale)}
                </span>
                <span className="shrink-0 text-sm font-semibold tnum text-accent">
                  {fmtDur(s.minutes)}
                </span>
                {s.focus != null && (
                  <span className="text-[11px] tnum text-muted-foreground">
                    · focus {s.focus}/5
                  </span>
                )}
                <div className="flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                  <Button variant="ghost" size="icon" onClick={() => onEdit(s)} aria-label="Modifica sessione">
                    <Icon name="pencil" size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(s)}
                    aria-label="Elimina sessione"
                  >
                    <Icon name="trash" size={14} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Conferma eliminazione */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Eliminare la sessione?"
        message={
          deleteTarget
            ? `${deleteTarget.subject} del ${labelDayKey(
                deleteTarget.date,
                locale
              )} (${fmtDur(deleteTarget.minutes)}) — questa azione non può essere annullata.`
            : ""
        }
        confirmLabel="Elimina"
      />
    </Reveal>
  );
}
