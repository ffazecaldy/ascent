#!/usr/bin/env node
// ============================================================
// ASCEND DAEMON — il motore dell'EXE unico
// - Serve l'app statica (cartella out/) su :3000
// - Espone il sync server 2 PC su :4878 (merge per voce)
// - Apre l'app in una finestra dedicata (Edge/Chrome --app,
//   profilo separato: storage pulito e isolato dal browser)
// - POST /api/shutdown (token) → chiude browser + processo
// Compilato con pkg in Ascend.exe (runtime node incluso).
// Env: ASCEND_APP_PORT (3000) · ASCEND_SYNC_PORT (4878) ·
//      ASCEND_SYNC_TOKEN ('ascend-sync') · ASCEND_NO_BROWSER=1
// ============================================================
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn, execFileSync } = require("node:child_process");

const IS_PKG = !!process.pkg;
// In pkg: snapshot virtuale — la radice dipende da dove vive il package.json
// di build (es. /snapshot/pkgbuild/out). In dev: out/ del progetto.
const ROOT = IS_PKG ? path.join(__dirname, "..") : path.resolve(__dirname, "..");
const DEV_OUT = path.resolve(ROOT, "out");

/** In pkg la collocazione degli assets varia con la struttura del build:
 *  prova i candidati noti finché trova index.html. */
function resolveOutDir() {
  if (!IS_PKG) return DEV_OUT;
  const candidates = [
    path.join(__dirname, "pkgbuild", "out"),
    path.join(__dirname, "..", "pkgbuild", "out"),
    path.join(__dirname, "out"),
    path.join(__dirname, "..", "out"),
  ];
  for (const c of candidates) {
    try {
      if (fs.readFileSync(path.join(c, "index.html")).length > 0) return c;
    } catch { /* prova il prossimo */ }
  }
  return candidates[0];
}
const OUT_DIR = resolveOutDir();

const APP_PORT = Number(process.env.ASCEND_APP_PORT ?? 3000);
const SYNC_PORT = Number(process.env.ASCEND_SYNC_PORT ?? 4878);
const TOKEN = process.env.ASCEND_SYNC_TOKEN ?? "ascend-sync";
const SYNC_HOST = "0.0.0.0";
const DATA_DIR = path.join(os.homedir(), "AppData", "Local", "Ascend");
const SYNC_FILE = path.join(DATA_DIR, "sync-db.json");
const PROFILE_DIR = path.join(DATA_DIR, "app-profile");

if (!process.env.ASCEND_SYNC_TOKEN) {
  console.log("[ascend] token: 'ascend-sync' (default) — imposta ASCEND_SYNC_TOKEN per cambiarlo");
}
console.log(`[ascend] app su :${APP_PORT} · sync su :${SYNC_PORT} · dati in ${DATA_DIR}`);
console.log(`[ascend] ${IS_PKG ? "EXE pkg" : "dev"} mode · static: ${OUT_DIR}`);

// ------------------------------------------------------------
// Merge sync (stessa spec di src/lib/merge.ts)
// ------------------------------------------------------------
const LIST_KEYS = [
  "categories", "transactions", "accounts", "trades", "setups", "setupRules",
  "tradeSetupRules", "firmExpenses", "payouts", "weeklyReviews", "dailyGoals",
  "weeklyGoals", "pcUsageLogs", "pcAppCategoryMap", "books", "workouts",
  "studySessions", "studySubjects", "savingsGoals", "savingsDeposits",
  "recurringRules", "wellnessLogs", "badges",
];
const BASIC_KEYS = ["categories", "transactions", "accounts", "trades"];

const isValidShape = (x) =>
  !!x && typeof x === "object" &&
  Number.isInteger(x.version) && x.version >= 1 &&
  !!x.settings && typeof x.settings === "object" && !Array.isArray(x.settings) &&
  BASIC_KEYS.every((k) => Array.isArray(x[k]));

