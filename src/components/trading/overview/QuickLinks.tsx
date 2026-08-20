"use client";

// ============================================================
// ASCEND — Trading overview: link rapidi alle sotto-sezioni
// di /trading/* (grid responsive di card con Button + descrizione).
// ============================================================

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface LinkDef {
  href: string;
  icon: string;
  title: string;
  desc: string;
}

const LINKS: LinkDef[] = [
  {
    href: "/trading/accounts",
    icon: "🏦",
    title: "Account",
    desc: "Account prop e personali: tipo, stato, capitale e saldo.",
  },
  {
    href: "/trading/trades",
    icon: "🕹",
    title: "Trade log",
    desc: "Registra e rivedi ogni trade con screenshot e note.",
  },
  {
    href: "/trading/setups",
    icon: "📋",
    title: "Playbook & Disciplina",
    desc: "Setup, regole e rispetto del playbook.",
  },
  {
    href: "/trading/import",
    icon: "📥",
    title: "Import storico",
    desc: "Importa i trade passati da un file CSV.",
  },
  {
    href: "/trading/stats",
    icon: "📈",
    title: "Statistiche",
    desc: "Trend, win rate e metriche di performance nel tempo.",
  },
  {
    href: "/trading/calendar",
    icon: "🗓",
    title: "Calendario P&L",
    desc: "Il P&L di ogni trading day, account per account.",
  },
  {
    href: "/trading/risk",
    icon: "🛡",
    title: "Risk Dashboard",
    desc: "Drawdown, limiti giornalieri e rischio per account.",
  },
  {
    href: "/trading/payouts",
    icon: "🏆",
    title: "Payout & Certificati",
    desc: "Payout ricevuti e spese della firm.",
  },
  {
    href: "/trading/review",
    icon: "✍️",
    title: "Weekly review",
    desc: "Rituali settimanali di auto-revisione del trading.",
  },
];

export function QuickLinks() {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-foreground">
        Esplora le sezioni
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LINKS.map((l) => (
          <Card
            key={l.href}
            className="flex flex-col gap-2 transition-colors hover:border-accent/40"
          >
            <div className="flex items-start justify-between">
              <span className="text-xl leading-none">{l.icon}</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">{l.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {l.desc}
              </p>
            </div>
            <div>
              <Link href={l.href}>
                <Button variant="outline" size="sm" className="w-full">
                  Apri
                </Button>
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
