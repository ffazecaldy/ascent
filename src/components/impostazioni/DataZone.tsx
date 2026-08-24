"use client";
// ============================================================
// ASCEND — Impostazioni · Zona dati
// Reset totale (seedDB) con dialog di conferma + promemoria backup.
// ============================================================

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useDB, updateDB, purgeAscendStorage } from "@/lib/storage";
import { seedDB } from "@/lib/db";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5 transition-colors hover:border-border-strong">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
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
    // purga TUTTO lo storage Ascend (DB, snapshot di backup, ack banner,
    // timer studio…) e poi semina lo stato nuovo-utente: l'app riparte
    // dall'onboarding come al primo avvio. Il redirect con reload COMPLETO
    // elimina anche eventuale stato React obsoleto in memoria.
    purgeAscendStorage();
    updateDB(() => seedDB());
    setConfirmOpen(false);
    window.location.assign("/");
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
        <Badge tone="info">
          <Icon name="download" size={11} /> localStorage
        </Badge>
      </CardHeader>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric icon={<Icon name="coins" size={14} />} label="Transazioni" value={db.transactions.length} />
        <Metric icon={<Icon name="activity" size={14} />} label="Trade" value={db.trades.length} />
        <Metric icon={<Icon name="building" size={14} />} label="Account" value={db.accounts.length} />
        <Metric icon={<Icon name="tag" size={14} />} label="Categorie" value={db.categories.length} />
      </div>

      <div className="relative mt-4 flex flex-col items-start justify-between gap-3 overflow-hidden rounded-xl border border-danger/20 bg-danger/5 p-3 sm:flex-row sm:items-center">
        <span className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b from-danger/70 to-danger/20" />
        <div className="pl-1.5">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Icon name="flame" size={15} className="text-danger" /> Zona pericolosa
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-secondary-text">
            Il reset totale cancella tutto e riporta Ascend allo stato iniziale.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/export">
            <Button variant="outline" className="hover:shadow-[0_0_18px_-6px_var(--accent-glow)]">
              <Icon name="download" size={14} />
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
