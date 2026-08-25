#!/usr/bin/env node
// ============================================================
// ASCEND Window Tracker — mini-server di sistema
// - Campiona la finestra attiva ogni INTERVAL_SEC (default 30s)
// - Espone micro-API HTTP su 127.0.0.1:4877 per Ascend
// - Scrive JSONL giornaliero in %LOCALAPPDATA%\Ascend\pc-usage\
// - Node stdlib ONLY (zero dipendenze) — impatto ~0
//
// Avvio:  node tracker-server.mjs
// Env:    ASCEND_TRACKER_PORT   (default 4877)
//         ASCEND_INTERVAL_SEC   (default 30)
//         ASCEND_DATA_DIR       (override data dir, default %LOCALAPPDATA%\Ascend\pc-usage)
//         ASCEND_RETENTION_DAYS (default 90 — prune JSONL più vecchi di N giorni)
//
// Integrità dati:
// - Scritture APPEND serializzate con coda single-writer + fs.appendFile
//   (nessun read-modify-write: niente O(n²) né race sul file .tmp)
// - Lock single-instance (.lock nel data dir, pid + staleness check):
//   una sola istanza — server node OPPURE track-window.ps1 — scrive i dati.
// - Prune retention all'avvio e una volta al giorno.
// - Polling tramite UN solo processo PowerShell residente (Add-Type
//   compilato una volta sola, riusato, kill alla chiusura).
// ============================================================
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promises as fs, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const PORT = Number(process.env.ASCEND_TRACKER_PORT ?? 4877);
const INTERVAL = Math.max(5, Number(process.env.ASCEND_INTERVAL_SEC ?? 30));
const HOOK_SCRIPT = fileURLToPath(new URL("./tracker-hook.ps1", import.meta.url));
const startedAt = Date.now();

let lastSample = null;
let checkInterval = null;

// ------------------------------------------------------------------
// DATA DIR: override via env (utile anche per i test), altrimenti
// %LOCALAPPDATA%\Ascend\pc-usage (fallback mac/linux: ~/.local/share)
// ------------------------------------------------------------------
const DATA_DIR_WIN = path.join(os.homedir(), "AppData", "Local", "Ascend", "pc-usage");
const DATA_DIR_FALLBACK = process.platform === "win32"
  ? DATA_DIR_WIN
  : path.join(os.homedir(), ".local", "share", "ascend", "pc-usage");
let DATA_DIR_USED = DATA_DIR_FALLBACK;

function resolveDataDir() {
  const env = process.env.ASCEND_DATA_DIR;
  return (env && env.trim()) ? env : DATA_DIR_USED;
}

