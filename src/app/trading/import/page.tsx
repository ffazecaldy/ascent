"use client";

// ============================================================
// ASCEND — Import storico trade da CSV (spec v3 §4.3 · subagent 8)
// Wizard: account → incollato/file + separatore → anteprima (10 righe,
// errori evidenziati) → "Importa N trade" → riepilogo + link a statistiche.
// Le righe scartate sono SEMPRE warning: non bloccano mai le valide.
// ============================================================

import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Trade, TradingAccount } from "@/lib/types";
import { useDB, updateDB, uid, nowISO } from "@/lib/storage";
import { getAccount } from "@/lib/db";
import { formatSignedMoney, formatR } from "@/lib/format";
import { parseTradesCsv, type ParseResult } from "@/lib/import-csv";
import { SectionHeader, EmptyState } from "@/components/ui/Misc";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Select, TextArea } from "@/components/ui/Field";
import { cn } from "@/lib/cn";

type Step = "account" | "csv" | "preview" | "done";

const SEPARATORS = [
  { id: "auto", label: "Auto (rileva)" },
  { id: ";", label: "Punto e virgola (;)" },
  { id: ",", label: "Virgola (,)" },
  { id: "\t", label: "Tab" },
] as const;

const STEP_ORDER: Step[] = ["account", "csv", "preview", "done"];
const STEP_LABELS: Record<Step, string> = {
  account: "1 · Account",
  csv: "2 · Dati CSV",
  preview: "3 · Anteprima",
  done: "4 · Fatto",
};

