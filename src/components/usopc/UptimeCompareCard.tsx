"use client";
// ============================================================
// ASCEND — Card "PC acceso vs Lavoro" (Uso PC)
// Confronto tra tempo di ACCENSIONE (boot → ora, da /api/sysinfo
// uptime) e LAVORO EFFETTIVO (campioni tracker aggregati oggi).
// Differenza = tempo "non lavorato" (pause, svago, AFK).
// Medie: su 7 giorni di pcUsageLogs. Tutto async/dinamico.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { minutiToOre } from "@/lib/format";
import type { DB } from "@/lib/types";

const BASE = "http://127.0.0.1:4877";

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0;
}

export function UptimeCompareCard({ db, today }: { db: DB; today: string }) {
  const [uptimeMin, setUptimeMin] = useState<number | null>(null);
  const [online, setOnline] = useState(true);

  // uptime del PC: polling leggero 30s (0.4ms per lettura)
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`${BASE}/api/sysinfo`, { cache: "no-store" });
        const j = await res.json();
        if (!cancelled && j.ok) setUptimeMin(Math.round(j.uptimeSec / 60));
      } catch {
        if (!cancelled) setOnline(false);
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // lavoro effettivo oggi (tutte le categorie tracciate)
  const workTodayMin = useMemo(
    () => db.pcUsageLogs.filter((p) => p.date === today).reduce((s, p) => s + p.minutes, 0),
    [db, today]
  );

  // medie ultimi giorni COMPLETI (esclude oggi parziale)
  const avg7 = useMemo(() => {
    const days = new Set<string>();
    for (const l of db.pcUsageLogs) {
      if (l.date < today) days.add(l.date);
    }
    const recent = Array.from(days).sort().slice(-6); // ultimi 6 + oggi = finestra 7
    if (recent.length === 0) return null;
    const total = recent.reduce((acc, d) => acc + db.pcUsageLogs.filter((p) => p.date === d).reduce((s, p) => s + p.minutes, 0), 0);
    return Math.round(total / recent.length);
  }, [db, today]);

  const gapMin = uptimeMin === null ? null : Math.max(0, uptimeMin - workTodayMin);
  const ratio = uptimeMin !== null && uptimeMin > 0 ? pct(workTodayMin, uptimeMin) : 0;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <CardTitle className="text-sm">PC acceso vs lavoro effettivo</CardTitle>
          <CardSubtitle>tempo dal boot · campioni tracker di oggi · live</CardSubtitle>
        </div>
        {!online && <Badge tone="danger">offline</Badge>}
      </div>

      {/* doppia barra proporzionale */}
      <div className="mt-3 space-y-2">
        {/* barra PC acceso */}
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1 text-secondary-text">
              <span className="h-2 w-2 rounded-full bg-accent/50" /> PC acceso
            </span>
            <span className="tnum font-semibold text-foreground">
              {uptimeMin === null ? "…" : minutiToOre(uptimeMin)}
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-elevated-2">
            <div className="h-full rounded-full bg-accent/40" style={{ width: "100%" }} />
          </div>
        </div>
        {/* barra lavoro */}
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1 text-secondary-text">
              <span className="h-2 w-2 rounded-full bg-success" /> Lavoro tracciato
            </span>
            <span className="tnum font-semibold text-foreground">{minutiToOre(workTodayMin)}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-elevated-2">
            <div
              className="h-full rounded-full bg-success transition-all duration-500"
              style={{ width: `${ratio}%` }}
            />
          </div>
        </div>
      </div>

      {/* numeri chiave */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-border bg-elevated px-2 py-1.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Rapporto</p>
          <p className="tnum text-sm font-bold text-foreground">{ratio}%</p>
        </div>
        <div className="rounded-lg border border-border bg-elevated px-2 py-1.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Non tracciato</p>
          <p className="tnum text-sm font-bold text-foreground">
            {gapMin === null ? "…" : minutiToOre(gapMin)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-elevated px-2 py-1.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Media 7gg</p>
          <p className="tnum text-sm font-bold text-foreground">{avg7 === null ? "—" : minutiToOre(avg7)}</p>
        </div>
      </div>

      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        Il tracker campiona ogni 30s quando il PC è acceso: la differenza è pausa/svago/schermo spento.
      </p>
    </Card>
  );
}