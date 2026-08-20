"use client";

import React from "react";
import { cn } from "@/lib/cn";

type Tone = "default" | "info" | "success" | "danger" | "warning";

const toneCls: Record<Tone, string> = {
  default: "bg-elevated text-secondary-text border border-border-strong",
  info: "bg-accent/15 text-accent border border-accent/30",
  success: "bg-success/15 text-success border border-success/30",
  danger: "bg-danger/15 text-danger border border-danger/30",
  warning: "bg-warning/15 text-warning border border-warning/30",
};

export function Badge({
  tone = "default",
  className,
  children,
  pulse,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
  /** pulsazione (stato live) */
  pulse?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap",
        toneCls[tone],
        className
      )}
    >
      {pulse && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse-dot" />}
      {children}
    </span>
  );
}

export function StatusDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block h-2 w-2 rounded-full", className)} style={{ backgroundColor: color }} />;
}
