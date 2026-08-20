# Architettura — Ascend

## Panoramica

App **single-user local-first**: tutti i dati vivono nel browser (un unico oggetto `DB` in `localStorage` sotto la chiave `ascend:db`), senza backend. Le pagine non toccano mai `localStorage` direttamente: passano da una **data layer a repository** (`src/lib/storage.ts`) esposta come hook React. Ricambiare il backend (es. Supabase) significa implementare la stessa interfaccia di repository dietro le stesse funzioni — le pagine non cambiano.

## Flusso dati

```
                    ┌──────────────────────────────┐
                    │        src/lib/types.ts       │
                    │  DB + tutte le entità (spec §5)│
                    └──────────────┬───────────────┘
                                   │ shape del DB
        ┌──────────────────────────▼──────────────────────────┐
        │                 STORAGE ENGINE (storage.ts)         │
        │  loadDB() · saveDB() · subscribe() · useDB()        │
        │  updateDB(mutator) · upsert() · removeById()        │
        │  uid() · nowISO()  ── localStorage "ascend:db"      │
        └──────────────────────────┬──────────────────────────┘
                                   │ useSyncExternalStore
        ┌──────────────────────────▼──────────────────────────┐
        │                 HOOK REATTIVI (useDB)               │
        │  ogni pagina:  const db = useDB()                   │
        │  ogni scrittura: updateDB(d => …)                   │
        └──────────────────────────┬──────────────────────────┘
                                   │
        ┌──────────────────────────▼──────────────────────────┐
        │               MOTORE DERIVATO (compute.ts)          │
        │  funzioni pure: activityStreak, ascordDay,          │
        │  disciplineStats, riskStats, tradingStats, …        │
        │  (mai persistite: ricalcolate a runtime)            │
        └──────────────────────────┬──────────────────────────┘
                                   │
        ┌──────────────────────────▼──────────────────────────┐
        │         COMPONENTI / PAGINE (src/app, components)   │
        │  leggono DB + derivato → renderizzano (UI italiana) │
        └─────────────────────────────────────────────────────┘
```

**Scrittura (immutabile):** le pagine non mutano mai lo stato — costruiscono un nuovo array e lo restituiscono:

```ts
updateDB((d) => ({
  ...d,
  transactions: upsert(d.transactions, { id: uid(), /* … */ }),
}));
// eliminazione:
updateDB((d) => ({ ...d, transactions: removeById(d.transactions, id) }));
```

`updateDB` fa il merge, `saveDB` persiste su `localStorage` (con fallback "slim" se si supera la quota, es. screenshot pesanti: salva i trade senza screenshot) e notifica i listener; `useSyncExternalStore` aggiorna tutte le pagine collegate.

**Lettura:** `const db = useDB()` (stato globale sincronizzato); i lookup di convenienza (`getAccount`, `getCategory`, `getSetup`, `setupName`) stanno in `db.ts`.

## Responsabilità di `src/lib/*`

| File | Responsabilità |
|---|---|
| `types.ts` | **Fonte unica di verità del data model**: tutte le entità + shape `DB` + `DB_VERSION`. Non definire entità altrove. |
| `storage.ts` | **Storage engine / repository**: `loadDB`, `saveDB`, `subscribe`, `useDB`, `updateDB`, `upsert`, `removeById`, `uid`, `nowISO`. Unico punto che conosce `localStorage`. |
| `db.ts` | **Seed e default**: `defaultSettings`, `defaultCategories`, `seedDB` (app parte **vuota** di dati demo) + lookup `getAccount`/`getCategory`/`getSetup`/`setupName`. |
| `compute.ts` | **Motore di calcolo derivato**: tutte le funzioni *pure* (ricevono DB, ritornano valori). Mai persistite come fonte di verità. Vedi sezione sotto. |
| `dates.ts` | **Confini temporali**: timezone utente come unica fonte di verità (`todayKey`, `isoToDayKey`, `addDaysKey`, `monthKeyOf`, `weekStartKey`) + **trading day per account** (`tradingDayKey` con timezone + rollover). |
| `fx.ts` | **Pipeline FX**: `quoteFx`, `convertAmountFx` (API gratuita `open.er-api.com`, cache 1h, timeout 6s). API irraggiungibile = inserimento manuale, **mai un blocco**. |
| `privacy.ts` | **Privacy a due livelli**: `moneyMasked`, `kpiMasked`, `calendarNeutral`, `maskMoney`, `maskKpi`, `maskCompact`. |
| `format.ts` | **Formattazione numeri**: `formatMoney`, `formatSignedMoney`, `formatPercent`, `formatR` (notazione smart `€1.5k / €1.563 / €563,92`). |
| `cn.ts` | Utility `cn(...)` per comporre classi Tailwind. |

