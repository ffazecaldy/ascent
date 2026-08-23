"use client";

// ============================================================
// ASCEND — Home dashboard (spec v3 §4.1) · v2 rich+animated
// Stile myfundedbook: denso, glow, reveal on scroll, count-up.
// ============================================================

import { useDB } from "@/lib/storage";
import { SectionHeader } from "@/components/ui/Misc";
import { Reveal } from "@/components/ui/Reveal";
import { StreakHero } from "@/components/home/StreakHero";
import { AscendDayCard } from "@/components/home/AscendDayCard";
import { MissingTodayCard } from "@/components/home/MissingTodayCard";
import { DeadlinesCard } from "@/components/home/DeadlinesCard";
import { QuickSummary } from "@/components/home/QuickSummary";
import { BestWorstCard } from "@/components/home/BestWorstCard";
import { BadgesWall } from "@/components/home/BadgesWall";
import { QuoteRotator } from "@/components/home/QuoteRotator";
import { TradingCalendarCard } from "@/components/home/TradingCalendarCard";
import { EquityCurveCard } from "@/components/home/EquityCurveCard";
import { SavingsSummaryCard } from "@/components/home/SavingsSummaryCard";
import { GoalsOverviewCard } from "@/components/home/GoalsOverviewCard";
import { SportReminderCard } from "@/components/home/SportReminderCard";
import { RadarCard } from "@/components/home/RadarCard";

export default function HomePage() {
  const db = useDB();

  return (
    <div className="space-y-6">
      <SectionHeader
        kicker="Dashboard"
        title="Oggi conta."
        subtitle="Sistema operativo per la crescita personale — tutto quello che conta, in un colpo d'occhio."
      />

      <Reveal>
        <QuoteRotator />
      </Reveal>

      <Reveal>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <StreakHero />
          </div>
          <AscendDayCard db={db} />
        </div>
      </Reveal>

      {/* ——— Promemoria sport (solo con profilo configurato) ——— */}
      <Reveal delay={20}>
        <SportReminderCard db={db} />
      </Reveal>

      {/* ——— Panoramica: tutta l'app in un colpo d'occhio ——— */}
      <Reveal delay={40}>
        <SectionHeader
          kicker="Panoramica"
          title="Tutta l'app, in un colpo d'occhio."
          subtitle="Trading, risparmi e obiettivi: lo stato reale, aggiornato dal vivo."
        />
      </Reveal>

      <Reveal delay={60}>
        <div className="grid gap-4 lg:grid-cols-2">
          <TradingCalendarCard db={db} />
          <EquityCurveCard db={db} />
        </div>
      </Reveal>

      <Reveal delay={100}>
        <div className="grid gap-4 lg:grid-cols-2">
          <RadarCard db={db} />
          <SavingsSummaryCard db={db} />
        </div>
      </Reveal>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Reveal delay={0}>
            <MissingTodayCard db={db} />
          </Reveal>
          <Reveal delay={40}>
            <DeadlinesCard db={db} />
          </Reveal>
        </div>
        <Reveal delay={80}>
          <BestWorstCard db={db} />
        </Reveal>
      </div>

      <Reveal delay={60}>
        <QuickSummary db={db} />
      </Reveal>

      <Reveal delay={100}>
        <BadgesWall db={db} />
      </Reveal>
    </div>
  );
}