function ymd(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayFile() {
  return path.join(resolveDataDir(), `pc-usage-${ymd()}.jsonl`);
}

function retentionDays() {
  const v = Number(process.env.ASCEND_RETENTION_DAYS);
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : 90;
}

// ------------------------------------------------------------------
// PRIVACY TITOLI: i titoli delle finestre possono contenere dati
// sensibili (oggetto mail, chat, ricerca). Di default il JSONL
// salva SOLO le prime 2 parole del titolo (l'app categorizza con
// exe + inizio titolo); ASCEND_TITLES=full ripristina il testo
// completo per chi vuole la cronologia letterale.
// ------------------------------------------------------------------
let titlePrivacyLogged = false;
function scrubTitle(title) {
  if (!title) return title;
  if (process.env.ASCEND_TITLES === "full") return title;
  if (!titlePrivacyLogged) {
    console.log("[tracker] privacy titoli: solo prime 2 parole nel JSONL (ASCEND_TITLES=full per disattivare)");
    titlePrivacyLogged = true;
  }
  return title.split(/\s+/).slice(0, 2).join(" ");
}

// ------------------------------------------------------------------
// LOCK SINGLE-INSTANCE (.lock nel data dir, pid + staleness check)
// ------------------------------------------------------------------
function lockFile() {
  return path.join(resolveDataDir(), ".lock");
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function acquireLock() {
  const lock = lockFile();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await fs.writeFile(lock, String(process.pid), { flag: "wx" }); // crea atomico
      return true;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
    // Lock esistente: è di un processo ancora vivo?
    let old = 0;
    try { old = parseInt((await fs.readFile(lock, "utf8")).trim(), 10); } catch { old = 0; }
    if (!pidAlive(old)) {
      // pid morto (crash) o file corrotto → prendi possesso
      try { await fs.unlink(lock); } catch { /* non rimovibile: riprova */ }
      continue;
    }
    return false; // tenuto da un tracker vivo
  }
  return false;
}

// Rilascio all'uscita del processo (sync: garantito anche su exit()).
process.on("exit", () => {
  try {
    const lock = lockFile();
    if (readFileSync(lock, "utf8").trim() === String(process.pid)) {
      unlinkSync(lock);
    }
  } catch (e) {
    // ENOENT = nessun lock da rimuovere, normale; altri errori: segnala.
    if (e?.code !== "ENOENT") {
      try { console.error(`[tracker] attenzione: lock non rimosso in uscita: ${e?.message ?? e}`); } catch { /* noop */ }
    }
  }
});

// ------------------------------------------------------------------
// SCRITTURA APPEND SERIALIZZATA (single-writer). Nessun read-modify-write:
// ogni campione è UNA riga JSONL appesa in coda. fs.appendFile su Windows
// apre con FILE_APPEND_DATA → l'offset è atomico; la coda promette l'ordine.
// ------------------------------------------------------------------
let writeChain = Promise.resolve();

function enqueueAppend(file, line) {
  writeChain = writeChain
    .then(() => fs.appendFile(file, line, "utf8"))
    .catch((e) => { handleError(e); return false; });
  return writeChain;
}

async function appendSample(obj) {
  const file = todayFile();
  const line = JSON.stringify({ ts: new Date().toISOString(), ...obj, title: scrubTitle(obj.title) }) + "\n";
  await enqueueAppend(file, line);
  return true;
}

// ------------------------------------------------------------------
// RETENTION: prune dei JSONL più vecchi di ASCEND_RETENTION_DAYS
// (default 90). Confronto sulla DATA nel nome file, non su mtime.
// ------------------------------------------------------------------
async function pruneOldData() {
  try {
    const cutoff = ymd(new Date(Date.now() - retentionDays() * 86400000));
    const files = await fs.readdir(resolveDataDir());
    let total = 0, removed = 0;
    for (const f of files) {
      const m = /^pc-usage-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(f);
      if (!m) continue;
      total++;
      if (m[1] < cutoff) {
        try { await fs.unlink(path.join(resolveDataDir(), f)); removed++; } catch { /* noop */ }
      }
    }
    if (removed > 0) {
      console.log(`[tracker] retention: rimossi ${removed}/${total} file più vecchi di ${retentionDays()} giorni`);
    }
  } catch { /* noop */ }
}

// ------------------------------------------------------------------
// RESIDENT POWERSHELL POLLER (solo Windows).
// UN solo processo, Add-Type compilato UNA volta: il loop PS legge un
// comando da stdin per tick e risponde con una riga JSON su stdout.
// Niente più powershell fresco a ogni campione (0.5-1s CPU ogni 30s).
// ------------------------------------------------------------------
const PS_POLL = String.raw`
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class AW {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
}
"@
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line -or $line -eq 'quit') { break }
  $h = [AW]::GetForegroundWindow()
  if ($h -eq [IntPtr]::Zero) { continue }
  if (-not [AW]::IsWindowVisible($h) -or [AW]::IsIconic($h)) { continue }
  $len = [AW]::GetWindowTextLength($h)
  if ($len -eq 0) { continue }
  $sb = New-Object System.Text.StringBuilder($len + 1)
  [void][AW]::GetWindowText($h, $sb, $sb.Capacity)
  $title = $sb.ToString()
  if ([string]::IsNullOrWhiteSpace($title)) { continue }
  $procId = 0
  [void][AW]::GetWindowThreadProcessId($h, [ref]$procId)
  $exe = "unknown.exe"
  try { $p = Get-Process -Id $procId -ErrorAction Stop; $exe = $p.ProcessName + ".exe" } catch {}
  [PSCustomObject]@{ exe=$exe; title=$title; pid=$procId; hwnd=$h.ToInt64() } | ConvertTo-Json -Compress
  [Console]::Out.Flush()
}
`;

let pollChild = null;
let pollResolve = null;
let pollTimer = null;
let pollBuffer = "";

function startPoller() {
  if (process.platform !== "win32" || pollChild) return;
  try {
    pollChild = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", PS_POLL],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }
    );
    pollChild.stdout.on("data", (d) => {
      pollBuffer += d.toString("utf8");
      let idx;
      while ((idx = pollBuffer.indexOf("\n")) >= 0) {
        const line = pollBuffer.slice(0, idx).trim();
        pollBuffer = pollBuffer.slice(idx + 1);
        if (!line || !pollResolve) continue;
        const resolve = pollResolve;
        pollResolve = null;
        clearTimeout(pollTimer);
        try { resolve(JSON.parse(line)); } catch { resolve(null); }
      }
    });
    pollChild.stderr.on("data", () => { /* silenzioso */ });
    const died = () => {
      pollChild = null;
      if (pollResolve) {
        const resolve = pollResolve;
        pollResolve = null;
        clearTimeout(pollTimer);
        resolve(null);
      }
    };
    pollChild.on("exit", died);
    pollChild.on("error", died);
  } catch {
    pollChild = null;
  }
}

