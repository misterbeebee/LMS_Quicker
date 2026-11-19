#!/usr/bin/env node
/**
 * Pure-Node (zero native dependency) branded PNG icon generator for Velm.
 * Generates:
 *   - apps/desktop/build/icon.png (512x512)
 *   - apps/extension/icons/icon-16.png, icon-32.png, icon-48.png, icon-128.png
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function renderVelmIconPng(size) {
  // Raw scanlines: each row has 1 filter byte (0) + size * 4 RGBA bytes
  const stride = 1 + size * 4;
  const raw = Buffer.alloc(stride * size);
  const radius = size * 0.22;
  const strokeHalf = size * 0.085;

  // "V" vertices in normalized [0, 1] coordinates
  const ax = 0.27 * size;
  const ay = 0.28 * size;
  const mx = 0.50 * size;
  const my = 0.74 * size;
  const bx = 0.73 * size;
  const by = 0.28 * size;

  for (let y = 0; y < size; y++) {
    const rowOffset = y * stride;
    raw[rowOffset] = 0; // filter type None

    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const idx = rowOffset + 1 + x * 4;

      // Rounded square mask
      const qx = Math.max(0, Math.abs(px - size / 2) - (size / 2 - radius));
      const qy = Math.max(0, Math.abs(py - size / 2) - (size / 2 - radius));
      const cornerDist = Math.hypot(qx, qy) - radius;

      if (cornerDist > 0.5) {
        // Transparent outside rounded square
        raw[idx] = 0;
        raw[idx + 1] = 0;
        raw[idx + 2] = 0;
        raw[idx + 3] = 0;
        continue;
      }

      const bgAlpha = cornerDist > -0.5 ? Math.round((0.5 - cornerDist) * 255) : 255;

      // Indigo gradient (#4f46e5 -> #312e81)
      const grad = (x + y) / (2 * size);
      let r = Math.round(79 * (1 - grad) + 49 * grad);
      let g = Math.round(70 * (1 - grad) + 46 * grad);
      let b = Math.round(229 * (1 - grad) + 129 * grad);

      // Distance to "V" glyph segments
      const d1 = distToSegment(px, py, ax, ay, mx, my);
      const d2 = distToSegment(px, py, mx, my, bx, by);
      const d = Math.min(d1, d2);

      if (d <= strokeHalf + 0.6) {
        const t = d < strokeHalf - 0.6 ? 1 : Math.max(0, Math.min(1, (strokeHalf + 0.6 - d) / 1.2));
        r = Math.round(r * (1 - t) + 255 * t);
        g = Math.round(g * (1 - t) + 255 * t);
        b = Math.round(b * (1 - t) + 255 * t);
      }

      raw[idx] = r;
      raw[idx + 1] = g;
      raw[idx + 2] = b;
      raw[idx + 3] = bgAlpha;
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth 8
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function main() {
  const desktopBuildDir = path.join(repoRoot, 'apps', 'desktop', 'build');
  const extIconsDir = path.join(repoRoot, 'apps', 'extension', 'icons');
  await fs.mkdir(desktopBuildDir, { recursive: true });
  await fs.mkdir(extIconsDir, { recursive: true });

  await fs.writeFile(path.join(desktopBuildDir, 'icon.png'), renderVelmIconPng(512));
  for (const sz of [16, 32, 48, 128]) {
    await fs.writeFile(path.join(extIconsDir, `icon-${sz}.png`), renderVelmIconPng(sz));
  }
  console.log('Generated Velm PNG icons in apps/desktop/build and apps/extension/icons.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
