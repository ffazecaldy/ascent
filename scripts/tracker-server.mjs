#!/usr/bin/env node
// ============================================================
// ASCEND Window Tracker — mini-server di sistema
// - Campiona la finestra attiva ogni INTERVAL_SEC (default 30s)
// - Espone micro-API HTTP su 127.0.0.1:4877 per Ascend
// - Scrive JSONL giornaliero in %APPDATA%\Ascend\pc-usage\
// - Node stdlib ONLY (zero dipendenze) — impatto ~0
//
// Avvio:  node tracker-server.mjs
// Env:    ASCEND_TRACKER_PORT (default 4877)
//         ASCEND_INTERVAL_SEC (default 30)
// ============================================================
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promises as fs, createWriteStream } from "node:fs";
import path from "node:path";
import os from "node:os";

const PORT = Number(process.env.ASCEND_TRACKER_PORT ?? 4877);
const INTERVAL = Math.max(5, Number(process.env.ASCEND_INTERVAL_SEC ?? 30));
const DATA_DIR = path.join(os.homedir(), "AppData", "Local", "Ascend", "pc-usage");
// fallback per mac/linux
const DATA_DIR_FALLBACK = process.platform === "win32"
  ? DATA_DIR
  : path.join(os.homedir(), ".local", "share", "ascend", "pc-usage");
const startedAt = Date.now();

let lastSample = null;
let checkInterval = null;

// ------------------------------------------------------------------
// POWERSHELL SNIPPET per lettura finestra attiva (solo Windows).
// Cattura finestra foreground + titolo + processo. ~150ms a chiamata,
// una volta ogni 30s → overhead trascurabile.
// ------------------------------------------------------------------
const PS_SNIPPET = String.raw`
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
$h = [AW]::GetForegroundWindow()
if ($h -eq [IntPtr]::Zero) { exit 0 }
if (-not [AW]::IsWindowVisible($h) -or [AW]::IsIconic($h)) { exit 0 }
$len = [AW]::GetWindowTextLength($h)
if ($len -eq 0) { exit 0 }
$sb = New-Object System.Text.StringBuilder($len + 1)
[void][AW]::GetWindowText($h, $sb, $sb.Capacity)
$title = $sb.ToString()
if ([string]::IsNullOrWhiteSpace($title)) { exit 0 }
$procId = 0
[void][AW]::GetWindowThreadProcessId($h, [ref]$procId)
$exe = "unknown.exe"
try { $p = Get-Process -Id $procId -ErrorAction Stop; $exe = $p.ProcessName + ".exe" } catch {}
[PSCustomObject]@{ exe=$exe; title=$title; pid=$procId; hwnd=$h.ToInt64() } | ConvertTo-Json -Compress
`;

function sampleActiveWindow() {
  return new Promise((resolve) => {
    if (process.platform !== "win32") return resolve(null);
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", PS_SNIPPET],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
    );
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", () => {});
    child.on("error", () => resolve(null));
    const done = (code) => {
      if (code !== 0) return resolve(null);
      try {
        const obj = JSON.parse(out.trim().split("\n").filter((l) => l.trim()).pop() || "");
        resolve(obj && typeof obj.exe === "string" ? obj : null);
      } catch {
        resolve(null);
      }
    };
    child.on("close", (code) => {
      done(code);
    });
    // safety: kill after 4s
    setTimeout(() => {
      try { child.kill(); } catch { /* noop */ }
      resolve(null);
    }, 4000).unref();
  });
}

// ------------------------------------------------------------------
// Scrittura JSONL atomica (tmp + rename)
// ------------------------------------------------------------------
async function ensureDir() {
  await fs.mkdir(DATA_DIR_FALLBACK, { recursive: true });
  return DATA_DIR_FALLBACK;
}
let DATA_DIR_USED = DATA_DIR_FALLBACK;

function todayFile() {
  const d = new Date();
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return path.join(DATA_DIR_USED, `pc-usage-${ymd}.jsonl`);
}

async function appendSample(obj) {
  const file = todayFile();
  const line = JSON.stringify({ ts: new Date().toISOString(), ...obj }) + "\n";
  const tmp = file + ".tmp";
  try {
    // append: leggi esistente se c'è, altrimenti crea
    let existing = "";
    try { existing = await fs.readFile(file, "utf8"); } catch { /* nuovo file */ }
    await fs.writeFile(tmp, existing + line, "utf8");
    await fs.rename(tmp, file);
    return true;
  } catch (e) {
    handleError(e);
    return false;
  }
}