function stopPoller() {
  if (!pollChild) return;
  const c = pollChild;
  pollChild = null;
  try { c.stdin.end("quit\n"); } catch { /* noop */ }
  setTimeout(() => { try { c.kill(); } catch { /* noop */ } }, 300).unref?.();
}

function sampleActiveWindow() {
  return new Promise((resolve) => {
    if (process.platform !== "win32") return resolve(null);
    if (!pollChild) startPoller();
    if (!pollChild || pollResolve) return resolve(null); // richiesta già in volo: salta il tick
    pollResolve = resolve;
    try { pollChild.stdin.write("tick\n"); } catch {
      pollResolve = null;
      pollChild = null;
      return resolve(null);
    }
    pollTimer = setTimeout(() => {
      if (pollResolve) {
        const r = pollResolve;
        pollResolve = null;
        r(null);
      }
    }, 4000);
    pollTimer.unref?.();
  });
}

// ------------------------------------------------------------------
// Error log
// ------------------------------------------------------------------
function handleError(e) {
  try {
    const log = path.join(resolveDataDir(), "tracker-errors.log");
    fs.appendFile(log, `[${new Date().toISOString()}] ${e?.message ?? e}\n`).catch(() => {});
  } catch { /* noop */ }
}

// ------------------------------------------------------------------
// HTTP server
// ------------------------------------------------------------------
// CORS allowlist: solo l'app Ascend in dev (localhost:3000/3001). MAI '*':
// le API espongono i titoli delle finestre attive — un sito web qualunque
// non deve poterli leggere dal browser.
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
]);
function corsOrigin(req) {
  const o = req.headers.origin;
  return o && ALLOWED_ORIGINS.has(o) ? o : null;
}
function send(res, code, obj, req) {
  const h = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
  const origin = corsOrigin(req);
  if (origin) h["Access-Control-Allow-Origin"] = origin;
  res.writeHead(code, h);
  res.end(JSON.stringify(obj));
}

// ------------------------------------------------------------------
// HOOK event-driven (Windows): cattura OGNI cambio finestra attiva
// via EVENT_SYSTEM_FOREGROUND. Fallback: polling interval.
// Le righe hook confluiscono nella STESSA coda append del polling.
// ------------------------------------------------------------------
let hookChild = null;
let hookAlive = false;
let hookBuffer = "";

