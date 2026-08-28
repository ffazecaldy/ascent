"use client";

// ============================================================
// ASCEND — Mappe di conoscenza (Studio · /studio/mappe)
// Lista a sinistra, editor React Flow a destra. L'editor salva
// da sé (autosave su db.knowledgeMaps): qui resta solo la selection.
// ============================================================

import { useState } from "react";
import { useDB } from "@/lib/storage";
import { SectionHeader, EmptyState } from "@/components/ui/Misc";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";
import { MapList } from "@/components/knowledge/MapList";
import { KnowledgeEditor } from "@/components/knowledge/KnowledgeEditor";

export default function MapsPage() {
  const db = useDB();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedMap = selectedId
    ? (db.knowledgeMaps.find((m) => m.id === selectedId) ?? null)
    : null;

  return (
    <div className="space-y-6">
      <Reveal>
        <SectionHeader
          kicker="Personale · Studio"
          title="Mappe di conoscenza"
          subtitle="Collega i concetti come in uno schema: nodi editabili, collegamenti trascinabili, modelli pronti per Studio, Trading e Strategia."
        />
      </Reveal>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Reveal delay={20} className="lg:sticky lg:top-4">
          <div className="h-fit rounded-[--radius] border border-border bg-card p-4 shadow-[--shadow-card]">
            <MapList selectedId={selectedId} onSelect={setSelectedId} />
          </div>
        </Reveal>

        <Reveal delay={40}>
          {selectedMap ? (
            <KnowledgeEditor
              key={selectedMap.id}
              map={selectedMap}
              onSaved={() => {}}
            />
          ) : (
            <EmptyState
              icon={<Icon name="book-open" size={34} className="text-accent" />}
              title="Seleziona o crea una mappa"
              description="Scegli una mappa dall'elenco o creane una con un modello: doppio click sul canvas per aggiungere nodi, trascina tra i punti per collegarli."
            />
          )}
        </Reveal>
      </div>
    </div>
  );
}
