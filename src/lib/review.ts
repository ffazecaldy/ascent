// ============================================================
// ASCEND — Ripasso flashcard: SM-2 semplificato (funzioni pure)
// Nessuna dipendenza da React o dal DOM: lo scheduling è calcolo
// puro su day key "yyyy-MM-dd". I campi di stato (ease, intervalDays,
// due, lapses) vengono toccati SOLO qui — nessun altro punto del
// codice li modifica.
// ============================================================

import type { DB, ReviewCard } from "./types";
import { addDaysKey } from "./dates";
import { nowISO, uid } from "./storage";

/** Voto dato dall'utente alla fine della ripetizione. */
export type ReviewGrade = "di_nuovo" | "difficile" | "bene" | "facile";

// Limiti di sicurezza dell'ease: sotto 1.3 gli intervalli collassano
// (carte ripassate ogni giorno per sempre), sopra 2.8 esplodono e le
// carte spariscono per mesi. Il default 2.5 è il valore classico di SM-2.
const EASE_MIN = 1.3;
const EASE_MAX = 2.8;

function clampEase(ease: number): number {
  return Math.min(EASE_MAX, Math.max(EASE_MIN, ease));
}

/**
 * Applica un voto a una carta e restituisce la NUOVA carta (immutabile,
 * mai mutare quella passata). Regole SM-2 semplificate:
 * - di_nuovo: dimenticata → intervallo azzerato, due = oggi, ease -0.2,
 *   lapses +1. Riusce domani (o più tardi in sessione) da capo.
 * - difficile: intervallo = max(1, round(intervallo * 1.2)).
 * - bene: intervallo = max(1, round(intervallo * ease)); prima volta = 1gg.
 * - facile: intervallo = max(2, round(intervallo * ease * 1.3)); prima volta = 3gg.
 * Il `due` è sempre addDaysKey(today, intervallo): con intervallo 0 torna
 * il day key di oggi, quindi la carta resta in coda.
 */
export function gradeCard(card: ReviewCard, grade: ReviewGrade, today: string): ReviewCard {
  // L'ease cala solo quando la carta viene dimenticata; gli altri voti
  // lo lasciano invariato. Clamp sempre applicato ai limiti 1.3..2.8.
  const ease = clampEase(grade === "di_nuovo" ? card.ease - 0.2 : card.ease);

  // "Prima volta" = intervallo ancora a 0 (carte nuove o appena dimenticate):
  // passi base fissi prima che l'ease personali i salti.
  const firstTime = card.intervalDays === 0;

  let intervalDays: number;
  switch (grade) {
    case "di_nuovo":
      intervalDays = 0;
      break;
    case "difficile":
      intervalDays = Math.max(1, Math.round(card.intervalDays * 1.2));
      break;
    case "bene":
      intervalDays = firstTime ? 1 : Math.max(1, Math.round(card.intervalDays * card.ease));
      break;
    case "facile":
      intervalDays = firstTime ? 3 : Math.max(2, Math.round(card.intervalDays * card.ease * 1.3));
      break;
  }

  return {
    ...card,
    ease,
    intervalDays,
    due: addDaysKey(today, intervalDays),
    lapses: card.lapses + (grade === "di_nuovo" ? 1 : 0),
    updatedAt: nowISO(),
  };
}

/**
 * Carte scadute (o scadute oggi): due <= today. Confronto lessicale sui
 * day key "yyyy-MM-dd" — non servono orari né timezone. Ordinate per due
 * crescente: prima le più arretrate.
 */
export function dueCards(db: DB, today: string): ReviewCard[] {
  return db.reviewCards
    .filter((c) => c.due <= today)
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
}

/**
 * Genera le ReviewCard dalle flashcards dei materiali del Vault che non
 * hanno ancora una carta. Una flashcard si identifica con la coppia
 * (materialId, q): la stessa domanda non genera mai una seconda carta.
 * Carte nuove: ease 2.5, intervallo 0, due oggi, lapses 0. Le prime
 * `limit` (default 10) nell'ordine dei materiali — la sessione le mette
 * in coda dopo le scadute.
 */
export function newCardsFromMaterials(db: DB, today: string, limit = 10): ReviewCard[] {
  const seen = new Set(db.reviewCards.map((c) => `${c.materialId}::${c.q}`));
  const out: ReviewCard[] = [];
  for (const material of db.studyMaterials) {
    for (const fc of material.flashcards ?? []) {
      if (out.length >= limit) return out;
      const key = `${material.id}::${fc.q}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const now = nowISO();
      out.push({
        id: uid(),
        materialId: material.id,
        q: fc.q,
        a: fc.a,
        ease: 2.5,
        intervalDays: 0,
        due: today,
        lapses: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  return out;
}
