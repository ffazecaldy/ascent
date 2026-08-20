"use client";
// ============================================================
// ASCEND — Impostazioni · Hint PWA
// "Usa Install app di Chrome/Edge per usare Ascend come app."
// ============================================================

import { Card } from "@/components/ui/Card";

export function PwaHint() {
  return (
    <Card className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-2xl">
        📲
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">Usa Ascend come app</p>
        <p className="mt-0.5 text-xs leading-relaxed text-secondary-text">
          Usa &quot;Install app&quot; di Chrome/Edge (o l&apos;icona di installazione nella barra degli
          indirizzi) per aggiungere Ascend alla barra delle applicazioni: si apre a schermo intero, con
          la sua icona, come una vera app.
        </p>
      </div>
    </Card>
  );
}
