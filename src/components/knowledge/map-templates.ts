"use client";

// ============================================================
// ASCEND — Mappe di conoscenza: modelli built-in
// Layout a raggiera: nodo centrale + figli disposti in cerchio.
// I modelli Studio/Trading/Strategia hanno ID FISSO (tmpl-*):
// ensureBuiltinTemplates usa l'id come gate, quindi il pannello
// lista li semina una sola volta per profilo.
// ============================================================

import type { KnowledgeMap, KnowledgeNode, KnowledgeEdge } from "@/lib/types";

export interface MapTemplateDef {
  id: string;
  name: string;
  icon: string;
  center: string;
  children: string[];
}

export const BUILTIN_TEMPLATES: MapTemplateDef[] = [
  {
    id: "tmpl-studio",
    name: "Schema Studio",
    icon: "book-open",
    center: "Argomento",
    children: [
      "Concetti chiave",
      "Esempi",
      "Domande d'esame",
      "Collegamenti con altre materie",
    ],
  },
  {
    id: "tmpl-trading",
    name: "Schema Trading",
    icon: "chart-line",
    center: "Setup",
    children: [
      "Contesto di mercato",
      "Ingresso",
      "Stop loss",
      "Take profit",
      "Gestione posizione",
      "Journal note",
    ],
  },
  {
    id: "tmpl-strategia",
    name: "Schema Strategia",
    icon: "target",
    center: "Obiettivo",
    children: [
      "Analisi",
      "Punti di forza",
      "Debolezze",
      "Azioni",
      "Rischi",
      "KPI",
    ],
  },
];

/** Raggio orizzontale del cerchio dei figli (px su canvas flow). */
const RADIUS_X = 300;
/** Raggio verticale del cerchio dei figli (px su canvas flow). */
const RADIUS_Y = 220;

/**
 * Costruisce una KnowledgeMap da un template: centro in (0,0), figli in
 * cerchio (angolo = 2πi/n − π/2, parte dall'alto), edge centro→figlio.
 * `idFactory` e `now` sono iniettati così la funzione è pura e riutilizzabile
 * sia per i modelli built-in (id fisso) sia per le copie utente (uid()).
 */
export function makeTemplate(
  def: MapTemplateDef,
  idFactory: () => string,
  now: () => string
): KnowledgeMap {
  const ts = now();
  const center: KnowledgeNode = {
    id: idFactory(),
    label: def.center,
    x: 0,
    y: 0,
  };

  const n = def.children.length;
  const children: KnowledgeNode[] = def.children.map((label, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    return {
      id: idFactory(),
      label,
      x: Math.round(RADIUS_X * Math.cos(angle)),
      y: Math.round(RADIUS_Y * Math.sin(angle)),
    };
  });

  const edges: KnowledgeEdge[] = children.map((c) => ({
    id: idFactory(),
    from: center.id,
    to: c.id,
  }));

  return {
    id: idFactory(),
    name: def.name,
    nodes: [center, ...children],
    edges,
    isTemplate: true,
    createdAt: ts,
    updatedAt: ts,
  };
}

/**
 * Garantisce la presenza dei modelli built-in: per ogni BUILTIN_TEMPLATES, se
 * NESSUNA mappa esistente ha quell'id fisso, aggiunge makeTemplate(def, () => def.id).
 * Non muta l'input; ritorna un nuovo array (o lo stesso se nulla è cambiato).
 */
export function ensureBuiltinTemplates(
  maps: KnowledgeMap[],
  now: () => string
): KnowledgeMap[] {
  const missing = BUILTIN_TEMPLATES.filter(
    (def) => !maps.some((m) => m.id === def.id)
  );
  if (missing.length === 0) return maps;
  return [...maps, ...missing.map((def) => makeTemplate(def, () => def.id, now))];
}
