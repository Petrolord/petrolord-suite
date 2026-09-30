// A scanned contour map for the Contour Map Digitizer e2e (MAP-U1-028,
// MAP-U2-006): 400 x 400 px, white paper, three black concentric contour
// rings (radius 60, 110, 160 px) around the centre, and three red ticks at
// the control point pixels (40, 40), (360, 40), (40, 360). The e2e maps
// pixel (x, y) to world (500000 + 10 x, 6700000 - 10 y). Written with
// node's zlib (no image dependency). Run: node e2e/fixtures/map/digitizer/generate.mjs
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const W = 400; const H = 400;
const px = Buffer.alloc(W * H * 3, 255);
const set = (x, y, r, g, b) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 3; px[i] = r; px[i + 1] = g; px[i + 2] = b; };
for (const R of [60, 110, 160]) {
  for (let a = 0; a < 3600; a++) {
    const t = (a / 3600) * 2 * Math.PI;
    for (let w = -1; w <= 1; w++) set(Math.round(200 + (R + w) * Math.cos(t)), Math.round(200 + (R + w) * Math.sin(t)), 0, 0, 0);
  }
}
for (const [cx, cy] of [[40, 40], [360, 40], [40, 360]]) for (let d = -6; d <= 6; d++) { set(cx + d, cy, 220, 0, 0); set(cx, cy + d, 220, 0, 0); }
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
fs.writeFileSync(path.join(here, 'concentric_contours.png'), png);
