"use client";

// ============================================================
// ASCEND — Mappe di conoscenza: editor React Flow
// Nodi editabili inline, edge trascinabili dai 4 handle, autosave
// con debounce 800ms su db.knowledgeMaps via updateDB.
// Il parent monta il componente con key={map.id}: ogni cambio
// mappa è un remount → lo stato iniziale deriva direttamente dal
// prop, senza effect di caricamento.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { updateDB, upsert, removeById, uid, nowISO } from "@/lib/storage";
import type { KnowledgeMap, KnowledgeEdge } from "@/lib/types";
import { KnowledgeNodeCard, nodeToFlow, flowToNode, type ConceptFlowNode } from "./KnowledgeNodeCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/Icon";

/** Stile condiviso degli edge (nuovi + default): hairline scura coerente col tema. */
const EDGE_STYLE: Edge["style"] = { stroke: "var(--border-strong)", strokeWidth: 1.5 };

/** Fuori dal componente: una nuova object identity a ogni render genererebbe
 *  il warning "It looks like you've created a new nodeTypes object". */
const nodeTypes = { concept: KnowledgeNodeCard };

function toFlowEdges(edges: KnowledgeEdge[]): Edge[] {
  return edges.map((e) => ({ id: e.id, source: e.from, target: e.to, style: EDGE_STYLE }));
}

function toDBEdge(e: Edge): KnowledgeEdge {
  return { id: e.id, from: e.source, to: e.target };
}

interface KnowledgeEditorInnerProps {
  map: KnowledgeMap;
  onSaved: () => void;
}

