# Studio Deepening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portare lo Studio da time-tracker base a sistema completo: materie con target, qualita sessione, Pomodoro, stats avanzate, Vault/Mappe collegati alle sessioni, obiettivi e Coach.

**Architecture:** Tutto local-first come oggi. Dati in `DB` via `useDB/updateDB`, derivato in `compute.ts` puro, UI con pattern esistenti (`StatCard`, `BarsChart`, `PnlCalendar`, `Modal`). Una migrazione `DB v14→v15`, nessun breaking change: campi nuovi tutti opzionali.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, Tailwind v4, React Flow esistente, Ollama esistente, `localStorage` + IndexedDB `ascend-files` esistenti. Zero nuove dipendenze.

---

## Fase 0 — Fondamenta/fix (prerequisito)

### Task 0.1: Fix merge — includere collezioni dimenticate
Files: `src/lib/merge.ts` (LIST_KEYS + COLLECTION_LABELS).
Contesto: LIST_KEYS ha solo 22 voci, mancano readingLog, knowledgeMaps, studyMaterials, customGoals, customGoalChecks, milestones -> export/import perde Vault e Mappe.

### Task 0.2: Tipi v15 — qualita, target materia, link
Files: `src/lib/types.ts` (StudySession += subjectId/focus/energy/materialId/mapId/updatedAt; StudySubject += color/icon/weeklyTargetMin/examDate/archived/updatedAt; StudyMaterial += status/flashcards; GoalType += studio_minuti; DB_VERSION=15), `src/lib/storage.ts` (migrazione v14→v15), `src/lib/db.ts` (seed invariato, version da DB_VERSION).

## Fase 1 — Studio core

### Task 1.1: Fix Timer — custom subjects + Pomodoro base
Files: `src/components/studio/StudyTimer.tsx`. Usa subjectOptions unificate (preset+saved+derived, stessa logica di StudyForm), modalita libero/25-5 con pausa opzionale, soglia minima 60s anti-rumore, persistenza esistente.

### Task 1.2: Form sessione — focus/energy + link materiale/mappa
Files: `src/components/studio/StudyForm.tsx`, `src/app/studio/page.tsx` (save). Campi opzionali focus 1-5, energy 1-5, materialId, mapId.

### Task 1.3: Materie con target + archivio
Files: `src/components/studio/SubjectManager.tsx`. Card per materia con minuti 7gg, ProgressBar verso weeklyTargetMin, badge esame, edit via Modal (target/examDate/color/archived). Preset: crea riga studySubjects alla prima modifica.

### Task 1.4: Stats avanzate + heatmap + filtri log
Files: `src/lib/compute.ts` (studyStats, studyStreak), `src/components/studio/StudyStats.tsx` (nuovo, tab 7/30/90 + confronto periodo precedente), heatmap via ActivityHeatmap/PnlCalendar esistenti, `src/components/studio/StudyLog.tsx` (search+materia+range+sort).

### Task 1.5: Shell Studio con tab + empty-state fix
Files: `src/app/studio/layout.tsx` (nuovo, tab Panoramica/Vault/Mappe), `src/app/studio/page.tsx` (card Vault/Mappe sempre visibili, empty-state solo per KPI/charts/log).

## Fase 2 — Collegamenti

### Task 2.1: Viste collegate per materia
Files: `src/app/studio/page.tsx` (?materia=), StudyLog, MaterialList/MapList (filtro opzionale), MaterialDetail (sessioni collegate).

## Fase 3 — Vault avanzato + sistema

### Task 3.1: Vault — stati, ricerca, flashcard
Files: `src/lib/types.ts` (status/flashcards), `src/lib/materials.ts` (secondo prompt flashcard), `src/components/study-vault/MaterialDetail.tsx` (status+flashcard flip+studia-ora), MaterialList (ricerca full-text + filtro stato).

### Task 3.2: Obiettivi studio_minuti + coach + home
Files: `src/lib/compute.ts` (GOAL_LABELS + weeklyGoalValue + daily eval case studio_minuti), `src/lib/coach-context.ts` (riga Studio settimanale), obiettivi page (mostra label automaticamente), home (nessun cambio dedicato, usa upcomingDeadlines esistente).

## Vincoli globali
- Mai localStorage diretto nelle pagine (solo useDB/updateDB), tranne timer keys esistenti.
- Mai verde/rosso per CTA, accento blu #4C7EFF, UI italiano, "use client" nelle pagine.
- Zero nuove dipendenze npm. Zero dati demo.
- Ogni task: npm run typecheck + lint, verifica manuale indicata nel piano chat.
