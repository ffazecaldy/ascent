"use client";

// ============================================================
// ASCEND — Home · Muro dei traguardi (badge)
// Badge già sbloccate + quelle da sbloccare ora. Il bottone
// "Sblocca" persiste le nuove badge in db.badges (upsert).
// ============================================================

import { useState } from "react";
import { updateDB, nowISO } from "@/lib/storage";
import { computeNewBadges, BADGE_DEFS, badgeDef } from "@/lib/compute";
import type { DB } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export function BadgesWall({ db }: { db: DB }) {
  const ownedKeys = new Set(db.badges.map((b) => b.key));
  const newKeys = computeNewBadges(db);
  const [justUnlocked, setJustUnlocked] = useState<string[]>([]);

  const unlock = () => {
    const keys = computeNewBadges(db);
    if (keys.length === 0) return;
    updateDB((d) => {
      const owned = new Set(d.badges.map((b) => b.key));
      const fresh = keys.filter((k) => !owned.has(k));
      return {
        ...d,
        badges: [
          ...d.badges,
          ...fresh.map((key) => ({ key, unlockedAt: nowISO() })),
        ],
      };
    });
    setJustUnlocked(keys);
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Traguardi</CardTitle>
          <CardSubtitle>
            {db.badges.length > 0
              ? `${db.badges.length} sbloccati di ${BADGE_DEFS.length}`
              : "Collezione di badge"}
          </CardSubtitle>
        </div>
        {newKeys.length > 0 && (
          <Button size="sm" onClick={unlock}>
            Sblocca ({newKeys.length})
          </Button>
        )}
      </CardHeader>

      {newKeys.length > 0 && (
        <div className="mb-4 rounded-lg border border-accent/25 bg-accent/10 p-3">
          <p className="text-sm font-medium text-accent">
            🎉 Nuovi traguardi da sbloccare!
          </p>
          <p className="mt-0.5 text-xs text-secondary-text">
            {newKeys
              .map((k) => badgeDef(k)?.label ?? k)
              .join(" · ")}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {BADGE_DEFS.map((def) => {
          const unlocked = ownedKeys.has(def.key) || justUnlocked.includes(def.key);
          return (
            <div
              key={def.key}
              title={def.description}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition-colors",
                unlocked
                  ? "border-accent/30 bg-accent/10"
                  : "border-border bg-elevated/30 opacity-50"
              )}
            >
              <span className={cn("text-2xl", !unlocked && "grayscale")}>
                {unlocked ? def.emoji : "🔒"}
              </span>
              <p
                className={cn(
                  "text-xs font-semibold",
                  unlocked ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {def.label}
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {def.description}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
