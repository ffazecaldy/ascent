"use client";

// ============================================================
// ASCEND — Home dashboard (spec v3 §4.1)
// Hero streak · Ascend Day · heatmap · cosa manca oggi ·
// riepilogo rapido · best/worst settimana · muro traguardi.
// ============================================================

import { useDB } from "@/lib/storage";
import { SectionHeader } from "@/components/ui/Misc";
import { StreakHero } from "@/components/home/StreakHero";
import { AscendDayCard } from "@/components/home/AscendDayCard";
import { ActivityHeatmapCard } from "@/components/home/ActivityHeatmapCard";
import { MissingTodayCard } from "@/components/home/MissingTodayCard";
import { QuickSummary } from "@/components/home/QuickSummary";
import { BestWorstCard } from "@/components/home/BestWorstCard";
import { BadgesWall } from "@/components/home/BadgesWall";

export default function HomePage() {
  const db = useDB();

  return (
    <div className="space-y-6">
      <SectionHeader title="Home" subtitle="Tutto quello che conta oggi, in un colpo d'occhio." />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <StreakHero />
        </div>
        <AscendDayCard db={db} />
      </div>

      <ActivityHeatmapCard db={db} />

      <div className="grid gap-4 lg:grid-cols-2">
        <MissingTodayCard db={db} />
        <BestWorstCard db={db} />
      </div>

      <QuickSummary db={db} />

      <BadgesWall db={db} />
    </div>
  );
}
