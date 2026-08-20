"use client";
// ============================================================
// ASCEND — Libri (spec 4.5 + batch import) · art-direct v2
// Stile myfundedbook: cover-gradient con lettera iniziale,
// libro in corso in evidenza, ProgressBar sottile, quick
// "+X pagine" con glow, hairline accent per "in corso".
// ============================================================

import { useMemo, useState } from "react";
import { useDB, updateDB, upsert, removeById, uid, nowISO } from "@/lib/storage";
import { currentBook } from "@/lib/compute";
import { todayKey, labelDayKey } from "@/lib/dates";
import { cn } from "@/lib/cn";
import type { Book, BookStatus } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { Input, TextArea, Select, Field } from "@/components/ui/Field";
import { Tabs, ProgressBar, SectionHeader } from "@/components/ui/Misc";
import { StatCard } from "@/components/ui/StatCard";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";

// ------------------------------------------------------------
// Metadati stato
// ------------------------------------------------------------
const STATUS_ORDER: BookStatus[] = ["da_leggere", "in_corso", "finito"];
const STATUS_LABEL: Record<BookStatus, string> = {
  da_leggere: "Da leggere",
  in_corso: "In corso",
  finito: "Finito",
};
const STATUS_BADGE: Record<BookStatus, "default" | "info" | "warning"> = {
  da_leggere: "default",
  in_corso: "info",
  finito: "warning",
};

type TabId = "tutti" | BookStatus;
const TABS: { id: TabId; label: string }[] = [
  { id: "tutti", label: "Tutti" },
  { id: "da_leggere", label: "Da leggere" },
  { id: "in_corso", label: "In corso" },
  { id: "finito", label: "Finiti" },
];

interface BookForm {
  title: string;
  author: string;
  status: BookStatus;
  totalPages: string;
  pagesRead: string;
  rating: number;
  startDate: string;
  endDate: string;
  notes: string;
  quotes: string;
}

const emptyForm = (): BookForm => ({
  title: "",
  author: "",
  status: "da_leggere",
  totalPages: "",
  pagesRead: "",
  rating: 0,
  startDate: "",
  endDate: "",
  notes: "",
  quotes: "",
});

const formFromBook = (b: Book): BookForm => ({
  title: b.title,
  author: b.author,
  status: b.status,
  totalPages: b.totalPages ? String(b.totalPages) : "",
  pagesRead: b.pagesRead ? String(b.pagesRead) : "",
  rating: b.rating ?? 0,
  startDate: b.startDate ?? "",
  endDate: b.endDate ?? "",
  notes: b.notes ?? "",
  quotes: b.quotes ?? "",
});

/** Normalizza input → Book valido. Auto-completa date e stato al 100%. */
function buildBook(form: BookForm, tz: string, existing?: Book): Book {
  const totalPages = Math.max(0, Math.floor(Number(form.totalPages) || 0));
  let pagesRead = Math.max(0, Math.floor(Number(form.pagesRead) || 0));
  if (totalPages > 0 && pagesRead > totalPages) pagesRead = totalPages;

  const today = todayKey(tz);
  let status = form.status;
  let startDate = form.startDate || null;
  let endDate = form.endDate || null;

  if (totalPages > 0 && pagesRead >= totalPages) {
    status = "finito";
    if (!startDate) startDate = today;
    if (!endDate) endDate = today;
  } else if (status === "finito") {
    if (!endDate) endDate = today;
  } else if (status === "in_corso") {
    if (!startDate) startDate = today;
  }

  const pagesChanged = !existing || existing.pagesRead !== pagesRead;

  return {
    id: existing?.id ?? uid(),
    title: form.title.trim(),
    author: form.author.trim(),
    status,
    totalPages,
    pagesRead,
    rating: form.rating || null,
    notes: form.notes.trim() || undefined,
    quotes: form.quotes.trim() || undefined,
    startDate,
    endDate,
    createdAt: existing?.createdAt ?? nowISO(),
    updatedAt: pagesChanged ? nowISO() : existing?.updatedAt ?? nowISO(),
  };
}

// ------------------------------------------------------------
// Import batch — "una riga per libro"
// ------------------------------------------------------------
interface ParsedImport {
  title: string;
  author: string;
  totalPages: number;
}