function handleHookLine(line) {
  const t = line.trim();
  if (!t) return;
  try {
    const obj = JSON.parse(t);
    if (obj && typeof obj.ts === "string" && typeof obj.exe === "string") {
      // riga di servizio del figlio PS ("hook ready"): mai persistita
      if (obj.exe === "(hook-ready)") return;
      // privacy: il titolo completo vive solo in memoria (API /api/active),
      // nel JSONL persistito va troncato
      const persisted = { ...obj, title: scrubTitle(obj.title) };
      lastSample = obj;
      enqueueAppend(todayFile(), JSON.stringify(persisted) + "\n");
    }
  } catch { /* riga non JSON */ }
}

async function startHook() {
  if (process.platform !== "win32") return false;
  try {
    hookChild = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", HOOK_SCRIPT],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
    );
    hookChild.stdout.on("data", (d) => {
      hookBuffer += d.toString("utf8");
      const lines = hookBuffer.split("\n");
      hookBuffer = lines.pop() ?? "";
      lines.forEach((l) => handleHookLine(l));
    });
    hookChild.stderr.on("data", (d) => {
      const s = d.toString("utf8");
      if (s.includes("HOOK_FAILED")) hookAlive = false;
    });
    hookChild.on("exit", () => {
      hookAlive = false;
      hookChild = null;
      // fallback al polling
      if (!checkInterval) {
        console.log("[tracker] hook terminato — fallback polling");
        tick();
        checkInterval = setInterval(tick, INTERVAL * 1000);
        checkInterval.unref?.();
      }
    });
    hookChild.on("error", () => {
      hookAlive = false;
      hookChild = null;
    });
    hookAlive = true;
    return true;
  } catch {
    return false;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const p = url.pathname;

  try {
    if (req.method === "OPTIONS") {
      const origin = corsOrigin(req);
      res.writeHead(
        204,
        origin
          ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET,OPTIONS", "Access-Control-Allow-Headers": "*" }
          : {}
      );
      return res.end();
    }

    if (p === "/api/health") {
      return send(res, 200, {
        ok: true,
        tracking: true,
        interval: INTERVAL,
        uptimeSec: Math.round((Date.now() - startedAt) / 1000),
        dataDir: resolveDataDir(),
        port: PORT,
        retentionDays: retentionDays(),
        lastSample,
        lastAt: lastSample?.ts ?? null,
        platform: process.platform,
        mode: hookAlive ? "hybrid" : "polling",
      }, req);
    }

    if (p === "/api/active") {
      return send(res, 200, {
        ok: true,
        tracking: true,
        last: lastSample,
        lastAt: lastSample?.ts ?? null,
        interval: INTERVAL,
      }, req);
    }

    if (p === "/api/today") {
      const d = ymd();
      const samples = await readDateLines(d);
      return send(res, 200, { ok: true, date: d, count: samples.length, samples }, req);
    }

    if (p === "/api/since") {
      const ts = url.searchParams.get("ts") || "";
      const d = ymd();
      const samples = await readDateLines(d);
      const from = ts ? new Date(ts).getTime() : 0;
      const filtered = ts ? samples.filter((s) => new Date(s.ts).getTime() > from) : samples;
      return send(res, 200, { ok: true, date: d, count: filtered.length, samples: filtered }, req);
    }

    if (p === "/api/today/csv") {
      // CSV compatibile con pagina Ascend: date,category,minutes,source
      // (aggregazione corsa — la categorization avviene lato Ascend)
      const d = ymd();
      const samples = await readDateLines(d);
      const origin = corsOrigin(req);
      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
        "Cache-Control": "no-store",
      });
      res.end(`date,category,minutes,source\n` + samples.map(() => `${d},auto,0.5,auto`).join("\n"));
      return;
    }

    if (p === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(
        `<h1>Ascend Window Tracker</h1><p>Tracking attivo</p><ul>` +
        `<li><a href="/api/health">/api/health</a></li>` +
        `<li><a href="/api/active">/api/active</a></li>` +
        `<li><a href="/api/today">/api/today</a></li>` +
        `<li><a href="/api/since?ts=2026-01-01T00:00:00Z">/api/since?ts=...</a></li>` +
        `</ul><p>Data dir: ${resolveDataDir()}</p>`
      );
    }

    return send(res, 404, { ok: false, error: "not found" }, req);
  } catch (e) {
    handleError(e);
    return send(res, 500, { ok: false, error: String(e?.message ?? e) }, req);
  }
});

