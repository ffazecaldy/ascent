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

function run(cmd, args, cwd) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
}

// 1. Build statica
run("npx", ["next", "build"], ROOT);
if (!existsSync(path.join(ROOT, "out", "index.html"))) {
  console.error("out/index.html manca — build fallita");
  process.exit(1);
}

// 2. Prep pkgbuild (copia daemon + app statica)
mkdirSync(PKGBUILD, { recursive: true });
rmSync(path.join(PKGBUILD, "out"), { recursive: true, force: true });
cpSync(path.join(ROOT, "out"), path.join(PKGBUILD, "out"), { recursive: true });
cpSync(path.join(ROOT, "scripts", "ascend-daemon.cjs"), path.join(PKGBUILD, "ascend-daemon.cjs"));

// 3. pkg → Ascend.exe
mkdirSync(DIST, { recursive: true });
run("npx", ["pkg", ".", "--targets", "node18-win-x64", "--output", path.join(DIST, "Ascend.exe")], PKGBUILD);

console.log("\nOK — Ascend.exe pronto:");
console.log("  " + path.join(DIST, "Ascend.exe"));
console.log("Per l'altro PC: copia il file (es. via OneDrive) e avvialo — stessa app, stesso DB condiviso via Sync.");