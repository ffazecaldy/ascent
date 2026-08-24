# Architettura — Ascend

## Panoramica

App **single-user local-first**: tutti i dati vivono nel browser (un unico oggetto `DB` in `localStorage` sotto la chiave `ascend:db`), senza backend cloud. Le pagine non toccano mai `localStorage` direttamente: passano da una **data layer a repository** (`src/lib/storage.ts`) esposta come hook React. Ricambiare il backend (es. Supabase) significa implementare la stessa interfaccia di repository dietro le stesse funzioni — le pagine non cambiano.

Accanto all'app girano **processi locali opzionali** (vedi sezione dedicata): il **window tracker** (`scripts/tracker-server.mjs`, micro-API su `127.0.0.1:4877`, alimenta l'auto-tracking di /usopc) e **Ollama** (`localhost:11434`, motore del Coach AI in /coach). `npm run dev` li orchestra tutti (`scripts/run-dev.mjs`); l'app funziona anche senza.

## Flusso dati

```
                    ┌──────────────────────────────┐
                    │        src/lib/types.ts       │
                    │  DB + tutte le entità (spec §5)│
                    └──────────────┬───────────────┘
                                   │ shape del DB
        ┌──────────────────────────▼──────────────────────────┐
        │                 STORAGE ENGINE (storage.ts)         │
        │  │  loadDB() · saveDB() · subscribe() · useDB()        │
        │  │  updateDB(mutator) · upsert() · removeById()        │
        │  │  uid() · nowISO()  ── localStorage "ascend:db"      │
        │  │  snapshot rotante (ascend:db:snap-N) + self-heal    │
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
| `storage.ts` | **Storage engine / repository**: `loadDB`, `saveDB`, `subscribe`, `useDB`, `updateDB`, `upsert`, `removeById`, `uid`, `nowISO`. Unico punto che conosce `localStorage`. `saveDB` con fallback "slim" se si supera la quota; **snapshot rotante** (`ascend:db:snap-1..3`, max 1/ora) e **self-heal**: se il DB principale è corrotto/illeggibile recupera lo snapshot più recente valido invece di azzerare. |
| `db.ts` | **Seed e default**: `defaultSettings`, `defaultCategories`, `seedDB` (app parte **vuota** di dati demo) + lookup `getAccount`/`getCategory`/`getSetup`/`setupName`. |
| `compute.ts` | **Motore di calcolo derivato**: tutte le funzioni *pure* (ricevono DB, ritornano valori). Mai persistite come fonte di verità. Vedi sezione sotto. |
| `dates.ts` | **Confini temporali**: timezone utente come unica fonte di verità (`todayKey`, `isoToDayKey`, `addDaysKey`, `monthKeyOf`, `weekStartKey`) + **trading day per account** (`tradingDayKey` con timezone + rollover). |
| `fx.ts` | **Pipeline FX**: `quoteFx`, `convertAmountFx` (API gratuita `open.er-api.com`, cache 1h, timeout 6s). API irraggiungibile = inserimento manuale, **mai un blocco**. |
| `privacy.ts` | **Privacy a tre livelli** (`off` / `standard` / `complete`, default `off`): `moneyMasked`, `kpiMasked`, `calendarNeutral`, `maskMoney`, `maskKpi`, `maskCompact`, `PRIVACY_LABELS`, `PRIVACY_ORDER`. |
| `format.ts` | **Formattazione numeri**: `formatMoney`, `formatSignedMoney`, `formatPercent`, `formatR` (notazione smart `€1.5k / €1.563 / €563,92`). |
| `cn.ts` | Utility `cn(...)` per comporre classi Tailwind. |
| `export.ts` | **Export/Backup**: backup JSON completo (`exportDbBackup`) + CSV per collezione (`exportCollectionCsv`), download client-side via anchor. |
| `import-csv.ts` | **Import trade storico**: `parseTradesCsv` (parsing CSV con report righe scartate/issue). |
| `ai.ts` | **Client Ollama per il Coach AI**: `coachChat` (POST `/api/chat` su `localhost:11434`, timeout 90s), `listOllamaModels` (GET `/api/tags`), `CoachError`/`isCoachOffline` (stato offline distinguibile). Chiamate dirette dal browser: nessun dato esce dalla macchina. |
| `coach-context.ts` | **Contesto per il Coach**: `buildCoachContext(db)` compatta i dati reali della settimana (stessi helper dell'app) in un blocco italiano per il prompt; `coachSystemPrompt()`. |
| `market-days.ts` | **Calendario mercato** (Nasdaq futures/CME): `isMarketOpen`, `nextMarketDay`, `prevMarketDay`, `marketDaysInMonth`. Apertura lun–ven; weekend rollover sul lunedì; festività USA non considerate (semplificazione voluta). |
| `pc-tracker.ts` | **Connettore window tracker**: mapping exe/title→categoria (unica sorgente per AutoTrackerImport e TrackerLive) + polling micro-API `127.0.0.1:4877` (`fetchTrackerHealth`, `/api/active`, `/api/since`). |
| `quotes.ts` | **100 citazioni motivazionali** per il rotatore della Home. |
| `theme.ts` | **Sistema temi client-only** (fuori dal DB): `readTheme`/`writeTheme` su `localStorage` `ascend:theme`, attributo `<html data-theme>`, temi `default` e `black`. SSR-safe. |
| `sport-meta.ts` | **Helper Sport Zone**: `fmtDur` (45 → "45m", 90 → "1h 30m") e conversioni ore↔minuti, condivisi da wizard /sport e card Home. |
| `risk-limits.ts` | **Adapter limiti di rischio**: re-esporta `limitUsage` dal core `compute.ts` (consumo reale dei limiti: `daily` = perdita netta del trading day corrente, `max` = capital − equity live), isolando i consumatori UI (Risk Dashboard) da cambi di firma del core. |

Non in `src/lib`, ma parte del foundation: `components/ui/*` (design system, incluse le icone SVG di `ui/Icon.tsx`), `components/charts/*` (chart SVG), `components/AppShell.tsx` (shell + nav + streak pill + privacy toggle + onboarding gate + registrazione service worker).

## Processi esterni e servizi locali (opzionali)

| Processo | File | Ruolo |
|---|---|---|
| **Window tracker** | `scripts/tracker-server.mjs` | Mini-server di sistema: campiona la finestra attiva ogni 30s (PowerShell, solo Windows), espone micro-API HTTP su `127.0.0.1:4877` (`/api/health`, `/api/active`, `/api/since`), scrive JSONL giornalieri in `%APPDATA%\Ascend\pc-usage`. Node stdlib only, CORS aperto per l'app. Alimenta l'AutoTrackerImport e il TrackerLive di /usopc via `src/lib/pc-tracker.ts`. Env: `ASCEND_TRACKER_PORT` (default 4877), `ASCEND_INTERVAL_SEC` (default 30). |
| **Orchestratore** | `scripts/run-dev.mjs` | `npm run dev`: avvia/ferma insieme window tracker + `ollama serve` + `next dev`; riusa i servizi già attivi sulle porte; watchdog anti-orfano (se muore il processo padre, spegne tutto). |
| **Ollama** | esterno (`localhost:11434`) | Motore del Coach AI (`src/lib/ai.ts` chiama `/api/chat` e `/api/tags` direttamente dal browser). Se non installato, il Coach è offline e il resto dell'app funziona. Poiché la chiamata è cross-origin dal browser, gli origin consentiti sono quelli di default di Ollama; per allargarli serve l'env var `OLLAMA_ORIGINS` del server Ollama. |
| **Service worker** | `public/sw.js` + `public/manifest.json` | PWA installabile offline base; `next.config.ts` serve `/sw.js` con `Cache-Control: max-age=0` e `Service-Worker-Allowed: /`. Registrato da `AppShell.tsx`. |

Script operativi aggiuntivi in `scripts/`: `track-window.ps1` (auto-tracker PowerShell nativo, installabile come Scheduled Task all'avvio con `install.bat`, rimosso da `uninstall.bat`) e `tracker-hook.ps1` (hook event-driven su cambio finestra, gestito da tracker-server.mjs come processo figlio).

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

1. **`loadDB`** → `SELECT` di tutte le collezioni e composizione dell'oggetto `DB`; su errore di rete ritorna comunque la cache locale (local-first anche in cloud). Lo schema Supabase rispecchia le **23 collezioni** del DB (`types.ts → DB`): `settings` (1 riga), `categories`, `transactions`, `accounts`, `trades`, `setups`, `setup_rules`, `trade_setup_rules`, `firm_expenses`, `payouts`, `weekly_reviews`, `daily_goals`, `weekly_goals`, `pc_usage_logs`, `pc_app_category_map`, `books`, `workouts`, `study_sessions`, `savings_goals`, `savings_deposits`, `sport_profile` (1 riga o nullable), `recurring_rules`, `badges`.
2. **`saveDB`** → con la stessa forma funzionale: calcola il **diff** tra `db` precedente e nuovo (via mutator) e fa l'upsert delle righe cambiate; o in alternativa `updateDB` emette eventi `row +`/`row −` delta.
3. **`subscribe`** → sottoscrizione alle `Realtime` changes di Supabase; ogni notifica remote viene trasformata in un nuovo `DB` completo e notificata ai listener di `useSyncExternalStore`.
4. **`uid()`** — per single-user non serve UUID server-side: si può continuare a generare id client-side (oppure passare a `uuid`).

Un unico accorgimento: `saveDB` oggi persiste anche i `screenshots` (data URL) nel DB; su Supabase andranno salvati su Storage con URL referenziati, mantenendo lo stesso campo `screenshots: string[]` come lista di riferimenti.

Il valore dell'astrazione: **zero cambiamenti nelle 22 pagine** — il passaggio è un nuovo file `supabase.ts` che esporta `useDB`/`updateDB`/`saveDB`/`loadDB`/`subscribe` con la stessa firma, più un `import` diverso nel punto di composizione.
