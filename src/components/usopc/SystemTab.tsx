"use client";
// ============================================================
// ASCEND — Tab "Sistema" (Uso PC): CPU/RAM/disco/uptime live
// + top processi per RAM. Dati da /api/sysinfo del tracker-server
// (:4877, sola lettura). Polling SOLO mentre il componente è
// montato: chiudi la tab = zero richieste, zero costo.
// Costo per campione misurato: os.cpus() ~0.4ms; tasklist ~54ms
// solo ogni 10s e solo se la tab è aperta.
// ============================================================
import { useEffect, useRef, useState } from "react";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

interface SysProc {
  name: string;
  pid: number;
  memMb: number;
}
interface SysInfo {
  ok: boolean;
  cpuPercent: number | null;
  cores: number;
  memTotalGb: number;
  memUsedGb: number;
  memUsedPercent: number;
  uptimeSec: number;
  processes?: SysProc[];
}

const BASE = "http://127.0.0.1:4877";

function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}g ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

function memTone(pct: number): "success" | "warning" | "danger" {
  if (pct < 70) return "success";
  if (pct < 88) return "warning";
  return "danger";
}

export function SystemTab() {
  const [info, setInfo] = useState<SysInfo | null>(null);
  const [online, setOnline] = useState(true);
  const procTimerRef = useRef<number | null>(null);

  // polling leggero (5s) dei numeri base
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`${BASE}/api/sysinfo`, { cache: "no-store" });
        const j = (await res.json()) as SysInfo;
        if (!cancelled && j.ok) {
          setInfo(j);
          setOnline(true);
        }
      } catch {
        if (!cancelled) setOnline(false);
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      if (procTimerRef.current !== null) window.clearInterval(procTimerRef.current);
    };
  }, []);

  // top processi: max ogni 10s, SOLO con tab aperta
  useEffect(() => {
    const fetchProcs = async () => {
      try {
        const res = await fetch(`${BASE}/api/sysinfo?withProcesses=1`, { cache: "no-store" });
        const j = (await res.json()) as SysInfo;
        if (j.ok && j.processes) setInfo((prev) => (prev ? { ...j, processes: j.processes } : j));
      } catch { /* silenzioso */ }
    };
    void fetchProcs();
    procTimerRef.current = window.setInterval(() => void fetchProcs(), 10_000);
    return () => {
      if (procTimerRef.current !== null) window.clearInterval(procTimerRef.current);
    };
  }, []);

  const cpu = info?.cpuPercent ?? null;
  const memPct = info?.memUsedPercent ?? 0;

  return (
    <div className="space-y-4">
      {!online && (
        <Card hairline="danger">
          <div className="flex items-center gap-2 text-sm text-secondary-text">
            <Icon name="x" size={14} className="text-danger" />
            Tracker di sistema offline — avvia l&apos;app con il launcher per vedere le statistiche live.
          </div>
        </Card>
      )}

      {/* KPI riga */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="CPU"
          value={cpu === null ? "…" : `${cpu}%`}
          delta={info ? `${info.cores} core` : undefined}
          hairline={cpu === null ? "accent" : cpu! < 60 ? "success" : cpu! < 85 ? "accent" : "danger"}
          icon={<Icon name="zap" size={16} />}
        />
        <StatCard
          label="RAM"
          value={info ? `${info.memUsedGb} / ${info.memTotalGb} GB` : "…"}
          delta={info ? `${memPct}% in uso` : undefined}
          hairline={memTone(memPct) === "success" ? "success" : memTone(memPct) === "danger" ? "danger" : "accent"}
          icon={<Icon name="activity" size={16} />}
        />
        <StatCard
          label="Accensione PC"
          value={info ? formatUptime(info.uptimeSec) : "…"}
          delta="tempo dall'ultimo boot"
          icon={<Icon name="power" size={16} />}
        />
        <StatCard
          label="Stato"
          value={online ? "Live" : "Offline"}
          delta={online ? "aggiorna ogni 5s" : "tracker non risponde"}
          hairline={online ? "success" : "danger"}
          icon={<Icon name="monitor" size={16} />}
        />
      </div>

      {/* barra RAM visuale */}
      {info && (
        <Card>
          <CardTitle className="text-sm">Memoria</CardTitle>
          <CardSubtitle>{info.memUsedGb} GB usati su {info.memTotalGb} GB</CardSubtitle>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-elevated-2">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                memPct < 70 ? "bg-success" : memPct < 88 ? "bg-warning" : "bg-danger"
              )}
              style={{ width: `${memPct}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
            <span>0 GB</span>
            <span className="tnum font-semibold">{memPct}%</span>
            <span>{info.memTotalGb} GB</span>
          </div>
        </Card>
      )}

      {/* Top processi */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">Top processi · RAM</CardTitle>
            <CardSubtitle>i 8 più pesanti · aggiorna ogni 10s</CardSubtitle>
          </div>
          <Badge tone="default">sola lettura</Badge>
        </div>
        <div className="mt-3 space-y-1">
          {(info?.processes ?? []).map((p, i) => {
            const maxMb = info?.processes?.[0]?.memMb || 1;
            const pct = Math.round((p.memMb / maxMb) * 100);
            return (
              <div key={`${p.name}-${p.pid}-${i}`} className="flex items-center gap-2.5 rounded-lg border border-border bg-elevated/40 px-3 py-1.5 text-sm">
                <span className="w-6 shrink-0 text-right text-[11px] tnum text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{p.name}</span>
                <div className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-elevated-2 sm:block">
                  <div className="h-full rounded-full bg-accent/70" style={{ width: `${pct}%` }} />
                </div>
                <span className="tnum w-16 shrink-0 text-right font-semibold text-foreground">{p.memMb} MB</span>
              </div>
            );
          })}
          {(info?.processes ?? []).length === 0 && (
            <p className="py-3 text-center text-xs text-muted-foreground">
              {online ? "Carico i processi…" : "Processi disponibili solo con il tracker attivo."}
            </p>
          )}
        </div>
      </Card>

      <p className="text-center text-[11px] text-muted-foreground">
        Lettura diretta dal sistema, nessun dato salvato — costo ≈ 0 (polling solo con questa tab aperta).
      </p>
    </div>
  );
}