/** 'Titolo' | 'Titolo — Autore' | 'Titolo — Autore — 320' (separatori: —, –, -) */
function parseImportLines(text: string): ParsedImport[] {
  const rows: ParsedImport[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/\s+[—–-]\s+/).map((s) => s.trim());
    const title = parts[0] ?? "";
    if (!title) continue;
    const author = parts.length > 1 ? parts[1] : "";
    const pagesRaw = parts.length > 2 ? parts[2] : "";
    const totalPages = /^\d+$/.test(pagesRaw) ? parseInt(pagesRaw, 10) : 0;
    rows.push({ title, author, totalPages });
  }
  return rows;
}

// ------------------------------------------------------------
// Cover gradient — colore stabile per titolo (lettera iniziale)
// ------------------------------------------------------------
const COVER_PAIRS: [string, string][] = [
  ["#4C7EFF", "#8A6BFF"],
  ["#8A6BFF", "#2FD4FF"],
  ["#2FD4FF", "#4C7EFF"],
  ["#f97316", "#ec4899"],
  ["#06b6d4", "#4C7EFF"],
  ["#10b981", "#06b6d4"],
];
function coverGradient(title: string): { background: string } {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [a, b] = COVER_PAIRS[h % COVER_PAIRS.length];
  return { background: `linear-gradient(135deg, ${a}, ${b})` };
}
const titleInitial = (title: string): string => (title.trim() ? title.trim()[0].toUpperCase() : "?");

// ------------------------------------------------------------
// Valutazione a stelle (uri riempito, stroke coerente)
// ------------------------------------------------------------
function Star({ filled, size = 15, onClick }: { filled: boolean; size?: number; onClick?: () => void }) {
  const svg = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={cn(
        "transition-colors",
        filled ? "text-accent drop-shadow-[0_0_5px_rgba(76,126,255,0.5)]" : "text-border-strong"
      )}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
  if (!onClick) return svg;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Valutazione"
      className="transition-transform hover:scale-110 focus-visible:outline-none"
    >
      {svg}
    </button>
  );
}

/** Riga "+X pagine oggi" — con glow sul CTA. */
function CommitPages({
  book,
  onCommit,
  compact = false,
}: {
  book: Book;
  onCommit: (b: Book, n: number) => void;
  compact?: boolean;
}) {
  const [val, setVal] = useState("");
  const n = parseInt(val, 10);
  const ok = Number.isFinite(n) && n > 0;
  const submit = () => {
    if (!ok) return;
    onCommit(book, n);
    setVal("");
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="number"
        min={1}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="X"
        aria-label="Pagine lette oggi"
        className={cn("tnum text-right", compact ? "h-7 w-14 text-sm" : "h-9 w-20 text-sm")}
      />
      <Button size={compact ? "sm" : "md"} disabled={!ok} onClick={submit} glow>
        <Icon name="plus" size={12} />
        {ok ? n : "X"} pagine oggi
      </Button>
    </div>
  );
}

/** Copertina stilizzata con gradiente e lettera iniziale. */
function Cover({
  title,
  size = "sm",
  className,
}: {
  title: string;
  size?: "sm" | "lg";
  className?: string;
}) {
  const grad = coverGradient(title);
  const dims = size === "lg" ? "h-28 w-[4.5rem] rounded-lg" : "h-14 w-10 rounded-md";
  return (
    <div
      className={cn("relative shrink-0 select-none overflow-hidden shadow-[0_6px_18px_-6px_rgba(0,0,0,0.7)]", dims, className)}
      style={grad}
    >
      {/* dorso */}
      <span className="absolute inset-y-0 left-[3px] w-px bg-white/25" />
      <span className="absolute inset-y-0 left-[6px] w-px bg-black/20" />
      <span className="absolute inset-0 flex items-center justify-center">
        <span
          className={cn(
            "font-bold text-white/95",
            size === "lg" ? "text-4xl" : "text-xl"
          )}
          style={{ textShadow: "0 2px 8px rgba(0,0,0,0.35)" }}
        >
          {titleInitial(title)}
        </span>
      </span>
    </div>
  );
}

