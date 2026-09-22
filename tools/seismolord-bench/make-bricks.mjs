#!/usr/bin/env node
// Build the benchmark's v1 brick store: one concatenated file of 64^3
// float32 bricks plus the manifest, transcoded from a SEG-Y with the
// repo's own engine. Feed the pair to mock-storage.mjs.
//
// usage: node --max-old-space-size=3000 make-bricks.mjs \
//          --segy /root/seis-bench/out/survey.sgy \
//          --bricks /root/seis-bench/out/bricks-v1.bin \
//          --manifest /root/seis-bench/out/bench-manifest.json
//
// The synthetic survey itself comes from /root/seis-bench/gen-segy.mjs
// (710 x 876 x 1,750 IEEE, 4 ms, 25 m bins, the tester's headers).

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const segy = arg('segy', '/root/seis-bench/out/survey.sgy');
const bricksOut = arg('bricks', '/root/seis-bench/out/bricks-v1.bin');
const manifestOut = arg('manifest', '/root/seis-bench/out/bench-manifest.json');
const ENG = new URL('../../packages/engines/engines/seismolord/', import.meta.url);

const { scanGeometry } = await import(new URL('segyScan.js', ENG));
const { transcodeToBricks } = await import(new URL('brickTranscode.js', ENG));
const { buildManifest } = await import(new URL('manifest.js', ENG));

const fh = await fs.promises.open(segy, 'r');
const size = (await fh.stat()).size;
const reader = {
  size,
  async read(offset, length) {
    const ab = new ArrayBuffer(length);
    const u8 = new Uint8Array(ab);
    let got = 0;
    while (got < length) {
      // eslint-disable-next-line no-await-in-loop
      const { bytesRead } = await fh.read(u8, got, length - got, offset + got);
      if (!bytesRead) throw new Error('short read');
      got += bytesRead;
    }
    return ab;
  },
};

const t0 = Date.now();
const scan = await scanGeometry(reader);
const B = 64;
const ni = Math.ceil(scan.il.count / B);
const nj = Math.ceil(scan.xl.count / B);
const nk = Math.ceil(scan.ns / B);
const brickBytes = B ** 3 * 4;
const out = await fs.promises.open(bricksOut, 'w');
await out.truncate(ni * nj * nk * brickBytes);
let done = 0;
const tr = await transcodeToBricks(reader, scan, {
  memoryBudgetBytes: 700 * 1024 * 1024,
  onBrick: async ({ i, j, k, data }) => {
    const off = ((i * nj + j) * nk + k) * brickBytes;
    await out.write(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), 0, brickBytes, off);
    done += 1;
    if (done % 500 === 0) process.stdout.write(`${done} / ${ni * nj * nk}\n`);
  },
});
await out.close();
await fh.close();
fs.writeFileSync(manifestOut, JSON.stringify(buildManifest({
  volumeId: 'bench',
  name: 'seis-bench survey',
  scan,
  transcode: tr,
  sourceFileName: segy.split('/').pop(),
  sourceFileSize: size,
}), null, 1));
process.stdout.write(`${JSON.stringify({ grid: [ni, nj, nk], wallS: (Date.now() - t0) / 1000 })}\n`);
export const at = pathToFileURL(bricksOut).href;
