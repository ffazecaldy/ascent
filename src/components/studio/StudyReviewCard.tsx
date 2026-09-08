"use client";

// ============================================================
// Zona Studio — Ripasso flashcard (SM-2 semplificato).
// Sessione guidata: coda = carte scadute (dueCards) + nuove dai
// materiali del Vault (newCardsFromMaterials), massimo 20 per sessione.
// Il voto applica gradeCard e fa upsert in db.reviewCards via updateDB;
// i campi di scheduling sono toccati solo da src/lib/review.ts.
// Solo domanda/risposta: nessun dettaglio del materiale di origine.
// ============================================================

import { useMemo, useState } from "react";
import type { DB, ReviewCard } from "@/lib/types";
import { todayKey } from "@/lib/dates";
import { updateDB, upsert } from "@/lib/storage";
import { dueCards, gradeCard, newCardsFromMaterials, type ReviewGrade } from "@/lib/review";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/** Massimo di carte per una sessione di ripasso. */
const MAX_PER_SESSION = 20;

const GRADE_LABELS: Record<ReviewGrade, string> = {
  di_nuovo: "Di nuovo",
  difficile: "Difficile",
  bene: "Bene",
  facile: "Facile",
};

export function StudyReviewCard({ db }: { db: DB }) {
  const today = todayKey(db.settings.timezone);

  // La coda è uno SNAPSHOT locale: si costruisce alla prima carta
  // disponibile e resta stabile per tutta la sessione. Ricalcolarla
  // dal db a ogni voto (con indice crescente) salterebbe le carte
  // che escono di coda davanti all'indice corrente. "Di nuovo"
  // riaccoda la carta in fondo (intervalDays 0 → due = oggi).
  const [queue, setQueue] = useState<ReviewCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [reviewed, setReviewed] = useState(0);

  // Coda calcolata sempre (hook incondizionato), usata solo finché
  // lo snapshot di sessione non esiste.
  const computed = useMemo(() => {
    const due = dueCards(db, today);
    const fresh = newCardsFromMaterials(db, today);
    return [...due, ...fresh].slice(0, MAX_PER_SESSION);
  }, [db, today]);

  const effective: ReviewCard[] = queue ?? computed;

  const current: ReviewCard | undefined = effective[index];

  const grade = (g: ReviewGrade) => {
    if (!current) return;
    const next = gradeCard(current, g, today);
    updateDB((d) => ({ ...d, reviewCards: upsert(d.reviewCards, next) }));
    setQueue((q) => {
      const base = q ?? effective;
      return g === "di_nuovo" ? [...base, next] : base;
    });
    setReviewed((n) => n + 1);
    setIndex((i) => i + 1);
    setShowAnswer(false);
  };

  // Nessuna carta: vuoto amichevole, il flusso parte dal Vault.
  if (effective.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ripasso flashcard</CardTitle>
        </CardHeader>
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Icon name="sparkles" size={26} className="text-accent" />
          <p className="text-sm text-foreground">Nessuna carta da ripassare oggi.</p>
          <p className="max-w-xs text-[11px] leading-relaxed text-muted-foreground">
            Le flashcard si creano dal Vault: aggiungi un materiale e genera le domande, poi
            compariranno qui pronte per il ripasso.
          </p>
        </div>
      </Card>
    );
  }

  // Coda finita: esito della sessione.
  if (!current) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ripasso flashcard</CardTitle>
          <Badge tone="success">
            <span className="tnum">{reviewed}</span>
          </Badge>
        </CardHeader>
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Icon name="check" size={26} className="text-success" />
          <p className="text-sm font-medium text-foreground">
            Sessione completata — <span className="tnum">{reviewed}</span> carte ripassate
          </p>
          <p className="max-w-xs text-[11px] text-muted-foreground">
            Torna domani: l&apos;algoritmo porterà qui le carte al momento giusto.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Ripasso flashcard</CardTitle>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Carta <span className="tnum">{index + 1}</span> di <span className="tnum">{effective.length}</span>
          </p>
        </div>
        <Badge tone="info">
          <span className="tnum">{effective.length - index}</span> da fare
        </Badge>
      </CardHeader>

      {/* Solo q/a: niente dettagli del materiale di origine */}
      <div className="rounded-[10px] border border-border bg-elevated p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Domanda</p>
        <p className="mt-1 text-sm leading-relaxed text-foreground">{current.q}</p>

        {showAnswer ? (
          <>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Risposta</p>
            <p className="mt-1 text-sm leading-relaxed text-foreground">{current.a}</p>
          </>
        ) : (
          <div className="mt-4">
            <Button variant="outline" size="sm" onClick={() => setShowAnswer(true)}>
              Mostra risposta
            </Button>
          </div>
        )}
      </div>

      {showAnswer && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(GRADE_LABELS) as ReviewGrade[]).map((g) => (
            <Button key={g} size="sm" variant={g === "di_nuovo" ? "subtle" : "outline"} onClick={() => grade(g)}>
              {GRADE_LABELS[g]}
            </Button>
          ))}
        </div>
      )}
    </Card>
  );
}
