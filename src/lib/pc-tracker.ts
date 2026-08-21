// ============================================================
// ASCEND — Connettore PC Tracker (mapping condiviso + micro-API)
// Sorgente unica per il mapping exe/title → categoria: usato sia
// dall'import a cartella (AutoTrackerImport.tsx) sia dal pannello
// "Tracker live" (TrackerLive.tsx) via polling http://127.0.0.1:4877.
//
// Server: scripts/tracker-server.mjs (Node stdlib, CORS aperto).
// Endpoint GET:
//   /api/health  → {ok, tracking, interval, lastSample, lastAt, ...}
//   /api/active  → {ok, last:{ts,exe,title,pid,hwnd}, lastAt}
//   /api/since?ts=ISO → {ok, count, samples:[...più recenti di ts]}
// ============================================================

// --- Tipi di dominio -------------------------------------------------

export interface TrackerSample {
  ts: string; // ISO 8601
  exe: string;
  title: string;
  pid?: number;
  hwnd?: number;
}

export interface TrackerHealth {
  ok: boolean;
  tracking: boolean;
  interval: number;
  uptimeSec: number;
  dataDir: string;
  port: number;
  lastSample: TrackerSample | null;
  lastAt: string | null;
  platform: string;
}

export interface TrackerActive {
  ok: boolean;
  tracking: boolean;
  last: TrackerSample | null;
  lastAt: string | null;
  interval: number;
}

export interface TrackerSince {
  ok: boolean;
  count: number;
  samples: TrackerSample[];
}

// --- Costanti ---------------------------------------------------------

export const TRACKER_BASE_URL = "http://127.0.0.1:4877";
/** Polling /api/since durante la registrazione live. */
export const TRACKER_POLL_MS = 20_000;
/** Ogni campione del tracker = 30s = 0.5 min. */
export const TRACKER_SAMPLE_MIN = 0.5;

// --- Micro-API (offline-safe: ogni fetch fallito → null) --------------

async function trackerGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${TRACKER_BASE_URL}${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    // rete/CORS/processo spento → offline
    return null;
  }
}

/** GET /api/health — stato del tracker di sistema. */
export function fetchTrackerHealth(): Promise<TrackerHealth | null> {
  return trackerGet<TrackerHealth>("/api/health");
}

/** GET /api/active — ultima finestra attiva campionata. */
export function fetchTrackerActive(): Promise<TrackerActive | null> {
  return trackerGet<TrackerActive>("/api/active");
}

/** GET /api/since?ts=ISO — campioni più recenti del timestamp dato. */
export function fetchTrackerSince(ts: string): Promise<TrackerSince | null> {
  return trackerGet<TrackerSince>(`/api/since?ts=${encodeURIComponent(ts)}`);
}

// --- Mapping exe → categoria (subset, estendibile via mapping.json) ---

export const EXE_CATEGORY: Record<string, string> = {
  // Browser
  "chrome.exe": "Web", "firefox.exe": "Web", "msedge.exe": "Web", "brave.exe": "Web", "opera.exe": "Web", "vivaldi.exe": "Web",
  // Dev
  "code.exe": "Dev", "code-insiders.exe": "Dev", "pycharm64.exe": "Dev", "idea64.exe": "Dev", "webstorm64.exe": "Dev", "rider64.exe": "Dev", "clion64.exe": "Dev", "goland64.exe": "Dev", "phpstorm64.exe": "Dev", "rubymine64.exe": "Dev", "vim.exe": "Dev", "nvim.exe": "Dev", "notepad++.exe": "Dev", "sublime_text.exe": "Dev", "atom.exe": "Dev",
  "cmd.exe": "Dev", "powershell.exe": "Dev", "pwsh.exe": "Dev", "bash.exe": "Dev", "wsl.exe": "Dev", "git.exe": "Dev", "docker.exe": "Dev", "docker-compose.exe": "Dev",
  // Communication
  "teams.exe": "Communication", "slack.exe": "Communication", "discord.exe": "Communication", "whatsapp.exe": "Communication", "telegram.exe": "Communication", "signal.exe": "Communication", "skype.exe": "Communication", "zoom.exe": "Communication", "outlook.exe": "Communication",
  // Design
  "figma.exe": "Design", "photoshop.exe": "Design", "illustrator.exe": "Design", "afterfx.exe": "Design", "premiere.exe": "Design", "blender.exe": "Design", "unity.exe": "Design", "unrealeditor.exe": "Design",
  // Productivity
  "excel.exe": "Productivity", "winword.exe": "Productivity", "powerpnt.exe": "Productivity", "onenote.exe": "Productivity", "notion.exe": "Productivity", "obsidian.exe": "Productivity", "logseq.exe": "Productivity",
  // Media
  "spotify.exe": "Media", "vlc.exe": "Media", "mpv.exe": "Media", "wmplayer.exe": "Media", "foobar2000.exe": "Media", "youtube.exe": "Media", "youtubemusic.exe": "Media",
  // System
  "explorer.exe": "System", "taskmgr.exe": "System", "regedit.exe": "System", "msconfig.exe": "System", "services.exe": "System",
  // Gaming
  "steam.exe": "Gaming", "epicgameslauncher.exe": "Gaming", "origin.exe": "Gaming", "battle.net.exe": "Gaming", "gog.exe": "Gaming",
};

