"use client";
// ============================================================
// ASCEND — Shell: sidebar + header. Stile myfundedbook, più animato:
// brand in gradiente, nav con pill attiva, streak con glow, blur header.
// ============================================================

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDB, updateDB } from "@/lib/storage";
import {
  activityStreak,
  evalProgress,
  applyRecurringRules,
  riskLimitAlerts,
  riskAckBucket,
  type RiskLimitAlert,
} from "@/lib/compute";
import { cn } from "@/lib/cn";
import { todayKey } from "@/lib/dates";
import { formatMoney, formatPercent } from "@/lib/format";
import { moneyMasked, maskMoney, maskKpi } from "@/lib/privacy";
import type { PrivacyMode } from "@/lib/types";
import { PRIVACY_ORDER } from "@/lib/privacy";
import { Icon, type IconName } from "@/components/ui/Icon";

interface NavItem {
  href: string;
  label: string;
  icon: IconName | { img: string; alt: string };
}

// localStorage key per l'acknowledge dei banner di drawdown:
// { "<accountId>-<daily|max>": timestamp dell'ack }
const RISK_ACK_KEY = "ascend:risk-ack";

const NAV: { group: string; items: NavItem[] }[] = [
  { group: "", items: [{ href: "/", label: "Home", icon: "home" }] },
  {
    group: "Finanze",
    items: [
      { href: "/finanze", label: "Finanze", icon: "wallet" },
      { href: "/risparmi", label: "Risparmi", icon: "coins" },
    ],
  },
  {
    group: "Trading",
    items: [
      { href: "/trading", label: "Panoramica", icon: "chart-line" },
      { href: "/trading/accounts", label: "Account", icon: "building" },
      { href: "/trading/trades", label: "Trade log", icon: "list" },
      { href: "/trading/setups", label: "Playbook · Disciplina", icon: "clipboard" },
      { href: "/trading/import", label: "Import storico", icon: "upload" },
      { href: "/trading/stats", label: "Statistiche", icon: "activity" },
      { href: "/trading/calendar", label: "Calendario P&L", icon: "calendar" },
      { href: "/trading/risk", label: "Risk Dashboard", icon: "shield" },
      { href: "/trading/payouts", label: "Payout · Certificati", icon: "trophy" },
      { href: "/trading/review", label: "Weekly review", icon: "pen" },
    ],
  },
  {
    group: "Uso del PC",
    items: [{ href: "/usopc", label: "Uso del PC", icon: "monitor" }],
  },
  {
    group: "Personale",
    items: [
      { href: "/studio", label: "Studio", icon: { img: "/icons/studio.png", alt: "Studio" } },
      { href: "/libri", label: "Libri", icon: "book-open" },
      { href: "/sport", label: "Sport", icon: "dumbbell" },
    ],
  },
  {
    group: "Progressione",
    items: [{ href: "/obiettivi", label: "Obiettivi", icon: "target" }],
  },
  {
    group: "Sistema",
    items: [
      { href: "/export", label: "Backup / Export", icon: "download" },
      { href: "/impostazioni", label: "Impostazioni", icon: "settings" },
    ],
  },
];

