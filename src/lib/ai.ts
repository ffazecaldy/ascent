// ============================================================
// ASCEND — Servizio AI: client Ollama per il Coach locale.
// Ollama gira in localhost (http://localhost:11434). Nessun dato
// esce dalla macchina. Endpoint usati:
//   POST /api/chat {model, messages, stream:false} → {message:{content}}
//   GET  /api/tags → {models:[{name,...}]}
// ============================================================

export const OLLAMA_BASE = "http://localhost:11434";
const CHAT_TIMEOUT_MS = 90_000; // modelli locali: primi token lenti
const TAGS_TIMEOUT_MS = 10_000;

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Errore applicativo del coach: isCoachOffline lo riconosce. */
export class CoachError extends Error {
  readonly offline: boolean;
  constructor(message: string, offline = false) {
    super(message);
    this.name = "CoachError";
    this.offline = offline;
  }
}

/**
 * Chat col coach: POST /api/chat con stream:false.
 * Risolve con il testo della risposta; rifiuta con Error in italiano chiaro
 * (CoachError.offline=true se Ollama non è raggiungibile / va in timeout).
 */
export async function coachChat(messages: ChatMsg[], model?: string): Promise<string> {
  if (!messages.length) throw new CoachError("Nessun messaggio da inviare al coach.");
  const m = model?.trim() || undefined;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CHAT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: m, messages, stream: false }),
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new CoachError(
        "Il coach non ha risposto entro 90 secondi (modello locale troppo lento o occupato). Riprova.",
        true
      );
    }
    throw new CoachError(
      "Ollama non è raggiungibile su localhost:11434. Avvia Ollama (`ollama serve`) e riprova.",
      true
    );
  }
  clearTimeout(timer);

  if (!res.ok) {
    let detail = "";
    try {
      detail = ((await res.json()) as { error?: string }).error ?? "";
    } catch {
      /* body non-JSON: ignora */
    }
    if (res.status === 404) {
      throw new CoachError(
        `Il modello "${m ?? "selezionato"}" non risulta installato in Ollama. Controlla la lista dei modelli disponibili.`,
        false
      );
    }
    throw new CoachError(
      `Ollama ha risposto con errore ${res.status}${detail ? `: ${detail}` : "."}`,
      false
    );
  }

  let data: { message?: { content?: unknown }; error?: string };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    throw new CoachError("Risposta di Ollama illeggibile (JSON non valido).", false);
  }
  if (data.error) throw new CoachError(`Ollama: ${data.error}`, res.status === 404);

  const content = data.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new CoachError("Il modello non ha prodotto una risposta. Prova un altro modello.", false);
  }
  return content;
}

/** Lista dei modelli installati in Ollama (GET /api/tags → models[].name). */
export async function listOllamaModels(): Promise<string[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TAGS_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: ctrl.signal });
  } catch {
    clearTimeout(timer);
    throw new CoachError(
      "Impossibile contattare Ollama su localhost:11434: verifica che sia attivo (`ollama serve`).",
      true
    );
  }
  clearTimeout(timer);
  if (!res.ok) {
    throw new CoachError(`Ollama ha risposto con errore ${res.status}.`, false);
  }
  let data: { models?: { name?: unknown }[] };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    throw new CoachError("Risposta di Ollama illeggibile (JSON non valido).", false);
  }
  return (data.models ?? [])
    .map((m) => m.name)
    .filter((n): n is string => typeof n === "string");
}

/**
 * True se l'errore indica che Ollama è offline / irraggiungibile / in timeout
 * (il resto dell'app può mostrare "coach offline" invece dell'errore generico).
 */
export function isCoachOffline(err: unknown): boolean {
  if (err instanceof CoachError) return err.offline;
  if (err instanceof TypeError) return true; // fetch network failure
  return false;
}
