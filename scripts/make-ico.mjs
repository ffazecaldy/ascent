#!/usr/bin/env node
// ============================================================
// ASCEND — genera l'icona .ico dell'exe dal logo PWA
// (public/icons/icon-512.svg → pkgbuild/ascend.ico, multi-size
// PNG 256/48/32/16 — Explorer scala dalla più grande).
// Uso: node scripts/make-ico.mjs
// ============================================================
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "public", "icons", "icon-512.svg");
const OUT_DIR = path.join(ROOT, "pkgbuild");
const OUT = path.join(OUT_DIR, "ascend.ico");
const SIZES = [256, 48, 32, 16];

const svg = readFileSync(SRC);
const pngs = [];
for (const size of SIZES) {
  const png = await sharp(svg).resize(size, size).png().toBuffer();
  pngs.push({ size, data: png });
}

// ——— ICO container con entry PNG (formato supportato da Windows Vista+) ———
const count = pngs.length;
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(count, 4);

const entries = Buffer.alloc(16 * count);
let offset = 6 + 16 * count;
pngs.forEach((p, i) => {
  const e = 16 * i;
  entries[e] = p.size >= 256 ? 0 : p.size; // width (0 = 256)
  entries[e + 1] = p.size >= 256 ? 0 : p.size; // height
  entries[e + 2] = 0; // palette
  entries[e + 3] = 0; // reserved
  entries.writeUInt16LE(1, e + 4); // planes
  entries.writeUInt16LE(32, e + 6); // bpp
  entries.writeUInt32LE(p.data.length, e + 8); // bytes in res
  entries.writeUInt32LE(offset, e + 12); // image offset
  offset += p.data.length;
});

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, Buffer.concat([header, entries, ...pngs.map((p) => p.data)]));
console.log(`OK — icona ${OUT} (${count} size: ${SIZES.join("/")})`);