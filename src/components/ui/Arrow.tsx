"use client";
// TrendArrow — freccia di movimento: ▲ verde (aumento) / ▼ rossa (diminuzione)
// / — neutro. Design decision: verde/rosso SOLO per direzione del movimento.

import { cn } from "@/lib/cn";

export type ArrowDir = "up" | "down" | "flat";

export function TrendArrow({
  value,
  dir,
  size = 12,
  className,
  label,
}: {
  /** se fornito, la direzione è derivata dal segno */
  value?: number;
  dir?: ArrowDir;
  size?: number;
  className?: string;
  label?: boolean;
}) {
  const d: ArrowDir =
    dir ?? (value == null ? "flat" : value > 0 ? "up" : value < 0 ? "down" : "flat");
  if (d === "flat") {
    return (
      <span title="Invariato" className={cn("text-muted-foreground", className)} style={{ fontSize: size, lineHeight: 1 }}>
        —
      </span>
    );
  }
  const up = d === "up";
  return (
    <span
      className={cn("inline-flex items-center animate-pop", up ? "text-success" : "text-danger", className)}
      title={up ? "In aumento" : "In diminuzione"}
      style={{ lineHeight: 1 }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {up ? <path d="M5 15l7-7 7 7" /> : <path d="M5 9l7 7 7-7" />}
      </svg>
      {label && <span className="ml-1 text-[11px] font-semibold">{up ? "+" : "−"}</span>}
    </span>
  );
}
