# Ascend

> **Sistema operativo per la crescita personale**: un solo posto per finanze, trading, tempo, corpo e mente. Streak quotidiano, Ascend Day, trading journal completo e obiettivi — con i tuoi dati che vivono sul tuo dispositivo.

PWA single-user **local-first**: Next.js 16 (App Router) + TypeScript + Tailwind v4, persistenza in `localStorage` dietro una data layer a repository (adapter Supabase sostituibile in futuro senza toccare le pagine). UI interamente in italiano.

## Stack

| Strato | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router, `src/`) |
| Linguaggio | TypeScript 5 |
| Styling | Tailwind CSS v4 (design system dark, accento blu `#4C7EFF`) |
| Persistenza | `localStorage` (`ascend:db`), architettura local-first — **nessun backend cloud**; servizi locali opzionali: window tracker (`127.0.0.1:4877`) e Ollama (`localhost:11434`) per il Coach AI |
| PWA | `public/manifest.json` + `public/sw.js` (installabile, offline base) |
| Grafici | SVG puro, zero dipendenze |

Le pagine usano `"use client"` e accedono ai dati esclusivamente via hook (`useDB()` / `updateDB()`) — mai `localStorage` diretto.

## Avvio

```bash
npm install        # installa le dipendenze
npm run dev        # orchestrazione: window tracker (:4877) + Ollama (se installato) + dev server → http://localhost:3000
npm run build      # build di produzione
npm start          # serve la build (dopo npm run build)
npm run typecheck  # tsc --noEmit
npm run check      # lint + typecheck
```