const itemTs = (it) => {
  const v = it.updatedAt ?? it.createdAt ?? it.date;
  return typeof v === "string" ? v : "";
};
const itemKey = (it) => {
  if (typeof it.id === "string" && it.id) return `id:${it.id}`;
  if (typeof it.date === "string" && it.date) return `date:${it.date}`;
  return `json:${JSON.stringify(it)}`;
};
function mergeLists(local, incoming) {
  const map = new Map();
  for (const it of local || []) map.set(itemKey(it), it);
  let added = 0, updated = 0;
  for (const it of incoming || []) {
    const k = itemKey(it);
    const cur = map.get(k);
    if (!cur) { map.set(k, it); added++; }
    else if (itemTs(it) > itemTs(cur)) { map.set(k, it); updated++; }
  }
  return { out: [...map.values()], added, updated };
}
function mergeDb(server, client) {
  const out = { ...server };
  let added = 0, updated = 0;
  for (const key of LIST_KEYS) {
    const r = mergeLists(server[key], client[key]);
    out[key] = r.out;
    added += r.added;
    updated += r.updated;
  }
  if ((client.settings?.updatedAt ?? "") > (server.settings?.updatedAt ?? "")) {
    out.settings = { ...server.settings, ...client.settings };
    updated++;
  }
  if (client.sportProfile && (!server.sportProfile || (client.sportProfile.onboardedAt ?? "") > (server.sportProfile.onboardedAt ?? ""))) {
    out.sportProfile = client.sportProfile;
    updated++;
  }
  out.version = server.version || client.version || 1;
  return { db: out, added, updated };
}

let syncCache = null;
let mergedAt = null;
function loadSync() {
  if (syncCache) return syncCache;
  try {
    if (fs.existsSync(SYNC_FILE)) {
      const raw = JSON.parse(fs.readFileSync(SYNC_FILE, "utf8"));
      if (isValidShape(raw)) {
        syncCache = raw;
        mergedAt = fs.statSync(SYNC_FILE).mtime.toISOString();
        return syncCache;
      }
    }
  } catch { /* riparte vuoto */ }
  syncCache = { version: 0 };
  return syncCache;
}
function saveSync(db) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = SYNC_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
    fs.renameSync(tmp, SYNC_FILE);
    mergedAt = new Date().toISOString();
  } catch (e) {
    console.warn("[ascend] salvataggio sync fallito:", e.message);
  }
}

// ------------------------------------------------------------
// HTTP + CORS (allowlist: solo l'app Ascend)
// ------------------------------------------------------------
const ALLOWED_ORIGINS = new Set(["http://localhost:3000", "http://localhost:3001"]);
function corsHeaders(req) {
  const origin = req.headers.origin;
  return origin && ALLOWED_ORIGINS.has(origin)
    ? { "Access-Control-Allow-Origin": origin }
    : {};
}
function authOk(req, url) {
  return req.headers["x-sync-token"] === TOKEN || url.searchParams.get("token") === TOKEN;
}
function json(res, code, data, extra = {}) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extra,
  });
  res.end(body);
}
function readBody(req, cap = 100 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > cap) { reject(new Error("body troppo grande")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith("/")) p += "index.html";
  if (p === "/") p = "index.html";
  const file = path.join(OUT_DIR, p);
  if (!file.startsWith(OUT_DIR)) return json(res, 403, { ok: false, error: "fuori root" });
  let data;
  try {
    data = fs.readFileSync(file);
  } catch {
    // SPA fallback sulla home per rotte client-side (raro con export)
    if (!p.endsWith(".html")) return json(res, 404, { ok: false, error: "non trovato" });
    try { data = fs.readFileSync(path.join(OUT_DIR, "index.html")); }
    catch { return json(res, 404, { ok: false, error: "non trovato" }); }
  }
  const ext = path.extname(file).toLowerCase();
  const isHtml = ext === ".html";
  res.writeHead(200, {
    "Content-Type": MIME[ext] ?? "application/octet-stream",
    "Cache-Control": isHtml ? "no-store" : "public, max-age=31536000, immutable",
    "X-Frame-Options": "DENY",
  });
  res.end(data);
}

