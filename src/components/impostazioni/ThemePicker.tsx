"use client";
// ============================================================
// ASCEND — Impostazioni · Selettore tema (Card "Aspetto")
// Quattro swatch cliccabili: Default (myfundedbook) / Nero puro /
// Neon (verde) / Aurora (viola).
// Applica il tema via data-theme su <html> + persiste in
// localStorage 'ascend:theme' (mai nel DB).
// Il tema salvato viene applicato al mount e letto via
// useSyncExternalStore (niente setState dentro useEffect).
// ============================================================

import { useEffect, useSyncExternalStore } from "react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import {
  applyTheme,
  readTheme,
  setTheme,
  subscribeTheme,
  type ThemeName,
} from "@/lib/theme";

const THEMES: { id: ThemeName; label: string; hint: string; swatch: string[] }[] = [
  {
    id: "default",
    label: "Default",
    hint: "Antracite myfundedbook",
    swatch: ["#0b0b0c", "#4c7eff"],
  },
  {
    id: "black",
    label: "Nero",
    hint: "OLED nero puro #000",
    swatch: ["#000000", "#4c7eff"],
  },
  {
    id: "neon",
    label: "Neon",
    hint: "Nero · verde neon",
    swatch: ["#030705", "#00e576"],
  },
  {
    id: "aurora",
    label: "Aurora",
    hint: "Blu profondo · viola",
    swatch: ["#08060f", "#8b5cf6"],
  },
];

/** Store reattivo sul valore di 'ascend:theme' in localStorage. */
function subscribeThemeStore(onChange: () => void): () => void {
  return subscribeTheme(onChange);
}

function getThemeSnapshot(): ThemeName {
  return readTheme();
}

const DEFAULT_SNAPSHOT: ThemeName = "default";
function getServerThemeSnapshot(): ThemeName {
  return DEFAULT_SNAPSHOT;
}

export function ThemePicker() {
  const theme = useSyncExternalStore(subscribeThemeStore, getThemeSnapshot, getServerThemeSnapshot);

  // Al mount applica il tema salvato a <html> (la preferenza
  // sopravvive ai reload; SSR-safe: readTheme è guardato).
  useEffect(() => {
    applyTheme(readTheme());
  }, []);

  const pick = (id: ThemeName) => {
    setTheme(id); // applica a <html> + persiste (+ notifica i listener)
  };

  return (
    <Card hairline="accent">
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-accent/25 bg-accent/15">
            <Icon name="eye" size={18} className="text-accent" />
          </div>
          <div>
            <CardTitle>Aspetto</CardTitle>
            <CardSubtitle>Scegli la tinta dell&apos;interfaccia. La preferenza resta su questo dispositivo.</CardSubtitle>
          </div>
        </div>
      </CardHeader>

      <div className="grid grid-cols-2 gap-2 sm:max-w-md" role="radiogroup" aria-label="Tema interfaccia">
        {THEMES.map((t) => {
          const active = theme === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => pick(t.id)}
              className={`group flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all duration-150 hover:border-border-strong ${
                active ? "border-accent/60 bg-accent/10" : "border-border bg-muted/40"
              }`}
            >
              {/* preview quadratino: bg del tema + puntino accent */}
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/15"
                style={{ backgroundColor: t.swatch[0] }}
                aria-hidden="true"
              >
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: t.swatch[1] }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-xs font-semibold ${active ? "text-accent" : "text-foreground"}`}>
                  {t.label}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">{t.hint}</span>
              </span>
              {active && (
                <span className="shrink-0 text-accent">
                  <Icon name="check" size={14} strokeWidth={2.4} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
