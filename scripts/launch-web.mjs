#!/usr/bin/env node
// ============================================================
// ASCEND — launcher web (modalità produzione)
//   node scripts/launch-web.mjs        → sync + tracker + next start + Edge app-mode
//   node scripts/launch-web.mjs stop   → ferma tutto (app inclusa, se avviata da noi)
// Avvio automatico al boot: Startup/Ascend.vbs (finestra nascosta).
// NIENTE exe/pkg, NIENTE profilo Edge dedicato: i dati vivono nel profilo
// Edge normale + mirror su file (%LOCALAPPDATA%\Ascend\sync-db.json a ogni save).
// Servizi già attivi sulle loro porte vengono riusati, non duplicati.
// ============================================================
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_PORT = Number(process.env.ASCEND_APP_PORT ?? 3000);
const TRACKER_PORT = Number(process.env.ASCEND_TRACKER_PORT ?? 4877);
const SYNC_PORT = Number(process.env.ASCEND_SYNC_PORT ?? 4878);
const APP_URL = `http://localhost:${APP_PORT}`;
const RUNTIME_DIR = path.join(os.homedir(), "AppData", "Local", "Ascend", "runtime");
const PID_FILE = path.join(RUNTIME_DIR, "web-launcher.pid");
const LOG_FILE = path.join(RUNTIME_DIR, "web-launcher.log");

// ---------- log su file (a boot non c'è console) ----------
fs.mkdirSync(RUNTIME_DIR, { recursive: true });
const logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  logStream.write(line + "\n");
}
log(`=== launch-web.mjs avviato (argv: ${process.argv.slice(2).join(" ") || "-"}) ===`);

function portInUse(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: "127.0.0.1", port, timeout: 1200 });
    sock.on("connect", () => { sock.destroy(); resolve(true); });
    sock.on("error", () => resolve(false));
  });
}

function pidsListeningOn(port) {
  try {
    const out = execFileSync("netstat", ["-ano"], { windowsHide: true, encoding: "utf8", timeout: 5000 });
    const pids = new Set();
    for (const line of out.split("\n")) {
      if (!line.includes(`:${port} `) || !/LISTENING/i.test(line)) continue;
      const pid = Number(line.trim().split(/\s+/).pop());
      if (pid > 0) pids.add(pid);
    }
    return [...pids];
  } catch {
    return [];
  }
}

function killTreePid(pid) {
  if (!pid || pid <= 0) return;
  try {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } catch { /* noop */ }
}

// ============================================================
// STOP: chiude tutto ciò che appartiene all'app (3000/4877/4878)
// ============================================================
if (process.argv[2] === "stop") {
  log("--- STOP richiesto ---");
  for (const port of [APP_PORT, TRACKER_PORT, SYNC_PORT]) {
    for (const pid of pidsListeningOn(port)) killTreePid(pid);
  }
  try { fs.unlinkSync(PID_FILE); } catch { /* noop */ }
  // il pid-file può riferire un launcher ancora vivo: chiudilo
  setTimeout(() => process.exit(0), 1500);
}

// ============================================================
// AVVIO
// ============================================================
const started = { next: null, sync: null, tracker: null };

if (await portInUse(SYNC_PORT)) {
  log(`sync già attivo su :${SYNC_PORT} — riuso`);
} else {
  log("avvio sync server (mirror DB su file)...");
  started.sync = spawn(process.execPath, [path.join(ROOT, "scripts", "sync-server.mjs")], {
    cwd: ROOT, stdio: "ignore", windowsHide: true,
  });
}

if (await portInUse(TRACKER_PORT)) {
  log(`tracker già attivo su :${TRACKER_PORT} — riuso`);
} else {
  log("avvio tracker...");
  started.tracker = spawn(process.execPath, [path.join(ROOT, "scripts", "tracker-server.mjs")], {
    cwd: ROOT, stdio: "ignore", windowsHide: true,
  });
}

if (await portInUse(APP_PORT)) {
  log(`app già attiva su :${APP_PORT} — riuso`);
} else {
  log("avvio next start (build produzione)...");
  started.next = spawn(
    process.execPath,
    [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start"],
    { cwd: ROOT, stdio: "ignore", windowsHide: true }
  );
  started.next.on("exit", (code) => log(`next start uscito (exit ${code})`));
}

// attesa app pronta (max 90s) con auto-restart se next muore subito
let restarts = 0;
for (let i = 0; i < 90 && !(await portInUse(APP_PORT)); i++) {
  await new Promise((r) => setTimeout(r, 1000));
  if (started.next && started.next.exitCode !== null && restarts < 2) {
    restarts++;
    log(`next morto al boot — restart ${restarts}/2`);
    started.next = spawn(
      process.execPath,
      [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start"],
      { cwd: ROOT, stdio: "ignore", windowsHide: true }
    );
  }
}
if (!(await portInUse(APP_PORT))) {
  log("FATALE: app non raggiungibile su :3000 dopo 90s — uscita");
  process.exit(1);
}

// ============================================================
// Finestra app: Edge in modalità app (profilo NORMALE, no dedicato)
// ============================================================
const EDGE = [
  path.join(process.env["ProgramFiles(x86)"] ?? "", "Microsoft", "Edge", "Application", "msedge.exe"),
  path.join(process.env["ProgramFiles"] ?? "", "Microsoft", "Edge", "Application", "msedge.exe"),
].find((p) => p && fs.existsSync(p));
if (EDGE) {
  log(`apertura finestra app (${EDGE})`);
  // --disable-background-mode: senza, chiudendo la finestra Edge resta in
  // background (--no-startup-window) e la riapertura dell'app non crea
  // più alcuna finestra. Così Edge esce del tutto alla chiusura e il
  // prossimo lancio apre la finestra come al primo avvio.
  spawn(EDGE, [`--app=${APP_URL}`, "--start-maximized", "--disable-background-mode"], {
    stdio: "ignore", windowsHide: true, detached: true,
  }).unref();
} else {
  log("Edge non trovato — apre nel browser di default");
  spawn("cmd", ["/c", "start", "", APP_URL], { stdio: "ignore", windowsHide: true }).unref();
}

// pid-file: a chi vuole fermarci basta taskkill sul pid qui dentro
fs.writeFileSync(PID_FILE, String(process.pid));

// ============================================================
// Sempre attivo dal boot allo spegnimento PC.
// Se next muore in corsa, riparte (max 3 riavvii all'ora) — l'app
// deve esserci quando l'utente apre la finestra.
// ============================================================
let restartsInHour = 0;
setInterval(() => { restartsInHour = 0; }, 3600_000).unref?.();
setInterval(async () => {
  if (started.next && started.next.exitCode !== null) {
    if (restartsInHour < 3) {
      restartsInHour++;
      log(`next uscito in corsa — riavvio (${restartsInHour}/3 in quest'ora)`);
      started.next = spawn(
        process.execPath,
        [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start"],
        { cwd: ROOT, stdio: "ignore", windowsHide: true }
      );
    } else {
      log("troppi crash — resta spento fino a prossimo boot");
    }
  }
}, 5000).unref?.();

process.on("SIGINT", () => { log("SIGINT — esco (servizi restano attivi)"); process.exit(0); });
process.on("SIGTERM", () => { log("SIGTERM — esco (servizi restano attivi)"); process.exit(0); });
process.on("exit", () => {
  try { fs.unlinkSync(PID_FILE); } catch { /* noop */ }
  log("launcher terminato");
});
log("launcher attivo — l'app resterà su fino allo spegnimento del PC");
