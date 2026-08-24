// ============================================================
// ASCEND — Mirror DB su file del daemon (ascend-db.json)
// ------------------------------------------------------------
// Il localStorage è legato al profilo del browser: con l'EXE (profilo
// dedicato) o un profilo nuovo i dati sembrano "spariti". Questo modulo
// rende il FILE del daemon la fonte di verità condivisa:
//   - ogni saveDB() → POST /api/sync (throttled 3s) al daemon locale
//   - al boot: pull dal file; se ha dati e il locale è vuoto → adottato
// Così browser normale e EXE vedono SEMPRE gli stessi dati.
// ============================================================
"use client";

let mirrorTimer: ReturnType<typeof setTimeout> | null = null;
let lastPushAt = 0;

function daemonBase(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

/** Push throttled del DB al daemon (fire-and-forget, mai bloccante). */
export function mirrorPush(db: unknown): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastPushAt < 3000) {
    if (mirrorTimer) return;
    mirrorTimer = setTimeout(() => {
      mirrorTimer = null;
      mirrorPush(db);
    }, 3000 - (now - lastPushAt));
    return;
  }
  lastPushAt = Date.now();
  try {
    fetch(`${daemonBase()}/api/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sync-token": "ascend-sync",
      },
      body: JSON.stringify({ db }),
      keepalive: true,
    }).catch(() => {
      /* daemon assente (dev senza daemon): silenzio */
    });
  } catch {
    /* fetch indisponibile: silenzio */
  }
}

/** Sovrascrive il file del daemon con un DB esatto (niente merge).
 *  Usato dal reset totale: senza questo, il merge resusciterebbe i dati. */
export function mirrorReplace(db: unknown): void {
  if (typeof window === "undefined") return;
  try {
    fetch(`${daemonBase()}/api/sync?replace=1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sync-token": "ascend-sync",
      },
      body: JSON.stringify({ db }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* silenzio */
  }
}

/** Pull dal daemon: ritorna il DB del file o null (assente/errore). */
export async function mirrorPull(): Promise<unknown | null> {
  try {
    const res = await fetch(`${daemonBase()}/api/db`, {
      headers: { "x-sync-token": "ascend-sync" },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { ok: boolean; db?: unknown };
    return j.ok && j.db ? j.db : null;
  } catch {
    return null;
  }
}