"use client";

// ============================================================
// ASCEND — Mappe di conoscenza: nodo custom per React Flow v12
// Doppio click → editing inline (Enter/blur commit, ESC annulla).
// 4 handle (T/R/B/L) tutti "source" e isConnectable: si può
// trascinare un collegamento da QUALUNQUE lato del nodo.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { Handle, Position, useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import type { KnowledgeNode } from "@/lib/types";

/** Nodo flow di una mappa di conoscenza. `editing` è un flag one-shot:
 *  true sul nodo appena creato col doppio click sul pane → apre l'input. */
export type ConceptFlowNode = Node<
  { label: string; color?: string; editing?: boolean },
  "concept"
>;

/** Converte un KnowledgeNode del DB in nodo flow. */
export function nodeToFlow(n: KnowledgeNode): ConceptFlowNode {
  return {
    id: n.id,
    type: "concept",
    position: { x: n.x, y: n.y },
    data: { label: n.label, ...(n.color !== undefined ? { color: n.color } : {}) },
  };
}

/** Converte un nodo flow in KnowledgeNode per il persist su DB. */
export function flowToNode(n: ConceptFlowNode): KnowledgeNode {
  return {
    id: n.id,
    label: n.data.label,
    x: Math.round(n.position.x),
    y: Math.round(n.position.y),
    ...(n.data.color !== undefined ? { color: n.data.color } : {}),
  };
}

const HANDLE_CLS =
  // Important con suffisso v4: il CSS di React Flow è UNLAYERED e batterebbe
  // le utility Tailwind (che stanno in @layer utilities) su width/height/bg/border.
  "h-2.5! w-2.5! border-2! border-accent! bg-elevated! opacity-0 transition-opacity duration-150 group-hover:opacity-100";

function conceptHandle(position: Position) {
  return (
    <Handle
      type="source"
      position={position}
      isConnectable
      className={HANDLE_CLS}
    />
  );
}

function KnowledgeNodeCardInner({ id, data, selected }: NodeProps<ConceptFlowNode>) {
  const rf = useReactFlow<ConceptFlowNode>();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.label);
  const inputRef = useRef<HTMLInputElement>(null);
  // Guard: il flag data.editing è una richiesta one-shot di apertura input
  // (nodo nuovo). Senza ref, l'effetto su [data.editing, data.label] riaprirebbe
  // l'input a ogni commit (il label cambia → effect re-run → editing di nuovo true).
  const autoEditConsumed = useRef(false);

  useEffect(() => {
    if (data.editing && !autoEditConsumed.current) {
      autoEditConsumed.current = true;
      setDraft(data.label);
      setEditing(true);
    }
  }, [data.editing, data.label]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    const label = draft.trim();
    if (label.length > 0 && label !== data.label) {
      rf.updateNodeData(id, { label });
    }
    setEditing(false);
  }

  function cancel() {
    setDraft(data.label);
    setEditing(false);
  }

  const borderStyle = { borderColor: data.color ?? "var(--accent)" };

  return (
    <div
      className={`group relative rounded-xl border bg-elevated px-3 py-2 shadow-[--shadow-card] transition-[box-shadow] ${
        selected ? "ring-1 ring-accent" : ""
      }`}
      style={borderStyle}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setDraft(data.label);
        setEditing(true);
      }}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          className="nodrag nowheel max-w-[200px] bg-transparent text-[13px] font-medium text-foreground caret-accent outline-none"
          aria-label="Etichetta del nodo"
        />
      ) : (
        <span
          className="block max-w-[200px] break-words text-[13px] font-medium text-foreground"
          style={{ overflowWrap: "anywhere" }}
        >
          {data.label}
        </span>
      )}
      {conceptHandle(Position.Top)}
      {conceptHandle(Position.Right)}
      {conceptHandle(Position.Bottom)}
      {conceptHandle(Position.Left)}
    </div>
  );
}

export const KnowledgeNodeCard = KnowledgeNodeCardInner;
