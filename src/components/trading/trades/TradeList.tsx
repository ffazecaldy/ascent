"use client";

// ============================================================
// ASCEND — Trade log: lista trade filtrati (account + mese)
// Riga: data chiusura · strumento · direzione badge · R colorato
// · resultNative colorato · setup badge · screenshot · stato disciplina · azioni
// ============================================================

import React, { useState } from "react";
import type { DB, Trade } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Badge, StatusDot } from "@/components/ui/Badge";
import { getAccount, setupName } from "@/lib/db";
import { formatR, formatSignedMoney } from "@/lib/format";
import { kpiMasked, moneyMasked, maskMoney, maskKpi } from "@/lib/privacy";
import { tradeRespected } from "@/lib/compute";
import { cn } from "@/lib/cn";
import { formatCloseDate } from "./trade-utils";
import { Lightbox } from "./Lightbox";

export function TradeList({
  db,
  trades,
  onEdit,
  onDelete,
  showAccount = false,
}: {
  db: DB;
  trades: Trade[];
  onEdit: (t: Trade) => void;
  onDelete: (t: Trade) => void;
  showAccount?: boolean;
}) {
  const [view, setView] = useState<string | null>(null);
  const moneyHidden = moneyMasked(db.settings.privacyMode);
  const kpiHidden = kpiMasked(db.settings.privacyMode);

  return (
    <div className="space-y-2.5">
      {trades.map((t) => {
        const acc = getAccount(db, t.accountId);
        const currency = acc?.nativeCurrency ?? db.settings.baseCurrency;
        const disc = tradeRespected(db, t.id); // true | false | null
        const discColor = disc === true ? "#22c55e" : disc === false ? "#ef4444" : "#6b6b72";
        const discLabel =
          disc === true ? "Disciplina rispettata" : disc === false ? "Regola del setup non rispettata" : "Non valutabile";
        const rn = t.resultNative;
        const pseudo = Boolean(t.screenshots?.length);

        return (
          <Card key={t.id} className="p-3.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="flex min-w-0 flex-col">
                <p className="text-xs text-muted-foreground tnum">{formatCloseDate(t.closeDate, db.settings.locale)}</p>
                {showAccount && acc && <p className="text-[11px] text-muted-foreground">{acc.name}</p>}
              </div>

              <div className="flex min-w-0 items-center gap-2">
                <Badge
                  tone={t.direction === "long" ? "info" : "default"}
                >
                  {t.direction === "long" ? "▲ Long" : "▼ Short"}
                </Badge>
                <span className="truncate text-sm font-semibold tnum">{t.instrument}</span>
              </div>

              {t.setupId && (
                <Badge tone="default" className="max-w-[160px] truncate" >
                  📋 {setupName(db, t.setupId)}
                </Badge>
              )}

              <div className="ml-auto flex items-center gap-3">
                <StatusDot color={discColor} />

                {t.setupId && disc !== null && (
                  <span
                    title={discLabel}
                    className={cn(
                      "text-xs font-medium",
                      disc === true ? "text-success" : disc === false ? "text-danger" : "text-muted-foreground"
                    )}
                  >
                    {kpiHidden ? maskKpi() : "Disciplina " + (disc ? "✓" : "✗")}
                  </span>
                )}

                <span
                  title="Risultato in R"
                  className={cn(
                    "text-sm font-semibold tnum",
                    kpiHidden
                      ? "text-muted-foreground"
                      : t.resultR > 0
                        ? "text-success"
                        : t.resultR < 0
                          ? "text-danger"
                          : "text-muted-foreground"
                  )}
                >
                  {kpiHidden ? maskKpi() : formatR(t.resultR)}
                </span>

                <span
                  title={`Risultato · ${currency}`}
                  className={cn(
                    "text-sm font-semibold tnum",
                    moneyHidden
                      ? "text-muted-foreground"
                      : rn > 0
                        ? "text-success"
                        : rn < 0
                          ? "text-danger"
                          : "text-muted-foreground"
                  )}
                >
                  {moneyHidden ? maskMoney() : formatSignedMoney(rn, currency, db.settings.locale)}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => onEdit(t)}
                  title="Modifica"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-elevated hover:text-foreground"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                </button>
                <button
                  onClick={() => onDelete(t)}
                  title="Elimina"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  </svg>
                </button>
              </div>
            </div>

            {pseudo && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {t.screenshots.map((s, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={s}
                    alt={`Screenshot ${i + 1}`}
                    onClick={() => setView(s)}
                    className="h-10 w-14 cursor-zoom-in rounded-md border border-border-strong object-cover"
                  />
                ))}
              </div>
            )}

            {(t.entry != null ||
              t.exit != null ||
              t.stop != null ||
              t.target != null ||
              t.size != null) && (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground tnum">
                {t.entry != null && <span>Entry {t.entry}</span>}
                {t.exit != null && <span>Exit {t.exit}</span>}
                {t.stop != null && <span>Stop {t.stop}</span>}
                {t.target != null && <span>Target {t.target}</span>}
                {t.size != null && <span>Size {t.size}</span>}
              </div>
            )}

            {(t.description || t.emotion) && (
              <p className="mt-1.5 text-xs text-secondary-text">
                {t.emotion && <span className="mr-2 rounded bg-elevated px-1.5 py-0.5 text-[11px]">😐 {t.emotion}</span>}
                {t.description}
              </p>
            )}
          </Card>
        );
      })}

      <Lightbox open={!!view} src={view} onClose={() => setView(null)} />
    </div>
  );
}
