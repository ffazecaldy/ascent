"use client";

// ============================================================
// ASCEND — Study Vault: dialog aggiunta materiale
// Due modalità (File / Link): file PDF/TXT/MD con estrazione
// testo (pdfjs) e blob in IndexedDB; link YouTube (oembed) o
// web con trascrizione incollata. Materia condivisa opzionale.
// ============================================================

import { useRef, useState } from "react";
import { useDB, updateDB, uid, nowISO } from "@/lib/storage";
import type { StudyMaterial } from "@/lib/types";
import {
  extractPdfText,
  readTextFile,
  detectKind,
  isYoutubeUrl,
  fetchYoutubeMeta,
} from "@/lib/materials";
import { putFile, checkFileSize } from "@/lib/file-store";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Field, Input, Select, TextArea } from "@/components/ui/Field";
import { cn } from "@/lib/cn";

type Mode = "file" | "link";

interface Props {
  open: boolean;
  onClose: () => void;
  onAdded: (id: string) => void;
}

export default function AddMaterialDialog({ open, onClose, onAdded }: Props) {
  const db = useDB();
  const [mode, setMode] = useState<Mode>("file");
  const [busy, setBusy] = useState<string | null>(null); // messaggio spinner
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false); // meta YouTube recuperati
  // --- stato form (reset ad ogni apertura) ---
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkAuthor, setLinkAuthor] = useState("");
  const [linkTranscript, setLinkTranscript] = useState("");
  const [subject, setSubject] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // NOTA: il componente viene montato solo quando serve (il parent lo rende
  // condizionalmente su open), quindi gli useState partono già "puliti".

  /** Salva un materiale nel DB e ritorna l'id. */
  function saveMaterial(m: StudyMaterial) {
    updateDB((d) => ({ ...d, studyMaterials: [...d.studyMaterials, m] }));
    return m.id;
  }

  /** Processa i file selezionati (multipli, sequenziali). */
  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    let firstId: string | null = null;
    let failures = 0; // file saltati per errore → il dialog resta aperto
    const errors: string[] = [];

    for (const file of Array.from(files)) {
      const sizeErr = checkFileSize(file);
      if (sizeErr) {
        errors.push(sizeErr);
        failures++;
        continue;
      }
      const kind = detectKind(file.type, file.name);
      if (kind === "other") {
        errors.push(`"${file.name}": formato non supportato (solo PDF, TXT, MD)`);
        failures++;
        continue;
      }
      setBusy(
        kind === "pdf"
          ? `Estrazione testo… (${file.name})`
          : `Lettura file… (${file.name})`
      );
      let transcript = "";
      try {
        transcript = kind === "pdf" ? await extractPdfText(file) : await readTextFile(file);
      } catch {
        errors.push(`"${file.name}": PDF illeggibile o corrotto`);
        failures++;
        continue;
      }

      const id = uid();
      try {
        await putFile(id, file);
      } catch {
        errors.push(`"${file.name}": salvataggio del file non riuscito`);
        failures++;
        continue;
      }

      const ts = nowISO();
      const material: StudyMaterial = {
        id,
        kind: "file",
        fileName: file.name,
        mime: file.type || "application/octet-stream",
        size: file.size,
        fileId: id,
        title: file.name.replace(/\.[^.]+$/, ""), // nome senza estensione
        transcript,
        subject: subject || undefined,
        createdAt: ts,
        updatedAt: ts,
      };
      saveMaterial(material);
      if (!firstId) firstId = id;
    }

    setBusy(null);
    if (errors.length) setError(errors.join(" · "));
    if (firstId) onAdded(firstId);
    // chiudi solo se TUTTI i file sono andati a buon fine
    if (firstId && failures === 0) onClose();
  }

  /** Bottone "Recupera info": oembed YouTube → titolo + autore. */
  async function fetchMeta() {
    const url = linkUrl.trim();
    if (!url || !isYoutubeUrl(url)) {
      setError("Inserisci prima un URL YouTube valido");
      return;
    }
    setError(null);
    setBusy("Recupero info dal video…");
    const meta = await fetchYoutubeMeta(url);
    setBusy(null);
    if (meta && (meta.title || meta.author)) {
      if (meta.title) setLinkTitle(meta.title);
      if (meta.author) setLinkAuthor(meta.author);
      setFetched(true);
    } else {
      setError("Info non disponibili (oembed non raggiungibile): compila il titolo a mano");
    }
  }

  /** Salva il link (YouTube o web). */
  function handleSaveLink() {
    const url = linkUrl.trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      setError("Inserisci un URL valido (http/https)");
      return;
    }
    const yt = isYoutubeUrl(url);
    const ts = nowISO();
    const material: StudyMaterial = {
      id: uid(),
      kind: "link",
      url,
      provider: yt ? "youtube" : "web",
      title: linkTitle.trim() || url, // fallback: URL come titolo
      author: linkAuthor.trim() || undefined,
      transcript: linkTranscript.trim() || undefined,
      subject: subject || undefined,
      createdAt: ts,
      updatedAt: ts,
    };
    const id = saveMaterial(material);
    onAdded(id);
    onClose();
  }

  const segment = (m: Mode, iconName: "clipboard" | "compass", label: string) => (
    <button
      key={m}
      type="button"
      onClick={() => setMode(m)}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
        mode === m
          ? "border-accent bg-accent/10 text-accent"
          : "border-border text-muted-foreground hover:border-accent/40 hover:text-secondary-text"
      )}
    >
      <Icon name={iconName} size={14} />
      {label}
    </button>
  );

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title="Aggiungi materiale al vault" width="max-w-xl">
      {/* toggle File / Link */}
      <div className="mb-4 flex gap-2">
        {segment("file", "clipboard", "File")}
        {segment("link", "compass", "Link")}
      </div>

      {mode === "file" ? (
        <div className="space-y-3">
          <Field label="File (PDF, TXT o MD — anche più di uno)">
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
              className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed border-border-strong bg-muted/40 px-4 py-6 text-center transition-colors hover:border-accent/50 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <Icon name="upload" size={22} className="text-accent" />
              <p className="text-[13px] font-medium text-foreground">
                {busy ?? "Clicca per scegliere i file"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Il testo viene estratto automaticamente dai PDF (max 25 MB)
              </p>
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.txt,.md"
              className="hidden"
              onChange={(e) => {
                const fl = e.target.files;
                void handleFiles(fl);
                e.target.value = ""; // permette riselezione stesso file
              }}
              disabled={!!busy}
            />
          </Field>
          {busy && kindSpinner(busy)}
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="URL">
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
              autoComplete="off"
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Titolo">
              <Input
                value={linkTitle}
                onChange={(e) => setLinkTitle(e.target.value)}
                placeholder={fetched ? "" : "Titolo del video o della pagina"}
              />
            </Field>
            <Field label="Autore (opzionale)">
              <Input
                value={linkAuthor}
                onChange={(e) => setLinkAuthor(e.target.value)}
                placeholder="Canale o autore"
              />
            </Field>
          </div>
          <Button variant="outline" size="sm" onClick={fetchMeta} disabled={!!busy || !linkUrl.trim()}>
            <Icon name="refresh" size={13} />
            Recupera info
          </Button>
          <Field label="Trascrizione o descrizione (consigliata per YouTube)">
            <TextArea
              value={linkTranscript}
              onChange={(e) => setLinkTranscript(e.target.value)}
              placeholder="Incolla qui la trascrizione del video…"
              className="min-h-28"
            />
          </Field>
          <p className="rounded-lg border border-border bg-elevated/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            Sul video: <span className="text-secondary-text">…altro</span> →{" "}
            <span className="text-secondary-text">Mostra trascrizione</span> → copia e incolla qui.
            Serve per generare il riassunto.
          </p>
        </div>
      )}

      {/* materia condivisa */}
      <Field label="Materia (opzionale)" className="mt-3">
        <Select value={subject} onChange={(e) => setSubject(e.target.value)}>
          <option value="">—</option>
          {db.studySubjects.map((s) => (
            <option key={s.id} value={s.name}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>

      {error && <p className="mt-3 text-[12px] font-medium text-danger">{error}</p>}

      {mode === "link" && (
        <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={onClose} disabled={!!busy}>
            Annulla
          </Button>
          <Button variant="primary" glow onClick={handleSaveLink} disabled={!!busy}>
            <Icon name="check" size={14} />
            Aggiungi link
          </Button>
        </div>
      )}
    </Modal>
  );
}

/** Spinner compatto riutilizzabile. */
function kindSpinner(msg: string) {
  return (
    <p className="flex items-center gap-2 text-[12px] text-secondary-text">
      <Icon name="refresh" size={14} className="animate-spin" />
      {msg}
    </p>
  );
}
