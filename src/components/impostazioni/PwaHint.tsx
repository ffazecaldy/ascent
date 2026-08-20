"use client";
// ============================================================
// ASCEND — Impostazioni · Hint PWA
// "Usa Install app di Chrome/Edge per usare Ascend come app."
// ============================================================

import React from "react";
import { Card } from "@/components/ui/Card";

export function PwaHint() {
  return (
    <Card className="group flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-accent/25 bg-accent/15 text-2xl shadow-[0_0_18px_-6px_var(--accent-glow)] transition-transform duration-200 group-hover:scale-105">
        📲
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          Usa Ascend come app
          <span className="hidden items-center gap-1 rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent sm:inline-flex">
            PWA
          </span>
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-secondary-text">
          Usa &quot;Install app&quot; di Chrome/Edge (o l&apos;icona di installazione nella barra degli
          indirizzi) per aggiungere Ascend alla barra delle applicazioni: si apre a schermo intero, con
          la sua icona, come una vera app.
        </p>
      </div>
      <span className="hidden text-accent transition-transform duration-200 group-hover:translate-x-1 sm:block">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14m0 0-6-6m6 6-6 6" />
        </svg>
      </span>
    </Card>
  );
}