function KnowledgeEditorInner({ map, onSaved }: KnowledgeEditorInnerProps) {
  // Remount per-mappa (key={map.id} nel parent): initializer dal prop, zero effect di load.
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<ConceptFlowNode>(
    map.nodes.map(nodeToFlow)
  );
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<Edge>(toFlowEdges(map.edges));
  const [mapName, setMapName] = useState(map.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const rf = useReactFlow<ConceptFlowNode>();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  // Snapshot corrente (nodi/edge/nome) leggibile dai callback e dal flush di
  // unmount senza dipendere dal closure del render corrente.
  const docRef = useRef<{ nodes: ConceptFlowNode[]; edges: Edge[]; name: string }>({
    nodes: map.nodes.map(nodeToFlow),
    edges: toFlowEdges(map.edges),
    name: map.name,
  });

  // Mirror dello stato nel ref: i ref si scrivono negli effect (mai in render).
  useEffect(() => {
    docRef.current = { nodes, edges, name: mapName };
  }, [nodes, edges, mapName]);

  const persist = useCallback(() => {
    const { nodes: ns, edges: es, name } = docRef.current;
    updateDB((d) => ({
      ...d,
      knowledgeMaps: upsert(d.knowledgeMaps, {
        ...map,
        name,
        nodes: ns.map(flowToNode),
        edges: es.map(toDBEdge),
        updatedAt: nowISO(),
      }),
    }));
    onSaved();
  }, [map, onSaved]);

  // Il flush di unmount deve chiamare l'ultima versione di persist:
  // il ref tiene il callback aggiornato senza includerlo nelle deps della cleanup.
  const persistRef = useRef(persist);
  useEffect(() => {
    persistRef.current = persist;
  }, [persist]);

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      dirtyRef.current = false;
      persist();
    }, 800);
  }, [persist]);

  // Unmount con autosave pendente (es. cambio mappa entro 800ms): flush subito,
  // altrimenti l'ultima modifica andrebbe persa col remount dell'editor.
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        if (dirtyRef.current) {
          dirtyRef.current = false;
          persistRef.current();
        }
      }
    };
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange<ConceptFlowNode>[]) => {
      onNodesChangeBase(changes);
      scheduleSave();
    },
    [onNodesChangeBase, scheduleSave]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      onEdgesChangeBase(changes);
      scheduleSave();
    },
    [onEdgesChangeBase, scheduleSave]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, id: uid(), style: EDGE_STYLE }, eds));
      scheduleSave();
    },
    [setEdges, scheduleSave]
  );

  const addNodeAt = useCallback(
    (x: number, y: number) => {
      const node: ConceptFlowNode = {
        id: uid(),
        type: "concept",
        position: { x: Math.round(x), y: Math.round(y) },
        data: { label: "Nuovo concetto", editing: true },
      };
      setNodes((nds) => [...nds, node]);
      scheduleSave();
    },
    [setNodes, scheduleSave]
  );

  // Doppio click sul PANE (non sul nodo) → nuovo nodo in editing al punto cliccato.
  const onPaneDoubleClick = useCallback(
    (event: ReactMouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.classList.contains("react-flow__pane")) return;
      const position = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addNodeAt(position.x, position.y);
    },
    [rf, addNodeAt]
  );

  const addNodeCentered = useCallback(() => {
    const wrapper = wrapperRef.current;
    const w = wrapper?.clientWidth ?? 800;
    const h = wrapper?.clientHeight ?? 600;
    const center = rf.screenToFlowPosition({ x: w / 2, y: h / 2 });
    addNodeAt(center.x, center.y);
  }, [rf, addNodeAt]);

  const saveAsTemplate = useCallback(() => {
    const { nodes: ns, edges: es, name } = docRef.current;
    const ts = nowISO();
    const tpl: KnowledgeMap = {
      id: uid(),
      name: `${name} (modello)`,
      nodes: ns.map(flowToNode),
      edges: es.map(toDBEdge),
      isTemplate: true,
      createdAt: ts,
      updatedAt: ts,
    };
    updateDB((d) => ({ ...d, knowledgeMaps: upsert(d.knowledgeMaps, tpl) }));
    onSaved();
  }, [onSaved]);

  function confirmDeleteMap() {
    updateDB((d) => ({ ...d, knowledgeMaps: removeById(d.knowledgeMaps, map.id) }));
    setConfirmDelete(false);
    onSaved();
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <input
            value={mapName}
            onChange={(e) => setMapName(e.target.value)}
            onBlur={scheduleSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            aria-label="Nome della mappa"
            className="min-w-0 max-w-[280px] flex-1 rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-[15px] font-semibold tracking-tight text-foreground outline-none transition-colors hover:border-border focus-visible:border-accent"
          />
          {map.isTemplate && <Badge tone="warning">Modello</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={addNodeCentered}>
            <Icon name="plus" size={14} />
            Nodo
          </Button>
          {!map.isTemplate && (
            <Button variant="ghost" size="sm" onClick={saveAsTemplate}>
              Salva come modello
            </Button>
          )}
          <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={14} />
            Elimina mappa
          </Button>
        </div>
      </div>
      <div
        ref={wrapperRef}
        onDoubleClick={onPaneDoubleClick}
        className="h-[calc(100vh-320px)] min-h-[480px] overflow-hidden rounded-xl border border-border bg-card"
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          deleteKeyCode={["Backspace", "Delete"]}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ style: EDGE_STYLE }}
          colorMode="dark"
          fitView
          className="[&_.react-flow__controls]:overflow-hidden [&_.react-flow__controls-button]:rounded-none! [&_.react-flow__controls-button]:border-border! [&_.react-flow__controls-button]:bg-elevated! [&_.react-flow__controls-button]:fill-foreground! [&_.react-flow__controls-button:hover]:bg-muted!"
        >
          <Background color="var(--border)" gap={24} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={confirmDeleteMap}
        title="Eliminare la mappa?"
        message={`"${map.name}" e tutti i suoi nodi verranno rimossi definitivamente.`}
        confirmLabel="Elimina mappa"
      />
    </div>
  );
}

interface KnowledgeEditorProps {
  map: KnowledgeMap;
  onSaved: () => void;
}

/** Provider obbligatorio: useReactFlow/screenToFlowPosition vivono nel context. */
export function KnowledgeEditor(props: KnowledgeEditorProps) {
  return (
    <ReactFlowProvider>
      <KnowledgeEditorInner {...props} />
    </ReactFlowProvider>
  );
}
