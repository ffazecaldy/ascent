"use client";

// ============================================================
// ASCEND — Trade log: lista trade filtrati (account + mese)
// Card per trade con hairline success/danger in base al risultato,
// riga densa (data · strumento · direzione · R · P&L · setup · dots
// disciplina per regola · thumbnail con hover zoom) · azioni.
// ============================================================

import React, { useState } from "react";
import type { DB, Trade } from "@/lib/types";
import { Badge, StatusDot } from "@/components/ui/Badge";
import { getAccount, setupName } from "@/lib/db";
import { formatR, formatSignedMoney } from "@/lib/format";
import { kpiMasked, moneyMasked, maskMoney, maskKpi } from "@/lib/privacy";
import { tradeRespected, rulesOfSetup } from "@/lib/compute";
import { cn } from "@/lib/cn";
import { formatDayTime } from "./trade-utils";
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
        const discColor = disc === true ? "#2ddf9e" : disc === false ? "#ff5c5c" : "#6b6b72";
        const discLabel =
          disc === true ? "Disciplina rispettata" : disc === false ? "Regola del setup non rispettata" : "Non valutabile";
        const rn = t.resultNative;
        const pseudo = Boolean(t.screenshots?.length);
        const hairline: "success" | "danger" | "none" = rn > 0 ? "success" : rn < 0 ? "danger" : "none";
        // stato disciplina PER REGOLA (regole attive del setup selezionato)
        const setupRules = t.setupId ? rulesOfSetup(db, t.setupId).filter((r) => r.active) : [];
        const ruleRespected = (ruleId: string): boolean => {
          const entry = db.tradeSetupRules.find((x) => x.tradeId === t.id && x.ruleId === ruleId);
          return entry ? entry.respected : false;
        };
        const prices =
          t.entry != null || t.exit != null || t.stop != null || t.target != null || t.size != null;

        return (
          <article
            key={t.id}
            className={cn(
              "group relative rounded-[--radius] border border-border bg-card p-3 shadow-[--shadow-card] transition-colors hover:border-border-strong",
              "hover-lift"
            )}
          >
            {/* Hairline in base al risultato */}
            {hairline === "success" && (
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-success to-transparent" />
            )}
            {hairline === "danger" && (
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-danger to-transparent" />
            )}

            <div className="flex items-center gap-3">
              {/* Thumbnail screenshot con hover zoom */}
              {pseudo && (
                <button
                  type="button"
                  onClick={() => setView(t.screenshots[0])}
                  title="Ingrandisci screenshot"
                  className="group/thumb relative h-12 w-[4.4rem] shrink-0 cursor-zoom-in rounded-md"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={t.screenshots[0]}
                    alt={`Screenshot — ${t.instrument}`}
                    className={cn(
                      "absolute inset-0 h-full w-full origin-bottom-left rounded-md border border-border-strong bg-elevated object-cover",
                      "transition-transform duration-200 ease-out group-hover/thumb:z-30 group-hover/thumb:scale-[2.4]",
                      "group-hover/thumb:border-accent/70 group-hover/thumb:shadow-[0_18px_44px_-12px_rgba(0,0,0,0.9)]"
                    )}
                  />
                  {t.screenshots.length > 1 && (
                    <span className="absolute -bottom-1 -right-1 rounded bg-black/70 px-1 py-0.5 text-[8px] font-semibold text-secondary-text tnum backdrop-blur">
                      +{t.screenshots.length - 1}
                    </span>
                  )}
                </button>
              )}

              {/* Colonna dati */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[11px] text-muted-foreground tnum">{formatDayTime(t.closeDate, db.settings.locale)}</span>
                  {showAccount && acc && (
                    <span className="max-w-28 truncate text-[11px] text-muted-foreground">{acc.name}</span>
                  )}
                  <span className="truncate text-sm font-semibold tracking-tight tnum">{t.instrument}</span>
                  <Badge tone={t.direction === "long" ? "info" : "default"}>
                    {t.direction === "long" ? "▲ Long" : "▼ Short"}
                  </Badge>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {t.setupId && (
                    <Badge tone="default" className="max-w-[150px] truncate">
                      📋 {setupName(db, t.setupId)}
                    </Badge>
                  )}

                  {t.setupId && (
                    <span
                      title={discLabel}
                      className="inline-flex items-center gap-1"
                    >
                      <StatusDot color={discColor} />
                    </span>
                  )}

                  {t.setupId && setupRules.length > 0 && (
                    <span className="flex items-center gap-1.5 pl-1">
                      {setupRules.map((r) => {
                        const ok = ruleRespected(r.id);
                        return (
                          <span key={r.id} className="group/rule relative">
                            <span
                              className={cn(
                                "block h-1.5 w-1.5 rounded-full transition-transform duration-150 group-hover/rule:scale-150",
                                !kpiHidden
                                  ? ok
                                    ? "bg-success"
                                    : "bg-danger"
                                  : "bg-muted-foreground/60"
                              )}
                            />
                            <span className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-border-strong bg-card px-2 py-1 text-[10px] shadow-[--shadow-pop] group-hover/rule:block">
                              <span className={ok ? "text-success" : "text-danger"}>{ok ? "✓" : "✗"}</span>{" "}
                              {r.text}
                            </span>
                          </span>
                        );
                      })}
                    </span>
                  )}

                  {t.emotion && (
                    <Badge tone="default" className="lowercase tracking-normal normal-case">
                      😐 {t.emotion}
                    </Badge>
                  )}
                </div>

                {/* Prezzi + descrizione: sottile, una riga */}
                {(prices || t.description) && (
                  <div className="mt-1.5 flex min-w-0 items-center gap-2 text-[10px] text-muted-foreground tnum">
                    {prices && (
                      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {t.entry != null && <span>E {t.entry}</span>}
                        {t.exit != null && <span>X {t.exit}</span>}
                        {t.stop != null && <span>SL {t.stop}</span>}
                        {t.target != null && <span>TP {t.target}</span>}
                        {t.size != null && <span>Q {t.size}</span>}
                      </span>
                    )}
                    {t.description && (
                      <span className="truncate normal-case text-muted-foreground/90">{t.description}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Metriche */}
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span
                  title="Risultato in R"
                  className={cn(
                    "text-sm font-semibold tracking-tight tnum",
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
                    "text-[13px] font-semibold tnum",
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

              {/* Azioni */}
              <div className="flex shrink-0 flex-col gap-0.5">
                <button
                  onClick={() => onEdit(t)}
                  title="Modifica"
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                </button>
                <button
                  onClick={() => onDelete(t)}
                  title="Elimina"
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  </svg>
                </button>
              </div>
            </div>
          </article>
        );
      })}

      <Lightbox open={!!view} src={view} onClose={() => setView(null)} />
    </div>
  );
}
