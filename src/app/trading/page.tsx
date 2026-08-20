"use client";

// ============================================================
// ASCEND — Trading: panoramica (hub di /trading/*)
// Sezione 4.3 della specifica v3 — KPI del mese, account,
// ultimi trade e link rapidi alle sotto-sezioni.
// Reveal a cascata sulle sezioni, kicker "Trading".
// ============================================================

import Link from "next/link";
import { useDB } from "@/lib/storage";
import { SectionHeader, EmptyState } from "@/components/ui/Misc";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import {
  KpiCards,
  AccountsList,
  RecentTrades,
  QuickLinks,
} from "@/components/trading/overview";

export default function TradingOverviewPage() {
  const db = useDB();
  const hasData = db.trades.length > 0 || db.accounts.length > 0;

  return (
    <div className="space-y-6">
      <SectionHeader
        kicker="Trading"
        title="Panoramica"
        subtitle="KPI del mese, account e attività recente."
        action={
          <Link href="/trading/trades">
            <Button variant="outline" size="sm">
              + Nuovo trade
            </Button>
          </Link>
        }
      />

      {hasData ? (
        <>
          <Reveal delay={0}>
            <KpiCards db={db} />
          </Reveal>
          <Reveal delay={80}>
            <AccountsList db={db} />
          </Reveal>
          <Reveal delay={40}>
            <RecentTrades db={db} />
          </Reveal>
        </>
      ) : (
        <Reveal>
          <EmptyState
            icon="📊"
            title="Il tuo trading parte da qui"
            description="Crea il primo account o registra il primo trade: qui vedrai KPI del mese, saldi live e attività recente."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/trading/accounts">
                  <Button size="sm" variant="primary">
                    Crea account
                  </Button>
                </Link>
                <Link href="/trading/trades">
                  <Button size="sm" variant="outline">
                    Trade log
                  </Button>
                </Link>
              </div>
            }
          />
        </Reveal>
      )}

      <Reveal delay={60}>
        <QuickLinks />
      </Reveal>
    </div>
  );
}
