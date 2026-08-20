"use client";
// ============================================================
// ASCEND — Impostazioni · Editor UserSettings
// Salvataggio IMMEDIATO a ogni modifica (updateDB + settings.updatedAt).
// timezone e week_start sono la fonte unica di verità dei confini del giorno.
// ============================================================

import React from "react";
import { useDB, updateDB, nowISO } from "@/lib/storage";
import { COMMON_CURRENCIES } from "@/lib/fx";
import { currencySymbol } from "@/lib/format";
import { dayKeyNow } from "@/lib/dates";
import type { UserSettings, PrivacyMode } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { TZ_NAMES, WEEK_START_LABELS, CURRENCY_LABELS } from "./constants";

function saveSettings(patch: Partial<UserSettings>) {
  updateDB((d) => ({
    ...d,
    settings: { ...d.settings, ...patch, updatedAt: nowISO() },
  }));
}

/** Kicker di card — etichetta piccola accent sopra il titolo (come SectionHeader). */
function CardKicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
      <span className="h-1 w-1 rounded-full bg-accent" />
      {children}
    </p>
  );
}

/** "Ora" nella timezone indicata → day key + weekday, null se fuso invalido. */
function nowInTz(tz: string): { date: string; weekday: string } | null {
  try {
    const weekday = new Intl.DateTimeFormat("it-IT", { timeZone: tz, weekday: "long" }).format(new Date());
    return { date: dayKeyNow(tz), weekday };
  } catch {
    return null;
  }
}

export function UserSettingsEditor() {
  const db = useDB();
  const s = db.settings;
  const now = nowInTz(s.timezone);
  const savedAt = new Date(s.updatedAt).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <Card hairline="accent">
      <CardHeader>
        <div>
          <CardKicker>Preferenze</CardKicker>
          <CardTitle>Utente & Impostazioni</CardTitle>
          <CardSubtitle>Ogni modifica viene salvata immediatamente.</CardSubtitle>
        </div>
        <Badge tone="success" pulse>
          💾 Salvato · {savedAt}
        </Badge>
      </CardHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Valuta di base">
          <Select
            value={s.baseCurrency}
            onChange={(e) => saveSettings({ baseCurrency: e.target.value })}
          >
            {COMMON_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {currencySymbol(code)} {code} — {CURRENCY_LABELS[code] ?? code}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Lingua (locale)">
          <Select value={s.locale} onChange={(e) => saveSettings({ locale: e.target.value })}>
            <option value="it-IT">Italiano (it-IT)</option>
            <option value="en-US">English (en-US)</option>
          </Select>
        </Field>

        {/* Fuso orario — pannello evidenziato perché è la fonte dei confini del giorno */}
        <div className="relative overflow-hidden rounded-xl border border-accent/20 bg-accent-dim p-3 sm:col-span-2">
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
          <Field label="Fuso orario (IANA)">
            <Input
              list="ascend-tz-list"
              value={s.timezone}
              placeholder="Es. Europe/Rome"
              onChange={(e) => saveSettings({ timezone: e.target.value.trim() })}
            />
            <datalist id="ascend-tz-list">
              {TZ_NAMES.map((tz) => (
                <option key={tz} value={tz} />
              ))}
            </datalist>
            <div className="mt-2 text-xs text-muted-foreground">
              {now ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span>Oggi in</span>
                  <span className="tnum font-medium text-secondary-text">{s.timezone}</span>
                  <span className="text-muted-foreground">è</span>
                  <span className="rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 font-medium capitalize text-accent">
                    {now.weekday}
                  </span>
                  <span className="tnum text-secondary-text">{now.date}</span>
                </div>
              ) : s.timezone === "" ? (
                <span className="text-muted-foreground">Digita un fuso IANA, es. Europe/Rome.</span>
              ) : (
                <span className="text-danger">Fuso non valido — usa un nome IANA, es. Europe/Rome.</span>
              )}
            </div>
          </Field>
        </div>

        <Field label="Inizio settimana">
          <Select
            value={String(s.weekStart)}
            onChange={(e) =>
              saveSettings({ weekStart: Number(e.target.value) as UserSettings["weekStart"] })
            }
          >
            {WEEK_START_LABELS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Modalità privacy predefinita">
          <Select
            value={s.privacyMode}
            onChange={(e) => saveSettings({ privacyMode: e.target.value as PrivacyMode })}
          >
            <option value="off">Off — tutto visibile</option>
            <option value="standard">Standard — nasconde le cifre</option>
            <option value="complete">Completa — nasconde anche KPI e calendario</option>
          </Select>
        </Field>
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-accent/25 bg-accent/5 px-3 py-2.5 text-xs leading-relaxed text-secondary-text">
        <span className="mt-0.5 text-base">🧭</span>
        <div>
          <span className="font-semibold text-foreground">Confini del giorno.</span> timezone e
          week_start sono la fonte unica di verità per i confini del giorno — mai inferiti dal
          browser.
        </div>
      </div>
    </Card>
  );
}
