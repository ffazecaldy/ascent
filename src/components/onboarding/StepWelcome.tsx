"use client";

export function StepWelcome() {
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-2xl font-bold text-white shadow-sm">
        A
      </div>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Benvenuto su Ascend</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Un unico sistema quotidiano per costruire la versione di te che vuoi essere — con dati, non promesse.
        </p>
      </div>
      <p className="text-xs text-muted-foreground">Tre passaggi, circa un minuto.</p>
    </div>
  );
}
