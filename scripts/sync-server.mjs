#!/usr/bin/env node
// ============================================================
// ASCEND — Sync server per 2 PC (DB condiviso in LAN)
// Tiene una copia del DB in %LOCALAPPDATA%\Ascend\sync-db.json
// e fonde (merge per voce, vince la più recente) le copie dei
// dispositivi: POST /api/sync {db} → merge → risposta {db, stats}.
//   - Token condiviso: header 'x-sync-token' (o ?token=)
//   - CORS allowlist: solo l'app Ascend (localhost:3000/3001)
//   - Bind 0.0.0.0: raggiungibile dall'altro PC nella LAN
// Env: ASCEND_SYNC_PORT (4878) · ASCEND_SYNC_TOKEN (default 'ascend-sync')
// ============================================================
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const PORT = Number(process.env.ASCEND_SYNC_PORT ?? 4878);
const TOKEN = process.env.ASCEND_SYNC_TOKEN ?? "ascend-sync";
const DATA_DIR = path.join(os.homedir(), "AppData", "Local", "Ascend");
const DB_FILE = path.join(DATA_DIR, "sync-db.json");
const MAX_BODY = 100 * 1024 * 1024; // 100 MB: un DB con anni di log resta sotto

if (!process.env.ASCEND_SYNC_TOKEN) {
  console.warn("[sync] ATTENZIONE: ASCEND_SYNC_TOKEN non impostata — uso il default 'ascend-sync'. Impostala per sicurezza.");
}

// ------------------------------------------------------------
// Merge core (JS puro, spec identica a src/lib/merge.ts)
// ------------------------------------------------------------
const LIST_KEYS = [
  "categories", "transactions", "accounts", "trades", "setups", "setupRules",
  "tradeSetupRules", "firmExpenses", "payouts", "weeklyReviews", "dailyGoals",
  "weeklyGoals", "pcUsageLogs", "pcAppCategoryMap", "books", "workouts",
  "studySessions", "studySubjects", "knowledgeMaps", "studyMaterials",
  "customGoals", "customGoalChecks", "readingLog", "milestones", "savingsGoals", "savingsDeposits",
  "recurringRules", "wellnessLogs", "badges",
];
const BASIC_KEYS = ["categories", "transactions", "accounts", "trades"];

function isValidShape(x) {
  return (
    !!x && typeof x === "object" &&
    Number.isInteger(x.version) && x.version >= 1 &&
    !!x.settings && typeof x.settings === "object" && !Array.isArray(x.settings) &&
    BASIC_KEYS.every((k) => Array.isArray(x[k]))
  );
}

function itemTs(item) {
  const v = item.updatedAt ?? item.createdAt ?? item.date;
  return typeof v === "string" ? v : "";
}
function itemKey(item) {
  if (typeof item.id === "string" && item.id) return `id:${item.id}`;
  if (typeof item.date === "string" && item.date) return `date:${item.date}`;
  return `json:${JSON.stringify(item)}`;
}
function mergeLists(local, incoming) {
  const map = new Map();
  for (const it of local || []) map.set(itemKey(it), it);
  let added = 0;
  let updated = 0;
  for (const it of incoming || []) {
    const k = itemKey(it);
    const cur = map.get(k);
    if (!cur) { map.set(k, it); added++; }
    else if (itemTs(it) > itemTs(cur)) { map.set(k, it); updated++; }
  }
  return { out: [...map.values()], added, updated };
}

/** Fonde la copia server con il DB inviato dal client (il client è autorevole
 *  come il server: vince la voce col timestamp più recente). */
function mergeDb(server, client) {
  const out = { ...server };
  let totalAdded = 0;
  let totalUpdated = 0;
  for (const key of LIST_KEYS) {
    const { out: merged, added, updated } = mergeLists(server[key], client[key]);
    out[key] = merged;
    totalAdded += added;
    totalUpdated += updated;
    if (added + updated > 0) {
      console.log(`[sync] ${key}: +${added}, ${updated} aggiornate`);
    }
  }
  // settings: oggetto singolo, vince il più recente
  const sTs = (s) => (s?.updatedAt ?? "");
  if (sTs(client.settings) > sTs(server.settings)) {
    out.settings = { ...server.settings, ...client.settings };
    totalUpdated++;
  }
  // sportProfile: vince il più recente (onboardedAt)
  const pTs = (p) => (p?.onboardedAt ?? "");
  if (client.sportProfile && (!server.sportProfile || pTs(client.sportProfile) > pTs(server.sportProfile))) {
    out.sportProfile = client.sportProfile;
    totalUpdated++;
  }
  out.version = server.version || client.version || 1;
  return { db: out, added: totalAdded, updated: totalUpdated };
}

