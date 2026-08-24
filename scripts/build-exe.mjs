#!/usr/bin/env node
// ============================================================
// ASCEND — rebuild dell'EXE (Ascend.exe)
// 1. next build (export statico → out/)
// 2. copia daemon + out in pkgbuild/
// 3. pkg → dist/Ascend.exe (runtime node incluso, ~44 MB)
// Uso: node scripts/build-exe.mjs
// Nota: dist/Ascend.exe NON è nel git (gira via OneDrive);
// le modifiche all'app si propagano solo dopo questa build.
// ============================================================
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PKGBUILD = path.join(ROOT, "pkgbuild");
const DIST = path.join(ROOT, "dist");

function q(a) {
  const s = String(a);
  return /[\s"]/.test(s) ? '"' + s.replace(/"/g, '\\"') + '"' : s;
}
function run(cmd, args, cwd) {
  const line = [cmd, ...args].map(q).join(" ");
  console.log("> " + line);
  // cmd.exe /d /s /c con quoting manuale: i path con spazi (OneDrive…) non
  // si spezzano, e i .cmd (npx) girano senza i limiti di shell:true.
  execFileSync("cmd.exe", ["/d", "/s", "/c", line], { cwd, stdio: "inherit", shell: false });
}

// 1. Build statica
  run("npx.cmd", ["next", "build"], ROOT);
if (!existsSync(path.join(ROOT, "out", "index.html"))) {
  console.error("out/index.html manca — build fallita");
  process.exit(1);
}

// 2. Prep pkgbuild (icona+asset PWA, tracker, daemon, app statica)
mkdirSync(PKGBUILD, { recursive: true });
run("node.exe", ["scripts/make-assets.mjs"], ROOT);
rmSync(path.join(PKGBUILD, "out"), { recursive: true, force: true });
cpSync(path.join(ROOT, "out"), path.join(PKGBUILD, "out"), { recursive: true });
cpSync(path.join(ROOT, "scripts", "tracker-server.mjs"), path.join(PKGBUILD, "tracker-server.mjs"));
cpSync(path.join(ROOT, "scripts", "ascend-daemon.cjs"), path.join(PKGBUILD, "ascend-daemon.cjs"));

// 3. pkg → ascend-core.exe (daemon; MAI patchato: le risorse Win32
//    rompono lo snapshot pkg, quindi l'icona vive nel launcher)
mkdirSync(DIST, { recursive: true });
run("npx.cmd", ["pkg", ".", "--targets", "node18-win-x64", "--output", path.relative(PKGBUILD, path.join(DIST, "ascend-core.exe"))], PKGBUILD);

// 4. Launcher C# ("Ascend.exe" visibile, con icona compilata dentro)
const CSC_CANDIDATES = [
  "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe",
  "C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe",
  "csc.exe", // dal PATH
];
const csc = CSC_CANDIDATES.find((c) => existsSync(c) || c === "csc.exe");
run(csc, [
  "/nologo", "/target:winexe", "/optimize+",
  "/win32icon:" + path.relative(PKGBUILD, path.join(PKGBUILD, "ascend.ico")),
  "/out:" + path.relative(PKGBUILD, path.join(DIST, "Ascend.exe")),
  path.relative(PKGBUILD, path.join(PKGBUILD, "Launcher.cs")),
], PKGBUILD);

console.log("\nOK — Ascend.exe pronto (insieme al suo core):");
console.log("  " + path.join(DIST, "Ascend.exe") + "     (launcher, icona Ascend)");
console.log("  " + path.join(DIST, "ascend-core.exe") + " (daemon app+sync)");
console.log("Copia ENTRAMBI nella stessa cartella. Per l'altro PC: stessa coppia di file.");