#!/usr/bin/env node
// ============================================================
// ASCEND — avvio accoppiato: l'app e il window-tracker
// vivono e muoiono insieme.
//   node scripts/run-dev.mjs  → tracker-server + next dev
// Ctrl+C (o chiusura app)     → tracker fermato insieme.
// Se il tracker è già attivo sulla porta, lo riusa.
// ============================================================
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import net from "node:net";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TRACKER_PORT = Number(process.env.ASCEND_TRACKER_PORT ?? 4877);

function portInUse(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: "127.0.0.1", port, timeout: 1200 });
    sock.on("connect", () => { sock.destroy(); resolve(true); });
    sock.on("error", () => resolve(false));
  });
}

const isTrackerUp = await portInUse(TRACKER_PORT);
let tracker = null;

if (isTrackerUp) {
  console.log(`[run-dev] tracker già attivo su :${TRACKER_PORT} — riuso`);
} else {
  console.log("[run-dev] avvio tracker locale...");
  tracker = spawn(process.execPath, [path.join(ROOT, "scripts", "tracker-server.mjs")], {
    cwd: ROOT,
    stdio: "inherit",
    windowsHide: true,
  });
  tracker.on("exit", (code) => {
    console.log(`[run-dev] tracker terminato (exit ${code})`);
  });
}

console.log("[run-dev] avvio next dev...");
const next = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["next", "dev"],
  { cwd: ROOT, stdio: "inherit", windowsHide: true, shell: process.platform === "win32" }
);

function shutdown(why) {
  console.log(`\n[run-dev] chiusura (${why}) — fermo tutto`);
  try { next.kill("SIGTERM"); } catch { /* noop */ }
  if (tracker) {
    try { tracker.kill("SIGTERM"); } catch { /* noop */ }
  }
  // esci dopo un attimo per lasciare il tempo ai figli di morire
  setTimeout(() => process.exit(0), 800);
}

next.on("exit", (code, sig) => {
  if (sig !== "SIGTERM") shutdown(`next dev uscito (${code})`);
  else setTimeout(() => process.exit(0), 400);
});

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Watchdog anti-orfano: se il processo padre (npm/terminale) muore,
// spegni anche next + tracker — niente processi zombie in background.
// Controlla parent E nonno (in un terminale: terminale→npm→node).
import { execFileSync } from "node:child_process";
function grandparentPid(pid) {
  try {
    const out = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-Command", `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').ParentProcessId`],
      { windowsHide: true, timeout: 5000, encoding: "utf8" }
    );
    return Number(out.trim()) || 0;
  } catch {
    return 0;
  }
}
const PARENT_PID = process.ppid;
const GRAND_PID = process.platform === "win32" ? grandparentPid(PARENT_PID) : 0;
function alive(pid) {
  if (!pid || pid <= 0) return true; // sconosciuto = lascia vivere
  try { process.kill(pid, 0); return true; } catch { return false; }
}
setInterval(() => {
  if (!alive(PARENT_PID) || (GRAND_PID && !alive(GRAND_PID))) {
    shutdown("processo padre/nonno morto (watchdog)");
  }
}, 4000).unref?.();