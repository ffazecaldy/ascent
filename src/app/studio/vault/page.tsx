"use client";

// ============================================================
// ASCEND — Study Vault (/studio/vault)
// Master-detail come /studio/mappe: lista materiali a sinistra,
// dettaglio (riassunto AI + testo originale) a destra.
// ============================================================

import { useState } from "react";
import { useDB } from "@/lib/storage";
import { SectionHeader, EmptyState } from "@/components/ui/Misc";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";
import { MaterialList } from "@/components/study-vault/MaterialList";
import MaterialDetail from "@/components/study-vault/MaterialDetail";

export default function VaultPage() {
  const db = useDB();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedMaterial = selectedId
    ? (db.studyMaterials.find((m) => m.id === selectedId) ?? null)
    : null;

  return (
    <div className="space-y-6">
      <Reveal>
        <SectionHeader
          kicker="Personale · Studio"
          title="Study Vault"
          subtitle="PDF, file e link YouTube con riassunti generati dall'AI locale: carica, analizza, ripassa."
        />
      </Reveal>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Reveal delay={20} className="lg:sticky lg:top-4">
          <div className="h-fit rounded-[--radius] border border-border bg-card p-4 shadow-[--shadow-card]">
            <MaterialList selectedId={selectedId} onSelect={setSelectedId} />
          </div>
        </Reveal>

        <Reveal delay={40}>
          {selectedMaterial ? (
            <MaterialDetail
              key={selectedMaterial.id}
              material={selectedMaterial}
              onDeleted={() => setSelectedId(null)}
            />
          ) : (
            <EmptyState
              icon={<Icon name="compass" size={34} className="text-accent" />}
              title="Seleziona o aggiungi un materiale"
              description="Carica un PDF o incolla un link YouTube: il testo viene estratto in locale e l'AI di Ollama genera il riassunto."
            />
          )}
        </Reveal>
      </div>
    </div>
  );
}