// ------------------------------------------------------------
// Persistenza (scrittura atomica: tmp + rename)
// ------------------------------------------------------------
let dbCache = null;
let mergedAt = null;

function loadDb() {
  if (dbCache) return dbCache;
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
      if (isValidShape(raw)) {
        dbCache = raw;
        const st = fs.statSync(DB_FILE);
        mergedAt = st.mtime.toISOString();
        console.log(`[sync] copia DB caricata (v${raw.version}, ${(st.size / 1024).toFixed(1)} KB)`);
        return dbCache;
      }
      console.warn("[sync] sync-db.json presente ma non valido — riparto vuoto");
    }
  } catch (e) {
    console.warn(`[sync] lettura sync-db.json fallita: ${e.message}`);
  }
  dbCache = {};
  return dbCache;
}

function saveDb(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tmp, DB_FILE);
  mergedAt = new Date().toISOString();
}

// ------------------------------------------------------------
// HTTP
// ------------------------------------------------------------
// CORS aperto: l'app può girare su localhost:3000, 127.0.0.1:3000, IP LAN o
// hostname custom (se il fetch è bloccato, i push muoiono IN SILENZIO e il DB
// centrale resta congelato mentre i browser salvano solo in locale — visto in
// produzione: 4 trade in Brave, 1 nel file). La protezione resta il token
// (x-sync-token): senza token nessun /api/db o /api/sync.
const CORS = { "Access-Control-Allow-Origin": "*" };

function json(res, code, data, extra = {}) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": CORS["Access-Control-Allow-Origin"],
    "Access-Control-Allow-Headers": "content-type, x-sync-token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
    ...extra,
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("body troppo grande"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function authOk(req, url) {
  const h = req.headers["x-sync-token"];
  const q = url.searchParams.get("token");
  return h === TOKEN || q === TOKEN;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": CORS["Access-Control-Allow-Origin"],
      "Access-Control-Allow-Headers": "content-type, x-sync-token",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    });
    res.end();
    return;
  }

  try {
    // /api/ping — health (+ info utili al client)
    if (req.method === "GET" && url.pathname === "/api/ping") {
      json(res, 200, {
        ok: true,
        service: "ascend-sync",
        dbVersion: loadDb().version ?? 0,
        mergedAt,
        requireToken: true,
      });
      return;
    }

    // Autenticazione per /api/db e /api/sync
    if (!authOk(req, url)) {
      json(res, 401, { ok: false, error: "token non valido" });
      return;
    }

    // /api/db — scarica la copia del server
    if (req.method === "GET" && url.pathname === "/api/db") {
      json(res, 200, { ok: true, db: loadDb(), mergedAt });
      return;
    }

    // /api/sync — push + merge + risposta col DB unificato
    if (req.method === "POST" && url.pathname === "/api/sync") {
      const body = await readBody(req);
      const parsed = JSON.parse(body);
      if (!parsed || !isValidShape(parsed.db)) {
        json(res, 400, { ok: false, error: "DB non valido nel body" });
        return;
      }
      // ?replace=1 — sostituzione TOTALE (reset dal client): niente merge,
      // il client è autoritativo (usato da purgeAscendStorage).
      if (url.searchParams.get("replace") === "1") {
        saveDb(parsed.db);
        dbCache = parsed.db;
        console.log("[sync] REPLACE totale richiesto dal client");
        json(res, 200, { ok: true, db: parsed.db, replaced: true });
        return;
      }
      const merged = mergeDb(loadDb(), parsed.db);
      saveDb(merged.db);
      dbCache = merged.db;
      json(res, 200, {
        ok: true,
        db: merged.db,
        mergedAt,
        stats: { added: merged.added, updated: merged.updated },
      });
      return;
    }

    json(res, 404, { ok: false, error: "rotta non trovata" });
  } catch (e) {
    json(res, 500, { ok: false, error: e?.message ?? "errore interno" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[sync] server su http://0.0.0.0:${PORT} (DB: ${DB_FILE})`);
  console.log(`[sync] token richiesto: ${TOKEN === "ascend-sync" ? "'ascend-sync' (default!)" : "impostato via env"}`);
  console.log("[sync] dall'altro PC usa: http://<IP-di-QUESTO-PC>:" + PORT);
});

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));