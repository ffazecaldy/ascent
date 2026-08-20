"use client";

import React from "react";
import { cn } from "@/lib/cn";
import { Card } from "./Card";

/**
 * StatCard — metrica chiave: numero GRANDE in tabular nums,
 * etichetta piccola sopra, variazione % sotto, sparkline opzionale.
 * Ricco: reveal + glow su positivo.
 */
export function StatCard({
  label,
  value,
  delta,
  deltaTone = "neutral",
  icon,
  spark,
  sparkColor = "#4C7EFF",
  hairline = "accent",
  className,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  delta?: React.ReactNode;
  deltaTone?: "positive" | "negative" | "neutral";
  icon?: React.ReactNode;
  spark?: number[];
  sparkColor?: string;
  hairline?: "accent" | "success" | "danger" | "none";
  className?: string;
  valueClassName?: string;
}) {
  return (
    <Card hairline={hairline} className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
        {icon}
      </div>
      <div className={cn("text-[26px] font-semibold leading-none tracking-tight tnum", valueClassName)}>{value}</div>
      <div className="flex items-end justify-between gap-2">
        {delta != null ? (
          <div className="flex items-center gap-1 text-xs">
            {deltaTone === "positive" && (
              <span className="text-success">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M5 15l7-7 7 7" />
                </svg>
              </span>
            )}
            {deltaTone === "negative" && (
              <span className="text-danger">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M5 9l7 7 7-7" />
                </svg>
              </span>
            )}
            <span
              className={cn(
                "tnum font-medium",
                deltaTone === "positive" && "text-success",
                deltaTone === "negative" && "text-danger",
                deltaTone === "neutral" && "text-muted-foreground"
              )}
            >
              {delta}
            </span>
          </div>
        ) : (
          <span />
        )}
        {spark && spark.length > 1 && <Spark svg={spark} color={sparkColor} />}
      </div>
    </Card>
  );
}

function Spark({ svg, color, height = 22 }: { svg: number[]; color: string; height?: number }) {
  const W = 60;
  const H = height;
  const min = Math.min(...svg);
  const max = Math.max(...svg);
  const span = max - min || 1;
  const pts = svg.map((v, i) => {
    const x = (i / (svg.length - 1)) * W;
    const y = H - 2 - ((v - min) / span) * (H - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[22px] w-14" preserveAspectRatio="none">
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