Non in `src/lib`, ma parte del foundation: `components/ui/*` (design system), `components/charts/*` (chart SVG), `components/AppShell.tsx` (shell + nav + streak pill + privacy toggle + onboarding gate + registrazione service worker).

## Il motore di calcolo derivato (`compute.ts`)

Tutte le funzioni sono pure e deterministiche: **derivato ≠ persistito**, niente cache di verità nel DB.

- **Streak** — `activityStreak(db)` costruisce l'insieme dei giorni attivi (transazioni, trade chiusi, workout, uso PC, aggiornamento libro) e cammina all'indietro. **Freeze automatico 1/mese**: oggi inattivo + ieri attivo → lo streak sopravvive (freeze tracciato in `settings.lastFreezeMonth`, consumato da `claimFreeze`). Ritorna `{ days, todayActive, freezeUsed, streakStart, lastActiveDay }`.
- **Ascend Day** — `ascordDay(db, dayKey)` verifica **tutti** i DailyGoal attivi del giorno (finanze_check, trade_log, disciplina_ok, lettura_minuti, allenamento, ore_produttive). `ascordWeek` conta i giorni vinti in settimana.
- **Disciplina** — `rulesOfSetup` → `tradeRespected` (un trade rispetta il setup se rispetta **tutte** le regole attive) → `disciplineStats` (quota rispettati, % trade senza setup). Le regole sono entità (`SetupRule`) collegate ai trade via `TradeSetupRule`: ID stabili, modifiche alle regole non toccano lo storico.
- **Risk** — `riskStats(db, account)` aggragge per **trading day dell'account**: daily drawdown (peggior giorno), max drawdown della curva equity, avg risk per trade, cumulative risk del giorno corrente, distanza dai limiti daily/max, best/worst day, streak di win/loss. `pnlByTradingDay`, `monthPnlTrades` per calendario e mensilità.
- **Finanze** — `financesMonth`, `financesByCategory` (conversione in valuta base con `exchangeRate` salvato per riga).
- **Altro** — `tradingStats` (win rate, avgR, PF, expectancy), `equityCurve`, `consecutiveWinsLosses`, `pcMinutesOnDay/InWeek`, `currentBook`, `sportStreak`, badge (`BADGE_DEFS` con key stabili, condizioni nel codice, `computeNewBadges`), `missingToday` (checklist "cosa manca oggi"), `weeklyReviewStats` (snapshot della weekly review).

## Sostituire localStorage con Supabase

L'architettura è fatta apposta: **solo `storage.ts` conosce `localStorage`**. Per passare a Supabase serve un adapter che implementi la **stessa interfaccia di repository**, e nessuna pagina o componente cambia:

```ts
// Interfaccia di repository (contratto) — oggi implementata da storage.ts (localStorage)
export function loadDB(): DB;                       // legge lo stato iniziale
export function saveDB(db: DB): void;              // persiste + notifica
export function subscribe(cb: () => void): () => void; // iscrizione a useDB
export function useDB(): DB;                       // hook reattivo
export function updateDB(mutator: (db: DB) => DB): DB; // scrittura immutabile
```

Il contratto da rispettare lato Supabase:

1. **`loadDB`** → `SELECT` di tutte le tabelle (settings, transactions, trades, …) e composizione dell'oggetto `DB`; su errore di rete ritorna comunque la cache locale (local-first anche in cloud).
2. **`saveDB`** → con la stessa forma funzionale: calcola il **diff** tra `db` precedente e nuovo (via mutator) e fa l'upsert delle righe cambiate; o in alternativa `updateDB` emette eventi `row +`/`row −` delta.
3. **`subscribe`** → sottoscrizione alle `Realtime` changes di Supabase; ogni notifica remote viene trasformata in un nuovo `DB` completo e notificata ai listener di `useSyncExternalStore`.
4. **`uid()`** — per single-user non serve UUID server-side: si può continuare a generare id client-side (oppure passare a `uuid`).

Un unico accorgimento: `saveDB` oggi persiste anche i `screenshots` (data URL) nel DB; su Supabase andranno salvati su Storage con URL referenziati, mantenendo lo stesso campo `screenshots: string[]` come lista di riferimenti.

Il valore dell'astrazione: **zero cambiamenti nelle ~20 pagine** — il passaggio è un nuovo file `supabase.ts` che esporta `useDB`/`updateDB`/`saveDB`/`loadDB`/`subscribe` con la stessa firma, più un `import` diverso nel punto di composizione.
