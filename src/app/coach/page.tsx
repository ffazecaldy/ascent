"use client";
// ============================================================
// ASCEND — Coach (/coach): chat focalizzata col coach AI locale.
// - Benvenuto generato LOCALMENTE dai dati (nessun LLM): 2-3
//   osservazioni reali + suggerimento su cosa chiedere.
// - Il system prompt ("usa SOLO i dati reali") è anteposto a OGNI payload;
//   il contesto dati (buildCoachContext) solo al primo invio.
//   La cronologia inviata è limitata agli ultimi 10 messaggi.
// - Modello selezionabile fra quelli LOCALI di Ollama (senza
//   ':cloud'); badge di stato + banner se Ollama è offline.
// - Sessione volatile: nessuna persistenza della chat.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useDB } from "@/lib/storage";
import { coachChat, isCoachOffline, listOllamaModels, type ChatMsg } from "@/lib/ai";
import { buildCoachContext, coachSystemPrompt } from "@/lib/coach-context";
import { activityStreak, sportWeekStats, tradingStats, tradesBetween } from "@/lib/compute";
import { addDaysKey, todayKey, weekStartKey } from "@/lib/dates";
import { formatPercent } from "@/lib/format";
import type { DB } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

// ------------------------------------------------------------
// Messaggi UI: come ChatMsg ma con bolla "error" (solo visual)
// ------------------------------------------------------------
interface UiMsg {
  role: "user" | "assistant" | "error";
  content: string;
}

/** Cronologia pulita (senza bolle errore) da inviare al modello. */
function toHistory(msgs: UiMsg[]): ChatMsg[] {
  return msgs
    .filter((m) => m.role !== "error")
    .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }) as ChatMsg);
}

// ------------------------------------------------------------
// Benvenuto locale: osservazioni calcolate dai dati reali
// (stessi helper dell'app — nessuna chiamata di rete)
// ------------------------------------------------------------
function buildWelcome(db: DB): string {
  const today = todayKey(db.settings.timezone);
  const ws = weekStartKey(today, db.settings.weekStart);
  const obs: string[] = [];

  // 1) Trading della settimana
  const trades = tradesBetween(db, ws, addDaysKey(ws, 6));
  if (trades.length > 0) {
    const st = tradingStats(trades);
    const wr = st.winRate != null ? formatPercent(st.winRate, 0) : "n/d";
    // "trade" è invariabile nel codebase ("1 trade chiuso" / "N trade chiusi", v. trading/accounts)
    obs.push(`Hai fatto ${st.count} trade questa settimana con WR ${wr}.`);
  } else {
    obs.push("Nessun trade chiuso questa settimana.");
  }

  // 2) Sport vs target settimanale
  const sp = sportWeekStats(db, ws);
  if (sp.sessionsTarget > 0) {
    obs.push(`Sport: ${sp.sessions}/${sp.sessionsTarget} sessioni questa settimana.`);
  } else if (sp.sessions > 0) {
    obs.push(`Sport: ${sp.sessions} sessioni questa settimana (nessun target impostato).`);
  } else {
    obs.push("Sport: nessun allenamento registrato questa settimana.");
  }

  // 3) Streak attività
  const streak = activityStreak(db);
  if (streak.days > 0) {
    obs.push(`Streak attività: ${streak.days} ${streak.days === 1 ? "giorno" : "giorni"} 🔥`);
  } else {
    obs.push("Streak attività a 0: registra un'azione oggi per riattivarlo.");
  }

  return [
    "Ciao! Sono il tuo coach Ascend 👋 Ho letto i tuoi dati locali, ecco cosa vedo:",
    "",
    ...obs.map((o) => `• ${o}`),
    "",
    'Chiedimi ad esempio: «Com\'è andata questa settimana?» oppure «Dove sto perdendo disciplina nei trade?».',
  ].join("\n");
}

