"use client";

// ============================================================
// ASCEND — Study Vault: dettaglio materiale (prop material)
// Azioni (apri/scarica/apri link, delete), generazione riassunto
// via Ollama (summarizeMaterial), tabs Riassunto/Testo originale.
// Il parent re-renderizza il componente ad ogni updateDB.
// ============================================================

import { useEffect, useState } from "react";
import { updateDB, nowISO, removeById } from "@/lib/storage";
import type { StudyMaterial } from "@/lib/types";
import { summarizeMaterial } from "@/lib/materials";
import { listOllamaModels, isCoachOffline } from "@/lib/ai";
import { cn } from "@/lib/cn";
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

export default function MaterialDetail({ material, onDeleted }: Props) {
  const [tab, setTab] = useState<Tab>("riassunto");
  // Modelli Ollama per la generazione riassunto
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
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
