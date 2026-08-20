"use client";

// ============================================================
// ASCEND — Trading overview: link rapidi alle sotto-sezioni
// di /trading/* — grid di card compatte con icona in tile,
// hover-lift e freccia in evidenza al passaggio.
// ============================================================

import Link from "next/link";

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
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          Esplora le sezioni
        </h2>
        <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[0_14px_34px_-16px_rgba(0,0,0,0.75)]"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-dim text-lg leading-none transition-transform duration-200 group-hover:scale-110">
              {l.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{l.title}</p>
              <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {l.desc}
              </p>
            </div>
            <span className="mt-1 shrink-0 text-sm text-accent opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100">
              →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
