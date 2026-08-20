// ============================================================
// ASCEND — Seed / default + helper di accesso alle collezioni.
// L'app parte VUOTA di dati demo (nessuna transazione/trade finti),
// ma con default sensati: impostazioni utente + categorie finanza.
// ============================================================

import type { DB, Category, UserSettings } from "./types";
import { uid, nowISO } from "./storage";

export function defaultSettings(): UserSettings {
  return {
    baseCurrency: "EUR",
    timezone: "Europe/Rome",
    weekStart: 1,
    locale: "it-IT",
    privacyMode: "standard",
    onboardingDone: false,
    updatedAt: nowISO(),
  };
}

export function defaultCategories(): Category[] {
  const c = (name: string, type: "income" | "expense", icon: string, color: string): Category => ({
    id: uid(),
    name,
    type,
    icon,
    color,
  });
  return [
    c("Stipendio", "income", "💼", "#4C7EFF"),
    c("Payout trading", "income", "📈", "#22c55e"),
    c("Altri ingressi", "income", "🪙", "#eab308"),
    c("Casa", "expense", "🏠", "#f97316"),
    c("Cibo", "expense", "🍝", "#ef4444"),
    c("Trasporti", "expense", "🚗", "#06b6d4"),
    c("Sport", "expense", "💪", "#8b5cf6"),
    c("Abbonamenti", "expense", "🔁", "#ec4899"),
    c("Altro", "expense", "📦", "#64748b"),
  ];
}

/** Crea una DB con i soli default (vuota di dati demo). */
export function seedDB(): DB {
  return {
    version: 1,
    settings: defaultSettings(),
    categories: defaultCategories(),
    transactions: [],
    accounts: [],
    trades: [],
    setups: [],
    setupRules: [],
    tradeSetupRules: [],
    firmExpenses: [],
    payouts: [],
    weeklyReviews: [],
    dailyGoals: [],
    weeklyGoals: [],
    pcUsageLogs: [],
    pcAppCategoryMap: [],
    books: [],
    workouts: [],
    studySessions: [],
    savingsGoals: [],
    savingsDeposits: [],
    badges: [],
  };
}

// ------------------------------------------------------------
// Helper di lookup (per le pagine)
// ------------------------------------------------------------
import type { TradingAccount, Setup, Category as C } from "./types";

export function getAccount(db: DB, id: string): TradingAccount | undefined {
  return db.accounts.find((a) => a.id === id);
}

export function getCategory(db: DB, id: string): Category | undefined {
  return db.categories.find((c) => c.id === id);
}

export function getSetup(db: DB, id: string): Setup | undefined {
  return db.setups.find((s) => s.id === id);
}

export function setupName(db: DB, id: string | null | undefined): string {
  if (!id) return "—";
  return db.setups.find((s) => s.id === id)?.name ?? "—";
}

export type { C };
