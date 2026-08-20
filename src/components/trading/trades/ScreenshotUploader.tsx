"use client";

// ============================================================
// ASCEND — Trade log: caricamento screenshot (drop + paste + browse)
// Riceve file/data URL → comprime via canvas (max 1200px, JPEG 0.7)
// → salva in trade.screenshots[] (max 4). Anteprime con click per ingrandire.
// Art-direction: dropzone con bordo tratteggiato + hint "Ctrl+V per incollare"
// + hover con glow, anteprime con hover zoom.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { compressImage, readAsDataURL } from "./trade-utils";
import { Lightbox } from "./Lightbox";

const MAX = 4;

export function ScreenshotUploader({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [view, setView] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const add = useCallback(async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    setBusy(true);
    setError(null);
    try {
      const next: string[] = [];
      for (const file of images) {
        if ((valueRef.current.length + next.length) >= MAX) break;
        const raw = await readAsDataURL(file);
        const compressed = await compressImage(raw);
        next.push(compressed);
      }
      if (next.length) {
        valueRef.current = [...valueRef.current, ...next];
        onChange(valueRef.current);
      } else {
        setError("Hai già raggiunto il massimo di 4 screenshot.");
      }
    } catch {
      setError("Immagine non valida o troppo grande.");
    } finally {
      setBusy(false);
    }
  }, [onChange]);

  // Ctrl+V / paste da clipboard su tutta la pagina (il form è aperto)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) {
        e.preventDefault();
        void add(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [add]);

  const remove = (i: number) => {
    const next = value.filter((_, idx) => idx !== i);
    valueRef.current = next;
    onChange(next);
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer?.files?.length) void add(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          "group relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-7 text-center transition-[border-color,background-color,box-shadow,transform] duration-200",
          dragOver
            ? "scale-[1.01] border-accent bg-accent/10 shadow-[0_0_28px_-6px_var(--accent-glow)]"
            : "border-border-strong bg-muted/30 hover:border-accent/60 hover:bg-accent/[0.05] hover:shadow-[0_0_22px_-8px_var(--accent-glow)]"
        )}
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-elevated text-xl shadow-[--shadow-card] transition-transform duration-200 group-hover:scale-110 group-hover:border-accent/40">
          📷
        </div>
        <p className="text-xs font-medium text-secondary-text">Trascina gli screenshot qui</p>
        <div className="flex items-center gap-1.5">
          <kbd className="rounded-md border border-border-strong bg-elevated px-1.5 py-0.5 font-mono text-[11px] font-semibold text-accent">
            Ctrl
          </kbd>
          <span className="text-[11px] text-muted-foreground">+</span>
          <kbd className="rounded-md border border-border-strong bg-elevated px-1.5 py-0.5 font-mono text-[11px] font-semibold text-accent">
            V
          </kbd>
          <span className="text-[11px] text-muted-foreground">per incollare</span>
        </div>
        <p className="text-[11px] text-secondary-text">
          oppure clicca per selezionare · {value.length}/{MAX} · compresse automaticamente
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : [];
          if (files.length) void add(files);
          e.target.value = "";
        }}
      />

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      {busy && <p className="mt-2 text-xs text-muted-foreground">Compressione in corso…</p>}

      {value.length > 0 && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {value.map((s, i) => (
            <div key={i} className="group/thumb relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s}
                alt={`Screenshot ${i + 1}`}
                onClick={() => setView(s)}
                className="h-16 w-full cursor-zoom-in rounded-md border border-border-strong object-cover transition-[transform,border-color,box-shadow] duration-200 group-hover/thumb:z-10 group-hover/thumb:scale-[1.35] group-hover/thumb:border-accent/60 group-hover/thumb:shadow-[0_12px_28px_-8px_rgba(0,0,0,0.85)]"
              />
              <button
                onClick={() => remove(i)}
                aria-label="Rimuovi screenshot"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border-strong bg-card text-[10px] text-muted-foreground opacity-0 shadow transition-[color,background-color,opacity] hover:bg-danger/20 hover:text-danger group-hover/thumb:opacity-100"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <Lightbox open={!!view} src={view} onClose={() => setView(null)} />
    </div>
  );
}
