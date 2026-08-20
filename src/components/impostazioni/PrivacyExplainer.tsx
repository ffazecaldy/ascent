"use client";
// ============================================================
// ASCEND — Impostazioni · Spiegazione livelli privacy
// Standard: maschera le cifre monetarie (•••)
// Completa: maschera anche KPI/percentuali e neutralizza il calendario P&L
// ============================================================

import React from "react";
import { useDB } from "@/lib/storage";
import { maskMoney, maskKpi } from "@/lib/privacy";
import { cn } from "@/lib/cn";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

/** Mini-riga "prima → dopo mascherato". */
function Row({ label, normal, masked }: { label: string; normal: string; masked: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/70 pb-2 text-xs last:border-0 last:pb-0">
      <span className="text-secondary-text">{label}</span>
      <span className="flex items-center gap-2 tnum">
        <span className="text-muted-foreground line-through decoration-muted-foreground/50">{normal}</span>
        <span className="text-accent">→</span>
        <span className="font-medium text-foreground">{masked}</span>
      </span>
    </div>
  );
}

/** Griglia finta da calendario P&L: colorata o neutra. */
function CalendarPreview({ neutral }: { neutral: boolean }) {
  const tones = ["bg-success/25", "bg-success/40", "bg-danger/25", "bg-success/20", "bg-elevated"];
  return (
    <div className="grid grid-cols-11 gap-1">
      {Array.from({ length: 11 }).map((_, i) => (
        <span
          key={i}
          className={cn("h-3 rounded-sm", neutral ? "bg-elevated" : tones[i % tones.length])}
        />
      ))}
    </div>
  );
}

function LevelCard({
  icon,
  title,
  desc,
  active,
  children,
}: {
  icon: string;
  title: string;
  desc: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border p-4 transition-[border-color,background-color,box-shadow] duration-300",
        active
          ? "border-accent/40 bg-accent/5 shadow-[0_0_28px_-10px_var(--accent-glow)]"
          : "border-border-strong bg-muted/40 hover:border-border-strong"
      )}
    >
      {active && (
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
      )}
      <div className="mb-3 flex items-center gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg transition-colors",
            active ? "bg-accent/15" : "bg-elevated"
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold leading-tight">{title}</h4>
          <p className="text-[11px] text-muted-foreground">{active ? "Attiva adesso" : "Disponibile"}</p>
        </div>
        {active ? (
          <Badge tone="info" pulse>
            Attiva
          </Badge>
        ) : (
          <Badge>Disponibile</Badge>
        )}
      </div>
      <p className="mb-3 text-xs leading-relaxed text-secondary-text">{desc}</p>
      <div className="rounded-md border border-border/60 bg-background/60 p-3">{children}</div>
    </div>
  );
}

export function PrivacyExplainer() {
  const db = useDB();
  const mode = db.settings.privacyMode;

  return (
    <Card hairline="accent">
      <CardHeader>
        <div>
          <CardTitle>Privacy</CardTitle>
          <CardSubtitle>
            Maschera numeri e calendario per screenshot e condivisione. Puoi cambiarla al volo dal
            toggle nella barra in alto.
          </CardSubtitle>
        </div>
        <Badge>👁 {mode === "standard" ? "Standard" : "Completa"}</Badge>
      </CardHeader>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <LevelCard
          icon="👁️"
          title="Standard"
          desc="Nasconde le cifre monetarie: gli importi diventano •••. KPI e percentuali restano visibili."
          active={mode === "standard"}
        >
          <div className="space-y-2">
            <Row label="Saldo totale" normal="€2.430" masked={maskMoney()} />
            <Row label="Win rate" normal="63,4%" masked="63,4%" />
            <div className="pt-2">
              <p className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                <span className="mr-1">🗓</span>Calendario P&L
              </p>
              <CalendarPreview neutral={false} />
            </div>
          </div>
        </LevelCard>

        <LevelCard
          icon="🔒"
          title="Completa"
          desc="Oltre alle cifre, maschera KPI e percentuali (••%) e neutralizza il calendario P&L: nessun dato economico leggibile."
          active={mode === "complete"}
        >
          <div className="space-y-2">
            <Row label="Saldo totale" normal="€2.430" masked={maskMoney()} />
            <Row label="Win rate" normal="63,4%" masked={maskKpi()} />
            <div className="pt-2">
              <p className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                <span className="mr-1">🗓</span>Calendario P&L
              </p>
              <CalendarPreview neutral />
            </div>
          </div>
        </LevelCard>
      </div>
    </Card>
  );
}
