"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { useDB, updateDB, uid, nowISO } from "@/lib/storage";
import { cn } from "@/lib/cn";
import type { PCUsageLog } from "@/lib/types";

interface AutoTrackerImportProps {
  onClose?: () => void;
}

export function AutoTrackerImport({ onClose }: AutoTrackerImportProps) {
  const [status, setStatus] = useState<"idle" | "reading" | "processing" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [count, setCount] = useState(0);
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);

  const db = useDB();

  // Mapping exe → categoria (subset, estendibile via mapping.json)
  const EXE_CATEGORY: Record<string, string> = {
    // Browser
    "chrome.exe": "Web", "firefox.exe": "Web", "msedge.exe": "Web", "brave.exe": "Web", "opera.exe": "Web", "vivaldi.exe": "Web",
    // Dev
    "code.exe": "Dev", "code-insiders.exe": "Dev", "pycharm64.exe": "Dev", "idea64.exe": "Dev", "webstorm64.exe": "Dev", "rider64.exe": "Dev", "clion64.exe": "Dev", "goland64.exe": "Dev", "phpstorm64.exe": "Dev", "rubymine64.exe": "Dev", "vim.exe": "Dev", "nvim.exe": "Dev", "notepad++.exe": "Dev", "sublime_text.exe": "Dev", "atom.exe": "Dev",
    "cmd.exe": "Dev", "powershell.exe": "Dev", "pwsh.exe": "Dev", "bash.exe": "Dev", "wsl.exe": "Dev", "git.exe": "Dev", "docker.exe": "Dev", "docker-compose.exe": "Dev",
    // Communication
    "teams.exe": "Communication", "slack.exe": "Communication", "discord.exe": "Communication", "whatsapp.exe": "Communication", "telegram.exe": "Communication", "signal.exe": "Communication", "skype.exe": "Communication", "zoom.exe": "Communication", "outlook.exe": "Communication",
    // Design
    "figma.exe": "Design", "photoshop.exe": "Design", "illustrator.exe": "Design", "afterfx.exe": "Design", "premiere.exe": "Design", "blender.exe": "Design", "unity.exe": "Design", "unrealeditor.exe": "Design",
    // Productivity
    "excel.exe": "Productivity", "winword.exe": "Productivity", "powerpnt.exe": "Productivity", "onenote.exe": "Productivity", "notion.exe": "Productivity", "obsidian.exe": "Productivity", "logseq.exe": "Productivity",
    // Media
    "spotify.exe": "Media", "vlc.exe": "Media", "mpv.exe": "Media", "wmplayer.exe": "Media", "foobar2000.exe": "Media", "youtube.exe": "Media", "youtubemusic.exe": "Media",
    // System
    "explorer.exe": "System", "taskmgr.exe": "System", "regedit.exe": "System", "msconfig.exe": "System", "services.exe": "System",
    // Gaming
    "steam.exe": "Gaming", "epicgameslauncher.exe": "Gaming", "origin.exe": "Gaming", "battle.net.exe": "Gaming", "gog.exe": "Gaming",
  };

  const TITLE_KEYWORDS: Record<string, string[]> = {
    Web: ["github", "gitlab", "stackoverflow", "docs", "api", "http", "web", "browser", "chrome", "firefox"],
    Dev: ["code", "git", "terminal", "bash", "python", "javascript", "typescript", "react", "vue", "node", "npm", "yarn", "docker", "kubernetes"],
    Communication: ["meeting", "call", "chat", "mail", "email", "message", "slack", "teams", "discord"],
    Design: ["figma", "design", "photoshop", "illustrator", "sketch", "adobe", "creative"],
    Productivity: ["notion", "obsidian", "notes", "task", "todo", "project", "plan", "excel", "word", "powerpoint"],
    Media: ["spotify", "music", "video", "youtube", "vlc", "media", "player"],
    System: ["settings", "control panel", "task manager", "registry", "services", "update"],
    Gaming: ["steam", "epic", "game", "play", "battle.net", "origin", "gog"],
  };

  function categorize(exe: string, title: string): string {
    const exeLower = exe.toLowerCase();
    if (EXE_CATEGORY[exeLower]) return EXE_CATEGORY[exeLower];

    const titleLower = title.toLowerCase();
    for (const [cat, keywords] of Object.entries(TITLE_KEYWORDS)) {
      if (keywords.some((k) => titleLower.includes(k.toLowerCase()))) {
        return cat;
      }
    }
    return "Other";
  }

  function aggregateMinutes(entries: Array<{ ts: string; exe: string; title: string }>): Record<string, number> {
    const byDayCat = new Map<string, number>();

    for (const e of entries) {
      const date = e.ts.split("T")[0];
      const cat = categorize(e.exe, e.title);
      const key = `${date}|${cat}`;
      const prev = byDayCat.get(key) ?? 0;
      // Ogni sample = 30 secondi = 0.5 minuti
      byDayCat.set(key, prev + 0.5);
    }

    const result: Record<string, number> = {};
    for (const [key, mins] of byDayCat.entries()) {
      // arrotonda a 1 decimale
      result[key] = Math.round(mins * 10) / 10;
    }
    return result;
  }

  async function readJsonlFile(file: File): Promise<Array<{ ts: string; exe: string; title: string }>> {
    const text = await file.text();
    const lines = text.trim().split("\n").filter((l) => l.trim());
    return lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter((x): x is { ts: string; exe: string; title: string } => x !== null);
  }

  async function handleImport() {
    setStatus("reading");
    setMessage("Lettura file in corso...");
    setCount(0);

    try {
      let entries: Array<{ ts: string; exe: string; title: string }> = [];

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

      const aggregated = aggregateMinutes(entries);

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

          const entry = {
                      id: uid(),
                      date,
                      categoryId: category,
                      minutes,
                      source: "auto" as const,
                      createdAt: new Date().toISOString(),
                    };

          if (idx >= 0) {
            next.pcUsageLogs[idx] = { ...next.pcUsageLogs[idx], minutes: next.pcUsageLogs[idx].minutes + minutes };
          } else {
            next.pcUsageLogs.push(entry as unknown as PCUsageLog);
            inserted++;
          }
        }
        return next;
      });

      setStatus("done");
      setMessage(`Import completato: ${inserted} nuove voci, ${Object.keys(aggregated).length} aggregazioni giorno+categoria`);
      setCount(inserted);
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
      const handle = await (window as any).showDirectoryPicker({ mode: "read" });
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