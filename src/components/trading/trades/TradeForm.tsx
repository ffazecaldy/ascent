"use client";

// ============================================================
// ASCEND — Trade log: form nuovo/modifica trade (Modal)
// + regole del setup (se selezionato) in pill con glow quando rispettate
// + caricamento screenshot (ScreenshotUploader)
// CTA "Salva trade" con gradiente animato.
// ============================================================

import React, { useEffect, useMemo, useState } from "react";
import type { DB, Trade, TradeDirection } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, TextArea, Select, Field } from "@/components/ui/Field";
import { rulesOfSetup } from "@/lib/compute";
import { getAccount } from "@/lib/db";
import { currencySymbol } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ScreenshotUploader } from "./ScreenshotUploader";
import {
  isoToLocalInput,
  localInputToISO,
  numOrNull,
  numOrZero,
} from "./trade-utils";

const EMOTIONS = ["Calmo", "Focus", "Ansia", "FOMO", "Vendetta", "Noia", "Distratto", "Sicuro", "Euforia", "Tilt"];

export interface TradePayload {
  id?: string;
  accountId: string;
  instrument: string;
  direction: TradeDirection;
  entry: number | null;
  exit: number | null;
  size: number | null;
  stop: number | null;
  target: number | null;
  resultNative: number;
  resultR: number;
  openDate: string;
  closeDate: string;
  screenshots: string[];
  description?: string;
  setupId?: string | null;
  emotion?: string;
  createdAt?: string;
}

/** Divisore di sezione del form: etichetta + lineetta. */
function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <span className="h-px w-4 bg-border-strong" />
        {title}
      </p>
      {children}
    </section>
  );
}

