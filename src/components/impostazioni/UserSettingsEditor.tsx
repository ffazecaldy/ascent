"use client";
// ============================================================
// ASCEND — Impostazioni · Editor UserSettings
// Salvataggio IMMEDIATO a ogni modifica (updateDB + settings.updatedAt).
// timezone e week_start sono la fonte unica di verità dei confini del giorno.
// ============================================================

import { useDB, updateDB, nowISO } from "@/lib/storage";
import { COMMON_CURRENCIES } from "@/lib/fx";
import { currencySymbol } from "@/lib/format";
import { dayKeyNow } from "@/lib/dates";
import type { UserSettings, PrivacyMode } from "@/lib/types";
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
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Utente & Impostazioni</CardTitle>
          <CardSubtitle>Ogni modifica viene salvata immediatamente.</CardSubtitle>
        </div>
        <Badge tone="info">💾 Salvato · {savedAt}</Badge>
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

        <Field label="Fuso orario (IANA)" className="sm:col-span-2">
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
          <div className="mt-1.5 text-xs text-muted-foreground">
            {now ? (
              <>
                Oggi in <span className="tnum font-medium text-secondary-text">{s.timezone}</span> è{" "}
                <span className="font-medium capitalize text-secondary-text">{now.weekday}</span> ·{" "}
                <span className="tnum text-secondary-text">{now.date}</span>
              </>
            ) : s.timezone === "" ? (
              <span className="text-muted-foreground">Digita un fuso IANA, es. Europe/Rome.</span>
            ) : (
              <span className="text-danger">Fuso non valido — usa un nome IANA, es. Europe/Rome.</span>
            )}
          </div>
        </Field>

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
            <option value="standard">Standard — nasconde le cifre</option>
            <option value="complete">Completa — nasconde anche KPI e calendario</option>
          </Select>
        </Field>
      </div>

      <div className="mt-4 rounded-lg border-l-2 border-accent bg-accent/5 px-3 py-2.5 text-xs leading-relaxed text-secondary-text">
        <span className="font-semibold text-foreground">🧭 Confini del giorno.</span>{" "}
        timezone e week_start sono la fonte unica di verità per i confini del giorno — mai inferiti dal
        browser.
      </div>
    </Card>
  );
}