export default function CoachPage() {
  const db = useDB();

  // --- chat (volatile) ---
  const [msgs, setMsgs] = useState<UiMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // --- Ollama / modelli ---
  const [online, setOnline] = useState<boolean | null>(null); // null = verifica in corso
  const [models, setModels] = useState<string[]>([]); // solo modelli locali (senza :cloud)
  const [model, setModel] = useState("");

  const contextSentRef = useRef(false); // il CONTESTO dati è anteposto solo al primo invio; il system prompt va a ogni payload
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  /** Fetch dei modelli installati (GET /api/tags) → stato online + lista locale. */
  const refreshModels = useCallback(async () => {
    try {
      const all = await listOllamaModels();
      const local = all.filter((n) => !n.includes(":cloud"));
      setModels(local);
      setOnline(true);
      setModel((cur) => (local.includes(cur) ? cur : (local[0] ?? "")));
    } catch {
      setModels([]);
      setModel("");
      setOnline(false);
    }
  }, []);

  // Al mount: benvenuto locale + verifica Ollama
  useEffect(() => {
    setMsgs([{ role: "assistant", content: buildWelcome(db) }]);
    void refreshModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll-to-bottom automatico su nuovi messaggi / loading
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, loading]);

  const canSend = online === true && !loading && input.trim().length > 0;

  const send = async () => {
    const text = input.trim();
    if (!text || loading || online !== true) return;

    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";

    // Cronologia: ultimi 10 messaggi INCLUSO quello nuovo (bolle errore escluse)
    const outgoing: UiMsg = { role: "user", content: text };
    const history = toHistory([...msgs, outgoing]).slice(-10);

    // Il system prompt (vincoli "usa SOLO i dati reali") va in cima a OGNI
    // payload: senza, dai turni successivi il modello perde i vincoli.
    // Il contesto dati aggiornato è anteposto solo al primo invio.
    const contextTurn: ChatMsg[] = contextSentRef.current
      ? []
      : [{ role: "user", content: buildCoachContext(db) }];
    const payload: ChatMsg[] = [
      { role: "system", content: coachSystemPrompt() },
      ...contextTurn,
      ...history,
    ];
    contextSentRef.current = true;

    setMsgs((m) => [...m, outgoing]);
    setLoading(true);
    try {
      const reply = await coachChat(payload, model.trim() || undefined);
      setMsgs((m) => [...m, { role: "assistant", content: reply }]);
    } catch (err) {
      // Se Ollama è caduto, aggiorna lo stato → banner + input disabilitato
      if (isCoachOffline(err)) setOnline(false);
      setMsgs((m) => [
        ...m,
        {
          role: "error",
          content: err instanceof Error && err.message ? err.message : "Si è verificato un errore imprevisto. Riprova.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const disabled = online !== true;

  return (
    <div className="space-y-4">
      {/* Header: titolo + modello + stato Ollama */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent/15 text-accent">
            <Icon name="sparkles" size={18} />
          </span>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Coach</h1>
            <p className="text-xs text-muted-foreground">
              Il tuo coach personale — gira in locale, i dati non lasciano il PC.
            </p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={disabled || models.length === 0}
            aria-label="Modello Ollama"
            className={cn(
              "w-52 cursor-pointer appearance-none rounded-lg border border-border-strong bg-muted px-3 py-2 text-sm text-foreground",
              "focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            {models.length === 0 ? (
              <option value="">— nessun modello —</option>
            ) : (
              models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))
            )}
          </select>

          <span
            title={online === false ? "Ollama non raggiungibile su localhost:11434" : "Ollama attivo su localhost:11434"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
              online === true && "border-success/30 bg-success/10 text-success",
              online === false && "border-danger/30 bg-danger/10 text-danger",
              online === null && "border-border-strong bg-elevated text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                online === true && "bg-success",
                online === false && "bg-danger",
                online === null && "animate-pulse-dot bg-muted-foreground"
              )}
            />
            {online === true ? "Ollama online" : online === false ? "Ollama offline" : "Verifica…"}
          </span>

          <button
            onClick={() => void refreshModels()}
            aria-label="Ricarica modelli"
            title="Riprova connessione a Ollama"
            className="rounded-lg p-2 text-secondary-text transition-colors hover:bg-elevated hover:text-foreground"
          >
            <Icon name="refresh" size={15} />
          </button>
        </div>
      </div>

      {/* Banner offline */}
      {online === false && (
        <div className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm font-medium text-warning">
          <Icon name="alert" size={16} />
          <span>Coach offline — avvia Ollama</span>
          <span className="hidden text-xs font-normal opacity-80 sm:inline">(localhost:11434 · `ollama serve`)</span>
        </div>
      )}

      {/* Chat */}
      <Card hairline="accent" className="flex h-[70vh] min-h-[460px] flex-col p-0">
        {/* Area messaggi */}
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {msgs.map((m, i) =>
            m.role === "user" ? (
              <div
                key={i}
                className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-xl rounded-br-sm bg-accent/15 px-3.5 py-2 text-sm text-foreground"
              >
                {m.content}
              </div>
            ) : m.role === "assistant" ? (
              <div
                key={i}
                className="mr-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-xl rounded-bl-sm bg-elevated px-3.5 py-2 text-sm text-foreground"
              >
                {m.content}
              </div>
            ) : (
              <div
                key={i}
                className="mr-auto flex w-fit max-w-[85%] items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2 text-sm text-danger"
              >
                <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
                <span className="whitespace-pre-wrap">{m.content}</span>
              </div>
            )
          )}

          {/* Loading: puntini animati */}
          {loading && (
            <div className="mr-auto flex w-fit items-center gap-1.5 rounded-xl bg-elevated px-4 py-3" aria-label="Il coach sta scrivendo">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-border p-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                const ta = e.target;
                ta.style.height = "auto";
                ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              disabled={disabled}
              placeholder={
                disabled
                  ? "Coach offline — avvia Ollama per chattare"
                  : "Chiedi qualcosa al coach… (Invio per inviare, Shift+Invio per andare a capo)"
              }
              className={cn(
                "max-h-40 min-h-[42px] flex-1 resize-none rounded-lg border border-border-strong bg-muted px-3 py-2.5 text-sm text-foreground",
                "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
            />
            <button
              onClick={() => void send()}
              disabled={!canSend}
              aria-label="Invia messaggio"
              className={cn(
                "grid h-[42px] w-[42px] shrink-0 place-items-center rounded-lg text-white transition-all",
                "bg-gradient-to-r from-accent to-accent-2 shadow-[0_4px_18px_-6px_var(--accent-glow)]",
                "hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:shadow-none"
              )}
            >
              <Icon name="arrow-up" size={18} />
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
