"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { updateDB, uid } from "@/lib/storage";
import { cn } from "@/lib/cn";
import type { PCUsageLog } from "@/lib/types";
import { aggregateSamples, type TrackerSample } from "@/lib/pc-tracker";

interface AutoTrackerImportProps {
  onClose?: () => void;
}

export function AutoTrackerImport({ onClose }: AutoTrackerImportProps) {
  const [status, setStatus] = useState<"idle" | "reading" | "processing" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);

  async function readJsonlFile(file: File): Promise<TrackerSample[]> {
    const text = await file.text();
    const lines = text.trim().split("\n").filter((l) => l.trim());
    return lines
      .map((line) => {
        try {
          return JSON.parse(line) as TrackerSample;
        } catch {
          return null;
        }
      })
      .filter((x): x is TrackerSample => Boolean(x && typeof x.ts === "string" && typeof x.exe === "string"));
  }

  async function handleImport() {
    setStatus("reading");
    setMessage("Lettura file in corso...");

    try {
      const entries: TrackerSample[] = [];

      if (dirHandle) {
        // Cartella selezionata via File System Access API
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for await (const [name, handle] of (dirHandle as any).entries()) {
          if (handle.kind === "file" && name.endsWith(".jsonl")) {
            const file = await handle.getFile();
            const entriesFromFile = await readJsonlFile(file);
            entries.push(...entriesFromFile);
          }
        }
      } else {
        setStatus("error");
        setMessage("Seleziona prima una cartella");
        return;
      }

      if (entries.length === 0) {
        setStatus("error");
        setMessage("Nessun dato trovato nei file .jsonl");
        return;
      }

      setStatus("processing");
      setMessage(`Elaborazione ${entries.length} campioni...`);

      const aggregated = aggregateSamples(entries);

      // Upsert in DB
      let inserted = 0;
      updateDB((d) => {
        const next = { ...d };
        next.pcUsageLogs = [...(d.pcUsageLogs ?? [])];

        for (const [key, minutes] of Object.entries(aggregated)) {
          const [date, category] = key.split("|");
          if (minutes <= 0) continue;

          // Cerca se esiste già entry per quel giorno+categoria
          const idx = next.pcUsageLogs.findIndex(
            (l) => l.date === date && l.categoryId === category
          );

          const entry: PCUsageLog = {
            id: uid(),
            date,
            categoryId: category,
            minutes,
            source: "auto",
            createdAt: new Date().toISOString(),
          };

          if (idx >= 0) {
            next.pcUsageLogs[idx] = { ...next.pcUsageLogs[idx], minutes: next.pcUsageLogs[idx].minutes + minutes };
          } else {
            next.pcUsageLogs.push(entry);
            inserted++;
          }
        }
        return next;
      });

      setStatus("done");
      setMessage(`Import completato: ${inserted} nuove voci, ${Object.keys(aggregated).length} aggregazioni giorno+categoria`);
    } catch (err) {
      console.error(err);
      setStatus("error");
      setMessage(`Errore: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function pickFolder() {
    try {
      if (!("showDirectoryPicker" in window)) {
        alert("File System Access API non supportata in questo browser. Usa Chrome/Edge.");
        return;
      }
      const handle = await (
        window as Window & {
          showDirectoryPicker: (opts?: { mode: "read" }) => Promise<FileSystemDirectoryHandle>;
        }
      ).showDirectoryPicker({ mode: "read" });
      setDirHandle(handle);
      setMessage("Cartella selezionata. Clicca Importa.");
    } catch (err) {
      console.error(err);
      setMessage("Selezione annullata");
    }
  }

  return (
    <Card className="w-full max-w-2xl">
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Icon name="download" size={24} className="text-accent" />
          <div>
            <h3 className="font-semibold text-lg">Importa Auto-Tracker</h3>
            <p className="text-sm text-muted-foreground">
              Importa i dati dell&apos;auto-tracker (file .jsonl) in Uso PC
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <Button
            variant="outline"
            size="lg"
            className="w-full justify-start gap-2"
            onClick={pickFolder}
            disabled={status === "reading" || status === "processing"}
          >
            <Icon name="download" size={18} />
            <span>Seleziona cartella tracker</span>
            {dirHandle && <span className="text-xs text-success ml-auto">✓ Cartella selezionata</span>}
          </Button>

          <Button
            variant="primary"
            size="lg"
            className="w-full justify-center gap-2"
            onClick={handleImport}
            disabled={status === "reading" || status === "processing" || !dirHandle}
          >
            {status === "processing" && <span className="animate-spin">⟳</span>}
            <span>{status === "processing" ? "Importazione..." : "Importa dati"}</span>
          </Button>
        </div>

        {(status === "done" || status === "error") && (
          <div
            className={cn(
              "p-3 rounded-lg text-sm",
              status === "done"
                ? "bg-success/10 text-success border border-success/20"
                : "bg-danger/10 text-danger border border-danger/20"
            )}
          >
            {message}
          </div>
        )}

        <div className="pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground mb-2">
            Il tracker PowerShell scrive file <code>.jsonl</code> giornalieri in
            <code>%APPDATA%\\\\Ascend\\\\pc-usage\\\\</code>.
          </p>
          <ul className="text-xs text-muted-foreground space-y-1 ml-4">
            <li>• Formato: JSON Lines (una riga = 1 campione 30s)</li>
            <li>• Campi: timestamp, exe, title, pid, hwnd</li>
            <li>• Aggregazione: per giorno + categoria (minuti, 1 decimale)</li>
            <li>• Categorie: Web, Dev, Communication, Design, Productivity, Media, System, Gaming, Other</li>
          </ul>
        </div>

        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose} className="w-full">
            Chiudi
          </Button>
        )}
      </div>
    </Card>
  );
}