function fmtDateTime(iso: string): string {
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return iso;
  return dt.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ImportPage() {
  const db = useDB();

  const [step, setStep] = useState<Step>("account");
  const [accountId, setAccountId] = useState<string>("");
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState<string>("");
  const [separator, setSeparator] = useState<(typeof SEPARATORS)[number]["id"]>("auto");
  const [hasHeader, setHasHeader] = useState(true);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [imported, setImported] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const accounts = db.accounts.filter((a) => !a.archived);
  const activeAccounts = accounts.length > 0 ? accounts : db.accounts;
  const account: TradingAccount | undefined = accountId ? getAccount(db, accountId) : undefined;

  // ---------- step 1: account ----------
  const startAccount = (id: string) => {
    setAccountId(id);
    setStep("csv");
  };

  // ---------- step 2: parse ----------
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setCsvText(text);
      parse(text);
    };
    reader.readAsText(f, "utf-8");
    e.target.value = "";
  };

  const parse = (text: string) => {
    const res = parseTradesCsv(text, {
      separator,
      hasHeader,
    });
    setParsed(res);
    setImported(null);
    setStep("preview");
  };

  const onParseClick = () => {
    if (!csvText.trim()) return;
    parse(csvText);
  };

  // ---------- step 3: import ----------
  const previewRows = useMemo(() => parsed?.rows.slice(0, 10) ?? [], [parsed]);
  const skippedRows = useMemo(() => parsed?.errors ?? [], [parsed]);

  const doImport = () => {
    if (!parsed || !accountId) return;
    const now = nowISO();
    updateDB((d) => ({
      ...d,
      trades: [
        ...d.trades,
        ...parsed.rows.map(
          (r): Trade => ({
            id: uid(),
            accountId,
            instrument: r.instrument ?? "—",
            direction: r.direction ?? "long",
            entry: r.entry ?? null,
            exit: r.exit ?? null,
            size: r.size ?? null,
            stop: r.stop ?? null,
            target: r.target ?? null,
            resultNative: r.resultNative ?? 0,
            resultR: r.resultR ?? 0,
            openDate: r.openDate ?? now,
            closeDate: r.closeDate ?? now,
            screenshots: [],
            description:
              [r.setup ? `Setup: ${r.setup}` : null, r.notes ? r.notes : null]
                .filter(Boolean)
                .join(" · ") || undefined,
            setupId: null,
            createdAt: now,
          })
        ),
      ],
    }));
    setImported(parsed.valid);
    setStep("done");
  };

  const resetAll = () => {
    setCsvText("");
    setFileName("");
    setParsed(null);
    setImported(null);
    setSeparator("auto");
    setHasHeader(true);
    setStep("account");
  };

  const currency = account?.nativeCurrency ?? db.settings.baseCurrency;

  return (
    <div className="mx-auto max-w-5xl">
      <SectionHeader
        title="Import storico"
        subtitle="Carica i trade passati (Edgewonk, Tradervue, myfundedbook, TradingView o CSV generico) nel tuo journal."
      />

      {/* stepper */}
      <div className="mb-6 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {STEP_ORDER.map((s, i) => {
          const activeIdx = STEP_ORDER.indexOf(step);
          const reached = activeIdx >= i;
          const completed = activeIdx > i || (step === "done" && i < STEP_ORDER.length - 1);
          return (
            <React.Fragment key={s}>
              <span className={cn("flex items-center gap-1.5", reached ? "text-accent" : "")}>
                <span
                  className={cn(
                    "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
                    completed
                      ? "bg-accent text-white"
                      : reached
                        ? "bg-accent/20 text-accent"
                        : "bg-elevated text-muted-foreground"
                  )}
                >
                  {i + 1}
                </span>
                {STEP_LABELS[s]}
              </span>
              {i < STEP_ORDER.length - 1 && <span className="h-px w-6 bg-border-strong" />}
            </React.Fragment>
          );
        })}
      </div>

      {/* ============================ STEP 1: ACCOUNT ============================ */}
      {step === "account" && (
        <>
          {activeAccounts.length === 0 ? (
            <Card>
              <EmptyState
                icon="📥"
                title="Nessun account di trading"
                description="Crea prima un account (prop o personale): i trade importati saranno associati a un account."
                action={
                  <Link href="/trading/accounts">
                    <Button size="sm">Crea account</Button>
                  </Link>
                }
              />
            </Card>
          ) : (
            <Card className="p-5">
              <CardHeader>
                <CardTitle>Scegli l'account di destinazione</CardTitle>
                <CardSubtitle>
                  Obbligatorio: ogni trade viene registrato su un account (valuta nativa e trading day propri).
                </CardSubtitle>
              </CardHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                {activeAccounts.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => startAccount(a.id)}
                    className="rounded-xl border border-border-strong bg-muted p-4 text-left transition-colors hover:border-accent hover:bg-elevated"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{a.name}</span>
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {a.type === "prop" ? "Prop" : "Personale"}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {a.nativeCurrency}
                      {a.status ? ` · ${a.status}` : ""}
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {/* ============================ STEP 2: CSV ============================ */}
      {step === "csv" && (
        <Card className="p-5">
          <CardHeader>
            <CardTitle>Dati CSV</CardTitle>
            <CardSubtitle>
              Incolla il testo o carica un file. Separatore e header regolabili prima dell'analisi.
            </CardSubtitle>
          </CardHeader>

          <div className="mb-4 flex items-center gap-3">
            <span className="text-sm text-secondary-text">
              Importazione su <span className="font-semibold text-foreground">{account?.name}</span>
            </span>
            <Button variant="ghost" size="sm" onClick={() => setStep("account")}>
              Cambia account
            </Button>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <Field label="Separatore">
              <Select
                value={separator}
                onChange={(e) => setSeparator(e.target.value as (typeof SEPARATORS)[number]["id"])}
              >
                {SEPARATORS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Intestazione">
              <Select value={hasHeader ? "1" : "0"} onChange={(e) => setHasHeader(e.target.value === "1")}>
                <option value="1">La prima riga è l'intestazione</option>
                <option value="0">Nessuna intestazione (ordine fisso)</option>
              </Select>
            </Field>
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              📁 Carica file…
            </Button>
            <span className="text-xs text-muted-foreground">
              {fileName ? `File: ${fileName}` : "Oppure incolla sotto"}
            </span>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={onFile} />

          <TextArea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={12}
            placeholder={
              "Date,Time,Symbol,Buy/Sell,Entry,Exit,Stop Loss,Take Profit,Lots,P/L$,R,Notes,Setup\n" +
              "2024-01-02 09:30:00,2024-01-02 11:15:00,EURUSD,Buy,1.1042,1.1080,1.1030,1.1110,1.00,380,2.0,News breakout,RS\n" +
              "— Colonne riconosciute (incluse): Date/Time, Symbol, Buy/Sell, Entry, Exit, Stop Loss,\n" +
              "  Take Profit, Lots/Size, P/L$, R, Notes, Setup. Valute e parentesi negative OK."
            }
            className="font-mono text-xs"
          />

          <div className="mt-4 flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={resetAll}>
              Annulla
            </Button>
            <Button onClick={onParseClick} disabled={!csvText.trim()}>
              Analizza CSV →
            </Button>
          </div>
        </Card>
      )}

      {/* ============================ STEP 3: ANTEPRIMA ============================ */}
      {step === "preview" && parsed && (
        <div className="space-y-4">
          {/* meta + contatori */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Righe valide</span>
              <span className="mt-1 block text-2xl font-semibold tnum text-success">{parsed.valid}</span>
            </Card>
            <Card className="p-4">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Righe scartate</span>
              <span className="mt-1 block text-2xl font-semibold tnum text-yellow-500">{parsed.skipped}</span>
            </Card>
            <Card className="p-4">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">CSV rilevato</span>
              <span className="mt-1 block text-2xl font-semibold tnum">
                {parsed.meta.separator === "\t" ? "tab" : `«${parsed.meta.separator}»`}
              </span>
              <span className="text-xs text-muted-foreground">
                {parsed.meta.recognized.length}/{parsed.meta.columnCount} colonne riconosciute
              </span>
            </Card>
          </div>

          {parsed.meta.unknown.length > 0 && (
            <p className="text-xs text-muted-foreground">
              ⚠ Colonne non riconosciute (ignorate): {parsed.meta.unknown.join(", ")}
            </p>
          )}

          {/* anteprima 10 righe */}
          <Card>
            <CardHeader>
              <CardTitle>Anteprima (prime {previewRows.length} righe)</CardTitle>
              <CardSubtitle>Righe valide pronte per l'import. I warning evidenziati non bloccano.</CardSubtitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Data apertura</th>
                    <th className="px-3 py-2 font-medium">Strumento</th>
                    <th className="px-3 py-2 font-medium">Dir</th>
                    <th className="px-3 py-2 text-right font-medium">Entry</th>
                    <th className="px-3 py-2 text-right font-medium">Exit</th>
                    <th className="px-3 py-2 text-right font-medium">P/L</th>
                    <th className="px-3 py-2 text-right font-medium">R</th>
                    <th className="px-3 py-2 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r) => {
                    const warn = r.issues.filter((x) => x.severity === "warning");
                    return (
                      <tr key={r.rowIndex} className={cn("border-b border-border/50", warn.length > 0 && "bg-yellow-500/5")}>
                        <td className="px-3 py-2 tnum text-muted-foreground">{r.rowIndex}</td>
                        <td className="px-3 py-2 tnum text-secondary-text">{r.openDate ? fmtDateTime(r.openDate) : "—"}</td>
                        <td className="px-3 py-2 font-medium">{r.instrument}</td>
                        <td className="px-3 py-2">
                          <span className={cn("text-xs font-semibold", r.direction === "long" ? "text-success" : "text-danger")}>
                            {r.direction === "long" ? "LONG" : "SHORT"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tnum">{r.entry != null ? r.entry : "—"}</td>
                        <td className="px-3 py-2 text-right tnum">{r.exit != null ? r.exit : "—"}</td>
                        <td
                          className={cn(
                            "px-3 py-2 text-right font-medium tnum",
                            (r.resultNative ?? 0) > 0 ? "text-success" : (r.resultNative ?? 0) < 0 ? "text-danger" : ""
                          )}
                        >
                          {r.resultNative != null ? formatSignedMoney(r.resultNative, currency) : "—"}
                        </td>
                        <td className={cn("px-3 py-2 text-right tnum", (r.resultR ?? 0) > 0 ? "text-success" : (r.resultR ?? 0) < 0 ? "text-danger" : "")}>
                          {r.resultR != null ? formatR(r.resultR) : "—"}
                        </td>
                        <td className="max-w-[180px] px-3 py-2">
                          {warn.length > 0 ? (
                            <span className="flex items-center gap-1 text-xs text-yellow-500" title={warn.map((w) => w.message).join(" · ")}>
                              ⚠ {warn.length}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {previewRows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-3 py-8 text-center text-xs text-muted-foreground">
                        Nessuna riga valida da importare.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* righe scartate → warning, mai blocco */}
          {skippedRows.length > 0 && (
            <Card className="border-yellow-500/30">
              <CardHeader>
                <CardTitle>Righe scartate ({skippedRows.length}) — non bloccano l'import</CardTitle>
                <CardSubtitle>
                  Queste righe non verranno importate ma le righe valide sì. Corrigile nel file e ri-analizza se vuoi recuperarle.
                </CardSubtitle>
              </CardHeader>
              <ul className="max-h-56 space-y-1 overflow-y-auto px-5 pb-5">
                {skippedRows.slice(0, 100).map((e, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <span className="mt-px shrink-0 rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-semibold text-danger">
                      riga {e.line}
                    </span>
                    <span className="text-secondary-text">{e.message}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep("csv")}>
              ← Modifica CSV
            </Button>
            <Button size="lg" onClick={doImport} disabled={parsed.valid === 0}>
              Importa {parsed.valid} trade
            </Button>
          </div>
        </div>
      )}

      {/* ============================ STEP 4: FATTO ============================ */}
      {step === "done" && (
        <Card className="p-8 text-center">
          <div className="mb-3 text-4xl">✅</div>
          <h2 className="text-xl font-semibold">
            {imported} trade importati su {account?.name ?? "account"}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            I trade sono nel journal con setup non associato. Le statistiche verranno aggiornate automaticamente.
          </p>
          {parsed && parsed.skipped > 0 && (
            <p className="mt-2 text-xs text-yellow-500">
              ⚠ {parsed.skipped} righe scartate: non sono state importate.
            </p>
          )}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Link href="/trading/stats">
              <Button>Vai alle statistiche</Button>
            </Link>
            <Link href="/trading/trades">
              <Button variant="outline">Vedi il journal</Button>
            </Link>
            <Button variant="ghost" onClick={resetAll}>
              Importa un altro file
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
