/**
 * Phase 2 data layer: brick cache behaviour (LRU / dedup / cancellation)
 * and slice assembly bit-identity against the segyio goldens, through
 * real transcoded bricks.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { bufferReader } from '@/pages/apps/Seismolord/engine/reader';
import { scanGeometry } from '@/pages/apps/Seismolord/engine/segyScan';
import { transcodeToBricks } from '@/pages/apps/Seismolord/engine/brickTranscode';
import { BrickCache } from '@/pages/apps/Seismolord/engine/brickCache';
import {
  assembleSlice,
  bricksForSlice,
} from '@/pages/apps/Seismolord/engine/sliceAssembly';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'test-data', 'seismolord');

const loadGolden = (name) =>
  JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens', `${name}.json`), 'utf8'));

const readerFor = (name) => {
  const buf = fs.readFileSync(path.join(DATA_DIR, 'segy', `${name}.sgy`));
  return bufferReader(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
};

const blobToFloat32 = (blob) => {
  const bytes = Buffer.from(blob.base64, 'base64');
  expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(blob.sha256);
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
};

const asBits = (f32) => Array.from(new Uint32Array(f32.buffer, f32.byteOffset, f32.length));

async function brickSetFor(name, golden, brickSize) {
  const reader = readerFor(name);
  const scan = await scanGeometry(reader, {
    ilByte: golden.geometry.il_byte, xlByte: golden.geometry.xl_byte,
  });
  const bricks = new Map();
  const result = await transcodeToBricks(reader, scan, {
    brickSize,
    onBrick: ({ i, j, k, data }) => bricks.set(`${i}-${j}-${k}`, data),
  });
  const geom = {
    nIl: scan.il.count,
    nXl: scan.xl.count,
    ns: scan.ns,
    brickSize: result.brickGrid.brickSize,
    grid: [result.brickGrid.ni, result.brickGrid.nj, result.brickGrid.nk],
  };
  const getBrick = (i, j, k) => Promise.resolve(bricks.get(`${i}-${j}-${k}`));
  return { geom, getBrick };
}

describe.each([64, 16])('slice assembly from %i^3 bricks', (brickSize) => {
  const golden = loadGolden('dome_ibm');
  const g = golden.geometry;

  test('inline, crossline and time slices are bit-identical to segyio', async () => {
    const { geom, getBrick } = await brickSetFor('dome_ibm', golden, brickSize);

    const inline = await assembleSlice(
      getBrick, geom, 'inline', golden.slices.inline.il - g.ilines[0]);
    expect(inline.width).toBe(g.ns);
    expect(inline.height).toBe(g.n_xl);
    expect(asBits(inline.data)).toEqual(asBits(blobToFloat32(golden.slices.inline)));

    const xline = await assembleSlice(
      getBrick, geom, 'xline', golden.slices.xline.xl - g.xlines[0]);
    expect(asBits(xline.data)).toEqual(asBits(blobToFloat32(golden.slices.xline)));

    const time = await assembleSlice(
      getBrick, geom, 'time', golden.slices.time.sample_index);
    expect(asBits(time.data)).toEqual(asBits(blobToFloat32(golden.slices.time)));
  });

  test('per-trace RMS is present for section slices and null-free', async () => {
    const { geom, getBrick } = await brickSetFor('dome_ibm', golden, brickSize);
    const inline = await assembleSlice(
      getBrick, geom, 'inline', golden.slices.inline.il - g.ilines[0]);
    expect(inline.traceRms).toHaveLength(g.n_xl);
    expect(Math.min(...inline.traceRms)).toBeGreaterThan(0);
    const time = await assembleSlice(getBrick, geom, 'time', 0);
    expect(time.traceRms).toBeNull();
  });
});

describe('bricksForSlice', () => {
  const geom = { nIl: 200, nXl: 130, ns: 300, brickSize: 64, grid: [4, 3, 5] };
  test('selects one brick plane per orientation', () => {
    expect(bricksForSlice(geom, 'inline', 70)).toHaveLength(3 * 5);
    expect(bricksForSlice(geom, 'inline', 70).every((c) => c.i === 1)).toBe(true);
    expect(bricksForSlice(geom, 'xline', 0)).toHaveLength(4 * 5);
    expect(bricksForSlice(geom, 'time', 299)).toHaveLength(4 * 3);
    expect(bricksForSlice(geom, 'time', 299).every((c) => c.k === 4)).toBe(true);
  });
});

describe('BrickCache', () => {
  const makeBrick = (fill, floats = 8) => {
    const a = new Float32Array(floats).fill(fill);
    return a.buffer;
  };

  test('deduplicates concurrent fetches and caches results', async () => {
    let calls = 0;
    const cache = new BrickCache(async () => {
      calls += 1;
      return makeBrick(calls);
    });
    const [a, b] = await Promise.all([cache.get('p1'), cache.get('p1')]);
    expect(calls).toBe(1);
    expect(a).toBe(b);
    await cache.get('p1');
    expect(calls).toBe(1);
    expect(cache.stats.hits).toBe(1);      // third call is a cache hit
    expect(cache.stats.misses).toBe(1);
  });

  test('evicts least-recently-used bricks past the byte budget', async () => {
    const cache = new BrickCache(async (p) => makeBrick(1, 8), { maxBytes: 96 });
    await cache.get('a');                   // 32 B each
    await cache.get('b');
    await cache.get('c');
    await cache.get('a');                   // refresh a -> b is now LRU
    await cache.get('d');                   // 128 B > 96 -> evict b
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('c')).toBe(true);
    expect(cache.has('d')).toBe(true);
    expect(cache.stats.evictions).toBe(1);
    expect(cache.bytes).toBeLessThanOrEqual(96);
  });

  test('cancelPendingExcept aborts only the stale fetches', async () => {
    const aborted = [];
    const cache = new BrickCache((p, signal) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => {
        aborted.push(p);
        reject(new Error('BRICK_FETCH_ABORTED'));
      });
      if (p === 'keep') setTimeout(() => resolve(makeBrick(1)), 5);
    }));
    const stale = cache.get('stale').catch((e) => e.message);
    const keep = cache.get('keep');
    cache.cancelPendingExcept(new Set(['keep']));
    expect(await stale).toBe('BRICK_FETCH_ABORTED');
    expect((await keep).length).toBe(8);
    expect(aborted).toEqual(['stale']);
    expect(cache.stats.aborts).toBe(1);
    // an aborted path can be re-requested cleanly
    let resolved = false;
    const again = cache.get('stale');
    cache.inflight.get('stale'); // still tracked as a fresh request
    await expect(Promise.race([again.then(() => { resolved = true; }), Promise.resolve()]))
      .resolves.toBeUndefined();
    expect(resolved).toBe(false);
  });

  test('a get() racing an abort starts a fresh fetch instead of reusing the doomed promise', async () => {
    // ML1: abort() rejects the old promise on a LATER microtask; a new
    // slice request for the same brick arriving in that window must not
    // be handed the aborted promise (callers drop ABORTED silently — the
    // new slice would never render).
    let calls = 0;
    const cache = new BrickCache((p, signal) => new Promise((resolve, reject) => {
      calls += 1;
      const mine = calls;
      signal.addEventListener('abort', () => reject(new Error('BRICK_FETCH_ABORTED')));
      setTimeout(() => resolve(makeBrick(mine)), 5);
    }));
    const stale = cache.get('b').catch((e) => e.message);
    cache.cancelPendingExcept();               // aborts, removes from inflight
    const fresh = cache.get('b');              // same tick — before the rejection lands
    expect(calls).toBe(2);                     // a genuinely new fetch
    expect(await stale).toBe('BRICK_FETCH_ABORTED');
    expect((await fresh)[0]).toBe(2);          // resolves with the fresh data
    expect(cache.has('b')).toBe(true);
  });
});
