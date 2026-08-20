"use client";

import React from "react";
import { cn } from "@/lib/cn";
import { Card } from "./Card";

/**
 * StatCard — metrica chiave in card:
 * numero GRANDE in tabular-nums, etichetta piccola sopra, variazione % sotto.
 */
export function StatCard({
  label,
  value,
  delta,
  deltaTone = "neutral",
  icon,
  className,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  delta?: React.ReactNode;
  deltaTone?: "positive" | "negative" | "neutral";
  icon?: React.ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <Card className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        {icon}
      </div>
      <div className={cn("text-2xl font-semibold tnum leading-tight", valueClassName)}>{value}</div>
      {delta != null && (
        <div
          className={cn(
            "text-xs tnum",
            deltaTone === "positive" && "text-success",
            deltaTone === "negative" && "text-danger",
            deltaTone === "neutral" && "text-muted-foreground"
          )}
        >
          {delta}
        </div>
      )}
    </Card>
  );
}