function StreakPill() {
  const db = useDB();
  const streak = activityStreak(db);
  return (
    <Link
      href="/"
      title="Activity Streak — calcolato a runtime"
      className={cn(
        "group flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
        streak.days > 0
          ? "border-accent/40 bg-accent/10 text-accent hover:bg-accent/20"
          : "border-border-strong bg-elevated text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon name="flame" size={14} className={cn(streak.days > 0 ? "text-accent animate-pulse-dot" : "text-muted-foreground")} />
      <span className="tnum">{streak.days}</span>
      <span className="text-[11px] font-medium opacity-70">
        {streak.days === 1 ? "giorno" : "giorni"}
        {streak.freezeUsed ? " · freeze" : ""}
      </span>
    </Link>
  );
}

function PrivacyToggle() {
  const db = useDB();
  const mode: PrivacyMode = db.settings.privacyMode;
  const cycle = () => {
    const next = PRIVACY_ORDER[(PRIVACY_ORDER.indexOf(mode) + 1) % PRIVACY_ORDER.length];
    updateDB((d) => ({
      ...d,
      settings: { ...d.settings, privacyMode: next, updatedAt: new Date().toISOString() },
    }));
  };
  const icon: IconName = mode === "off" ? "eye" : mode === "standard" ? "lock" : "shield";
  const label = mode === "off" ? "Privacy off" : mode === "standard" ? "Cifre" : "Totale";
  return (
    <button
      onClick={cycle}
      title="Privacy: Off (tutto visibile) · Standard (cifre nascoste) · Completa (anche KPI e calendario)"
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        mode === "complete"
          ? "border-danger/30 bg-danger/10 text-danger"
          : mode === "standard"
            ? "border-warning/30 bg-warning/10 text-warning"
            : "border-border-strong bg-elevated text-secondary-text hover:border-accent/40 hover:text-foreground"
      )}
    >
      <Icon name={icon} size={14} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const db = useDB();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!db.settings.onboardingDone && pathname !== "/onboarding") {
      router.replace("/onboarding");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.settings.onboardingDone, pathname]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  // RICORRENTI — generazione automatica all'apertura (una volta per sessione):
  // le regole attive con dayOfMonth <= oggi generano la transazione del mese
  // (anti-doppione via id deterministico rec-<rule>-<mese> e lastAppliedMonth).
  const recurringRanRef = useRef(false);
  useEffect(() => {
    if (recurringRanRef.current) return;
    if (!db.recurringRules || db.recurringRules.length === 0) return;
    recurringRanRef.current = true;
    const today = todayKey(db.settings.timezone);
    const { transactions: newTx, rules: updatedRules } = applyRecurringRules(db, today);
    if (newTx.length === 0) return;
    updateDB((d) => ({
      ...d,
      transactions: [...d.transactions, ...newTx],
      recurringRules: d.recurringRules.map((r) => updatedRules.find((u) => u.id === r.id) ?? r),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // PROMOZIONE EVAL → FINANZIATO (globale: scatta da qualunque pagina)
  const [evalToast, setEvalToast] = useState<string | null>(null);
  const promotedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const acc of db.accounts) {
      if (acc.status !== "eval") {
        promotedRef.current.delete(acc.id);
        continue;
      }
      if (promotedRef.current.has(acc.id)) continue;
      const p = evalProgress(db, acc);
      if (p.reached) {
        promotedRef.current.add(acc.id);
        updateDB((d) => ({
          ...d,
          accounts: d.accounts.map((a) =>
            a.id === acc.id ? { ...a, status: "finanziato" as const, evalTarget: null } : a
          ),
        }));
        setEvalToast(`🎉 ${acc.name} ha raggiunto l'obiettivo: promosso a Finanziato`);
      }
    }
  }, [db]);
  useEffect(() => {
    if (!evalToast) return;
    const t = setTimeout(() => setEvalToast(null), 6000);
    return () => clearTimeout(t);
  }, [evalToast]);

  // ALERT DRAWDOWN GLOBALE — banner sotto l'header per ogni account attivo
  // (non archiviato, eval|finanziato) con daily/max loss limit consumato ≥80%.
  const riskAlerts = useMemo(
    () => riskLimitAlerts(db),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db.accounts, db.trades]
  );

  const [riskAckVersion, setRiskAckVersion] = useState(0);

  // ack letti a ogni cambio versione (bottone ✕) — fuori dal DB, solo localStorage
  const riskAcks = useMemo(() => {
    void riskAckVersion;
    try {
      const raw = localStorage.getItem(RISK_ACK_KEY);
      return raw ? (JSON.parse(raw) as Record<string, number>) : {};
    } catch {
      return {};
    }
  }, [riskAckVersion]);

  // banner attivi = alert la cui soglia non è stata ancora ack-ata
  // (l'ack è valido finché il consumo resta nella stessa fascia: 80|100)
  const activeRiskAlerts = riskAlerts.filter((a) => {
    const ackAt = riskAcks[`${a.accountId}-${a.kind}`];
    if (!ackAt) return true;
    return false;
  });

  const ackRiskAlert = (a: RiskLimitAlert) => {
    try {
      const raw = localStorage.getItem(RISK_ACK_KEY);
      const map: Record<string, number> = raw ? JSON.parse(raw) : {};
      map[`${a.accountId}-${a.kind}`] = Date.now();
      localStorage.setItem(RISK_ACK_KEY, JSON.stringify(map));
      setRiskAckVersion((v) => v + 1); // forza il filtro degli ack senza toccare il DB
    } catch {
      /* localStorage indisponibile: il banner riapparirà al prossimo render */
    }
  };

  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="relative flex min-h-screen">
      {/* Semi-sfondo: wallpaper che svanisce gradualmente verso l'alto (a malapena visibile) */}
      <div aria-hidden className="wallpaper-fade pointer-events-none fixed inset-0 z-0" />

      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-[--bg-elev-1]/60 backdrop-blur-xl lg:flex">
        <SidebarContent pathname={pathname} />
      </aside>

      {/* Drawer mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="animate-rise absolute inset-y-0 left-0 w-64 border-r border-border bg-[--bg-elev-1]">
            <SidebarContent pathname={pathname} onNavigate={() => setSidebarOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col lg:pl-60">
        <header
          className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 lg:px-6"
          style={{
            background:
              "linear-gradient(to bottom, rgba(11,11,12,0.82) 0%, rgba(11,11,12,0.5) 55%, rgba(11,11,12,0) 100%)",
          }}
        >
          <button
            className="rounded-lg p-1.5 text-secondary-text hover:bg-elevated lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tracking-tight">
              Ascend
              <span className="ml-2 hidden text-xs font-normal text-muted-foreground sm:inline">
                · {new Date().toLocaleDateString(db.settings.locale || "it-IT", { weekday: "long", day: "numeric", month: "long" })}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StreakPill />
            <PrivacyToggle />
          </div>
        </header>

        {/* ALERT DRAWDOWN GLOBALE */}
        {activeRiskAlerts.length > 0 && (
          <div className="mx-auto w-full max-w-6xl space-y-2 px-4 pt-3 lg:px-6">
            {activeRiskAlerts.map((a) => {
              const over = a.pct >= 100;
              return (
                <div
                  key={`${a.accountId}-${a.kind}`}
                  className={cn(
                    "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-2.5 text-sm",
                    over
                      ? "animate-pulse-dot border-danger/50 bg-danger/12 text-danger"
                      : "border-warning/40 bg-warning/10 text-warning"
                  )}
                >
                  <Icon name={over ? "alert" : "shield"} size={16} />
                  <span className="font-semibold">{a.accountName}</span>
                  <span>
                    {over ? "LIMITE SUPERATO —" : ""} {a.kind === "daily" ? "Perdita giornaliera" : "Max loss"}:{" "}
                    <span className="tnum font-bold">{a.pct}%</span> · residuo{" "}
                    <span className="tnum font-medium">
                      {moneyMasked(db.settings.privacyMode) ? maskMoney() : formatMoney(a.remaining, a.nativeCurrency)}
                    </span>
                  </span>
                  <button
                    onClick={() => ackRiskAlert(a)}
                    aria-label="Nascondi avviso"
                    className="ml-auto rounded-md p-1 transition-colors hover:bg-elevated"
                  >
                    <Icon name="x" size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-7 lg:px-6">{children}</main>
      </div>

      {/* Toast promozione eval */}
      {evalToast && (
        <div className="animate-pop fixed left-1/2 top-4 z-[60] w-[min(92vw,420px)] -translate-x-1/2 rounded-xl border border-success/30 bg-[--bg-elev-1] px-4 py-3 shadow-[--shadow-pop]">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-success/15 text-lg">🎉</span>
            <p className="text-sm font-medium text-foreground">{evalToast}</p>
            <button
              onClick={() => setEvalToast(null)}
              className="ml-auto rounded-md p-1 text-muted-foreground hover:text-foreground"
              aria-label="Chiudi"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarContent({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex h-full flex-col overflow-y-auto p-3">
      {/* Brand */}
      <div className="mb-5 flex items-center gap-2.5 px-2 pt-1">
        <div className="relative flex h-9 w-9 items-center justify-center">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-accent via-accent-2 to-accent-3 opacity-90 blur-[6px]" />
          <img
            src="/icons/studio.png"
            alt="Ascend"
            className="relative h-9 w-9 rounded-xl object-cover shadow-lg ring-1 ring-white/10"
          />
        </div>
        <span className="text-lg font-bold tracking-tight">
          Ascend<span className="grad-text">.</span>
        </span>
      </div>

      <div className="flex-1 space-y-4">
        {NAV.map((group, gi) => (
          <div key={gi}>
            {group.group && (
              <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                {group.group}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                // BUG FIX: un item "padre" (es. /trading) resta attivo anche sulle sue
                // sotto-rotte. Un item è padre se un altro item inizia con il suo path.
                const isParent = group.items.some(
                  (i) => i.href !== item.href && i.href.startsWith(item.href + "/")
                );
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : isParent
                      ? pathname === item.href
                      : pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150",
                      active
                        ? "bg-accent/15 text-accent"
                        : "text-secondary-text hover:bg-elevated hover:text-foreground"
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-accent to-accent-3 shadow-[0_0_8px_var(--accent-glow)]" />
                    )}
                    {typeof item.icon === "string" ? (
                      <Icon
                        name={item.icon as IconName}
                        size={18}
                        className={cn(
                          "shrink-0 transition-colors",
                          active ? "text-accent" : "text-secondary-text group-hover:text-foreground"
                        )}
                      />
                    ) : (
                      <img
                        src={item.icon.img}
                        alt={item.icon.alt}
                        className="h-4 w-4 rounded object-cover transition-transform duration-150 group-hover:scale-110"
                      />
                    )}
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-border bg-elevated/60 p-3">
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Un sistema, un solo dato di verità: <span className="text-secondary-text">sto diventando una versione migliore, giorno dopo giorno.</span>
        </p>
      </div>
    </nav>
  );
}