export function TradeForm({
  open,
  onClose,
  initial,
  db,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  initial: Trade | null;
  db: DB;
  onSave: (payload: { trade: TradePayload; rules: { ruleId: string; respected: boolean }[] }) => void;
}) {
  // ---- stato form (stringhe per gli input numerici, così si può svuotare) ----
  const [accountId, setAccountId] = useState("");
  const [instrument, setInstrument] = useState("");
  const [direction, setDirection] = useState<TradeDirection>("long");
  const [entry, setEntry] = useState("");
  const [exit, setExit] = useState("");
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");
  const [size, setSize] = useState("");
  const [resultNative, setResultNative] = useState("");
  const [resultR, setResultR] = useState("");
  const [openDate, setOpenDate] = useState("");
  const [closeDate, setCloseDate] = useState("");
  const [description, setDescription] = useState("");
  const [emotion, setEmotion] = useState("");
  const [setupId, setSetupId] = useState("");
  const [respects, setRespects] = useState<Record<string, boolean>>({});
  const [screenshots, setScreenshots] = useState<string[]>([]);

  const isEdit = !!initial;

  // Reset/populate alla apertura
  useEffect(() => {
    if (!open) return;
    const now = new Date().toISOString();
    if (initial) {
      const accAvailable = db.accounts.some((a) => a.id === initial.accountId);
      setAccountId(accAvailable ? initial.accountId : db.accounts.find((a) => !a.archived)?.id ?? "");
      setInstrument(initial.instrument);
      setDirection(initial.direction);
      setEntry(initial.entry != null ? String(initial.entry) : "");
      setExit(initial.exit != null ? String(initial.exit) : "");
      setStop(initial.stop != null ? String(initial.stop) : "");
      setTarget(initial.target != null ? String(initial.target) : "");
      setSize(initial.size != null ? String(initial.size) : "");
      setResultNative(String(initial.resultNative));
      setResultR(String(initial.resultR));
      setOpenDate(isoToLocalInput(initial.openDate) || isoToLocalInput(now));
      setCloseDate(isoToLocalInput(initial.closeDate) || isoToLocalInput(now));
      setDescription(initial.description ?? "");
      setEmotion(initial.emotion ?? "");
      setSetupId(initial.setupId ?? "");
      setScreenshots(initial.screenshots ?? []);
      // rispetta da TradeSetupRule esistenti (default true per le attive)
      const existing = db.tradeSetupRules.filter((r) => r.tradeId === initial.id);
      const map: Record<string, boolean> = {};
      rulesOfSetup(db, initial.setupId ?? "")
        .filter((r) => r.active)
        .forEach((r) => {
          const entryRule = existing.find((x) => x.ruleId === r.id);
          map[r.id] = entryRule ? entryRule.respected : true;
        });
      setRespects(map);
    } else {
      const first = db.accounts.find((a) => !a.archived) ?? db.accounts[0];
      setAccountId(first?.id ?? "");
      setInstrument("");
      setDirection("long");
      setEntry("");
      setExit("");
      setStop("");
      setTarget("");
      setSize("");
      setResultNative("");
      setResultR("");
      setOpenDate(isoToLocalInput(now));
      setCloseDate(isoToLocalInput(now));
      setDescription("");
      setEmotion("");
      setSetupId("");
      setRespects({});
      setScreenshots([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  const activeAccounts = useMemo(() => {
    let arch = db.accounts.filter((a) => !a.archived);
    if (!arch.length) arch = db.accounts;
    if (initial && initial.accountId && !arch.some((a) => a.id === initial.accountId)) {
      const acc = db.accounts.find((a) => a.id === initial.accountId);
      if (acc) arch = [...arch, acc];
    }
    return arch;
  }, [db.accounts, initial]);

  const account = getAccount(db, accountId);
  const currency = account?.nativeCurrency ?? db.settings.baseCurrency;

  // ---- setup → regole attive con checkbox ----
  const activeRules = useMemo(() => {
    if (!setupId) return [];
    return rulesOfSetup(db, setupId).filter((r) => r.active);
  }, [db, setupId]);

  const handleSetupChange = (val: string) => {
    setSetupId(val);
    const rules = val ? rulesOfSetup(db, val).filter((r) => r.active) : [];
    const map: Record<string, boolean> = {};
    rules.forEach((r) => {
      map[r.id] = true;
    });
    setRespects(map);
  };

  const toggleRespect = (ruleId: string) => {
    setRespects((prev) => ({ ...prev, [ruleId]: !(prev[ruleId] ?? true) }));
  };

  const respectedCount = activeRules.reduce((n, r) => n + (respects[r.id] ?? true ? 1 : 0), 0);

  // ---- validazione ----
  const rn = parseFloat(resultNative.replace(",", "."));
  const rr = parseFloat(resultR.replace(",", "."));
  const valid =
    !!accountId &&
    instrument.trim().length > 0 &&
    !isNaN(rn) &&
    !isNaN(rr);

  const handleSubmit = () => {
    if (!valid) return;
    const payload: TradePayload = {
      id: initial?.id,
      accountId,
      instrument: instrument.trim(),
      direction,
      entry: numOrNull(entry),
      exit: numOrNull(exit),
      stop: numOrNull(stop),
      target: numOrNull(target),
      size: numOrNull(size),
      resultNative: numOrZero(resultNative),
      resultR: numOrZero(resultR),
      openDate: localInputToISO(openDate),
      closeDate: localInputToISO(closeDate),
      screenshots,
      description: description.trim() ? description.trim() : undefined,
      setupId: setupId || null,
      emotion: emotion.trim() ? emotion.trim() : undefined,
      createdAt: initial?.createdAt,
    };
    const rules = activeRules.map((r) => ({ ruleId: r.id, respected: respects[r.id] ?? true }));
    onSave({ trade: payload, rules });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          {isEdit ? "Modifica trade" : "Nuovo trade"}
          <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
            {isEdit ? "modifica" : "registrazione"}
          </span>
        </span>
      }
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={handleSubmit} disabled={!valid} glow className="grad-animated">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            Salva trade
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <FormSection title="Dettagli">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Account">
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="" disabled>
                  Seleziona account
                </option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.archived ? " (archiviato)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Strumento">
              <Input
                value={instrument}
                onChange={(e) => setInstrument(e.target.value)}
                placeholder="es. ES, NQ, EURUSD…"
              />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Esecuzione">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Direzione">
              <Select value={direction} onChange={(e) => setDirection(e.target.value as TradeDirection)}>
                <option value="long">Long ▲</option>
                <option value="short">Short ▼</option>
              </Select>
            </Field>
            <Field label="Entry">
              <Input value={entry} onChange={(e) => setEntry(e.target.value)} inputMode="decimal" placeholder="—" />
            </Field>
            <Field label="Exit">
              <Input value={exit} onChange={(e) => setExit(e.target.value)} inputMode="decimal" placeholder="—" />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Stop">
              <Input value={stop} onChange={(e) => setStop(e.target.value)} inputMode="decimal" placeholder="—" />
            </Field>
            <Field label="Target">
              <Input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" placeholder="—" />
            </Field>
            <Field label="Size">
              <Input value={size} onChange={(e) => setSize(e.target.value)} inputMode="decimal" placeholder="—" />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Risultato">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={`Risultato · ${currencySymbol(currency)} (può essere negativo)`}>
              <Input
                type="number"
                step="any"
                value={resultNative}
                onChange={(e) => setResultNative(e.target.value)}
                placeholder="es. 125.50 oppure -80"
              />
            </Field>
            <Field label="Risultato · R">
              <Input
                type="number"
                step="any"
                value={resultR}
                onChange={(e) => setResultR(e.target.value)}
                placeholder="es. 2.5 oppure -1"
              />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Timing">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Apertura">
              <Input type="datetime-local" value={openDate} onChange={(e) => setOpenDate(e.target.value)} />
            </Field>
            <Field label="Chiusura">
              <Input type="datetime-local" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Emozione">
              <Input
                list="ascend-emotions"
                value={emotion}
                onChange={(e) => setEmotion(e.target.value)}
                placeholder="Calmo, Focus, FOMO…"
              />
              <datalist id="ascend-emotions">
                {EMOTIONS.map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
            </Field>
            <Field label="Setup (opzionale)">
              <Select value={setupId} onChange={(e) => handleSetupChange(e.target.value)}>
                <option value="">Nessun setup</option>
                {db.setups.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </FormSection>

        <FormSection title="Descrizione">
          <TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Contesto, esecuzione, note…"
          />
        </FormSection>

        {setupId && (
          <div className="rounded-xl border border-border bg-muted/25 p-3.5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-secondary-text">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Regole del setup — rispettate?
              </p>
              {activeRules.length > 0 && (
                <span className="tnum rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
                  {respectedCount}/{activeRules.length}
                </span>
              )}
            </div>

            {activeRules.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nessuna regola attiva per questo setup.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {activeRules.map((r) => {
                  const ok = respects[r.id] ?? true;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggleRespect(r.id)}
                      aria-pressed={ok}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200 active:scale-[0.97]",
                        ok
                          ? "border-accent/60 bg-accent/15 text-foreground shadow-[0_0_16px_-2px_var(--accent-glow)]"
                          : "border-border-strong bg-muted/60 text-muted-foreground hover:border-danger/40 hover:text-secondary-text"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold transition-colors",
                          ok
                            ? "border-accent bg-accent text-white shadow-[0_0_8px_var(--accent-glow)]"
                            : "border-border-strong bg-elevated text-muted-foreground"
                        )}
                      >
                        {ok ? "✓" : "✗"}
                      </span>
                      <span className={cn("max-w-[230px] truncate", !ok && "opacity-70 line-through")}>{r.text}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <FormSection title="Screenshot">
          <ScreenshotUploader value={screenshots} onChange={setScreenshots} />
        </FormSection>
      </div>
    </Modal>
  );
}
