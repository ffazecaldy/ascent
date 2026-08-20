"use client";

// ============================================================
// ASCEND — Trading overview: lista account non-archiviati
// Nome + badge tipo (prop/personale) e stato + saldo live
// (= capitale + somma trade chiusi, in valuta nativa) → link
// alla pagina account. Rispetta la privacy (moneyMasked).
// ============================================================

import Link from "next/link";
import { cn } from "@/lib/cn";
import type { DB, TradingAccount, AccountStatus, AccountType } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Misc";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { moneyMasked, maskMoney, maskCompact } from "@/lib/privacy";

const TYPE_LABEL: Record<AccountType, string> = {
  prop: "Prop",
  personal: "Personale",
};
const TYPE_TONE: Record<AccountType, "info" | "default"> = {
  prop: "info",
  personal: "default",
};

const STATUS_LABEL: Record<AccountStatus, string> = {
  eval: "In valutazione",
  superato: "Superata",
  finanziato: "Finanziato",
  bruciato: "Bruciato",
};
const STATUS_TONE: Record<AccountStatus, "warning" | "success" | "info" | "danger"> = {
  eval: "warning",
  superato: "success",
  finanziato: "info",
  bruciato: "danger",
};

function closedNative(db: DB, accountId: string): number {
  return db.trades
    .filter((t) => t.accountId === accountId)
    .reduce((s, t) => s + t.resultNative, 0);
}

export function AccountsList({ db }: { db: DB }) {
  const accounts = db.accounts.filter((a) => !a.archived);
  const locale = db.settings.locale;
  const moneyHide = moneyMasked(db.settings.privacyMode);

  const subtitle =
    accounts.length === 0
      ? "Nessun account attivo"
      : `${accounts.length} account attiv${accounts.length === 1 ? "o" : "i"}`;

  return (
    <Card>
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
            return (
              <Link
                key={acc.id}
                href="/trading/accounts"
                className="group flex items-center justify-between gap-3 rounded-lg border border-border bg-elevated/40 p-3 transition-colors hover:border-accent/40 hover:bg-elevated"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{acc.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge tone={TYPE_TONE[acc.type]}>{TYPE_LABEL[acc.type]}</Badge>
                    <Badge tone={STATUS_TONE[acc.status]}>
                      {STATUS_LABEL[acc.status]}
                    </Badge>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Saldo
                  </p>
                  <p
                    className={cn(
                      "text-base font-semibold tnum leading-tight",
                      moneyHide ? "text-secondary-text" : "text-foreground"
                    )}
                  >
                    {moneyHide
                      ? maskMoney()
                      : formatMoney(saldo, acc.nativeCurrency, locale)}
                  </p>
                  <p
                    className={cn(
                      "text-[11px] tnum",
                      moneyHide
                        ? "text-muted-foreground"
                        : closed > 0
                          ? "text-success"
                          : closed < 0
                            ? "text-danger"
                            : "text-muted-foreground"
                    )}
                  >
                    {moneyHide
                      ? maskCompact()
                      : `${formatSignedMoney(closed, acc.nativeCurrency, locale)} chiusi`}
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
