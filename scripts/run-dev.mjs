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
const OLLAMA_PORT = Number(process.env.ASCEND_OLLAMA_PORT ?? 11434);
const OLLAMA_EXE_DEFAULT = path.join(
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
  tracker.on("error", (err) => {
    console.error(`[run-dev] errore avvio tracker: ${err.message}`);
    shutdown("errore spawn tracker");
  });
}

// --- Ollama (per il Coach AI): riusa se già attivo, altrimenti serve ---
// Porta da ASCEND_OLLAMA_PORT (default 11434); eseguibile da
// ASCEND_OLLAMA_EXE → path di default → "ollama" risolto dal PATH.
const isOllamaUp = await portInUse(OLLAMA_PORT);
let ollama = null;

if (isOllamaUp) {
  console.log(`[run-dev] ollama già attivo su :${OLLAMA_PORT} — riuso`);
} else {
  const { existsSync } = await import("node:fs");
  const envExe = process.env.ASCEND_OLLAMA_EXE;
  const ollamaExe = (envExe && existsSync(envExe) && envExe) ||
    (existsSync(OLLAMA_EXE_DEFAULT) && OLLAMA_EXE_DEFAULT) ||
    null;
  if (envExe && ollamaExe !== envExe) {
    console.warn(`[run-dev] ASCEND_OLLAMA_EXE="${envExe}" non esiste — uso "${ollamaExe ?? "ollama (dal PATH)"}"`);
  }
  const cmd = ollamaExe ?? "ollama"; // dal PATH: spawn risolve ollama.exe su Windows
  console.log(`[run-dev] avvio ollama serve (${cmd}) su :${OLLAMA_PORT}...`);
  ollama = spawn(cmd, ["serve"], {
    stdio: "ignore",
    windowsHide: true,
  });
  ollama.on("error", (err) => {
    if (err.code === "ENOENT") {
      console.log("[run-dev] Ollama non trovato (né nei path noti né nel PATH) — Coach AI non disponibile (l'app funziona comunque)");
      console.log("[run-dev] Suggerimento: imposta ASCEND_OLLAMA_EXE=<percorso di ollama.exe> oppure installa Ollama.");
    } else {
      console.error(`[run-dev] errore avvio ollama: ${err.message}`);
    }
    ollama = null; // non killare in shutdown un processo mai partito
  });
  ollama.on("exit", () => {
    console.log("[run-dev] ollama terminato");
  });
  // piccola attesa: il server impiega ~1-2s a bindare la porta
  for (let i = 0; i < 10 && !(await portInUse(OLLAMA_PORT)); i++) {
    await new Promise((r) => setTimeout(r, 500));
  }
}

// Avviso CORS: il Coach gira nel browser (origin http://localhost:3000).
// Ollama di default accetta solo origini localhost; con build/proxy recenti
// serve OLLAMA_ORIGINS esplicita (requisito segnalato anche in ai.ts).
if (!process.env.OLLAMA_ORIGINS) {
  console.warn(
    "[run-dev] ATTENZIONE CORS: OLLAMA_ORIGINS non impostata. Se la chat Coach fallisce " +
    "con errori CORS, riavvia Ollama con: OLLAMA_ORIGINS=http://localhost:3000 ollama serve"
  );
}
if (OLLAMA_PORT !== 11434) {
  console.warn(
    "[run-dev] Nota: il Coach UI (ai.ts) usa la porta fissa 11434; con ASCEND_OLLAMA_PORT diverso la chat UI non lo raggiunge."
  );
}

console.log("[run-dev] avvio next dev...");
const next = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["next", "dev"],
  { cwd: ROOT, stdio: "inherit", windowsHide: true, shell: process.platform === "win32" }
);
next.on("error", (err) => {
  console.error(`[run-dev] errore avvio next dev: ${err.message}`);
  console.error("[run-dev] npx non trovato? Verifica l'installazione di Node/npm (npx.cmd deve essere nel PATH).");
  shutdown("errore spawn next dev");
});

// Su Windows SIGTERM colpisce solo il wrapper (cmd/npx.cmd) senza i figli:
// si usa taskkill /T (albero) /F (forzato) sul pid reale del wrapper.
function killTree(child) {
  if (!child || child.pid == null) return;
  if (process.platform === "win32") {
    try {
      const tk = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      tk.on("error", () => {
        // taskkill non disponibile: ultima spiaggia
        try { child.kill("SIGTERM"); } catch { /* noop */ }
      });
      tk.on("exit", (code) => {
        // taskkill fallito (es. accesso negato / pid già morto ≠ 0): SIGTERM diretto
        if (code !== 0) {
          try { child.kill("SIGTERM"); } catch { /* noop */ }
        }
      });
    } catch {
      try { child.kill("SIGTERM"); } catch { /* noop */ }
    }
  } else {
    try { child.kill("SIGTERM"); } catch { /* noop */ }
  }
}

let shuttingDown = false;
function shutdown(why) {
  if (shuttingDown) return; // idempotente: taskkill /F fa scattare 'exit' dei figli
  shuttingDown = true;
  console.log(`\n[run-dev] chiusura (${why}) — fermo tutto`);
  killTree(next);
  if (tracker) killTree(tracker);
  // Ollama solo se l'abbiamo avviato noi (se era già attivo, lo lasciamo vivo)
  if (ollama) killTree(ollama);
  // esci dopo un attimo per lasciare il tempo a taskkill di completare
  setTimeout(() => process.exit(0), 1500);
}

next.on("exit", (code, sig) => {
  if (shuttingDown) return; // la chiusura è già in corso (es. taskkill)
  if (sig === "SIGTERM") setTimeout(() => process.exit(0), 400);
  else shutdown(`next dev uscito (${code})`);
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