#!/usr/bin/env node
// Build the benchmark's v4 display store: every display brick (level 0 and
// the levels of detail) as its own object under --out, plus a manifest v4
// with display.complete, i.e. the state a volume is in at 'display_ready'
// (the moment target 4 is measured from). Transcoded from a SEG-Y with the
// repo's own engine, deflate-raw by node:zlib (the format the browser's
// CompressionStream('deflate-raw') writes). The float32 copy is not kept:
// the view reads the display copy only. Feed the directory to
// mock-storage.mjs --store.
//
// usage: node --experimental-specifier-resolution=node \
//          --max-old-space-size=3000 make-bricks-v4.mjs \
//          --segy /root/seis-bench/out/survey.sgy \
//          --out /root/seis-bench/out/v4
//
// Writes <out>/manifest.json and <out>/v4/d{L}/{i}-{j}-{k}.u8z.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const segy = arg('segy', '/root/seis-bench/out/survey.sgy');
const outDir = arg('out', '/root/seis-bench/out/v4');
const ENG = new URL('../../packages/engines/engines/seismolord/', import.meta.url);

const { scanGeometry } = await import(new URL('segyScan.js', ENG));
const { transcodeV4, gridFromScan, sampleAmplitudeClip } = await import(new URL('brickTranscodeV4.js', ENG));
const { buildManifestV4, withV4Complete, displayBrickRelPath } = await import(new URL('manifest.js', ENG));
const { DEFLATE_RAW } = await import(new URL('brickCodecV4.js', ENG));

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
const grid = gridFromScan(scan);
const clip = await sampleAmplitudeClip(reader, grid);
const B = 64;
const F32_BRICK_BYTES = B ** 3 * 4;
const codec = {
  compression: DEFLATE_RAW,
  // the float32 copy is dropped (display_ready): skip compressing it
  deflate: async (bytes) => (bytes.length === F32_BRICK_BYTES ? new Uint8Array(0) : new Uint8Array(zlib.deflateRawSync(bytes))),
};
fs.mkdirSync(outDir, { recursive: true });
const made = new Set();
const bytesByLevel = {};
let written = 0;
const result = await transcodeV4(reader, grid, {
  codec,
  clip,
  brickSize: B,
  onBrick: async (b) => {
    if (b.kind === 'f32') return;
    const rel = displayBrickRelPath(b.level, b.i, b.j, b.k);
    const dir = path.join(outDir, path.dirname(rel));
    if (!made.has(dir)) { fs.mkdirSync(dir, { recursive: true }); made.add(dir); }
    await fs.promises.writeFile(path.join(outDir, rel), b.bytes);
    bytesByLevel[b.level] = (bytesByLevel[b.level] || 0) + b.bytes.length;
    written += 1;
    if (written % 1000 === 0) process.stdout.write(`${written} display bricks\n`);
  },
});
await fh.close();
const manifest = withV4Complete(buildManifestV4({
  volumeId: 'bench-v4',
  name: 'seis-bench survey (v4 display copy)',
  scan,
  transcode: result,
  sourceFileName: path.basename(segy),
  sourceFileSize: size,
}), { display: true, f32: false });
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
process.stdout.write(`${JSON.stringify({
  levels: manifest.display.levels.map((l) => ({ level: l.level, bricks: l.bricks, count: l.count, bytes: bytesByLevel[l.level] })),
  clip: manifest.display.clip,
  wallS: (Date.now() - t0) / 1000,
})}\n`);
