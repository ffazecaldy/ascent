"use client";
// ============================================================
// ASCEND — Quick Log (check-in rapido di un'azione di oggi)
// Alimenta l'Activity Streak in ~3 click: transazione, trade,
// allenamento, lettura (pagine) o uso PC — ogni salvataggio è
// un upsert su useDB()/updateDB(). Nessuna dipendenza.
// Esporta: <QuickLogButton /> (bottone compatto con stato locale)
//          <QuickLogModal />  (modal controllato, apribile anche fuori)
// ============================================================

import { useState } from "react";
import { useDB, updateDB, upsert, uid, nowISO } from "@/lib/storage";
import { todayKey } from "@/lib/dates";
import { formatSignedMoney, formatR } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Tabs, EmptyState } from "@/components/ui/Misc";
import { Field, Input, Select } from "@/components/ui/Field";
import type { TransactionType, TradeDirection } from "@/lib/types";

// ------------------------------------------------------------
// Costanti locali (categorie PC e tipi workout: nessuna entità
// dedicata in types.ts → lista locale dentro questo file).
// ------------------------------------------------------------
const WORKOUT_TYPES = ["Palestra", "Corsa", "Calisthenics", "Squadra", "Nuoto", "Altro"] as const;

const PC_CATEGORIES = [
  { id: "deep-work", label: "Deep work", icon: "🎯" },
  { id: "studio", label: "Studio", icon: "📚" },
  { id: "creativo", label: "Creativo", icon: "🎨" },
  { id: "amministrazione", label: "Amministrazione", icon: "🧾" },
  { id: "distrazione", label: "Distrazione", icon: "📱" },
  { id: "altro", label: "Altro", icon: "📦" },
] as const;

type QuickTab = "transazione" | "trade" | "allenamento" | "lettura" | "pc";

const QUICK_TABS: { id: QuickTab; label: string }[] = [
  { id: "transazione", label: "💶 Transazione" },
  { id: "trade", label: "🕹 Trade" },
  { id: "allenamento", label: "💪 Allenamento" },
  { id: "lettura", label: "📚 Lettura" },
  { id: "pc", label: "💻 PC" },
];

interface DoneConf {
  icon: string;
  text: string;
  tone: "success" | "danger" | "neutral";
}

const doneCls: Record<DoneConf["tone"], string> = {
  success: "border-success/30 bg-success/10 text-success",
  danger: "border-danger/30 bg-danger/10 text-danger",
  neutral: "border-border-strong bg-elevated text-secondary-text",
};

// ------------------------------------------------------------
// Helpers numerici / tempo (locali a questo file)
// ------------------------------------------------------------
function parseNumber(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
const numOr0 = (s: string): number => parseNumber(s) ?? 0;

/** Offset UTC (minuti) di una timezone IANA per un certo istante. */
function tzOffsetMinutes(date: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) map[p.type] = p.value;
  let h = Number(map.hour);
  if (h === 24) h = 0;
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    h,
    Number(map.minute),
    Number(map.second)
  );
  return Math.round((asUTC - date.getTime()) / 60000);
}

/** ISO assoluto di "oggi alle HH:MM (ora civile)" nel fuso utente. */
function isoForWallClockToday(timeZone: string, hour: number, minute = 0): string {
  const [y, m, d] = todayKey(timeZone).split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  const offset = tzOffsetMinutes(new Date(guess), timeZone);
  return new Date(guess - offset * 60_000).toISOString();
}

const segBase =
  "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60";

// ------------------------------------------------------------
// QuickLogButton — bottone compatto, stato locale (apre il modal)
// ------------------------------------------------------------
export function QuickLogButton({
  size = "md",
  label = "⚡ Quick log",
  className,
  initialTab = "transazione",
}: {
  size?: "sm" | "md";
  label?: string;
  className?: string;
  initialTab?: QuickTab;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" size={size} className={className} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <QuickLogModal open={open} onClose={() => setOpen(false)} initialTab={initialTab} />
    </>
  );
}