// ------------------------------------------------------------
// Card libro
// ------------------------------------------------------------
function BookCard({
  book,
  onEdit,
  onDelete,
  onAddPages,
  onRating,
}: {
  book: Book;
  onEdit: (b: Book) => void;
  onDelete: (b: Book) => void;
  onAddPages: (b: Book, n: number) => void;
  onRating: (b: Book, r: number) => void;
}) {
  const total = book.totalPages || 0;
  const pct = total > 0 ? Math.round((book.pagesRead / total) * 100) : 0;
  const done = total > 0 && book.pagesRead >= total;
  const rating = book.rating ?? 0;
  const current = book.status === "in_corso" && !done;

  return (
    <Card hairline={current ? "accent" : "none"} className="flex h-full flex-col gap-2.5">
      <div className="flex gap-3">
        <Cover title={book.title} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="truncate text-sm font-semibold text-foreground">{book.title}</h4>
                {done ? (
                  <Badge tone="warning"><Icon name="check" size={11} /> {STATUS_LABEL.finito}</Badge>
                ) : (
                  <Badge tone={STATUS_BADGE[book.status]}>{STATUS_LABEL[book.status]}</Badge>
                )}
              </div>
              {book.author && <p className="mt-0.5 truncate text-xs text-muted-foreground">{book.author}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => onEdit(book)}
                aria-label="Modifica"
                title="Modifica"
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
              >
                <Icon name="pencil" size={14} />
              </button>
              <button
                type="button"
                onClick={() => onDelete(book)}
                aria-label="Elimina"
                title="Elimina"
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
          </div>

          <div className="mt-1.5 flex items-center gap-1.5">
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} filled={i <= rating} size={14} onClick={() => onRating(book, rating === i ? 0 : i)} />
              ))}
            </div>
            <span className="tnum text-[11px] text-muted-foreground">{rating > 0 ? `${rating}/5` : "da valutare"}</span>
          </div>
        </div>
      </div>

      {(total > 0 || book.pagesRead > 0) && (
        <div>
          <div className="mb-1 flex items-baseline justify-between text-[11px]">
            <span className="text-muted-foreground">Progresso</span>
            <span className="tnum text-secondary-text">
              {book.pagesRead} / {total || "—"} pagine · {pct}%
            </span>
          </div>
          <ProgressBar value={book.pagesRead} max={total || 1} className="h-1.5" />
        </div>
      )}

      {book.status !== "finito" && <CommitPages book={book} onCommit={onAddPages} compact />}

      {(book.startDate || book.endDate) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {book.startDate && <span className="tnum"><Icon name="calendar" size={11} className="mr-1 inline" /> Iniziato {labelDayKey(book.startDate)}</span>}
          {book.endDate && <span className="tnum"><Icon name="flag" size={11} className="mr-1 inline" /> Finito {labelDayKey(book.endDate)}</span>}
        </div>
      )}

      {(book.notes || book.quotes) && (
        <div className="mt-auto space-y-1.5 border-t border-border pt-2.5">
          {book.quotes && <p className="line-clamp-2 text-xs italic text-secondary-text">&ldquo;{book.quotes}&rdquo;</p>}
          {book.notes && <p className="line-clamp-2 text-xs text-muted-foreground">{book.notes}</p>}
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------
// Pagina
// ------------------------------------------------------------
export default function LibriPage() {
  const db = useDB();
  const books = db.books;

  const counts = useMemo(() => {
    const c: Record<TabId, number> = { tutti: books.length, da_leggere: 0, in_corso: 0, finito: 0 };
    for (const b of books) c[b.status] += 1;
    return c;
  }, [books]);

  const sorted = useMemo(() => {
    const arr = [...books];
    arr.sort((a, b) => {
      const s = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
      if (s !== 0) return s;
      return a.title.localeCompare(b.title, "it");
    });
    return arr;
  }, [books]);

  const [tab, setTab] = useState<TabId>("tutti");
  const shown = useMemo(() => (tab === "tutti" ? sorted : sorted.filter((b) => b.status === tab)), [sorted, tab]);

  const current = currentBook(db);
  const totalPagesRead = books.reduce((s, b) => s + (b.pagesRead || 0), 0);

  // ---- form nuova/modifica ----
  const [formModal, setFormModal] = useState<{ mode: "new" } | { mode: "edit"; book: Book } | null>(null);
  const [form, setForm] = useState<BookForm>(emptyForm());

  const openNew = () => {
    setForm(emptyForm());
    setFormModal({ mode: "new" });
  };
  const openEdit = (book: Book) => {
    setForm(formFromBook(book));
    setFormModal({ mode: "edit", book });
  };

  const saveBook = () => {
    if (!form.title.trim()) return;
    updateDB((d) => ({
      ...d,
      books: upsert(d.books, buildBook(form, d.settings.timezone, formModal?.mode === "edit" ? formModal.book : undefined)),
    }));
    setFormModal(null);
  };

  // ---- quick action +X pagine oggi ----
  const addPages = (book: Book, pages: number) => {
    if (!Number.isFinite(pages) || pages <= 0) return;
    updateDB((d) => ({
      ...d,
      books: d.books.map((b) => {
        if (b.id !== book.id) return b;
        const total = Math.max(0, b.totalPages || 0);
        const next = total > 0 ? Math.min(b.pagesRead + Math.floor(pages), total) : b.pagesRead + Math.floor(pages);
        const finished = total > 0 && next >= total;
        const today = todayKey(d.settings.timezone);
        return {
          ...b,
          pagesRead: next,
          status: finished ? "finito" : b.status === "da_leggere" ? "in_corso" : b.status,
          startDate: !finished && b.status === "da_leggere" && !b.startDate ? today : b.startDate,
          endDate: finished ? today : b.endDate,
          updatedAt: nowISO(),
        };
      }),
    }));
  };

  const setRating = (book: Book, r: number) => {
    updateDB((d) => ({
      ...d,
      books: d.books.map((b) => (b.id === book.id ? { ...b, rating: r || null } : b)),
    }));
  };

  // ---- delete ----
  const [toDelete, setToDelete] = useState<Book | null>(null);
  const confirmDelete = () => {
    if (!toDelete) return;
    updateDB((d) => ({ ...d, books: removeById(d.books, toDelete.id) }));
    setToDelete(null);
  };

  // ---- import batch ----
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const parsedImport = useMemo(() => parseImportLines(importText), [importText]);
  const importPreview = useMemo(() => {
    const existing = new Set(books.map((b) => b.title.trim().toLowerCase()));
    return parsedImport.map((r) => ({ ...r, dup: existing.has(r.title.trim().toLowerCase()) }));
  }, [parsedImport, books]);
  const newImportCount = importPreview.filter((r) => !r.dup).length;

  const doImport = () => {
    if (parsedImport.length === 0) return;
    updateDB((d) => {
      const existing = new Set(d.books.map((b) => b.title.trim().toLowerCase()));
      const now = nowISO();
      const toAdd: Book[] = parsedImport
        .filter((r) => !existing.has(r.title.trim().toLowerCase()))
        .map((r) => ({
          id: uid(),
          title: r.title,
          author: r.author,
          status: "da_leggere" as BookStatus,
          totalPages: r.totalPages,
          pagesRead: 0,
          rating: null,
          notes: undefined,
          quotes: undefined,
          startDate: null,
          endDate: null,
          createdAt: now,
          updatedAt: now,
        }));
      return { ...d, books: [...d.books, ...toAdd] };
    });
    setImportText("");
    setImportOpen(false);
  };

  const currentPct = current && current.totalPages > 0 ? Math.round((current.pagesRead / current.totalPages) * 100) : 0;
  const remaining =
    current && current.totalPages > 0 ? Math.max(0, current.totalPages - current.pagesRead) : 0;

  return (
    <div className="space-y-6">
      <Reveal>
        <SectionHeader
          kicker="Libreria"
          title="Leggi di più, ogni giorno."
          subtitle={`${books.length} ${books.length === 1 ? "libro" : "libri"} · ${counts.in_corso} in corso · ${counts.finito} ${counts.finito === 1 ? "finito" : "finiti"}`}
          action={
            <>
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <Icon name="upload" size={13} />
                Importa
              </Button>
              <Button size="sm" onClick={openNew}>
                <Icon name="plus" size={13} />
                Nuovo libro
              </Button>
            </>
          }
        />
      </Reveal>

      {books.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Reveal delay={0}>
            <StatCard label="In libreria" value={books.length} icon={<Icon name="book" size={16} className="text-accent" />} className="h-full" />
          </Reveal>
          <Reveal delay={60}>
            <StatCard label="In corso" value={counts.in_corso} icon={<Icon name="book-open" size={16} className="text-accent" />} className="h-full" />
          </Reveal>
          <Reveal delay={120}>
            <StatCard label="Completati" value={counts.finito} icon={<Icon name="check" size={16} className="text-accent" />} className="h-full" />
          </Reveal>
          <Reveal delay={180}>
            <StatCard label="Pagine lette" value={totalPagesRead} icon={<Icon name="book-open" size={16} className="text-accent" />} className="h-full" />
          </Reveal>
        </div>
      )}

      {/* Libro in corso — evidenza con cover */}
      {current && (
        <Reveal delay={40}>
          <Card hairline="accent" texture className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
            <Cover title={current.title} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="info" pulse>● In corso adesso</Badge>
                <span className="text-[11px] text-muted-foreground">
                  {remaining > 0 ? (
                    <>
                      ancora <span className="tnum text-secondary-text">{remaining}</span> pagine
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      ultimo miglio <Icon name="flag" size={11} />
                    </span>
                  )}
                </span>
              </div>
              <h2 className="mt-1.5 truncate text-xl font-semibold tracking-tight">{current.title}</h2>
              {current.author && <p className="mt-0.5 text-sm text-muted-foreground">{current.author}</p>}
              <div className="mt-2 flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star
                    key={i}
                    filled={i <= (current.rating ?? 0)}
                    size={17}
                    onClick={() => setRating(current, (current.rating ?? 0) === i ? 0 : i)}
                  />
                ))}
                <span className="tnum ml-1 text-[11px] text-muted-foreground">
                  {(current.rating ?? 0) > 0 ? `${current.rating}/5` : "da valutare"}
                </span>
              </div>
              <div className="mt-3 max-w-md">
                <div className="mb-1 flex items-baseline justify-between text-xs">
                  <span className="text-muted-foreground">Progresso</span>
                  <span className="tnum font-medium text-foreground">
                    {current.pagesRead} / {current.totalPages || "—"} · {currentPct}%
                  </span>
                </div>
                <ProgressBar value={current.pagesRead} max={current.totalPages || 1} className="h-1.5" />
              </div>
            </div>
            <div className="w-full sm:w-auto sm:shrink-0">
              <CommitPages book={current} onCommit={addPages} />
            </div>
          </Card>
        </Reveal>
      )}

      {books.length > 0 && (
        <Reveal delay={20}>
          <Tabs tabs={TABS.map((t) => ({ ...t, count: counts[t.id] }))} value={tab} onChange={(id) => setTab(id as TabId)} />
        </Reveal>
      )}

      {books.length === 0 ? (
        <Reveal delay={30}>
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong py-12 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl border border-accent/30 bg-accent/10 shadow-[0_0_28px_-8px_rgba(76,126,255,0.6)]">
              <Icon name="book-open" size={30} className="text-accent" />
            </div>
            <p className="text-sm font-medium text-secondary-text">Libreria vuota</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Aggiungi il tuo primo libro oppure importa tutta la lista in un colpo: una riga per libro.
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Button size="sm" onClick={openNew}>
                <Icon name="plus" size={13} />
                Aggiungi libro
              </Button>
              <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                <Icon name="upload" size={13} />
                Importa da testo
              </Button>
            </div>
          </div>
        </Reveal>
      ) : shown.length === 0 ? (
        <Reveal delay={30}>
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong py-12 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl border border-accent/30 bg-accent/10 shadow-[0_0_28px_-8px_rgba(76,126,255,0.6)]">
              <Icon name="book" size={30} className="text-accent" />
            </div>
            <p className="text-sm font-medium text-secondary-text">{`Nessun libro ${tab === "tutti" ? "" : `«${STATUS_LABEL[tab as BookStatus].toLowerCase()}»`}`}</p>
            <p className="max-w-xs text-xs text-muted-foreground">Cambia filtro oppure aggiungi un nuovo libro.</p>
          </div>
        </Reveal>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {shown.map((b, i) => (
            <Reveal key={b.id} delay={Math.min(i, 5) * 50}>
              <BookCard
                book={b}
                onEdit={openEdit}
                onDelete={setToDelete}
                onAddPages={addPages}
                onRating={setRating}
              />
            </Reveal>
          ))}
        </div>
      )}

      {/* Modale nuova/modifica libro */}
      <Modal
        open={formModal !== null}
        onClose={() => setFormModal(null)}
        title={formModal?.mode === "edit" ? "Modifica libro" : "Nuovo libro"}
        width="max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormModal(null)}>
              Annulla
            </Button>
            <Button onClick={saveBook} disabled={!form.title.trim()}>
              {formModal?.mode === "edit" ? "Salva" : "Aggiungi"}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Titolo" className="sm:col-span-2">
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Es. Atomic Habits"
              autoFocus
            />
          </Field>
          <Field label="Autore">
            <Input
              value={form.author}
              onChange={(e) => setForm({ ...form, author: e.target.value })}
              placeholder="Es. James Clear"
            />
          </Field>
          <Field label="Stato">
            <div className="relative">
              <Select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as BookStatus })}
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <Icon name="arrow-down" size={12} />
              </span>
            </div>
          </Field>
          <Field label="Pagine totali">
            <Input
              type="number"
              min={0}
              value={form.totalPages}
              onChange={(e) => setForm({ ...form, totalPages: e.target.value })}
              placeholder="320"
              className="tnum"
            />
          </Field>
          <Field label="Pagine lette">
            <Input
              type="number"
              min={0}
              value={form.pagesRead}
              onChange={(e) => setForm({ ...form, pagesRead: e.target.value })}
              placeholder="0"
              className="tnum"
            />
          </Field>
          <Field label="Data inizio">
            <Input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </Field>
          <Field label="Data fine">
            <Input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </Field>
          <Field label="Valutazione" className="sm:col-span-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star
                    key={i}
                    filled={i <= form.rating}
                    size={20}
                    onClick={() => setForm({ ...form, rating: form.rating === i ? 0 : i })}
                  />
                ))}
              </div>
              <span className="tnum text-xs text-muted-foreground">
                {form.rating > 0 ? `${form.rating}/5` : "Nessuna valutazione"}
              </span>
            </div>
          </Field>
          <Field label="Citazioni" className="sm:col-span-2">
            <TextArea
              value={form.quotes}
              onChange={(e) => setForm({ ...form, quotes: e.target.value })}
              placeholder="Le frasi che ti colpiscono…"
            />
          </Field>
          <Field label="Note" className="sm:col-span-2">
            <TextArea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Appunti, riassunti, idee…"
            />
          </Field>
        </div>
      </Modal>

      {/* Modale import batch — anteprima curata */}
      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Importa libri"
        width="max-w-xl"
        footer={
          <>
            <span className="mr-auto text-xs text-muted-foreground">
              {importText && newImportCount === 0 ? "Tutti i titoli sono già in libreria" : ""}
            </span>
            <Button variant="ghost" onClick={() => setImportOpen(false)}>
              Annulla
            </Button>
            <Button onClick={doImport} disabled={newImportCount === 0}>
              Importa {newImportCount}
            </Button>
          </>
        }
      >
        <p className="mb-2 text-xs text-muted-foreground">Una riga per libro. Formati supportati:</p>
        <div className="mb-3 space-y-0.5 rounded-lg border border-border bg-muted px-3 py-2 font-mono text-[11px] leading-relaxed text-secondary-text">
          <div>Titolo</div>
          <div>Titolo — Autore</div>
          <div>Titolo — Autore — 320</div>
        </div>
        <TextArea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder={"Il problema dei 3 corpi — Liu Cixin — 416\nDeep Work\nFactfulness — 342"}
          className="min-h-32 font-mono text-xs"
        />
        {importPreview.length > 0 && (
          <div className="mt-3 overflow-hidden rounded-xl border border-border">
            <div className="flex items-center justify-between border-b border-border bg-elevated/50 px-3 py-2">
              <p className="text-xs font-medium text-secondary-text">
                Anteprima <span className="tnum">({importPreview.length})</span> —{" "}
                <span className="tnum text-accent">{newImportCount}</span> da importare
              </p>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">una riga = un libro</span>
            </div>
            <ul className="max-h-48 space-y-1 overflow-y-auto p-2">
              {importPreview.map((r, i) => (
                <li
                  key={i}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-elevated/30 px-2.5 py-1.5 text-xs transition-colors hover:border-border-strong",
                    r.dup && "opacity-55"
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="flex h-6 w-5 shrink-0 items-center justify-center rounded-[4px] text-[10px] font-bold text-white"
                      style={coverGradient(r.title)}
                    >
                      {titleInitial(r.title)}
                    </span>
                    <span className="min-w-0 truncate">
                      <span className="font-medium text-foreground">{r.title}</span>
                      {r.author && <span className="text-muted-foreground"> — {r.author}</span>}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {r.totalPages > 0 && <span className="tnum text-muted-foreground">{r.totalPages} p.</span>}
                    {r.dup ? (
                      <Badge>già in libreria</Badge>
                    ) : (
                      <Badge tone="info">nuovo</Badge>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>

      {/* Conferma eliminazione */}
      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Eliminare il libro?"
        message={toDelete ? `«${toDelete.title}» verrà rimosso dalla libreria. Questa azione non può essere annullata.` : ""}
        confirmLabel="Elimina"
      />
    </div>
  );
}
