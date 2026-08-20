"use client";

import React from "react";
import { cn } from "@/lib/cn";

export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: string; label: React.ReactNode; count?: number }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "relative flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
            value === t.id
              ? "border-accent text-foreground"
              : "border-transparent text-muted-foreground hover:text-secondary-text"
          )}
        >
          {t.label}
          {t.count != null && (
            <span className="tnum rounded-md bg-elevated px-1.5 py-0.5 text-[10px] text-muted-foreground">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({
  value,
  max = 100,
  className,
  shimmer = true,
  tone = "accent",
}: {
  value: number;
  max?: number;
  className?: string;
  shimmer?: boolean;
  tone?: "accent" | "success" | "danger" | "warning";
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const toneCls = {
    accent: "bg-gradient-to-r from-accent to-accent-3",
    success: "bg-gradient-to-r from-success to-emerald-400",
    danger: "bg-gradient-to-r from-danger to-rose-400",
    warning: "bg-gradient-to-r from-warning to-amber-400",
  }[tone];
  return (
    <div className={cn("relative h-2 w-full overflow-hidden rounded-full bg-elevated", className)}>
      <div
        className={cn("relative h-full rounded-full transition-[background-color,box-shadow] duration-700 ease-out", toneCls)}
        style={{ width: `${pct}%` }}
      >
        {shimmer && pct > 4 && <div className="shimmer absolute inset-0" />}
      </div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2"
      aria-pressed={checked}
    >
      <span
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200",
          checked ? "bg-accent shadow-[0_0_10px_-2px_var(--accent-glow)]" : "border border-border-strong bg-elevated"
        )}
      >
        <span
          className={cn(
            "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200",
            checked ? "translate-x-[18px]" : "translate-x-[3px]"
          )}
        />
      </span>
      {label && <span className="text-sm text-secondary-text">{label}</span>}
    </button>
  );
}

export function EmptyState({
  icon = "🌱",
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong py-12 text-center">
      <div className="animate-rise text-4xl drop-shadow-[0_0_16px_rgba(76,126,255,0.35)]">{icon}</div>
      <p className="text-sm font-medium text-secondary-text">{title}</p>
      {description && <p className="max-w-xs text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
  kicker,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  /** etichetta piccola sopra il titolo (sezione) */
  kicker?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {kicker && (
          <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
            <span className="h-1 w-1 rounded-full bg-accent" />
            {kicker}
          </p>
        )}
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}
