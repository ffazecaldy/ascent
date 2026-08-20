"use client";
// ============================================================
// ASCEND — Impostazioni · Spiegazione livelli privacy
// Standard: maschera le cifre monetarie (•••)
// Completa: maschera anche KPI/percentuali e neutralizza il calendario P&L
// ============================================================

import { useDB } from "@/lib/storage";
import { maskMoney, maskKpi } from "@/lib/privacy";
import { cn } from "@/lib/cn";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

/** Mini-riga "prima → dopo mascherato". */
function Row({ label, normal, masked }: { label: string; normal: string; masked: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border pb-2 text-xs last:border-0 last:pb-0">
      <span className="text-secondary-text">{label}</span>
      <span className="flex items-center gap-2 tnum">
        <span className="text-muted-foreground line-through decoration-muted-foreground/50">{normal}</span>
        <span className="text-foreground">→</span>
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
  title,
  desc,
  active,
  children,
}: {
  title: string;
  desc: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        "rounded-lg border p-4 " +
        (active ? "border-accent/40 bg-accent/5" : "border-border-strong bg-muted/40")
      }
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{title}</h4>
        {active ? (
          <Badge tone="info">Attiva adesso</Badge>
        ) : (
          <Badge>Disponibile</Badge>
        )}
      </div>
      <p className="mb-3 text-xs leading-relaxed text-secondary-text">{desc}</p>
      <div className="rounded-md bg-background/60 p-3">{children}</div>
    </div>
  );
}

export function PrivacyExplainer() {
  const db = useDB();
  const mode = db.settings.privacyMode;

  return (
    <Card>
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
          title="Standard"
          desc="Nasconde le cifre monetarie: gli importi diventano •••. KPI e percentuali restano visibili."
          active={mode === "standard"}
        >
          <div className="space-y-2">
            <Row label="Saldo totale" normal="€2.430" masked={maskMoney()} />
            <Row label="Win rate" normal="63,4%" masked="63,4%" />
            <div className="pt-2">
              <p className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">Calendario P&L</p>
              <CalendarPreview neutral={false} />
            </div>
          </div>
        </LevelCard>

        <LevelCard
          title="Completa"
          desc="Oltre alle cifre, maschera KPI e percentuali (••%) e neutralizza il calendario P&L: nessun dato economico leggibile."
          active={mode === "complete"}
        >
          <div className="space-y-2">
            <Row label="Saldo totale" normal="€2.430" masked={maskMoney()} />
            <Row label="Win rate" normal="63,4%" masked={maskKpi()} />
            <div className="pt-2">
              <p className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">Calendario P&L</p>
              <CalendarPreview neutral />
            </div>
          </div>
        </LevelCard>
      </div>
    </Card>
  );
}
