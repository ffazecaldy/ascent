"use client";

import React from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "outline" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantCls: Record<Variant, string> = {
  // ACCENTO SEMPRE BLU — mai verde (riservato ai valori positivi)
  primary: "bg-accent text-white hover:bg-accent-hover shadow-sm",
  outline: "border border-border-strong text-foreground hover:bg-elevated",
  ghost: "text-secondary-text hover:bg-elevated hover:text-foreground",
  danger: "bg-danger/10 text-danger hover:bg-danger/20 border border-danger/20",
  subtle: "bg-elevated text-secondary-text hover:text-foreground",
};

const sizeCls: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs rounded-md gap-1",
  md: "h-9 px-3.5 text-sm rounded-lg gap-1.5",
  lg: "h-11 px-5 text-sm rounded-lg gap-2",
  icon: "h-8 w-8 rounded-md",
};

export function Button({
  variant = "primary",
  size = "md",
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
        "inline-flex items-center justify-center font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-40 disabled:cursor-not-allowed select-none",
        variantCls[variant],
        sizeCls[size],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
