// ============================================================
// ASCEND — Study Vault: estrazione testo (PDF) + helper YouTube
// + prompt e generazione riassunti via Ollama (coachChat).
// Tutto locale: nessun dato esce dalla macchina.
// ============================================================

import { coachChat, type ChatMsg } from "./ai";
import type { StudyMaterial } from "./types";

const MAX_PDF_PAGES = 60; // cap sanitario: oltre, PDF da spezzare a mano
const MAX_PROMPT_CHARS = 24_000; // per chunk inviato al modello
const MAX_TOTAL_CHARS = 60_000; // cap complessivo del testo estratto

/**
 * Estrae il testo da un PDF lato client (pdfjs-dist v4+, solo text layer).
 * PDF scansionati (immagini) → testo quasi vuoto: il chiamante lo gestisce.
 */
export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  // Worker v4+: file .mjs served dal bundle (new URL + import.meta.url)
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const chunks: string[] = [];
  let total = 0;

  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((it) => ("str" in it ? it.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) {
      chunks.push(text);
      total += text.length;
      if (total >= MAX_TOTAL_CHARS) break;
    }
  }

  let out = chunks.join("\n\n");
  if (out.length > MAX_TOTAL_CHARS) out = out.slice(0, MAX_TOTAL_CHARS) + "…[troncato]";
  return out;
}

/** Estrae l'id di un video YouTube da qualunque formato di URL. */
export function youtubeId(url: string): string | null {
  const m = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/.exec(
    url
  );
  return m ? m[1] : null;
}

/** È un URL YouTube? */
export function isYoutubeUrl(url: string): boolean {
  return /(?:youtube\.com|youtu\.be)/i.test(url);
}

/**
 * Metadati YouTube via oembed (nessuna API key). Fallisce → null (mai bloccare).
 */
export async function fetchYoutubeMeta(
  url: string
): Promise<{ title: string; author: string } | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { title?: unknown; author_name?: unknown };
    return {
      title: typeof j.title === "string" ? j.title : "",
      author: typeof j.author_name === "string" ? j.author_name : "",
    };
  } catch {
    return null;
  }
}

/** Legge un file di testo (.txt/.md) come stringa UTF-8. */
export async function readTextFile(file: File): Promise<string> {
  const text = await file.text();
  return text.slice(0, MAX_TOTAL_CHARS);
}

/** Rileva il kind di materiale dal mime/nome. */
export function detectKind(
  mime: string,
  name: string
): "pdf" | "text" | "other" {
  if (mime === "application/pdf" || name.toLowerCase().endsWith(".pdf")) return "pdf";
  if (
    mime.startsWith("text/") ||
    /\.(txt|md|markdown)$/i.test(name)
  )
    return "text";
  return "other";
}

/** Spezza un testo lungo in chunk ≤ max basati su paragrafi. */
export function chunkForPrompt(text: string, max: number = MAX_PROMPT_CHARS): string[] {
  if (text.length <= max) return [text];
  const paras = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let cur = "";
  for (const p of paras) {
    if ((cur + "\n\n" + p).length > max && cur) {
      chunks.push(cur);
      cur = p;
    } else {
      cur = cur ? cur + "\n\n" + p : p;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

const SYSTEM_PROMPT = `Sei un assistente di studio per uno studente universitario di Informatica al primo anno.
Ricevi il testo (o la trascrizione) di un materiale didattico e produci un RIASSUNTO DI STUDIO in markdown, in italiano.
Struttura OBBLIGATORIA (usa esattamente questi header):

## In sintesi
3-5 frasi che catturano il cuore del materiale.

## Concetti chiave
Elenco puntato: ogni voce = concetto + definizione chiara e autoportante (1-2 frasi).

## Approfondimenti
3-6 punti meno ovvi: dettagli, eccezioni, collegamenti, esempi concreti presenti nel testo.

## Domande da ripasso
Esattamente 5 domande di verifica, ognuna seguita dalla risposta breve in corsivo su riga sotto.

## Glossario
Tabella markdown | Termine | Significato | con i termini tecnici del testo (max 10 righe).

REGOLE:
- Usa SOLO il testo fornito: non inventare nulla, non aggiungere conoscenza esterna.
- Se il testo è frammentario, dilo onestamente nella sezione "In sintesi" e lavora solo su ciò che c'è.
- Tono asciutto e tecnico, niente frasi di apertura/chiusura, niente "certamente!".`;

/** Costruisce i messaggi per un singolo chunk. */
function chunkMessages(
  title: string,
  chunk: string,
  index: number,
  total: number,
  partial?: string
): ChatMsg[] {
  const user = [
    `Titolo del materiale: "${title}"`,
    total > 1 ? `Passaggio ${index + 1} di ${total} (testo spezzato, riassumilo parzialmente).` : "",
    partial
      ? `Riassunto parziale dei passaggi precedenti:\n\n${partial}\n\nTesto nuovo del passaggio ${index + 1}:`
      : "Testo del materiale:",
    "",
    chunk,
  ]
    .filter(Boolean)
    .join("\n\n");
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: user },
  ];
}

/** Prompt finale che fonde i parziali in un riassunto unico. */
function finalMessages(title: string, partials: string[]): ChatMsg[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Titolo del materiale: "${title}"\n\nIl testo era lungo ed è stato riassunto in ${partials.length} parziali in sequenza. Fondili in UN riassunto finale completo rispettando la struttura obbligatoria:\n\n${partials
        .map((p, i) => `--- Parziale ${i + 1} ---\n${p}`)
        .join("\n\n")}`,
    },
  ];
}

/**
 * Genera il riassunto strutturato di un materiale con Ollama (modello dato).
 * Testi lunghi → riassunto incrementale a blocchi. Ritorna markdown.
 */
export async function summarizeMaterial(
  material: Pick<StudyMaterial, "title" | "transcript">,
  model: string
): Promise<string> {
  const text = (material.transcript ?? "").trim();
  if (!text) {
    throw new Error(
      "Nessun testo da riassumere: per i link YouTube incolla la trascrizione, per i PDF verifica che non siano scansionati."
    );
  }
  const chunks = chunkForPrompt(text);

  if (chunks.length === 1) {
    return coachChat(chunkMessages(material.title, chunks[0], 0, 1), model);
  }

  // riassunto incrementale: parziale = riassumi(parziale_precedente + chunk)
  let partial = "";
  for (let i = 0; i < chunks.length; i++) {
    partial = await coachChat(
      chunkMessages(material.title, chunks[i], i, chunks.length, partial || undefined),
      model
    );
  }
  // fusione finale dei parziali nel formato obbligatorio
  return coachChat(finalMessages(material.title, [partial]), model);
}
