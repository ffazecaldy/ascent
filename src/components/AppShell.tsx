"use client";
// ============================================================
// ASCEND — Shell dell'app: sidebar + header globale.
// - Streak pill sempre visibile (derivato a runtime)
// - Privacy toggle (standard / completa)
// - Onboarding gate: se non completato → /onboarding
// - Registrazione service worker (PWA)
// ============================================================

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDB, updateDB } from "@/lib/storage";
import { activityStreak } from "@/lib/compute";
import { cn } from "@/lib/cn";
import type { PrivacyMode } from "@/lib/types";
import { QuickLogButton } from "@/components/QuickLog";

interface NavItem {
  href: string;
  label: string;
  icon: string; // emoji
  section?: string;
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "",
    items: [{ href: "/", label: "Home", icon: "🏠" }],
  },
  {
    group: "Finanze",
    items: [{ href: "/finanze", label: "Finanze", icon: "💶" }],
  },
  {
    group: "Trading",
    items: [
      { href: "/trading", label: "Panoramica", icon: "📊" },
      { href: "/trading/accounts", label: "Account", icon: "🏦" },
      { href: "/trading/trades", label: "Trade log", icon: "🕹" },
      { href: "/trading/setups", label: "Playbook & Disciplina", icon: "📋" },
      { href: "/trading/import", label: "Import storico", icon: "📥" },
      { href: "/trading/stats", label: "Statistiche", icon: "📈" },
      { href: "/trading/calendar", label: "Calendario P&L", icon: "🗓" },
      { href: "/trading/risk", label: "Risk Dashboard", icon: "🛡" },
      { href: "/trading/payouts", label: "Payout & Certificati", icon: "🏆" },
      { href: "/trading/review", label: "Weekly review", icon: "✍️" },
    ],
  },
  {
    group: "Uso del PC",
    items: [{ href: "/usopc", label: "Uso del PC", icon: "💻" }],
  },
  {
    group: "Personale",
    items: [
      { href: "/libri", label: "Libri", icon: "📚" },
      { href: "/sport", label: "Sport", icon: "💪" },
    ],
  },
  {
    group: "Progressione",
    items: [{ href: "/obiettivi", label: "Obiettivi", icon: "🎯" }],
  },
  {
    group: "Sistema",
    items: [
      { href: "/export", label: "Backup / Export", icon: "📤" },
      { href: "/impostazioni", label: "Impostazioni", icon: "⚙️" },
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
      className="flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/10 px-3 py-1.5 text-sm font-semibold text-accent hover:bg-accent/20"
    >
      <span>🔥</span>
      <span className="tnum">{streak.days}</span>
      <span className="text-[11px] font-medium text-accent/70">giorni{streak.freezeUsed ? " (freeze)" : ""}</span>
    </Link>
  );
}

function PrivacyToggle() {
  const db = useDB();
  const mode: PrivacyMode = db.settings.privacyMode;
  const cycle = () => {
    const next: PrivacyMode = mode === "standard" ? "complete" : "standard";
    updateDB((d) => ({
      ...d,
      settings: { ...d.settings, privacyMode: next, updatedAt: new Date().toISOString() },
    }));
  };
  const label = mode === "standard" ? "Privacy: cifre" : "Privacy: totale";
  return (
    <button
      onClick={cycle}
      title="Maschera i dati per screenshot/condivisione (Standard: cifre · Completa: cifre+KPI+percentuali+calendario)"
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        mode === "complete"
          ? "border-danger/30 bg-danger/10 text-danger"
          : "border-border-strong bg-elevated text-secondary-text hover:text-foreground"
      )}
    >
      <span>{mode === "complete" ? "🕶" : "👁"}</span>
      {label}
    </button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const db = useDB();
  const pathname = usePathname();
  const router = useRouter();

  // Onboarding gate — primo accesso
  useEffect(() => {
    if (!db.settings.onboardingDone && pathname !== "/onboarding") {
      router.replace("/onboarding");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.settings.onboardingDone, pathname]);

  // Service worker (PWA)
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-card lg:flex">
        <SidebarContent pathname={pathname} />
      </aside>

      {/* Drawer mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-border bg-card">
            <SidebarContent pathname={pathname} onNavigate={() => setSidebarOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md lg:px-6">
          <button
            className="rounded-md p-1.5 text-secondary-text hover:bg-elevated lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tracking-tight">Ascend</p>
          </div>
          <div className="flex items-center gap-2">
            <QuickLogButton size="sm" />
            <StreakPill />
            <PrivacyToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:px-6">{children}</main>
      </div>
    </div>
  );
}

function SidebarContent({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex h-full flex-col overflow-y-auto p-3">
      <div className="mb-4 flex items-center gap-2 px-2 pt-1">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-base font-bold text-white">A</span>
        <span className="text-lg font-semibold tracking-tight">Ascend</span>
      </div>
      <div className="flex-1 space-y-4">
        {NAV.map((group, gi) => (
          <div key={gi}>
            {group.group && (
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {group.group}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                      active
                        ? "bg-accent/12 text-accent"
                        : "text-secondary-text hover:bg-elevated hover:text-foreground"
                    )}
                  >
                    <span className="text-sm">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
