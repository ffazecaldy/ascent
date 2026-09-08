"use client";

// ============================================================
// ASCEND — Study Vault: dettaglio materiale (prop material)
// Azioni (apri/scarica/apri link, delete), generazione riassunto
// via Ollama (summarizeMaterial), tabs Riassunto/Testo originale.
// Il parent re-renderizza il componente ad ogni updateDB.
// ============================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDB, updateDB, nowISO, removeById } from "@/lib/storage";
import type { StudyMaterial } from "@/lib/types";
import { summarizeMaterial, generateFlashcards } from "@/lib/materials";
import { listOllamaModels, isCoachOffline } from "@/lib/ai";
import { cn } from "@/lib/cn";
import { labelDayKey } from "@/lib/dates";
import { fmtDur } from "@/components/studio/constants";
import { getFile, deleteFile, downloadAttachment, fmtBytes } from "@/lib/file-store";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Select, TextArea } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/Misc";
import Markdown from "./Markdown";

interface Props {
  material: StudyMaterial;
  onDeleted: () => void;
}

type Tab = "riassunto" | "testo";

type Flashcard = { q: string; a: string };

/** Lista flashcard con flip locale; `key={material.id}` nel parent resetta lo stato al cambio materiale. */
function FlashcardList({ cards }: { cards: Flashcard[] }) {
  const [flipped, setFlipped] = useState<Set<number>>(new Set());

  function toggleFlip(index: number) {
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  if (cards.length === 0) {
    return (
      <p className="mt-2 text-[12px] text-muted-foreground">
        Nessuna flashcard — generale con l&apos;AI dal testo del materiale.
      </p>
    );
  }
  return (
    <div className="mt-2 space-y-1.5">
      {cards.map((c, i) => {
        const open = flipped.has(i);
        return (
          <div key={i} className="rounded-lg border border-border bg-elevated/40 px-3 py-2">
            <p className="text-[12px] font-medium text-foreground">
              <span className="tnum text-muted-foreground">{i + 1}. </span>
              {c.q}
            </p>
            {open ? (
              <p className="mt-1.5 border-t border-border pt-1.5 text-[12px] text-secondary-text">
                {c.a}
              </p>
            ) : null}
            <div className="mt-1.5">
              <Button variant="subtle" size="sm" onClick={() => toggleFlip(i)}>
                {open ? "Nascondi risposta" : "Mostra risposta"}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function MaterialDetail({ material, onDeleted }: Props) {
  const db = useDB();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("riassunto");
  // Modelli Ollama per la generazione riassunto
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  // Flashcard AI
  const [flashBusy, setFlashBusy] = useState(false);
  const [flashError, setFlashError] = useState<string | null>(null);
  const [flashcardsKey, setFlashcardsKey] = useState(0);
  // Aggiunta trascrizione inline (link senza testo)
  const [showTranscriptInput, setShowTranscriptInput] = useState(false);
  const [transcriptDraft, setTranscriptDraft] = useState("");
  // Delete
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);

  // Carica modelli Ollama una volta (default: il primo della lista)
  useEffect(() => {
    let cancelled = false;
    void listOllamaModels()
      .then((list) => {
        if (cancelled) return;
        setModels(list);
        setModel(list[0] ?? "");
      })
      .catch(() => {
        // Ollama offline: mostrato solo se l'utente prova a generare
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Apertura file: PDF in nuova scheda, resto in download. */
  async function handleOpen() {
    if (!material.fileId) return;
    const blob = await getFile(material.fileId);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    if (material.mime === "application/pdf") {
      window.open(url, "_blank", "noopener,noreferrer");
      // revocato dopo un minuto: la scheda ha già caricato il blob
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } else {
      URL.revokeObjectURL(url);
      void downloadAttachment(material.fileId, material.fileName ?? "file");
    }
  }

  /** Genera (o rigenera) il riassunto con Ollama. */
  async function handleSummarize() {
    if (!model) return;
    setBusy(true);
    setError(null);
    setOffline(false);
    try {
      const md = await summarizeMaterial(
        { title: material.title, transcript: material.transcript ?? "" },
        model
      );
      updateDB((d) => ({
        ...d,
        studyMaterials: d.studyMaterials.map((m) =>
          m.id === material.id
            ? { ...m, summary: md, summaryModel: model, summaryAt: nowISO(), updatedAt: nowISO() }
            : m
        ),
      }));
    } catch (err) {
      if (isCoachOffline(err)) {
        setOffline(true);
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : "Generazione non riuscita");
      }
    } finally {
      setBusy(false);
    }
  }

  /** Cambia lo stato di avanzamento studio. */
  function handleStatusChange(status: NonNullable<StudyMaterial["status"]>) {
    updateDB((d) => ({
      ...d,
      studyMaterials: d.studyMaterials.map((m) =>
        m.id === material.id ? { ...m, status, updatedAt: nowISO() } : m
      ),
    }));
  }

  /** Genera le flashcard con Ollama (da transcript, fallback summary). */
  async function handleGenerateFlashcards() {
    if (!model || flashBusy) return;
    setFlashBusy(true);
    setFlashError(null);
    setOffline(false);
    try {
      const cards = await generateFlashcards(
        {
          title: material.title,
          transcript: material.transcript ?? "",
          summary: material.summary ?? "",
        },
        model
      );
      updateDB((d) => ({
        ...d,
        studyMaterials: d.studyMaterials.map((m) =>
          m.id === material.id ? { ...m, flashcards: cards, updatedAt: nowISO() } : m
        ),
      }));
      setFlashcardsKey((k) => k + 1);
    } catch (err) {
      if (isCoachOffline(err)) {
        setOffline(true);
        setFlashError(null);
      } else {
        setFlashError(err instanceof Error ? err.message : "Generazione non riuscita");
      }
    } finally {
      setFlashBusy(false);
    }
  }

  /** Salva la trascrizione incollata inline. */
  function saveTranscript() {
    const t = transcriptDraft.trim();
    if (!t) return;
    updateDB((d) => ({
      ...d,
      studyMaterials: d.studyMaterials.map((m) =>
        m.id === material.id ? { ...m, transcript: t, updatedAt: nowISO() } : m
      ),
    }));
    setShowTranscriptInput(false);
    setTranscriptDraft("");
  }

  /** Elimina materiale + blob da IndexedDB. */
  async function handleDelete() {
    setBusyDelete(true);
    if (material.fileId) await deleteFile(material.fileId);
    updateDB((d) => ({ ...d, studyMaterials: removeById(d.studyMaterials, material.id) }));
    setBusyDelete(false);
    setConfirmDelete(false);
    onDeleted();
  }

  const ts = material.summaryAt ? new Date(material.summaryAt) : null;
  const hasSummary = !!material.summary;
  const flashcards = material.flashcards ?? [];
  const hasFlashSource = !!((material.transcript ?? "").trim() || (material.summary ?? "").trim());
  const locale = db.settings.locale || "it-IT";
  const linkedSessions = db.studySessions
    .filter((s) => s.materialId === material.id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  function handleStudyNow() {
    const base = `/studio?materialId=${material.id}`;
    router.push(material.subject ? `${base}&materia=${encodeURIComponent(material.subject)}` : base);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[--radius] border border-border bg-card p-4 shadow-[--shadow-card]">
        {/* header: title + meta + delete */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-foreground">{material.title}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              {material.author && <span>{material.author}</span>}
              {material.author && <span>·</span>}
              <Badge tone={material.kind === "link" ? "info" : "default"}>
                {material.provider === "youtube" ? "YouTube" : material.kind === "link" ? "Web" : "File"}
              </Badge>
              {material.subject && (
                <>
                  <span>·</span>
                  <span>{material.subject}</span>
                </>
              )}
              <span>·</span>
              <span>{new Date(material.createdAt).toLocaleDateString("it-IT")}</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Elimina materiale"
            onClick={() => setConfirmDelete(true)}
          >
            <Icon name="trash" size={16} />
          </Button>
        </div>

        {/* azioni */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {material.kind === "file" && material.fileId && (
            <>
              <Button variant="outline" size="sm" onClick={() => void handleOpen()}>
                <Icon name="eye" size={13} />
                Apri
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void downloadAttachment(material.fileId!, material.fileName ?? "file")}
              >
                <Icon name="download" size={13} />
                Scarica
              </Button>
            </>
          )}
          {material.kind === "link" && material.url && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(material.url, "_blank", "noopener,noreferrer")}
            >
              <Icon name="arrow-right" size={13} />
              Apri link
            </Button>
          )}
          {material.size != null && material.kind === "file" && (
            <span className="text-[11px] text-muted-foreground">{fmtBytes(material.size)}</span>
          )}
          <Button variant="primary" size="sm" glow onClick={handleStudyNow}>
            <Icon name="timer" size={13} />
            Studia ora → registra sessione
          </Button>
        </div>

        {/* stato avanzamento */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor="material-status" className="text-[12px] text-muted-foreground">
            Stato:
          </label>
          <Select
            id="material-status"
            value={material.status ?? "da_studiare"}
            onChange={(e) =>
              handleStatusChange(e.target.value as NonNullable<StudyMaterial["status"]>)
            }
            className="h-9 w-auto min-w-40 max-w-56 py-0 text-[12px]"
            aria-label="Stato di avanzamento"
          >
            <option value="da_studiare">Da studiare</option>
            <option value="in_ripasso">In ripasso</option>
            <option value="completato">Completato</option>
          </Select>
        </div>

        {/* generazione riassunto: select modello + bottone */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="h-9 w-auto min-w-40 max-w-56 py-0 text-[12px]"
            disabled={models.length === 0}
          >
            {models.length === 0 ? (
              <option value="">Nessun modello</option>
            ) : (
              models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))
            )}
          </Select>
          <Button variant="primary" size="sm" glow onClick={() => void handleSummarize()} disabled={busy || !model}>
            {busy ? (
              <>
                <Icon name="refresh" size={13} className="animate-spin" />
                Analisi in corso…
              </>
            ) : hasSummary ? (
              <>
                <Icon name="refresh" size={13} />
                Rigenera
              </>
            ) : (
              <>
                <Icon name="sparkles" size={13} />
                Genera riassunto
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleGenerateFlashcards()}
            disabled={flashBusy || !model || !hasFlashSource}
            title={
              hasFlashSource
                ? "Genera 8 flashcard dall'AI locale"
                : "Aggiungi una trascrizione o genera prima il riassunto"
            }
          >
            {flashBusy ? (
              <>
                <Icon name="refresh" size={13} className="animate-spin" />
                Generazione…
              </>
            ) : (
              <>
                <Icon name="clipboard" size={13} />
                Genera flashcard (AI)
              </>
            )}
          </Button>
          {busy && (
            <span className="text-[11px] text-muted-foreground">
              con modelli locali può richiedere minuti
            </span>
          )}
        </div>

        {offline && (
          <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
            Ollama non attivo: avvialo con <span className="font-mono">ollama serve</span>
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
            {error}
          </p>
        )}
        {flashError && (
          <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
            {flashError}
          </p>
        )}
      </div>

      {/* hint trascrizione / warning PDF scansionato */}
      {material.kind === "link" && !(material.transcript ?? "").trim() && (
        <div className="rounded-[--radius] border border-border bg-card p-4 shadow-[--shadow-card]">
          {!showTranscriptInput ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] text-muted-foreground">
                Nessuna trascrizione: incollala per poter generare il riassunto
                {material.provider === "youtube" ? " (sul video: …altro → Mostra trascrizione)" : ""}.
              </p>
              <Button variant="subtle" size="sm" onClick={() => setShowTranscriptInput(true)}>
                <Icon name="clipboard" size={13} />
                Aggiungi trascrizione
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <TextArea
                value={transcriptDraft}
                onChange={(e) => setTranscriptDraft(e.target.value)}
                placeholder="Incolla la trascrizione…"
                className="min-h-32"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowTranscriptInput(false)}>
                  Annulla
                </Button>
                <Button variant="primary" size="sm" onClick={saveTranscript} disabled={!transcriptDraft.trim()}>
                  <Icon name="check" size={13} />
                  Salva trascrizione
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      {material.kind === "file" && !(material.transcript ?? "").trim() && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[12px] text-warning">
          PDF probabilmente scansionato (nessun testo estraibile): serve un PDF con testo reale.
        </p>
      )}

      {/* tabs: Riassunto | Testo originale */}
      <div className="rounded-[--radius] border border-border bg-card shadow-[--shadow-card]">
        <div className="flex items-center gap-1 border-b border-border px-2">
          {(
            [
              ["riassunto", "Riassunto"],
              ["testo", "Testo originale"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "border-b-2 px-3 py-2.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                tab === id
                  ? "border-accent text-foreground"
                  : "border-transparent text-muted-foreground hover:text-secondary-text"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="p-4">
          {tab === "riassunto" ? (
            hasSummary ? (
              <div className="space-y-2">
                <Markdown text={material.summary!} />
                <p className="border-t border-border pt-2 text-[11px] text-muted-foreground">
                  Generato con <span className="text-secondary-text">{material.summaryModel ?? "—"}</span> ·{" "}
                  {ts ? ts.toLocaleString("it-IT") : "—"}
                </p>
              </div>
            ) : (
              <EmptyState
                icon={<Icon name="sparkles" size={34} className="text-accent" />}
                title="Nessun riassunto — genera con l'AI locale"
                description="Scegli un modello Ollama e premi Genera riassunto: l'analisi avviene tutta sul tuo computer."
              />
            )
          ) : (
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap text-[12px] font-mono text-secondary-text">
              {material.transcript ?? "Nessun testo estratto."}
            </pre>
          )}
        </div>
      </div>

      {/* flashcard */}
      <div className="rounded-[--radius] border border-border bg-card p-4 shadow-[--shadow-card]">
        <h3 className="text-[13px] font-semibold text-foreground">
          Flashcard <span className="tnum">({flashcards.length})</span>
        </h3>
        <FlashcardList key={`${material.id}-${flashcardsKey}`} cards={flashcards} />
      </div>

      {/* sessioni collegate al materiale */}
      <div className="rounded-[--radius] border border-border bg-card p-4 shadow-[--shadow-card]">
        <h3 className="text-[13px] font-semibold text-foreground">
          Sessioni collegate <span className="tnum">({linkedSessions.length})</span>
        </h3>
        {linkedSessions.length === 0 ? (
          <p className="mt-2 text-[12px] text-muted-foreground">
            Nessuna sessione collegata — collega dal form sessione.
          </p>
        ) : (
          <div className="mt-2 space-y-1.5">
            {linkedSessions.slice(0, 5).map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg border border-border bg-elevated/40 px-3 py-2"
              >
                <span className="text-[11px] tnum text-muted-foreground">
                  {labelDayKey(s.date, locale)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">
                  {s.subject}
                </span>
                <span className="shrink-0 text-[12px] font-semibold tnum text-accent">
                  {fmtDur(s.minutes)}
                </span>
              </div>
            ))}
            {linkedSessions.length > 5 && (
              <p className="text-[11px] text-muted-foreground">
                e altre <span className="tnum">{linkedSessions.length - 5}</span>
              </p>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void handleDelete()}
        title="Eliminare il materiale?"
        message={`"${material.title}" verrà rimosso definitivamente dal vault${
          material.fileId ? " insieme al file allegato" : ""
        }.`}
        confirmLabel="Elimina"
        busy={busyDelete}
      />
    </div>
  );
}