let browserPid = 0;
function findBrowser() {
  const candidates = [
    path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
  ];
  return candidates.find((c) => fs.existsSync(c)) ?? null;
}
function openAppWindow() {
  if (process.env.ASCEND_NO_BROWSER === "1") {
    console.log(`[ascend] browser non aperto (ASCEND_NO_BROWSER=1) — apri http://localhost:${APP_PORT}`);
    return;
  }
  const exe = findBrowser();
  if (!exe) {
    console.log(`[ascend] nessun Edge/Chrome trovato — apri http://localhost:${APP_PORT}`);
    return;
  }
  const url = `http://localhost:${APP_PORT}/`;
  const extra = exe.toLowerCase().includes("chrome") ? ["--no-first-run", "--no-default-browser-check"] : [];
  const child = spawn(exe, ["--app=" + url, `--user-data-dir=${PROFILE_DIR}`, ...extra], {
    stdio: "ignore",
    windowsHide: true,
  });
  browserPid = child.pid ?? 0;
  child.on("error", () => {
    console.log(`[ascend] avvio browser fallito — apri ${url} manualmente`);
    browserPid = 0;
  });
  console.log(`[ascend] finestra dedicata aperta (pid ${browserPid})`);
}
function closeAppWindow() {
  if (!browserPid) return;
  try {
    execFileSync("taskkill", ["/pid", String(browserPid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    console.log(`[ascend] finestra Ascend chiusa (pid ${browserPid})`);
  } catch { /* già chiusa */ }
  browserPid = 0;
}

// ------------------------------------------------------------
// Server HTTP unico: statico (app) + API (sync/shutdown)
// ------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      ...corsHeaders(req),
      "Access-Control-Allow-Headers": "content-type, x-sync-token",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    });
    res.end();
    return;
  }

  try {
    // ——— API del sync server ———
    if (url.pathname.startsWith("/api/")) {
      const cors = corsHeaders(req);
      if (!authOk(req, url)) {
        json(res, 401, { ok: false, error: "token non valido" }, cors);
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/ping") {
        const up = syncCache?.version ? { dbVersion: syncCache.version, mergedAt } : { dbVersion: 0, mergedAt: null };
        json(res, 200, { ok: true, service: "ascend-daemon", ...up, requireToken: true }, cors);
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/db") {
        json(res, 200, { ok: true, db: loadSync(), mergedAt }, cors);
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/sync") {
        const body = JSON.parse(await readBody(req));
        if (!body || !isValidShape(body.db)) {
          json(res, 400, { ok: false, error: "DB non valido" }, cors);
          return;
        }
        const merged = mergeDb(loadSync(), body.db);
        saveSync(merged.db);
        syncCache = merged.db;
        json(res, 200, { ok: true, db: merged.db, mergedAt, stats: { added: merged.added, updated: merged.updated } }, cors);
        return;
      }
      // ——— SPEGNIMENTO: chiude finestra dedicata + server + processo ———
      if (req.method === "POST" && url.pathname === "/api/shutdown") {
        console.log("[ascend] spegnimento richiesto dal tasto Spegni…");
        json(res, 200, { ok: true, message: "Ascend spento — puoi chiudere questa finestra" }, cors);
        setTimeout(() => {
          closeAppWindow();
          server.close();
          setTimeout(() => process.exit(0), 300);
        }, 400);
        return;
      }
      json(res, 404, { ok: false, error: "rotta API non trovata" }, cors);
      return;
    }

    // ——— App statica ———
    serveStatic(req, res, url);
  } catch (e) {
    json(res, 500, { ok: false, error: e?.message ?? "errore interno" });
  }
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`[ascend] porta ${APP_PORT} occupata — chiudi l'altra istanza di Ascend e riprova`);
  } else {
    console.error("[ascend] errore server:", e.message);
  }
  process.exit(1);
});

server.listen(APP_PORT, "127.0.0.1", () => {
  console.log(`[ascend] app pronta su http://localhost:${APP_PORT}`);
  openAppWindow();
});
// sync server: stesso processo, porta separata (0.0.0.0 per la LAN)
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        ...corsHeaders(req),
        "Access-Control-Allow-Headers": "content-type, x-sync-token",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      });
      res.end();
      return;
    }
    const cors = corsHeaders(req);
    if (!authOk(req, url)) { json(res, 401, { ok: false, error: "token non valido" }, cors); return; }
    if (req.method === "GET" && url.pathname === "/api/ping") {
      const up = syncCache?.version ? { dbVersion: syncCache.version, mergedAt } : { dbVersion: 0, mergedAt: null };
      json(res, 200, { ok: true, service: "ascend-daemon", ...up, requireToken: true }, cors);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/db") {
      json(res, 200, { ok: true, db: loadSync(), mergedAt }, cors);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/sync") {
      try {
        const body = JSON.parse(await readBody(req));
        if (!body || !isValidShape(body.db)) { json(res, 400, { ok: false, error: "DB non valido" }, cors); return; }
        const merged = mergeDb(loadSync(), body.db);
        saveSync(merged.db);
        syncCache = merged.db;
        json(res, 200, { ok: true, db: merged.db, mergedAt, stats: { added: merged.added, updated: merged.updated } }, cors);
      } catch (e) {
        json(res, 500, { ok: false, error: e?.message ?? "errore" }, cors);
      }
      return;
    }
    json(res, 404, { ok: false, error: "rotta non trovata" }, cors);
  })
  .listen(SYNC_PORT, SYNC_HOST, () => {
    console.log(`[ascend] sync server su :${SYNC_PORT} (LAN) — dall'altro PC: http://<IP-questo>:${SYNC_PORT}`);
  });

process.on("SIGINT", () => { closeAppWindow(); process.exit(0); });
process.on("SIGTERM", () => { closeAppWindow(); process.exit(0); });