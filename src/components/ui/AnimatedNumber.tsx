"use client";
// AnimatedNumber — count-up che RI-ANIMA a ogni cambio di `value`
// (non solo al primo mount): i dati risultano sempre "live".
// Anima dal valore precedente a quello nuovo; se l'elemento è
// fuori viewport, attende il primo intersection.

import { useEffect, useRef, useState } from "react";

export function AnimatedNumber({
  value,
  fmt = (n: number) => String(n),
  duration = 800,
  className,
}: {
  value: number;
  fmt?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);
  const frameRef = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(frameRef.current);

    if (typeof IntersectionObserver === "undefined" || typeof window === "undefined") {
      setDisplay(value);
      prevRef.current = value;
      return;
    }

    const from = prevRef.current || 0;
    let obs: IntersectionObserver | null = null;

    const animate = () => {
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        setDisplay(from + (value - from) * eased);
        if (p < 1) {
          frameRef.current = requestAnimationFrame(tick);
        } else {
          setDisplay(value);
          prevRef.current = value;
        }
      };
      tick(t0);
    };

    obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            obs?.disconnect();
            animate();
          }
        });
      },
      { threshold: 0.2 }
    );
    obs.observe(el);

    return () => {
      obs?.disconnect();
      cancelAnimationFrame(frameRef.current);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {fmt(display)}
    </span>
  );
}
