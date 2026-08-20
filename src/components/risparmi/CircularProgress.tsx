"use client";
// ============================================================
// ASCEND — Risparmi · Anello di progresso SVG (zero dipendenze)
// Usato sulle card obiettivo: cerchio di avanzamento con leggero
// glow verde quando l'obiettivo è raggiunto.
// ============================================================

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function CircularProgress({
  pct,
  size = 60,
  stroke = 5.5,
  done = false,
  label,
}: {
  /** 0..100 (già clampato da chi chiama) */
  pct: number;
  size?: number;
  stroke?: number;
  /** obiettivo raggiunto → verde + glow */
  done?: boolean;
  /** testo al centro (es. percentuale) */
  label?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const off = c * (1 - clamped / 100);
  const color = done ? "#22c55e" : "#4C7EFF";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#232327" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(0.22,1,0.36,1)" }}
          className={cn(done && "drop-shadow-[0_0_6px_rgba(34,197,94,0.65)]")}
        />
      </svg>
      {label != null && (
        <div className="absolute inset-0 grid place-items-center">
          <span
            className="tnum text-[11px] font-semibold leading-none"
            style={{ color: done ? "#22c55e" : "#a0a0a8" }}
          >
            {label}
          </span>
        </div>
      )}
    </div>
  );
}