async function readDateLines(date) {
  const file = path.join(DATA_DIR_USED, `pc-usage-${date}.jsonl`);
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
// Loop sampling
// ------------------------------------------------------------------
async function tick() {
  const sample = await sampleActiveWindow();
  if (sample) {
    lastSample = { ts: new Date().toISOString(), ...sample };
    await appendSample(lastSample);
  }
}

// ------------------------------------------------------------------
// Error log
// ------------------------------------------------------------------
function handleError(e) {
  try {
    const log = path.join(DATA_DIR_USED, "tracker-errors.log");
    fs.appendFile(log, `[${new Date().toISOString()}] ${e?.message ?? e}\n`).catch(() => {});
  } catch { /* noop */ }
}

// ------------------------------------------------------------------
// HTTP server
// ------------------------------------------------------------------
function send(res, code, obj) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(obj));
}

// ------------------------------------------------------------------
// HOOK event-driven (Windows): cattura OGNI cambio finestra attiva
// via EVENT_SYSTEM_FOREGROUND. Fallback: polling interval.
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
      lastSample = obj;
      const file = todayFile();
      const tmp = file + ".tmp";
      fs.readFile(file, "utf8").then((existing) => {
        fs.writeFile(tmp, existing + JSON.stringify(obj) + "\n", "utf8")
          .then(() => fs.rename(tmp, file))
          .catch(() => {});
      }).catch(() => {
        fs.writeFile(tmp, JSON.stringify(obj) + "\n", "utf8")
          .then(() => fs.rename(tmp, file))
          .catch(() => {});
      });
    }
  } catch { /* riga non JSON */ }
}

async function startHook() {
  if (process.platform !== "win32") return false;
  const hookScript = fileURLToPath(new URL("./tracker-hook.ps1", import.meta.url));
  try {
    hookChild = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", hookScript],
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
    setTimeout(() => {
      if (!hookAlive) return;
    }, 2000);
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
      res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,OPTIONS", "Access-Control-Allow-Headers": "*" });
      return res.end();
    }

    if (p === "/api/health") {
      return send(res, 200, {
        ok: true,
        tracking: true,
        interval: INTERVAL,
        uptimeSec: Math.round((Date.now() - startedAt) / 1000),
        dataDir: DATA_DIR_USED,
        port: PORT,
        lastSample,
        lastAt: lastSample?.ts ?? null,
        platform: process.platform,
        mode: hookAlive ? "hook-event" : "polling",
      });
    }

    if (p === "/api/active") {
      return send(res, 200, {
        ok: true,
        tracking: true,
        last: lastSample,
        lastAt: lastSample?.ts ?? null,
        interval: INTERVAL,
      });
    }

    if (p === "/api/today") {
      const d = new Date();
      const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const samples = await readDateLines(ymd);
      return send(res, 200, { ok: true, date: ymd, count: samples.length, samples });
    }

    if (p === "/api/since") {
      const ts = url.searchParams.get("ts") || "";
      const d = new Date();
      const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const samples = await readDateLines(ymd);
      const from = ts ? new Date(ts).getTime() : 0;
      const filtered = ts ? samples.filter((s) => new Date(s.ts).getTime() > from) : samples;
      return send(res, 200, { ok: true, date: ymd, count: filtered.length, samples: filtered });
    }

    if (p === "/api/today/csv") {
      // CSV compatibile con pagina Ascend: date,category,minutes,source
      // (aggregazione corsa — la categorization avviene lato Ascend)
      const d = new Date();
      const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const samples = await readDateLines(ymd);
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
      res.end(`date,category,minutes,source\n` + samples.map(() => `${ymd},auto,0.5,auto`).join("\n"));
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
        `</ul><p>Data dir: ${DATA_DIR_USED}</p>`
      );
    }

    return send(res, 404, { ok: false, error: "not found" });
  } catch (e) {
    handleError(e);
    return send(res, 500, { ok: false, error: String(e?.message ?? e) });
  }
});

server.listen(PORT, "127.0.0.1", async () => {
  await fs.mkdir(DATA_DIR_FALLBACK, { recursive: true });
  DATA_DIR_USED = DATA_DIR_FALLBACK;
  console.log(`Ascend Window Tracker · http://127.0.0.1:${PORT}`);
  console.log(`Data dir: ${DATA_DIR_USED} · interval ${INTERVAL}s · platform ${process.platform}`);
  // Prova hook event-driven; se non parte, polling
  const hooked = await startHook();
  if (!hooked) {
    console.log("[tracker] hook non disponibile — polling attivo");
    tick();
    checkInterval = setInterval(tick, INTERVAL * 1000);
    checkInterval.unref?.();
  } else {
    console.log("[tracker] hook WinEvent attivo (event-driven, CPU ~0)");
  }
});

process.on("SIGINT", () => { console.log("\nTracker fermato (SIGINT)"); process.exit(0); });
process.on("SIGTERM", () => { console.log("Tracker fermato (SIGTERM)"); process.exit(0); });
