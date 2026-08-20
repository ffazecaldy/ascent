"use client";
// ============================================================
// ASCEND — Impostazioni · Zona dati
// Reset totale (seedDB) con dialog di conferma + promemoria backup.
// ============================================================

import { useState } from "react";
import Link from "next/link";
import { useDB, updateDB } from "@/lib/storage";
import { seedDB } from "@/lib/db";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";

function Metric({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5 transition-colors hover:border-border-strong">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className="text-sm">{icon}</span>
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tnum">{value}</p>
    </div>
  );
}

export function DataZone() {
  const db = useDB();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const doReset = () => {
    updateDB(() => seedDB());
    setConfirmOpen(false);
  };

  return (
    <Card hairline="danger">
      <CardHeader>
        <div>
          <CardTitle>Dati</CardTitle>
          <CardSubtitle>
            Tutto è salvato in locale su questo browser/dispositivo (localStorage), senza server.
          </CardSubtitle>
        </div>
        <Badge tone="info">💾 localStorage</Badge>
      </CardHeader>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric icon="💶" label="Transazioni" value={db.transactions.length} />
        <Metric icon="🕹" label="Trade" value={db.trades.length} />
        <Metric icon="🏦" label="Account" value={db.accounts.length} />
        <Metric icon="🏷" label="Categorie" value={db.categories.length} />
      </div>

      <div className="relative mt-4 flex flex-col items-start justify-between gap-3 overflow-hidden rounded-xl border border-danger/20 bg-danger/5 p-3 sm:flex-row sm:items-center">
        <span className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b from-danger/70 to-danger/20" />
        <div className="pl-1.5">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <span className="text-base">🔥</span> Zona pericolosa
          </p>
          <p className="mt-0.5 text-xs text-secondary-text">
            Il reset totale cancella tutto e riporta Ascend allo stato iniziale.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/export">
            <Button variant="outline" className="hover:shadow-[0_0_18px_-6px_var(--accent-glow)]">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              Backup / Export
            </Button>
          </Link>
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            Reset totale
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={doReset}
        title="Reset totale — cancella tutto?"
        confirmLabel="Sì, cancella tutto"
        message="Eliminerà TUTTI i dati: transazioni, trade, account, categorie, obiettivi, libri, sport e impostazioni personalizzate. Ascend tornerà allo stato iniziale e ripartirai dall'onboarding. Consigliato: crea prima un backup dalla pagina Export."
      />
    </Card>
  );
}
