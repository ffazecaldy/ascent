"use client";

import React from "react";
import { cn } from "@/lib/cn";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** bordo superiore con lineetta colorata di accento */
  hairline?: "accent" | "success" | "danger" | "none";
  /** texture a griglia (finanza/trading) */
  texture?: boolean;
  /** effetto scan line (card "live") */
  scan?: boolean;
}

export function Card({ className, children, hairline = "none", texture, scan, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[--radius] border border-border bg-card p-4 shadow-[--shadow-card]",
        "hover-lift",
        hairline !== "none" && "shadow-[0_0_0_1px_var(--bg)] shadow-[0_0_24px_-6px_rgba(0,0,0,0.5)]",
        texture && "grid-texture",
        scan && "scan-line",
        className
      )}
      {...rest}
    >
      {hairline === "accent" && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent to-transparent" />
      )}
      {hairline === "success" && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-success to-transparent" />
      )}
      {hairline === "danger" && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-danger to-transparent" />
      )}
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mb-3 flex items-start justify-between gap-3", className)}>{children}</div>;
}

export function CardTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return <h3 className={cn("text-[13px] font-semibold tracking-tight text-foreground", className)}>{children}</h3>;
}

export function CardSubtitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("mt-0.5 text-xs text-muted-foreground", className)}>{children}</p>;
}