// ------------------------------------------------------------
// QuickLogModal — modal controllato (open/onClose + initialTab)
// ------------------------------------------------------------
export function QuickLogModal({
  open,
  onClose,
  initialTab = "transazione",
}: {
  open: boolean;
  onClose: () => void;
  initialTab?: QuickTab;
}) {
  const [tab, setTab] = useState<QuickTab>(initialTab);
  const [done, setDone] = useState<DoneConf | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [prevOpen, setPrevOpen] = useState(open);

  const reset = () => {
    setDone(null);
    setFormKey((k) => k + 1); // rimonta i form → campi puliti
  };

  // all'apertura: tab iniziale, nessuna conferma residua, form puliti
  // (pattern "adjust state during render" — evita setState in effect)
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setTab(initialTab);
      setDone(null);
      setFormKey((k) => k + 1);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="⚡ Quick log"
      width="max-w-md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Chiudi
          </Button>
          {done && (
            <Button variant="outline" size="sm" onClick={reset}>
              Un’altra azione
            </Button>
          )}
        </>
      }
    >
      <p className="mb-3 text-xs text-muted-foreground">
        Un’azione di oggi accende lo streak 🔥 — salvataggio immediato.
      </p>

      <Tabs tabs={QUICK_TABS} value={tab} onChange={(id) => setTab(id as QuickTab)} />

      <div className="mt-4" key={`${tab}-${formKey}`}>
        {tab === "transazione" && <TransazioneForm onDone={setDone} />}
        {tab === "trade" && <TradeForm onDone={setDone} />}
        {tab === "allenamento" && <WorkoutForm onDone={setDone} />}
        {tab === "lettura" && <BookForm onDone={setDone} />}
        {tab === "pc" && <PCForm onDone={setDone} />}
      </div>

      {done && (
        <div
          className={cn(
            "mt-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm tnum",
            doneCls[done.tone]
          )}
        >
          <span className="text-base leading-none">✓</span>
          <span>
            {done.icon} {done.text}
          </span>
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------
// Tab: Transazione
// ------------------------------------------------------------
function TransazioneForm({ onDone }: { onDone: (c: DoneConf) => void }) {
  const db = useDB();
  const [type, setType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [catId, setCatId] = useState("");

  const cats = db.categories.filter((c) => c.type === type);
  const base = db.settings.baseCurrency;

  const switchType = (t: TransactionType) => {
    setType(t);
    if (!cats.some((c) => c.id === catId)) setCatId("");
  };

  const save = () => {
    const amountNum = parseNumber(amount);
    if (amountNum == null || amountNum <= 0) return;
    const cat = cats.find((c) => c.id === catId);
    if (!cat) return;
    updateDB((d) => ({
      ...d,
      transactions: upsert(d.transactions, {
        id: uid(),
        amount: amountNum,
        currency: d.settings.baseCurrency,
        exchangeRate: 1,
        type,
        categoryId: cat.id,
        date: todayKey(d.settings.timezone),
        createdAt: nowISO(),
      }),
    }));
    onDone({
      icon: cat.icon,
      tone: type === "income" ? "success" : "danger",
      text: `${cat.name} · ${formatSignedMoney(type === "income" ? amountNum : -amountNum, base)} → oggi`,
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => switchType("income")}
          className={cn(
            segBase,
            type === "income"
              ? "border-success/40 bg-success/10 text-success"
              : "border-border-strong bg-muted text-secondary-text hover:text-foreground"
          )}
        >
          + Entrata
        </button>
        <button
          type="button"
          onClick={() => switchType("expense")}
          className={cn(
            segBase,
            type === "expense"
              ? "border-danger/40 bg-danger/10 text-danger"
              : "border-border-strong bg-muted text-secondary-text hover:text-foreground"
          )}
        >
          − Uscita
        </button>
      </div>

      <Field label={`Importo (${base})`}>
        <div className="relative">
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="0,00"
            value={amount}
            autoFocus
            onChange={(e) => setAmount(e.target.value)}
            className="pr-10"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {base}
          </span>
        </div>
      </Field>

      <Field label="Categoria">
        <Select value={catId} onChange={(e) => setCatId(e.target.value)}>
          <option value="">Seleziona…</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </Select>
      </Field>

      {cats.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nessuna categoria {type === "income" ? "di entrata" : "di spesa"} disponibile. Aggiungila nelle Impostazioni.
        </p>
      ) : (
        <Button
          size="sm"
          className="w-full"
          disabled={
            parseNumber(amount) == null || parseNumber(amount)! <= 0 || !catId
          }
          onClick={save}
        >
          Salva transazione
        </Button>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Tab: Trade
// ------------------------------------------------------------
function TradeForm({ onDone }: { onDone: (c: DoneConf) => void }) {
  const db = useDB();
  const [accountId, setAccountId] = useState("");
  const [instrument, setInstrument] = useState("");
  const [direction, setDirection] = useState<TradeDirection>("long");
  const [native, setNative] = useState("");
  const [r, setR] = useState("");

  const accounts = db.accounts.filter((a) => !a.archived);

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon="🏦"
        title="Nessun account di trading"
        description="Crea un account in Trading → Account per registrare un trade da qui."
      />
    );
  }

  const save = () => {
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return;
    const close = isoForWallClockToday(db.settings.timezone, 18); // chiusura oggi alle 18:00 locali
    const nativeNum = numOr0(native);
    const rNum = numOr0(r);
    updateDB((d) => ({
      ...d,
      trades: upsert(d.trades, {
        id: uid(),
        accountId: acc.id,
        instrument: instrument.trim() || "—",
        direction,
        entry: null,
        exit: null,
        size: null,
        stop: null,
        target: null,
        resultNative: nativeNum,
        resultR: rNum,
        openDate: close,
        closeDate: close,
        screenshots: [],
        setupId: null,
        createdAt: nowISO(),
      }),
    }));
    onDone({
      icon: "🕹",
      tone: nativeNum > 0 ? "success" : nativeNum < 0 ? "danger" : "neutral",
      text: `${acc.name} · ${formatSignedMoney(nativeNum, acc.nativeCurrency)} · ${formatR(rNum)}`,
    });
  };

  const valid = accountId !== "";

  return (
    <div className="space-y-3">
      <Field label="Account">
        <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Seleziona…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.nativeCurrency}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-2">
        {(["long", "short"] as TradeDirection[]).map((dir) => (
          <button
            key={dir}
            type="button"
            onClick={() => setDirection(dir)}
            className={cn(
              segBase,
              direction === dir
                ? "border-accent bg-accent/10 text-accent"
                : "border-border-strong bg-muted text-secondary-text hover:text-foreground"
            )}
          >
            {dir === "long" ? "▲ Long" : "▼ Short"}
          </button>
        ))}
      </div>

      <Field label="Strumento (opzionale)">
        <Input
          placeholder="es. ES, NQ, EURUSD…"
          value={instrument}
          onChange={(e) => setInstrument(e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Risultato nativo">
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            placeholder="0,00"
            value={native}
            autoFocus
            onChange={(e) => setNative(e.target.value)}
          />
        </Field>
        <Field label="Risultato in R">
          <Input
            type="number"
            inputMode="decimal"
            step="0.25"
            placeholder="0"
            value={r}
            onChange={(e) => setR(e.target.value)}
          />
        </Field>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Chiuso oggi alle 18:00 (ora locale) → alimenta lo streak di oggi.
      </p>

      <Button size="sm" className="w-full" disabled={!valid} onClick={save}>
        Salva trade
      </Button>
    </div>
  );
}

// ------------------------------------------------------------
// Tab: Allenamento
// ------------------------------------------------------------
function WorkoutForm({ onDone }: { onDone: (c: DoneConf) => void }) {
  const [type, setType] = useState<string>(WORKOUT_TYPES[0]);
  const [dur, setDur] = useState("");

  const save = () => {
    const durNum = parseNumber(dur);
    if (durNum == null || durNum <= 0) return;
    updateDB((d) => ({
      ...d,
      workouts: upsert(d.workouts, {
        id: uid(),
        date: todayKey(d.settings.timezone),
        type,
        durationMin: durNum,
        createdAt: nowISO(),
      }),
    }));
    onDone({
      icon: "💪",
      tone: "success",
      text: `${type} · ${durNum} min → oggi`,
    });
  };

  return (
    <div className="space-y-3">
      <Field label="Tipo">
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          {WORKOUT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Durata (minuti)">
        <Input
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          placeholder="45"
          value={dur}
          autoFocus
          onChange={(e) => setDur(e.target.value)}
        />
      </Field>

      <Button
        size="sm"
        className="w-full"
        disabled={parseNumber(dur) == null || parseNumber(dur)! <= 0}
        onClick={save}
      >
        Salva allenamento
      </Button>
    </div>
  );
}

// ------------------------------------------------------------
// Tab: Lettura — aggiunge pagine al libro in corso
// ------------------------------------------------------------
function BookForm({ onDone }: { onDone: (c: DoneConf) => void }) {
  const db = useDB();
  const [bookId, setBookId] = useState("");
  const [pages, setPages] = useState("");

  const inCorso = db.books.filter((b) => b.status === "in_corso");

  if (inCorso.length === 0) {
    return (
      <EmptyState
        icon="📚"
        title="Nessun libro in corso"
        description="Metti un libro su 'in corso' nella pagina Libri per loggare le pagine lette."
      />
    );
  }

  const save = () => {
    const book = inCorso.find((b) => b.id === bookId);
    const n = parseNumber(pages);
    if (!book || n == null || n <= 0) return;
    const current = book.pagesRead || 0;
    // blocco al totale se noto (totalPages = 0/assente → ignora il cap)
    const next = book.totalPages ? Math.min(current + n, book.totalPages) : current + n;
    updateDB((d) => ({
      ...d,
      books: upsert(d.books, { ...book, pagesRead: next, updatedAt: nowISO() }),
    }));
    onDone({
      icon: "📖",
      tone: "success",
      text: `${book.title} · +${n} pagine (${next}${book.totalPages ? `/${book.totalPages}` : ""})`,
    });
  };

  return (
    <div className="space-y-3">
      <Field label="Libro in corso">
        <Select value={bookId} onChange={(e) => setBookId(e.target.value)}>
          <option value="">Seleziona…</option>
          {inCorso.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title} · {b.pagesRead || 0}/{b.totalPages || "?"} pag.
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Pagine lette oggi">
        <Input
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          placeholder="10"
          value={pages}
          autoFocus
          onChange={(e) => setPages(e.target.value)}
        />
      </Field>

      <Button
        size="sm"
        className="w-full"
        disabled={!bookId || parseNumber(pages) == null || parseNumber(pages)! <= 0}
        onClick={save}
      >
        Aggiungi pagine
      </Button>
    </div>
  );
}

// ------------------------------------------------------------
// Tab: PC
// ------------------------------------------------------------
function PCForm({ onDone }: { onDone: (c: DoneConf) => void }) {
  const [catId, setCatId] = useState<string>(PC_CATEGORIES[0].id);
  const [min, setMin] = useState("");

  const save = () => {
    const minNum = parseNumber(min);
    if (minNum == null || minNum <= 0) return;
    const cat = PC_CATEGORIES.find((c) => c.id === catId);
    if (!cat) return;
    updateDB((d) => ({
      ...d,
      pcUsageLogs: upsert(d.pcUsageLogs, {
        id: uid(),
        date: todayKey(d.settings.timezone),
        categoryId: cat.id,
        minutes: minNum,
        source: "manuale",
        createdAt: nowISO(),
      }),
    }));
    onDone({
      icon: "💻",
      tone: catId === "distrazione" ? "danger" : "success",
      text: `${cat.icon} ${cat.label} · ${minNum} min → oggi`,
    });
  };

  return (
    <div className="space-y-3">
      <Field label="Categoria">
        <Select value={catId} onChange={(e) => setCatId(e.target.value)}>
          {PC_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Minuti">
        <Input
          type="number"
          inputMode="numeric"
          min="1"
          step="5"
          placeholder="60"
          value={min}
          autoFocus
          onChange={(e) => setMin(e.target.value)}
        />
      </Field>

      <Button
        size="sm"
        className="w-full"
        disabled={parseNumber(min) == null || parseNumber(min)! <= 0}
        onClick={save}
      >
        Salva uso PC
      </Button>
    </div>
  );
}
