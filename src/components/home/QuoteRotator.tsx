"use client";

// ============================================================
// ASCEND — Home · Rotatore di citazioni
// Mostra una citazione da QUOTES (101) in loop sequenziale, una
// ogni ~8 secondi con transizione fade + slide. Il bottone
// "Successiva" anticipa la citazione (manuale). Nessuna dipendenza.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { QUOTES } from "@/lib/quotes";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";

const ROTATE_MS = 8000; // ogni ~8 secondi
const FADE_MS = 500; // durata fade-out (poi fade-in)

export function QuoteRotator() {
  // Deterministico al primo render (SSR e primo paint client identici):
  // parte sempre dalla prima citazione; l'indice casuale viene applicato
  // SOLO dopo il mount (useEffect) per evitare hydration mismatch.
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(true);
  const timers = useRef<number[]>([]);

  // Dopo il mount: salta a una citazione casuale (una volta sola)
  useEffect(() => {
    setIndex(Math.floor(Math.random() * QUOTES.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // pulizia timeouts pendenti allo smontaggio
  useEffect(() => {
    return () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
  }, []);

  // fade-out → cambia indice → fade-in
  const flip = (nextIndex: (i: number) => number) => {
    setShown(false);
    const id = window.setTimeout(() => {
      setIndex((i) => nextIndex(i));
      setShown(true);
    }, FADE_MS);
    timers.current.push(id);
  };

  const nextManual = () => flip((i) => (i + 1) % QUOTES.length);

  // rotazione automatica
  useEffect(() => {
    const id = window.setInterval(() => flip((i) => (i + 1) % QUOTES.length), ROTATE_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const quote = QUOTES[index];

  return (
    <Card hairline="accent" className="relative overflow-hidden px-4 py-3.5">
      {/* virgolette decorative grandi */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-4 right-5 select-none font-serif text-[84px] leading-none text-accent/15"
      >
        ❝
      </span>

      <div className="relative flex items-start gap-3">
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-accent/25 bg-accent/10 text-accent"
        >
          <Icon name="sparkles" size={18} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="min-h-[72px] sm:min-h-[56px]">
            <p
              className={`font-serif text-[15px] italic leading-relaxed text-foreground/90 transition-[transform,opacity] duration-500 ease-out ${
                shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
              }`}
            >
              “{quote.text}”
            </p>
          </div>

          <div
            className={`mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border/70 pt-2 transition-[transform,opacity] duration-500 delay-75 ease-out ${
              shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
            }`}
          >
            <p className="text-xs font-medium text-secondary-text">
              <span className="mr-1.5 text-accent">—</span>
              {quote.author}
            </p>
            <div className="flex items-center gap-2">
              <span className="tnum text-[11px] text-muted-foreground">
                {index + 1}/{QUOTES.length}
              </span>
              <button
                type="button"
                onClick={nextManual}
                aria-label="Cita successiva"
                className="rounded-md border border-border-strong bg-elevated px-2 py-0.5 text-xs font-medium text-secondary-text transition-colors hover:border-accent/50 hover:text-accent"
              >
                Successiva →
              </button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
