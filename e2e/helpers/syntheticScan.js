// Synthetic scanned-log PNG for the digitizer e2e (PT7): a white field
// with a red 3 px line x = 40 + 0.4 y, so the traced values are known by
// construction. Stdlib only (zlib deflate + a CRC32), no image library.

import fs from 'fs';
import zlib from 'zlib';
import { Buffer } from 'buffer';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Encode an RGB buffer (width*height*3) as PNG. */
export function encodePng(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0; // filter none
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export const SCAN = { width: 200, height: 300, x0: 40, slope: 0.4, color: [255, 0, 0] };

/** Expected traced value at image row y under the canned harness calibration
 *  (value 0 at x=0, 150 at x=width-1). */
export function expectedValueAt(y) {
  return ((SCAN.x0 + SCAN.slope * y) * 150) / (SCAN.width - 1);
}

/** Write the synthetic scan to `file` and return its path. */
export function writeSyntheticScan(file) {
  const { width, height, x0, slope, color } = SCAN;
  const rgb = Buffer.alloc(width * height * 3, 255);
  for (let y = 0; y < height; y++) {
    const xc = Math.round(x0 + slope * y);
    for (let dx = -1; dx <= 1; dx++) {
      const x = xc + dx;
      if (x < 0 || x >= width) continue;
      const i = (y * width + x) * 3;
      rgb[i] = color[0]; rgb[i + 1] = color[1]; rgb[i + 2] = color[2];
    }
  }
  fs.writeFileSync(file, encodePng(width, height, rgb));
  return file;
}