// Handler errori di listen: EADDRINUSE → messaggio chiaro, exit pulita.
server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`[tracker] ERRORE: porta ${PORT} già in uso — un altro tracker gira già su http://127.0.0.1:${PORT}?`);
    console.error("[tracker] Usa l'API già attiva, oppure ferma l'altro processo, oppure cambia porta con ASCEND_TRACKER_PORT.");
  } else {
    console.error(`[tracker] Errore server: ${e.code ?? e.message}`);
  }
  process.exit(1);
});

async function readDateLines(date) {
  const file = path.join(resolveDataDir(), `pc-usage-${date}.jsonl`);
  try {
    const txt = await fs.readFile(file, "utf8");
    return txt.split("\n").filter((l) => l.trim()).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

// ------------------------------------------------------------------
// Loop sampling (polling ibrido, sempre attivo).
// Dedup: se l'hook ha appena catturato la stessa finestra (<70% del
// tick), il poller salta l'append — niente doppi conteggi sul cambio
// finestra; con finestra stabile invece appende ogni tick (0.5 min).
// ------------------------------------------------------------------
const POLL_DEDUP_MS = Math.round(INTERVAL * 1000 * 0.7);
async function tick() {
  const sample = await sampleActiveWindow();
  if (sample) {
    const dup =
      lastSample &&
      lastSample.exe === sample.exe &&
      lastSample.title === sample.title &&
      Date.now() - Date.parse(lastSample.ts) < POLL_DEDUP_MS;
    lastSample = { ts: new Date().toISOString(), ...sample };
    if (dup) return; // appena contato dall'hook: salta
    await appendSample(lastSample);
  }
}

// ------------------------------------------------------------------
// Avvio: lock single-instance → prune → listen
// ------------------------------------------------------------------
async function startServer() {
  try {
    await fs.mkdir(resolveDataDir(), { recursive: true });
    const locked = await acquireLock();
    if (!locked) {
      console.error("[tracker] Un'altra istanza del tracker è già attiva (lock .lock nel data dir).");
      console.error(`[tracker] Lock: ${lockFile()} — esco senza toccare i dati.`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`[tracker] Errore inizializzazione (data dir/lock): ${e?.message ?? e}`);
    process.exit(1);
  }
  DATA_DIR_USED = resolveDataDir();

  await pruneOldData();
  setInterval(pruneOldData, 24 * 60 * 60 * 1000).unref?.();

  server.listen(PORT, "127.0.0.1", async () => {
    console.log(`Ascend Window Tracker · http://127.0.0.1:${PORT}`);
    console.log(`Data dir: ${DATA_DIR_USED} · interval ${INTERVAL}s · retention ${retentionDays()}g · platform ${process.platform}`);
    // MODALITÀ IBRIDA (sempre attiva): il polling 30s garantisce un campione
    // anche quando la finestra attiva NON cambia (gioco, lettura, chat) —
    // l'hook event-driven aggiunge i cambi istantanei. L'hook da solo
    // sottoconta di ore l'uso reale (0 eventi = 0 dati).
    const hooked = await startHook();
    if (hooked) {
      console.log("[tracker] hook WinEvent attivo (event-driven, CPU ~0)");
    } else {
      console.log("[tracker] hook non disponibile — solo polling");
    }
    // Polling SEMPRE attivo (hybrid): anche con hook vivo.
    tick();
    checkInterval = setInterval(tick, INTERVAL * 1000);
    checkInterval.unref?.();
  });
}

function shutdown(reason) {
  console.log(reason);
  stopPoller();
  if (hookChild) {
    try { hookChild.kill(); } catch { /* noop */ }
    hookChild = null;
  }
  process.exit(0);
}

process.on("SIGINT", () => shutdown("\nTracker fermato (SIGINT)"));
process.on("SIGTERM", () => shutdown("Tracker fermato (SIGTERM)"));

// ------------------------------------------------------------------
// SELFTEST: verifica funzioni reali su data dir temporanea.
//   node scripts/tracker-server.mjs --selftest
// ------------------------------------------------------------------
async function runSelfTest() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ascend-tracker-selftest-"));
  process.env.ASCEND_DATA_DIR = tmp;
  const results = [];
  const check = (name, ok, extra = "") => {
    results.push(ok);
    console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  };
  try {
    console.log("[selftest] data dir temporanea:", tmp);

    // --- lock ---
    check("acquireLock: prima istanza acquisisce", (await acquireLock()) === true);
    // il pid di questo processo è vivo → seconda acquisizione deve fallire
    check("acquireLock: seconda istanza rifiutata (pid vivo)", (await acquireLock()) === false);
    await fs.unlink(lockFile()).catch(() => {});
    // lock stale (pid inesistente) → takeover
    await fs.writeFile(lockFile(), "999999999", { flag: "wx" });
    check("acquireLock: lock stale rilevato e preso", (await acquireLock()) === true);
    await fs.unlink(lockFile()).catch(() => {});

    // --- append serializzato via handleHookLine (campioni finti) ---
    for (let i = 0; i < 50; i++) {
      handleHookLine(JSON.stringify({ ts: new Date().toISOString(), exe: `fake${i}.exe`, title: `Test ${i}` }));
    }
    handleHookLine("riga non-json {{{");
    handleHookLine(""); // vuota
    await appendSample({ exe: "poll.exe", title: "PollSample", pid: 1, hwnd: 0 });
    await writeChain;

    const txt = await fs.readFile(todayFile(), "utf8");
    const lines = txt.split("\n").filter((l) => l.trim());
    const parsed = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } });
    check("append serializzato: 51 righe JSON valide", lines.length === 51 && parsed.every(Boolean), `${lines.length} righe`);
    check("ordine preservato (ultimo = poll)", parsed[parsed.length - 1]?.exe === "poll.exe");

    // --- retention (2 giorni) ---
    process.env.ASCEND_RETENTION_DAYS = "2";
    const drop3 = `pc-usage-${ymd(new Date(Date.now() - 3 * 86400000))}.jsonl`;
    const keep2 = `pc-usage-${ymd(new Date(Date.now() - 2 * 86400000))}.jsonl`;
    await fs.writeFile(path.join(tmp, drop3), "x\n");
    await fs.writeFile(path.join(tmp, keep2), "x\n");
    await pruneOldData();
    const remaining = await fs.readdir(tmp);
    check(
      "retention: -3g rimosso, -2g e oggi mantenuti",
      !remaining.includes(drop3) && remaining.includes(keep2) && remaining.includes(`pc-usage-${ymd()}.jsonl`),
      remaining.filter((f) => f.startsWith("pc-usage-")).join(", ")
    );

    // --- resident poller (solo Windows): campione REALE via PS ---
    if (process.platform === "win32") {
      const s = await sampleActiveWindow();
      stopPoller();
      check("resident poller: campione reale via powershell", !!s && typeof s.exe === "string", s ? JSON.stringify(s) : "null");
    }
  } catch (e) {
    console.log("  EXC", e?.stack ?? e);
    results.push(false);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
  const ok = results.every(Boolean);
  console.log(`[selftest] ${ok ? "TUTTI I TEST OK" : "TEST FALLITI"} (${results.length} check)`);
  return ok;
}

const isSelfTest = process.argv.includes("--selftest");
if (isSelfTest) {
  runSelfTest().then((ok) => process.exit(ok ? 0 : 1));
} else {
  startServer();
}

export {
  appendSample, enqueueAppend, handleHookLine, todayFile, ymd, resolveDataDir,
  acquireLock, lockFile, pruneOldData, sampleActiveWindow, startPoller, stopPoller,
};