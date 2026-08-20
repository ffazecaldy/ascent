"use client";

import React from "react";
import { cn } from "@/lib/cn";

type Tone = "default" | "info" | "success" | "danger" | "warning";

const toneCls: Record<Tone, string> = {
  default: "bg-elevated text-secondary-text border border-border-strong",
  info: "bg-accent/12 text-accent border border-accent/25",
  success: "bg-success/12 text-success border border-success/25",
  danger: "bg-danger/12 text-danger border border-danger/25",
  warning: "bg-yellow-500/12 text-yellow-500 border border-yellow-500/25",
};

export function Badge({
  tone = "default",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        toneCls[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function StatusDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block h-2 w-2 rounded-full", className)} style={{ backgroundColor: color }} />;
}
