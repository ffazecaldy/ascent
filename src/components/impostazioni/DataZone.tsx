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

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tnum">{value}</p>
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
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Dati</CardTitle>
          <CardSubtitle>
            Tutto è salvato in locale su questo browser/dispositivo (localStorage), senza server.
          </CardSubtitle>
        </div>
        <Badge>💾 localStorage</Badge>
      </CardHeader>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Transazioni" value={db.transactions.length} />
        <Metric label="Trade" value={db.trades.length} />
        <Metric label="Account" value={db.accounts.length} />
        <Metric label="Categorie" value={db.categories.length} />
      </div>

      <div className="mt-4 flex flex-col items-start justify-between gap-3 rounded-lg border border-danger/20 bg-danger/5 p-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold text-foreground">Zona pericolosa</p>
          <p className="mt-0.5 text-xs text-secondary-text">
            Il reset totale cancella tutto e riporta Ascend allo stato iniziale.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/export">
            <Button variant="outline">📤 Backup / Export</Button>
          </Link>
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            🔥 Reset totale
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
