"use client";

// ============================================================
// ASCEND — Sync tra 2 PC (LAN)
// Config: URL del sync-server (es. http://192.168.1.50:4878) +
// token condiviso + auto-sync (ogni 5 min). Il server gira sul
// PC principale (scripts/sync-server.mjs, avviato da run-dev) e
// fonde i DB: ogni dispositivo invia il suo, riceve l'unificato.
// ============================================================

import { useEffect, useSyncExternalStore, useState } from "react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Field, Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { SectionHeader } from "@/components/ui/Misc";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";
import {
  readSyncConfig,
  saveSyncConfig,
  subscribeSync,
  readLastSync,
  testSyncConnection,
  syncNow,
  defaultSyncConfig,
  type SyncConfig,
  type SyncOutcome,
} from "@/lib/sync";

function formatLast(iso: string | null): string {
  if (!iso) return "mai sincronizzato";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "mai sincronizzato";
  return d.toLocaleString("it-IT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SyncPage() {
  const cfg = useSyncExternalStore(subscribeSync, readSyncConfig, defaultSyncConfig);
  const [lastSync, setLastSync] = useState<string | null>(() => readLastSync());
  const [url, setUrl] = useState(cfg.url);
  const [token, setToken] = useState(cfg.token);
  const [auto, setAuto] = useState(cfg.auto);
  const [busy, setBusy] = useState<"test" | "sync" | null>(null);
  const [msg, setMsg] = useState<SyncOutcome | null>(null);

  // Sincronizza lo stato locale quando la config cambia (es. altro tab)
  useEffect(() => {
    queueMicrotask(() => {
      setUrl(cfg.url);
      setToken(cfg.token);
      setAuto(cfg.auto);
    });
     
  }, [cfg.url, cfg.token, cfg.auto]);

  function persist(partial: Partial<SyncConfig>) {
    const next: SyncConfig = { url: url.trim(), token: token.trim(), auto, ...partial };
    saveSyncConfig(next);
    setUrl(next.url);
    setToken(next.token);
    setAuto(next.auto);
  }

  async function doTest() {
    setBusy("test");
    setMsg(null);
    const r = await testSyncConnection(url.trim(), token.trim());
    setMsg(r);
    setBusy(null);
  }

  async function doSync() {
    setBusy("sync");
    setMsg(null);
    const r = await syncNow();
    setMsg(r);
    if (r.ok) setLastSync(readLastSync());
    setBusy(null);
  }

  const ready = url.trim().startsWith("http") && token.trim().length > 0;

  return (
    <div className="space-y-6">
      <SectionHeader
        kicker="Sistema · Sync"
        title="Sync tra i tuoi 2 PC"
        subtitle="Un database condiviso sulla tua rete: il sync-server gira sul PC principale, l'altro PC si collega con URL e token."
      />

      <Reveal>
        <Card hairline="accent">
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-accent/25 bg-accent/15">
                <Icon name="refresh" size={18} className="text-accent" />
              </div>
              <div>
                <CardTitle>Connessione al server</CardTitle>
                <CardSubtitle>
                  Sul PC principale avvia l&apos;app con run-dev (il server sync parte insieme).
                  Qui inserisci lo stesso URL e token che vedi nel suo terminale.
                </CardSubtitle>
              </div>
            </div>
            <Badge tone={lastSync ? "success" : "info"} pulse={!lastSync}>
              {lastSync ? `ultima sync · ${formatLast(lastSync)}` : "mai sincronizzato"}
            </Badge>
          </CardHeader>

          <div className="space-y-3">
            <Field label="URL del server">
              <Input
                type="url"
                placeholder="http://192.168.1.50:4878"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={() => persist({})}
              />
            </Field>
            <Field label="Token condiviso">
              <Input
                type="password"
                placeholder="x-sync-token (uguale su entrambi i PC)"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onBlur={() => persist({})}
              />
            </Field>

            <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
              <input
                type="checkbox"
                checked={auto}
                onChange={(e) => persist({ auto: e.target.checked })}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span className="text-sm font-medium text-foreground">Sincronizzazione automatica</span>
              <span className="text-xs text-muted-foreground">(ogni 5 minuti, silenziosa)</span>
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="subtle" onClick={doTest} disabled={busy !== null || !ready}>
                {busy === "test" ? "Test in corso…" : "Test connessione"}
              </Button>
              <Button variant="primary" glow onClick={doSync} disabled={busy !== null || !ready}>
                <Icon name="refresh" size={14} />
                {busy === "sync" ? "Sincronizzazione…" : "Sincronizza ora"}
              </Button>
            </div>

            {msg && (
              <div
                className={cn(
                  "flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm animate-pop",
                  msg.ok
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-danger/30 bg-danger/10 text-danger"
                )}
              >
                <Icon name={msg.ok ? "check" : "alert"} size={15} className="mt-0.5 shrink-0" />
                <span>
                  {msg.ok
                    ? msg.added + msg.updated === 0
                      ? "Sincronizzato: nessun dato nuovo (già allineato)."
                      : `Sincronizzato: ${msg.added} dati nuovi, ${msg.updated} aggiornati — DB unificato salvato.`
                    : msg.error}
                </span>
              </div>
            )}
          </div>
        </Card>
      </Reveal>

      <Reveal delay={60}>
        <Card>
          <CardHeader>
            <CardTitle>Come funziona (2 PC, stessa rete)</CardTitle>
          </CardHeader>
          <ol className="list-decimal space-y-1.5 px-4 text-xs leading-relaxed text-secondary-text">
            <li>
              <b className="text-foreground">PC principale</b>: avvia l&apos;app come sempre (run-dev). Il
              sync-server parte su <span className="tnum">:4878</span> — nel terminale vedi l&apos;indirizzo da
              usare e il token.
            </li>
            <li>
              Trova l&apos;IP di questo PC sulla rete (es. <span className="tnum">192.168.1.50</span>): da
              questo PC <span className="tnum">ipconfig</span>, oppure sul router. L&apos;URL da inserire è{" "}
              <span className="tnum">http://&lt;IP&gt;:4878</span>.
            </li>
            <li>
              <b className="text-foreground">Altro PC</b>: apri Ascend (stessa installazione), pagina{" "}
              <b>Sync</b>, inserisci URL + token identici, premi <b>Sincronizza ora</b>.
            </li>
            <li>
              Da allora: ogni sync fonde tutto (vince la modifica più recente, nulla si perde). Con
              l&apos;auto-sync i due PC restano allineati da soli.
            </li>
          </ol>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon name="lock" size={12} className="shrink-0" />
            I dati viaggiano solo sulla tua rete locale (o VPN), protetti dal token. Nessun cloud.
          </p>
        </Card>
      </Reveal>
    </div>
  );
}