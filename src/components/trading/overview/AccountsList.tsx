"use client";

// ============================================================
// ASCEND — Trading overview: lista account non-archiviati
// Righe-link con avatar-iniziale in gradiente, badge tipo/stato
// (pulse su "Finanziato"/"In valutazione"), saldo live in tnum
// colorato e hairline accent per gli account attivi. Card con
// texture "carta trading" (grid-texture). Rispetta la privacy.
// ============================================================

import Link from "next/link";
import { cn } from "@/lib/cn";
import type {
  DB,
  TradingAccount,
  AccountStatus,
  AccountType,
} from "@/lib/types";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TrendArrow } from "@/components/ui/Arrow";
import { EmptyState } from "@/components/ui/Misc";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { monthKeyOf, todayKey, isoToDayKey, parseDateKey } from "@/lib/dates";
import { moneyMasked, kpiMasked, maskMoney, maskCompact } from "@/lib/privacy";

const TYPE_LABEL: Record<AccountType, string> = {
  prop: "Prop",
  personal: "Personale",
};

const STATUS_LABEL: Record<AccountStatus, string> = {
  eval: "In valutazione",
  superato: "Superata",
  finanziato: "Finanziato",
  bruciato: "Bruciato",
};
const STATUS_TONE: Record<AccountStatus, "success" | "info" | "warning" | "danger"> = {
  eval: "warning",
  superato: "info",
  finanziato: "success",
  bruciato: "danger",
};

/** Account considerati "attivi" (hairline accent): non bruciati. */
const ACTIVE: AccountStatus[] = ["eval", "superato", "finanziato"];

// Gradienti avatar — variano in base a un hash del nome account.
const AVATAR_GRADIENTS = [
  "from-accent to-accent-2",
  "from-accent-2 to-accent-3",
  "from-accent-3 to-accent",
  "from-accent to-accent-3",
  "from-accent-2 to-accent",
];
function avatarGradient(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

function closedNative(db: DB, accountId: string): number {
  return db.trades
    .filter((t) => t.accountId === accountId)
    .reduce((s, t) => s + t.resultNative, 0);
}

/** P&L nativo chiuso di un account in un dato mese ("yyyy-MM"). */
function pnlInMonth(db: DB, accountId: string, monthKey: string): number {
  return db.trades
    .filter(
      (t) =>
        t.accountId === accountId &&
        monthKeyOf(isoToDayKey(t.closeDate, db.settings.timezone)) === monthKey
    )
    .reduce((s, t) => s + t.resultNative, 0);
}

/** Month key "yyyy-MM" spostata di `offset` mesi (negativo = indietro). */
function monthOffsetKey(monthKey: string, offset: number): string {
  const { y, m } = parseDateKey(monthKey + "-01");
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function AccountsList({ db }: { db: DB }) {
  const accounts = db.accounts.filter((a) => !a.archived);
  const locale = db.settings.locale;
  const moneyHide = moneyMasked(db.settings.privacyMode);
  const kpiHide = kpiMasked(db.settings.privacyMode);
  const monthKey = monthKeyOf(todayKey(db.settings.timezone));

  const subtitle =
    accounts.length === 0
      ? "Nessun account attivo"
      : `${accounts.length} account attiv${accounts.length === 1 ? "o" : "i"}`;

  return (
    <Card texture>
      <CardHeader>
        <div>
          <CardTitle>Account</CardTitle>
          <CardSubtitle>{subtitle}</CardSubtitle>
        </div>
        <Link
          href="/trading/accounts"
          className="text-xs font-medium text-accent hover:underline"
        >
          Gestisci →
        </Link>
      </CardHeader>
      {accounts.length === 0 ? (
        <EmptyState
          icon="🏦"
          title="Nessun account"
          description="Crea un account prop o personale per iniziare a tracciare capitale, stato e trade."
          action={
            <Link href="/trading/accounts">
              <Button size="sm" variant="primary">
                Crea account
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {accounts.map((acc: TradingAccount) => {
            const closed = closedNative(db, acc.id);
            const saldo = acc.capital + closed;
            const active = ACTIVE.includes(acc.status);
            const monthly = pnlInMonth(db, acc.id, monthKey);
            const prevMonthly = pnlInMonth(
              db,
              acc.id,
              monthOffsetKey(monthKey, -1)
            );
            const monthlyDelta = monthly - prevMonthly;
            const saldoTone = moneyHide
              ? "text-secondary-text"
              : closed > 0
                ? "text-success"
                : closed < 0
                  ? "text-danger"
                  : "text-foreground";
            const monthlyTone =
              monthly > 0
                ? "text-success"
                : monthly < 0
                  ? "text-danger"
                  : "text-muted-foreground";
            return (
              <Link
                key={acc.id}
                href="/trading/accounts"
                className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-card/70 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[0_12px_30px_-14px_rgba(0,0,0,0.7)]"
              >
                {active && (
                  <span className="pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-gradient-to-b from-accent via-accent-2 to-transparent" />
                )}
                <div
                  className={cn(
                    "relative grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-sm font-bold text-white shadow-[0_4px_14px_-4px_var(--accent-glow)]",
                    avatarGradient(acc.name)
                  )}
                >
                  {acc.name.trim().charAt(0).toUpperCase() || "•"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{acc.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge tone="default">{TYPE_LABEL[acc.type]}</Badge>
                    <Badge
                      tone={STATUS_TONE[acc.status]}
                      pulse={
                        acc.status === "finanziato" || acc.status === "eval"
                      }
                    >
                      {STATUS_LABEL[acc.status]}
                    </Badge>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Saldo
                  </p>
                  <p className="inline-flex items-center justify-end gap-1">
                    <span
                      className={cn(
                        "text-base font-semibold tnum leading-tight",
                        saldoTone
                      )}
                    >
                      {moneyHide
                        ? maskMoney()
                        : formatMoney(saldo, acc.nativeCurrency, locale)}
                    </span>
                    {/* delta saldo − capitale = P&L chiuso (freccia di movimento) */}
                    {!kpiHide && <TrendArrow value={closed} size={12} />}
                  </p>
                  <p
                    className={cn(
                      "inline-flex items-center justify-end gap-1 text-[11px] tnum",
                      moneyHide
                        ? "text-muted-foreground"
                        : closed > 0
                          ? "text-success"
                          : closed < 0
                            ? "text-danger"
                            : "text-muted-foreground"
                    )}
                  >
                    {moneyHide ? (
                      maskCompact()
                    ) : (
                      formatSignedMoney(closed, acc.nativeCurrency, locale)
                    )}{" "}
                    chiusi · mese{" "}
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5",
                        moneyHide ? "text-muted-foreground" : monthlyTone
                      )}
                    >
                      {!kpiHide && <TrendArrow value={monthlyDelta} size={10} />}
                      {moneyHide
                        ? maskCompact()
                        : formatSignedMoney(monthly, acc.nativeCurrency, locale)}
                    </span>
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}
