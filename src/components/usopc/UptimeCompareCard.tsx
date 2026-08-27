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
import { cn } from "@/lib/cn";
import type { DB } from "@/lib/types";

const BASE = "http://127.0.0.1:4877";

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0;
}

export function UptimeCompareCard({ db, today }: { db: DB; today: string }) {
  const [uptimeMin, setUptimeMin] = useState<number | null>(null);
  const [workMin, setWorkMin] = useState<number | null>(null);
  const [online, setOnline] = useState(true);

  // uptime + lavoro tracciato: polling leggero 30s (0.4ms per lettura).
  // Il lavoro viene da /api/worktoday del TRACKER (fonte primaria): minuti
  // calcolati sul JSONL grezzo con dedup a slot 30s — immuni dai doppioni di
  // sincronizzazione/multi-tab che gonfiavano la somma dei pcUsageLogs oltre
  // il tempo reale di accensione. Fallback: somma dal DB (vecchio comportamento).
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`${BASE}/api/sysinfo`, { cache: "no-store" });
        const j = await res.json();
        if (!cancelled && j.ok) setUptimeMin(Math.round(j.uptimeSec / 60));
        setOnline(true);
      } catch {
        if (!cancelled) setOnline(false);
      }
      try {
        const res2 = await fetch(`${BASE}/api/worktoday`, { cache: "no-store" });
        const j2 = await res2.json();
        if (!cancelled && j2.ok && typeof j2.minutes === "number") {
          setWorkMin(Math.round(j2.minutes));
        }
      } catch {
        /* tracker online ma endpoint assente → resta il fallback DB */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // lavoro effettivo oggi (tutte le categorie tracciate) — FALLBACK se il
  // tracker non risponde con /api/worktoday
  const workFromDbMin = useMemo(
    () => db.pcUsageLogs.filter((p) => p.date === today).reduce((s, p) => s + p.minutes, 0),
    [db, today]
  );
  const workTodayMin = workMin ?? Math.round(workFromDbMin);

  // "PC acceso OGGI": l'uptime NON si azzera con lo standby e può coprire più
  // giorni (boot di ieri → 32h anche se oggi è attivo da 9h). La card confronta
  // OGGI con OGGI: min(uptime, minuti trascorsi da mezzanotte locale).
  const accesoOggiMin = useMemo(() => {
    if (uptimeMin === null) return null;
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: db.settings.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const [h, m] = fmt.format(new Date()).split(":").map(Number);
    return Math.min(uptimeMin, h * 60 + m);
  }, [uptimeMin, db.settings.timezone]);

  // Media 7gg: ultimi giorni COMPLETI (esclude oggi parziale) — somma dei log
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

  // ULTIMI 7 GIORNI (oggi incluso): minuti tracciati per giorno, per la tabella
  const week = useMemo(() => {
    const parse = (k: string) => {
      const [y, m, d] = k.split("-").map(Number);
      return new Date(y, m - 1, d);
    };
    const shift = (k: string, n: number) => {
      const dt = parse(k);
      dt.setDate(dt.getDate() + n);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    };
    const out: { key: string; dow: string; date: string; min: number; isToday: boolean }[] = [];
    for (let i = 6; i >= 0; i--) {
      const key = shift(today, -i);
      const dt = parse(key);
      const min = db.pcUsageLogs.filter((p) => p.date === key).reduce((s, p) => s + p.minutes, 0);
      out.push({
        key,
        dow: dt.toLocaleDateString("it-IT", { weekday: "short" }),
        date: dt.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }),
        min: Math.round(min),
        isToday: i === 0,
      });
    }
    return out;
  }, [db.pcUsageLogs, today]);

  const gapMin = accesoOggiMin === null ? null : Math.max(0, accesoOggiMin - workTodayMin);
  const ratio = accesoOggiMin !== null && accesoOggiMin > 0 ? pct(workTodayMin, accesoOggiMin) : 0;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <CardTitle className="text-sm">PC acceso vs tempo di tracciatura</CardTitle>
          <CardSubtitle>oggi · campioni tracker · live</CardSubtitle>
        </div>
        {!online && <Badge tone="danger">offline</Badge>}
      </div>

      {/* doppia barra proporzionale */}
      <div className="mt-3 space-y-2">
        {/* barra PC acceso */}
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1 text-secondary-text">
              <span className="h-2 w-2 rounded-full bg-accent/50" /> PC acceso oggi
            </span>
            <span className="tnum font-semibold text-foreground">
              {accesoOggiMin === null ? "…" : minutiToOre(accesoOggiMin)}
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
              <span className="h-2 w-2 rounded-full bg-success" /> Tempo di tracciatura
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

      {/* tabella utilizzo settimanale */}
      <div className="mt-3">
        <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <span className="h-px w-3 bg-border-strong" />
          Utilizzo ultimi 7 giorni
        </p>
        <div className="space-y-1">
          {week.map((d) => {
            const max = Math.max(...week.map((w) => w.min), 1);
            const w = Math.max(2, Math.round((d.min / max) * 100));
            return (
              <div key={d.key} className="flex items-center gap-2">
                <span
                  className={cn(
                    "w-16 shrink-0 text-[11px] font-medium capitalize",
                    d.isToday ? "text-accent" : "text-muted-foreground"
                  )}
                >
                  {d.dow} {d.date}
                </span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-elevated-2">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      d.isToday ? "bg-accent" : "bg-accent/40"
                    )}
                    style={{ width: `${w}%` }}
                  />
                </div>
                <span
                  className={cn(
                    "tnum w-14 shrink-0 text-right text-[11px] font-semibold",
                    d.isToday ? "text-foreground" : "text-secondary-text"
                  )}
                >
                  {d.min > 0 ? minutiToOre(d.min) : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        Il tracker campiona ogni 30s quando il PC è acceso: include lavoro, studio e
        anche svago (giochi, YouTube…) se fai alt-tab — la differenza è solo pausa/schermo spento.
        {uptimeMin !== null && accesoOggiMin !== null && uptimeMin - accesoOggiMin >= 60 && (
          <> Il PC è acceso da {minutiToOre(uptimeMin)} senza riavvii (lo standby non azzera il contatore).</>
        )}
      </p>
    </Card>
  );
}