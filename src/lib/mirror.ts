// ============================================================
// ASCEND — Mirror DB sul FILE CENTRALE (sync-server :4878)
// ------------------------------------------------------------
// Il localStorage è legato al profilo del browser: profili diversi
// (= browser diversi) avrebbero DB diversi. Questo modulo rende il
// FILE di %LOCALAPPDATA%\Ascend\sync-db.json l'UNICA fonte di verità:
//   - ogni saveDB() → POST /api/sync (throttled 3s, merge per timestamp)
//   - al boot: pull dal file; vuoto+pieno → adozione, pieno+vuoto → semina
// Così Brave, Edge app-window, qualunque profilo: STESSO database.
// ============================================================
"use client";

const SYNC_BASE = "http://127.0.0.1:4878";
const SYNC_TOKEN = "ascend-sync";

let mirrorTimer: ReturnType<typeof setTimeout> | null = null;
let lastPushAt = 0;

/** Push throttled del DB al sync-server (fire-and-forget, mai bloccante). */
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
    fetch(`${SYNC_BASE}/api/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sync-token": SYNC_TOKEN,
      },
      body: JSON.stringify({ db }),
      keepalive: true,
    }).catch(() => {
      /* sync-server assente: silenzio */
    });
  } catch {
    /* fetch indisponibile: silenzio */
  }
}

/** Sovrascrive il file centrale con un DB esatto (niente merge).
 *  Usato dal reset totale: senza questo, il merge resusciterebbe i dati. */
export function mirrorReplace(db: unknown): void {
  if (typeof window === "undefined") return;
  try {
    fetch(`${SYNC_BASE}/api/sync?replace=1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sync-token": SYNC_TOKEN,
      },
      body: JSON.stringify({ db }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* silenzio */
  }
}

/** Pull dal file centrale: ritorna il DB o null (assente/errore). */
export async function mirrorPull(): Promise<unknown | null> {
  try {
    const res = await fetch(`${SYNC_BASE}/api/db`, {
      headers: { "x-sync-token": SYNC_TOKEN },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { ok: boolean; db?: unknown };
    return j.ok && j.db ? j.db : null;
  } catch {
    return null;
  }
}