"use client";

// ============================================================
// ASCEND — Trading overview: "Sequenza in corso"
// Chip animato delle consecutive W/L sui trade chiusi (tutti).
// 🔥 N win (verde, dot in ping/pulse) · ⚠ N loss (rosso, ping) ·
// 🧊 neutro. In privacy "complete" mostra un conteggio mascherato
// (kpiMasked), come nel resto del modulo trading.
// ============================================================

import { cn } from "@/lib/cn";
import type { DB } from "@/lib/types";
import type { ReactNode } from "react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { consecutiveWinsLosses } from "@/lib/compute";
import { kpiMasked, maskCompact } from "@/lib/privacy";
import { Icon } from "@/components/ui/Icon";

type Tone = "success" | "danger" | "default";

const TONE_CLS: Record<Tone, string> = {
  success: "border-success/40 bg-success/10 text-success",
  danger: "border-danger/40 bg-danger/10 text-danger",
  default: "border-border-strong bg-elevated text-secondary-text",
};

const TONE_DOT: Record<Tone, string> = {
  success: "var(--success)",
  danger: "var(--danger)",
  default: "var(--border-strong)",
};

export function StreakChip({ db }: { db: DB }) {
  const kpiHide = kpiMasked(db.settings.privacyMode);
  const streak = consecutiveWinsLosses(db.trades);

  let emoji: ReactNode;
  let count: string;
  let label: string;
  let tone: Tone;
  const live = !kpiHide && streak.current !== null;

  if (kpiHide) {
    emoji = "·";
    count = maskCompact();
    label = "sequenza";
    tone = "default";
  } else if (streak.current === "win") {
    emoji = <Icon name="flame" size={14} />;
    count = String(streak.wins);
    label = "win di fila";
    tone = "success";
  } else if (streak.current === "loss") {
    emoji = <Icon name="alert" size={14} />;
    count = String(streak.losses);
    label = "loss di fila";
    tone = "danger";
  } else {
    emoji = <Icon name="activity" size={14} />;
    count = "0";
    label = "neutro";
    tone = "default";
  }

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div>
          <CardTitle>Sequenza in corso</CardTitle>
          <CardSubtitle>Consecutive sui trade chiusi</CardSubtitle>
        </div>
      </CardHeader>
      <div className="flex flex-1 items-center justify-center py-3">
        <div
          className={cn(
            "relative inline-flex items-center gap-2.5 rounded-full border px-4 py-2",
            TONE_CLS[tone]
          )}
        >
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {live && (
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                style={{ backgroundColor: TONE_DOT[tone] }}
              />
            )}
            <span
              className="relative inline-flex h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: TONE_DOT[tone] }}
            />
          </span>
          <span className="text-sm leading-none">{emoji}</span>
          <span className="tnum text-lg font-bold leading-none">{count}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider">
            {label}
          </span>
        </div>
      </div>
    </Card>
  );
}
