"use client";
// ============================================================
// ASCEND — Popup flottante "registrazione attiva" (app-wide)
// Visibile su OGNI pagina mentre il tracker sta registrando:
// dot verde pulsante + cronometro HH:MM:SS + pulsante Ferma.
// La registrazione è gestita dal modulo globale (src/lib/pc-record.ts):
// navigare tra le pagine NON la ferma, e sopravvive a reload/riavvio.
// ============================================================
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { formatDurHMS } from "@/lib/pc-tracker";
import {
  getRecordState,
  getRecordStateServer,
  restoreIfNeeded,
  stopRecord,
  subscribeRecord,
} from "@/lib/pc-record";
import { Icon } from "@/components/ui/Icon";

export function TrackerFloating() {
  const state = useSyncExternalStore(subscribeRecord, getRecordState, getRecordStateServer);
  const [now, setNow] = useState(() => Date.now());

  // all'avvio dell'app: riprende una registrazione rimasta attiva
  useEffect(() => {
    restoreIfNeeded();
  }, []);

  // tick del cronometro solo mentre registra
  useEffect(() => {
    if (!state.recording) return;
    queueMicrotask(() => setNow(Date.now()));
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [state.recording]);

  if (!state.recording || state.sessionStart === null) return null;

  const elapsed = formatDurHMS(Math.max(0, now - state.sessionStart));

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 top-3 z-40 -translate-x-1/2"
    >
      <div className="flex items-center gap-2 rounded-full border border-success/25 bg-elevated/90 py-1.5 pl-3 pr-1.5 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <span className="h-2 w-2 animate-pulse-dot rounded-full bg-success" />
        <span className="text-xs font-semibold text-success">Registrando</span>
        <Link
          href="/usopc/"
          className="tnum rounded-full bg-success/10 px-2.5 py-1 text-sm font-bold text-foreground transition-colors hover:bg-success/15"
          title="Apri Uso PC"
        >
          {elapsed}
        </Link>
        <button
          onClick={stopRecord}
          className="flex items-center gap-1.5 rounded-full bg-danger/15 px-3 py-1 text-xs font-semibold text-danger transition-colors hover:bg-danger/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
          title="Ferma la registrazione (i dati restano salvati in Uso PC)"
        >
          <Icon name="pause" size={13} />
          Ferma
        </button>
      </div>
    </div>
  );
}