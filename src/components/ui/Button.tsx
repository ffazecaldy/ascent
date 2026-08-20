"use client";

import React from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "outline" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** alone luminoso (accentuato) — solo su primary */
  glow?: boolean;
}

const variantCls: Record<Variant, string> = {
  primary:
    "bg-gradient-to-r from-accent to-accent-2 text-white font-semibold shadow-[0_4px_18px_-6px_var(--accent-glow)] hover:shadow-[0_8px_28px_-6px_var(--accent-glow)] hover:brightness-110",
  outline: "border border-border-strong text-foreground hover:border-accent/50 hover:bg-accent-dim transition-colors",
  ghost: "text-secondary-text hover:bg-elevated hover:text-foreground",
  danger: "bg-danger/10 text-danger hover:bg-danger/20 border border-danger/25",
  subtle: "bg-elevated text-secondary-text hover:bg-elevated-2 hover:text-foreground",
};

const sizeCls: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs rounded-lg gap-1",
  md: "h-9 px-3.5 text-sm rounded-[10px] gap-1.5",
  lg: "h-11 px-5 text-sm rounded-xl gap-2",
  icon: "h-8 w-8 rounded-lg",
};

export function Button({
  variant = "primary",
  size = "md",
  glow,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        "relative inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed",
        variantCls[variant],
        sizeCls[size],
        glow && variant === "primary" && "animate-glow",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