export const TITLE_KEYWORDS: Record<string, string[]> = {
  Web: ["github", "gitlab", "stackoverflow", "docs", "api", "http", "web", "browser", "chrome", "firefox"],
  Dev: ["code", "git", "terminal", "bash", "python", "javascript", "typescript", "react", "vue", "node", "npm", "yarn", "docker", "kubernetes"],
  Communication: ["meeting", "call", "chat", "mail", "email", "message", "slack", "teams", "discord"],
  Design: ["figma", "design", "photoshop", "illustrator", "sketch", "adobe", "creative"],
  Productivity: ["notion", "obsidian", "notes", "task", "todo", "project", "plan", "excel", "word", "powerpoint"],
  Media: ["spotify", "music", "video", "youtube", "vlc", "media", "player"],
  System: ["settings", "control panel", "task manager", "registry", "services", "update"],
  Gaming: ["steam", "epic", "game", "play", "battle.net", "origin", "gog"],
};

/** Categorizza un campione (exe + titolo finestra) → categoria. */
export function categorize(exe: string, title: string): string {
  const exeLower = exe.toLowerCase();
  if (EXE_CATEGORY[exeLower]) return EXE_CATEGORY[exeLower];

  const titleLower = title.toLowerCase();
  for (const [cat, keywords] of Object.entries(TITLE_KEYWORDS)) {
    if (keywords.some((k) => titleLower.includes(k.toLowerCase()))) {
      return cat;
    }
  }
  return "Other";
}

/**
 * Aggrega campioni per giorno+categoria in minuti.
 * Ogni campione = 30s = 0.5 min. Chiave risultato: "yyyy-MM-dd|Categoria".
 */
export function aggregateSamples(entries: TrackerSample[]): Record<string, number> {
  const byDayCat = new Map<string, number>();

  for (const e of entries) {
    if (!e?.ts || !e?.exe) continue;
    const date = e.ts.split("T")[0];
    const cat = categorize(e.exe, e.title ?? "");
    const key = `${date}|${cat}`;
    const prev = byDayCat.get(key) ?? 0;
    byDayCat.set(key, prev + TRACKER_SAMPLE_MIN);
  }

  const result: Record<string, number> = {};
  for (const [key, mins] of byDayCat.entries()) {
    // arrotonda a 1 decimale
    result[key] = Math.round(mins * 10) / 10;
  }
  return result;
}

/** Formatta minuti → "Xh Ym" (es. 210 → "3h 30m", 45 → "45m"). */
export function formatOreMin(min: number): string {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h > 0 && rem > 0) return `${h}h ${rem}m`;
  if (h > 0) return `${h}h`;
  return `${rem}m`;
}

/** Tempo relativo ("2 min fa", "adesso", ...). */
export function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s <= 1) return "adesso";
  if (s < 60) return `${s}s fa`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min fa`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m fa`;
}

// --- Helpers stats di sessione (TrackerLive) --------------------------

/** Categorie considerate "produttive" (dev/web/lavoro, EN + IT). */
export const PRODUCTIVE_CATEGORIES: ReadonlySet<string> = new Set([
  "Dev",
  "Web",
  "Sviluppo",
  "Lavoro",
]);

/** Formatta una durata in millisecondi → "HH:MM:SS" (cronometro). */
export function formatDurHMS(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Colori barra per categoria (token tema, per style inline). */
export const CATEGORY_COLOR: Record<string, string> = {
  Dev: "var(--accent)",
  Web: "var(--success)",
  Sviluppo: "var(--accent)",
  Lavoro: "var(--success)",
  Communication: "var(--warning)",
  Productivity: "var(--accent-2)",
  Design: "var(--accent-3)",
  Media: "var(--accent-dim)",
  Gaming: "var(--danger)",
  System: "var(--text-muted)",
  Other: "var(--text-2)",
};

/** Colore barra di una categoria (fallback muted). */
export function categoryColor(category: string): string {
  return CATEGORY_COLOR[category] ?? "var(--text-2)";
}
