"use client";

export function StepWelcome() {
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      {/* logo con alone animato */}
      <div className="relative">
        <div className="absolute inset-0 animate-pulse rounded-2xl bg-accent/25 blur-xl" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-2xl font-bold text-white shadow-[0_10px_30px_-8px_var(--accent-glow)]">
          A
        </div>
      </div>

      <div>
        <p className="mb-2 flex items-center justify-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
          <span className="h-1 w-1 rounded-full bg-accent" />
          Configurazione iniziale
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Benvenuto su <span className="grad-text">Ascend</span>
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Un unico sistema quotidiano per costruire la versione di te che vuoi essere — con dati, non
          promesse.
        </p>
      </div>

      <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-[11px] font-medium text-accent">
        <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-accent" />
        Tre passaggi, circa un minuto
      </span>
    </div>
  );
}
