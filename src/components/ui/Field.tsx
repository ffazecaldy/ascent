"use client";

import React from "react";
import { cn } from "@/lib/cn";

export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <label className={cn("mb-1.5 block text-xs font-medium text-secondary-text", className)}>{children}</label>;
}

export const inputCls =
  "w-full rounded-lg border border-border-strong bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return <input {...rest} className={cn(inputCls, className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return <textarea {...rest} className={cn(inputCls, "min-h-20 resize-y", className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, children, ...rest } = props;
  return (
    <select {...rest} className={cn(inputCls, "appearance-none pr-8 bg-no-repeat cursor-pointer", className)}>
      {children}
    </select>
  );
}

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
