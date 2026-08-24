#!/usr/bin/env node
// ============================================================
// ASCEND — genera TUTTI gli asset dal logo dell'app
// (public/icons/app-icon.png, il file scelto dall'utente):
//  - pkgbuild/ascend.ico    → icona dell'exe (launcher, 256/48/32/16)
//  - public/favicon.ico     → favicon browser (64/48/32/16)
//  - public/icons/app-icon-512.png / app-icon-192.png → PWA manifest
// Uso: node scripts/make-assets.mjs
// ============================================================
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "public", "icons", "app-icon.png");

function makeIco(pngs, outPath) {
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  const entries = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  pngs.forEach((p, i) => {
    const e = 16 * i;
    entries[e] = p.size >= 256 ? 0 : p.size;
    entries[e + 1] = p.size >= 256 ? 0 : p.size;
    entries[e + 2] = 0;
    entries[e + 3] = 0;
    entries.writeUInt16LE(1, e + 4);
    entries.writeUInt16LE(32, e + 6);
    entries.writeUInt32LE(p.data.length, e + 8);
    entries.writeUInt32LE(offset, e + 12);
    offset += p.data.length;
  });
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, Buffer.concat([header, entries, ...pngs.map((p) => p.data)]));
}

const pngAt = async (size) => ({
  size,
  data: await sharp(SRC).resize(size, size).png().toBuffer(),
});

// ——— exe (launcher) ———
makeIco(
  [await pngAt(256), await pngAt(48), await pngAt(32), await pngAt(16)],
  path.join(ROOT, "pkgbuild", "ascend.ico")
);
console.log("OK ascend.ico (256/48/32/16)");

// ——— favicon (16-64 più usata dal browser) ———
makeIco(
  [await pngAt(64), await pngAt(48), await pngAt(32), await pngAt(16)],
  path.join(ROOT, "public", "favicon.ico")
);
console.log("OK public/favicon.ico");

// ——— PWA manifest ———
const pwa512 = await sharp(SRC).resize(512, 512, { fit: "cover" }).png().toBuffer();
const pwa192 = await sharp(SRC).resize(192, 192, { fit: "cover" }).png().toBuffer();
writeFileSync(path.join(ROOT, "public", "icons", "app-icon-512.png"), pwa512);
writeFileSync(path.join(ROOT, "public", "icons", "app-icon-192.png"), pwa192);
console.log("OK app-icon-512/192.png (PWA)");