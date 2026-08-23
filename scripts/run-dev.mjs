#!/usr/bin/env node
// ============================================================
// ASCEND — avvio accoppiato: app + window-tracker + Ollama
// vivono e muoiono insieme.
//   node scripts/run-dev.mjs  → tracker-server + ollama serve + next dev
// Ctrl+C (o chiusura app)     → tutto fermato insieme.
// Servizi già attivi sulle loro porte vengono riusati, non duplicati.
// ============================================================
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import net from "node:net";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TRACKER_PORT = Number(process.env.ASCEND_TRACKER_PORT ?? 4877);
const OLLAMA_PORT = 11434;
const OLLAMA_EXE = path.join(
  os.homedir(), "AppData", "Local", "Programs", "Ollama", "ollama.exe"
);

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

// --- Ollama (per il Coach AI): riusa se già attivo, altrimenti serve ---
const isOllamaUp = await portInUse(OLLAMA_PORT);
let ollama = null;

if (isOllamaUp) {
  console.log(`[run-dev] ollama già attivo su :${OLLAMA_PORT} — riuso`);
} else {
  const { existsSync } = await import("node:fs");
  if (!existsSync(OLLAMA_EXE)) {
    console.log("[run-dev] Ollama non installato — Coach AI non disponibile (l'app funziona comunque)");
  } else {
    console.log("[run-dev] avvio ollama serve...");
    ollama = spawn(OLLAMA_EXE, ["serve"], {
      stdio: "ignore",
      windowsHide: true,
    });
    ollama.on("exit", () => {
      console.log("[run-dev] ollama terminato");
    });
    // piccola attesa: il server impiega ~1-2s a bindare la porta
    for (let i = 0; i < 10 && !(await portInUse(OLLAMA_PORT)); i++) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
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
  // Ollama solo se l'abbiamo avviato noi (se era già attivo, lo lasciamo vivo)
  if (ollama) {
    try { ollama.kill("SIGTERM"); } catch { /* noop */ }
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