`npm run dev` (via `scripts/run-dev.mjs`) avvia e ferma insieme Next.js e i **servizi locali opzionali**: il **window tracker** (`scripts/tracker-server.mjs`, micro-API su `127.0.0.1:4877` — alimenta l'auto-tracker e il TrackerLive di /usopc) e **Ollama** (`localhost:11434` — necessario per il Coach AI). Servizi già attivi sulle loro porte vengono riusati, non duplicati; se Ollama non è installato il Coach resta offline ma l'app funziona normalmente.

> Nota CORS Coach: il browser chiama Ollama (`localhost:11434`) direttamente. Se l'origin dell'app non rientra negli origin consentiti da Ollama, serve l'env var `OLLAMA_ORIGINS` (del server Ollama, non gestita dal repo) prima di `ollama serve`.

## Struttura delle cartelle

```
ASCEBT/
├─ src/
│  ├─ app/            # rotte (App Router)
│  ├─ components/
│  │  ├─ ui/          # design system: Button, Card, StatCard, Badge, Modal, Field…
│  │  ├─ charts/      # chart SVG condivise: LineChart, BarsChart, DonutChart…
│  │  └─ AppShell.tsx # sidebar + header globali (streak pill, privacy toggle, onboarding gate)
│  └─ lib/            # foundation: types, storage, compute, dates, fx, privacy, format, db, cn,
│                     # ai, coach-context, market-days, pc-tracker, quotes, theme, sport-meta,
│                     # export, import-csv, risk-limits
├─ public/            # manifest PWA, service worker, icone
├─ PHASE_1.md         # contratto per i subagent
└─ docs/              # documentazione (ARCHITECTURE.md, DECISIONS.md)
```

### Rotte (`src/app`)

| Rotta | Pagina |
|---|---|
| `/` | **Home** — dashboard: streak, Ascend Day, "cosa manca oggi", P&L del periodo, best/worst week |
| `/onboarding` | **Onboarding** — primo accesso: valuta base, timezone, obiettivi iniziali |
| `/finanze` | **Finanze** — transazioni entrate/uscite, saldo mensile, categorie |
| `/risparmi` | **Risparmi** — obiettivi di accumulo (target, deadline) e versamenti |
| `/trading` | **Trading — Panoramica** — P&L aggregato multi-account |
| `/trading/accounts` | **Account** — account prop/personal, stato, capital, limiti, timezone trading day |
| `/trading/trades` | **Trade log** — CRUD trade (entry/exit, R, setup, emozione, screenshot) |
| `/trading/setups` | **Playbook & Disciplina** — setup e regole del playbook, rispetto per trade |
| `/trading/import` | **Import storico** — import CSV dei trade |
| `/trading/stats` | **Statistiche** — win rate, avgR, profit factor, consecutive, equity |
| `/trading/calendar` | **Calendario P&L** — heatmap per trading day |
| `/trading/risk` | **Risk Dashboard** — drawdown, limiti daily/max, rischio per trade |
| `/trading/payouts` | **Payout & Certificati** — payout con generazione automatica in Finanze |
| `/trading/review` | **Weekly Review** — snapshot settimanale + risposte libere |
| `/usopc` | **Uso del PC** — minuti per categoria (manuale / CSV / ActivityWatch / auto-tracker nativo + TrackerLive) |
| `/libri` | **Libri** — stato, pagine, citazioni, minuti di lettura |
| `/studio` | **Studio** — sessioni di studio per materia (minuti, note) |
| `/sport` | **Sport** — workout, profilo discipline, streak sportivo |
| `/obiettivi` | **Obiettivi** — daily/weekly goal, badge sbloccati |
| `/coach` | **Coach AI** — coach locale via Ollama: chat con dati reali della settimana (offline se Ollama non è attivo) |
| `/impostazioni` | **Impostazioni** — valuta base, timezone, privacy mode, tema, reset dati |
| `/export` | **Backup / Export** — esporta e ripristina il DB |

## Data model

Il modello dati (specifica v3, sezione 5) vive in **`src/lib/types.ts`** — fonte unica di verità per tutti i moduli, nessuna entità è definita altrove.

- **Un solo oggetto `DB`** persistito sotto `ascend:db`, con `version` (DB v6) e **23 collezioni**: settings, categories, transactions, accounts, trades, setups, setupRules, tradeSetupRules, firmExpenses, payouts, weeklyReviews, dailyGoals, weeklyGoals, pcUsageLogs, pcAppCategoryMap, books, workouts, studySessions, savingsGoals, savingsDeposits, sportProfile, recurringRules, badges.
- **Settings di sistema**: `baseCurrency`, `timezone` IANA, `weekStart`, `locale`, `privacyMode`, `lastFreezeMonth`, `onboardingDone`.
- **Dati immutabili per riga**: ogni transazione/payout/firm expense salva `currency` + `exchangeRate` al momento dell'inserimento (lo storico non ricalcola con tassi correnti); ogni account può avere `baseRate` per aggregare i trade in valuta base.
- **Derivato ≠ persistito**: streak, Ascend Day, disciplina, risk e statistiche sono ricalcolati a runtime da `compute.ts` (funzioni pure) — nulla di derivato è fonte di verità.

## Decisioni chiave

- **Streak freeze 1/mese automatico** — se oggi è inattivo ma l'activity streak era vivo ieri, il giorno si "congela" (una volta al mese, tracciato in `settings.lastFreezeMonth`). Niente UI extra: automatico.
- **Payout → transazione auto-generata** — ogni payout trading crea in automatico una transazione income in Finanze (`autoGenerated: true`, `sourcePayoutId`), così i conti tornano.
- **Trading day per account** — ogni account ha `tradingDayTimezone` + `tradingDayRolloverTime` (es. 17:00) + `dailyLossLimit`/`maxLossLimit`: il confine del giorno di trading è per account, non globale.
- **SetupRule a ID stabili** — le regole del playbook sono entità (`SetupRule`) collegate ai trade via `TradeSetupRule`; modificare una regola non invalida lo storico dei trade già loggati.
- **Privacy a tre livelli** — `off` (default: tutto visibile), *standard* (maschera le cifre monetarie), *completa* (maschera anche KPI/percentuali e neutralizza il calendario P&L). Toggle in alto a destra (icone SVG).
- **Valuta base con tassi salvati per riga** — conversione in valuta base al tasso *congelato* al momento dell'inserimento; il tasso corrente (API FX gratuita) serve solo per precompilare, mai per riscrivere la storia.
- **Transazioni ricorrenti mensili** — regole (`RecurringRule`, DB v6) che generano la transazione del mese all'avvio dell'app, senza duplicati (`sourceRecurringId`, `lastAppliedMonth`).
- **Coach AI locale** — `/coach` dialoga con un modello Ollama su `localhost:11434` con i dati reali della settimana (nessun dato esce dalla macchina); senza Ollama l'app funziona, il Coach resta offline.
- **Snapshot di backup rotante** — `storage.ts` salva fino a 3 snapshot (`ascend:db:snap-N`, max 1/ora); se il DB principale è corrotto recupera automaticamente lo snapshot più recente valido.

## Documentazione

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — architettura, flusso dati, responsabilità di `src/lib/*`, motore di calcolo, come passare a Supabase.
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — le 16 decisioni chiave e come sono implementate.
- `PHASE_1.md` — **contratto storico** della fase 1 (la matrice subagent non copre le rotte/moduli aggiunti dopo; lo storage è evoluto fino a DB v6).
