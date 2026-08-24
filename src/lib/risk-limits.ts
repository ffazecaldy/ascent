// ============================================================
// ASCEND — Adapter limiti di rischio
// Il CORE `limitUsage` vive in @/lib/compute (logica di calcolo,
// mantenuta dall'agente core-math): NON duplicarla qui.
// Questo modulo è l'ADAPTER che isola i consumatori (UI) dal core:
// se la firma/forma del core cambia, l'impatto si assorbe in questo
// unico punto di re-export.
// Contratto del core (agente core-math):
//   limitUsage(account: TradingAccount, trades: Trade[], now: Date) → LimitUsage
//     { daily: number  // consumo netto del trading day corrente (≥ 0)
//       max:   number } // consumo su equity live: max(0, capital - live) (≥ 0)
// Le distanze dai limiti si derivano dal consumo con le stesse soglie di
// accounts/page.tsx: distance = max(0, limite - consumo).
// ============================================================

export { limitUsage } from "@/lib/compute";
export type { LimitUsage } from "@/lib/compute";