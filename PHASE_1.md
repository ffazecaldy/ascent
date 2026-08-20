# PHASE_1.md — Contratto per i subagent (leggere PRIMA di scrivere codice)

Stai contribuendo ad **Ascend**: PWA Next.js 16 (App Router, `src/`) + TypeScript + Tailwind v4, single-user, **persistenza locale (localStorage)** con data layer a repository (adapter Supabase sostituibile in seguito). Il modello dati della specifica v3 è rispettato integralmente.

## 1. COSE DA NON FARE (assolute)

1. **NON modificare** i file condivisi: `src/lib/*` (types, storage, compute, format, dates, fx, privacy, db, cn), `src/components/ui/*`, `src/components/charts/*`, `src/components/AppShell.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `next.config.ts`, `tsconfig.json`, `package.json`, `package-lock.json`, `public/manifest.json`, `public/sw.js`.
2. **NON usare localStorage direttamente** — usa `useDB()` / `updateDB()` da `@/lib/storage`.
3. **NON aggiungere dipendenze npm** (niente recharts, date-fns, etc). Se ti serve qualcosa, costruiscilo con React/SVG base.
4. **NON inserire dati demo/finti** nel DB. La app parte vuota. Puoi mostrare empty state.
5. **NON importare file creati da ALTRI subagent** (possiedi solo i tuoi). Se ti serve, ricava i dati da `useDB()` e dagli helper in `src/lib/`.
6. **NON eseguire git add/commit/push** (lo fa l'orchestratore).
7. **NON girare `npm run build`** (valido solo a fine integrazione). Puoi fare un typecheck mirato: `npx tsc --noEmit` SOLO se riesci a ignorare errori in file di altri agent (che potrebbero non esistere ancora).

## 2. File di riferimento (leggerli prima di scrivere)

- `src/lib/types.ts` — TUTTI i tipi (non definirne di nuovi: riusa o estendi solo se stretto necessario e sotto `src/lib/types.ts` NON lo tocchi).
- `src/lib/storage.ts` — `useDB()`, `updateDB(mutator)`, `upsert`, `removeById`, `uid()`, `nowISO()`.
- `src/lib/compute.ts` — streak, ascord day, disciplina, risk, equity, stats, badges, ecc.
- `src/lib/format.ts` — `formatMoney`, `formatSignedMoney`, `formatPercent`, `formatR`.
- `src/lib/dates.ts` — day key, timezone, trading day, week.
- `src/lib/fx.ts` — `quoteFx`, `convertAmountFx`.
- `src/lib/privacy.ts` — `moneyMasked`, `kpiMasked`, `calendarNeutral`, `maskMoney`.
- `src/lib/db.ts` — `getAccount`, `getCategory`, `getSetup`, `setupName`, `defaultCategories`, `defaultSettings`.
- `src/components/ui/*` — `Button`, `Card`/`CardHeader`/`CardTitle`/`CardSubtitle`, `StatCard`, `Badge`, `StatusDot`, `Modal`, `ConfirmDialog`, `Input`, `TextArea`, `Select`, `Field`, `Label`, `Tabs`, `ProgressBar`, `Toggle`, `EmptyState`, `SectionHeader`.
- `src/components/charts/*` (index.tsx) — `LineChart`, `BarsChart`, `GroupedBars`, `DonutChart`, `ActivityHeatmap`, `PnlCalendar`, `Sparkline`.

## 3. Design system (obbligatorio)

- Dark mode: sfondo `#0b0b0c`, card `#151517`. **MAI** verde/rosso per bottoni o CTA.
- Accento **blu `#4C7EFF`** per CTA/elementi interattivi (utility: `bg-accent`, `text-accent`, `border-accent`).
- Verde `#22c55e` / rosso `#ef4444` SOLO per: P&L, entrate/uscite, win/loss, drawdown. Utility: `text-success` / `text-danger`.
- Numeri: classe `tnum` (tabular-nums) + font display Space Grotesk (già globale).
- Layout card-based, numeri grandi, etichetta piccola sopra, variazione sotto (`StatCard` fa questo).
- UI in **italiano**. Tonaltà diretta, zero preamboli. Niente grafici pesanti: linee sottili, tooltip minimal.
- Tutte le pagine devono partire con `"use client";` (usano localStorage via hooks).

## 4. Pattern di accesso dati

```tsx
"use client";
import { useDB, updateDB, upsert, removeById, uid } from "@/lib/storage";

export default function MiaPagina() {
  const db = useDB();
  // leggere: db.transactions, db.trades, ...
  // scrivere:
  updateDB((d) => ({
    ...d,
    transactions: upsert(d.transactions, { id: uid(), /* ... */ }),
  }));
  // eliminare:
  updateDB((d) => ({ ...d, transactions: removeById(d.transactions, id) }));
}
```

Reset dati (se utile in impostazioni):
```ts
import { seedDB } from "@/lib/db";
updateDB(() => seedDB());
```

Privacy: leggi `db.settings.privacyMode`; dove mostri soldi fare già tutto in `formatMoney` — per la modalità privacy chiami `moneyMasked(mode)` → se true mostri `maskMoney()`. I KPI (percentuali, win rate, +R, Disciplina) → se `kpiMasked(mode)` mostri `maskKpi()`. Il calendario P&L espone un prop `neutral` (`PnlCalendar neutral={calendarNeutral(mode)}`).

## 5. Matrice di ownership (file che PUOI creare/modificare — solo questi)

| # | Subagent | File posseduti |
|---|----------|----------------|
| 1 | Home | `src/app/page.tsx`, `src/components/home/*` |
| 2 | Onboarding | `src/app/onboarding/page.tsx`, `src/components/onboarding/*` |
| 3 | Finanze | `src/app/finanze/page.tsx`, `src/components/finanze/*` |
| 4 | Trading overview | `src/app/trading/page.tsx`, `src/components/trading/overview/*` |
| 5 | Account | `src/app/trading/accounts/page.tsx` |
| 6 | Trade log | `src/app/trading/trades/page.tsx`, `src/components/trading/trades/*` |
| 7 | Playbook & Disciplina | `src/app/trading/setups/page.tsx` |
| 8 | Import CSV | `src/app/trading/import/page.tsx`, `src/lib/import-csv.ts` |
| 9 | Statistiche | `src/app/trading/stats/page.tsx` |
| 10 | Calendario P&L | `src/app/trading/calendar/page.tsx` |
| 11 | Risk Dashboard | `src/app/trading/risk/page.tsx` |
| 12 | Payout & Certificati | `src/app/trading/payouts/page.tsx` |
| 13 | Weekly Review | `src/app/trading/review/page.tsx` |
| 14 | Uso PC | `src/app/usopc/page.tsx` |
| 15 | Libri | `src/app/libri/page.tsx` |
| 16 | Sport | `src/app/sport/page.tsx` |
| 17 | Obiettivi | `src/app/obiettivi/page.tsx` |
| 18 | Impostazioni | `src/app/impostazioni/page.tsx`, `src/components/impostazioni/*` |
| 19 | Export/Backup | `src/app/export/page.tsx`, `src/lib/export.ts` |
| 20 | QuickLog | `src/components/QuickLog.tsx` (esporta `QuickLogButton` e `QuickLogModal`) |

## 6. Criteri di completamento

- File creati nel path assegnato, compilabili in isolamento (tipi corretti, import esistenti).
- Pagina completa del CRUD + viste previste dalla sezione della specifica v3 corrispondente.
- Nessun import sconosciuto. Se hai bisogno di un helper che non esiste, crealo DENTRO i tuoi file (non in `src/lib/`).
- Riepilogo finale: cosa hai costruito, eventuali limitazioni, eventuali segnalazioni di API mancanti.

## 7. Sezione di specifica da seguire

La tua sezione della specifica è riportata nel field `goal`/`context` del task. Usala come riferimento del comportamento; non devi copiare testi, devi implementare funzionalità.
