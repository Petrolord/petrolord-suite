/**
 * Large-survey Stream L, viewer side: the slice engine (sources, one
 * budgeted brick cache, slice cache), the worker protocol and client, and
 * the memory budget.
 *
 * Bit-identity on the committed segyio goldens: slices served from the
 * local file equal both the golden slices and the slices assembled from
 * the transcoder's bricks, through the same engine the worker runs.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { bufferReader } from '../engine/reader';
import { scanGeometry } from '../engine/segyScan';
import { transcodeToBricks } from '../engine/brickTranscode';
import { buildManifest } from '../engine/manifest';
import { amplitudePercentile, percentileOfSorted } from '../engine/displayEnhance';
import { SliceEngine, SliceCache, PERCENTILE_CAP } from '../sources/sliceEngine';
import { createSliceWorkerHandler, withFetchTimeout } from '../sources/sliceWorkerHandler';
import { SliceWorkerClient } from '../sources/sliceWorkerClient';
import {
  cacheBudgetBytes, splitBudget, formatBudget, reportedDeviceMemory,
} from '../sources/memoryBudget';
import {
  SOURCE_ERRORS, friendlySourceMessage, isOutOfMemory, errorCode,
} from '../sources/sliceSource';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'test-data', 'seismolord');
const MB = 1024 * 1024;
const loadGolden = (name) =>
  JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens', `${name}.json`), 'utf8'));
const loadSegy = (name) => {
  const buf = fs.readFileSync(path.join(DATA_DIR, 'segy', `${name}.sgy`));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
};
const blobToFloat32 = (blob) => {
  const bytes = Buffer.from(blob.base64, 'base64');
  expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(blob.sha256);
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
};
const bits = (f32) => Array.from(new Uint32Array(f32.buffer, f32.byteOffset, f32.length));
const tick = () => new Promise((r) => { setTimeout(r, 0); });

/** Transcode a golden file to an in-memory v1 brick store + manifest. */
async function brickVolume(name, mapping, brickSize = 16) {
  const buf = loadSegy(name);
  const reader = bufferReader(buf);
  const scan = await scanGeometry(reader, mapping);
  const bricks = new Map();
  const tr = await transcodeToBricks(reader, scan, {
    brickSize,
    onBrick: ({ i, j, k, data }) => { bricks.set(`vol/${name}/bricks/${i}-${j}-${k}.f32`, data); },
  });
  const manifest = buildManifest({
    volumeId: name, name, scan, transcode: tr, sourceFileName: name, sourceFileSize: buf.byteLength,
  });
  return { buf, bricks, manifest, storagePath: `vol/${name}` };
}

/** Fetcher over the brick map: raw little-endian float32 payloads,
 *  recording every request and its signal. */
function mapFetcher(bricks, { delay = 0 } = {}) {
  const calls = [];
  const fetcher = (p, signal) => {
    calls.push({ path: p, signal });
    const data = bricks.get(p);
    if (!data) return Promise.reject(new Error(`Brick fetch failed (404) for ${p}`));
    const payload = data.slice().buffer;
    if (!delay) return Promise.resolve(payload);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => resolve(payload), delay);
      signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('BRICK_FETCH_ABORTED')); });
    });
  };
  fetcher.calls = calls;
  return fetcher;
}

// ---- memory budget -------------------------------------------------------------

describe('memory budget from the reported device memory', () => {
  test('about 256 MB on an 8 GB laptop, 512 MB on 16 GB, 1 GB cap, 128 MB floor', () => {
    expect(cacheBudgetBytes(8)).toBe(256 * MB);
    expect(cacheBudgetBytes(16)).toBe(512 * MB);
    expect(cacheBudgetBytes(64)).toBe(1024 * MB);
    expect(cacheBudgetBytes(4)).toBe(128 * MB);
    expect(cacheBudgetBytes(0.5)).toBe(128 * MB);
    expect(cacheBudgetBytes(undefined)).toBe(256 * MB);
    expect(cacheBudgetBytes(NaN)).toBe(256 * MB);
  });

  test('split, formatting and the reported value', () => {
    expect(splitBudget(256 * MB)).toEqual({ bricks: 192 * MB, slices: 64 * MB });
    expect(formatBudget(256 * MB)).toBe('256 MB');
    expect(formatBudget(1024 * MB)).toBe('1 GB');
    expect(reportedDeviceMemory({ navigator: { deviceMemory: 8 } })).toBe(8);
    expect(reportedDeviceMemory({ navigator: {} })).toBeUndefined();
  });
});

// ---- local source on the goldens ---------------------------------------------------

describe.each(['dome_ibm', 'dome_ieee', 'dome_oddbytes'])('local source on %s', (name) => {
  const golden = loadGolden(name);
  const g = golden.geometry;
  const mapping = { ilByte: g.il_byte, xlByte: g.xl_byte };
  let vol;
  let engine;
  beforeAll(async () => {
    vol = await brickVolume(name, mapping);
    engine = new SliceEngine({ budgetBytes: 64 * MB });
    await engine.openLocal('L', bufferReader(vol.buf), { mapping, name });
    engine.openBricks('B', {
      manifest: vol.manifest, storagePath: vol.storagePath, fetcher: mapFetcher(vol.bricks),
    });
  });

  test('the golden inline and crossline come back bit-identical to segyio', async () => {
    const ilIdx = (golden.slices.inline.il - g.ilines[0]) / g.il_step;
    const xlIdx = (golden.slices.xline.xl - g.xlines[0]) / g.xl_step;
    const inl = await engine.getSlice('L', { orientation: 'inline', index: ilIdx });
    expect(bits(inl.data)).toEqual(bits(blobToFloat32(golden.slices.inline)));
    const xl = await engine.getSlice('L', { orientation: 'crossline', index: xlIdx });
    expect(bits(xl.data)).toEqual(bits(blobToFloat32(golden.slices.xline)));
  });

  test('every local inline and crossline equals the brick-assembled slice', async () => {
    for (const [o, n] of [['inline', g.n_il], ['xline', g.n_xl]]) {
      for (let i = 0; i < n; i++) {
        // eslint-disable-next-line no-await-in-loop
        const a = await engine.getSlice('L', { orientation: o, index: i });
        // eslint-disable-next-line no-await-in-loop
        const b = await engine.getSlice('B', { orientation: o, index: i });
        expect(bits(a.data)).toEqual(bits(b.data));
        expect(bits(a.traceRms)).toEqual(bits(b.traceRms));
      }
    }
  });

  test('local bricks and traces equal the transcoded ones', async () => {
    const [ni, nj, nk] = vol.manifest.brick.grid;
    const local = new SliceEngine({ budgetBytes: 64 * MB });
    const info = await local.openLocal('L2', bufferReader(vol.buf), { mapping });
    // the virtual lattice is 64^3; compare traces (lattice-independent)
    expect(info.manifest.brick.size).toBe(64);
    for (const [il, xl] of [[0, 0], [Math.min(5, g.n_il - 1), Math.min(17, g.n_xl - 1)], [g.n_il - 1, g.n_xl - 1]]) {
      // eslint-disable-next-line no-await-in-loop
      const a = await local.getTrace('L2', il, xl);
      // eslint-disable-next-line no-await-in-loop
      const b = await engine.getTrace('B', il, xl);
      expect(bits(a)).toEqual(bits(b));
    }
    expect(ni * nj * nk).toBeGreaterThan(0);
  });

  test('time slices: refused locally with the conversion code, exact from bricks', async () => {
    const k = golden.slices.time.sample_index;
    await expect(engine.getSlice('L', { orientation: 'time', index: k }))
      .rejects.toMatchObject({ code: SOURCE_ERRORS.TIME_NEEDS_CONVERSION });
    const t = await engine.getSlice('B', { orientation: 'time', index: k });
    expect(bits(t.data)).toEqual(bits(blobToFloat32(golden.slices.time)));
  });

  test('the percentile sample attached to a slice gives the viewer the same clip', async () => {
    const s = await engine.getSlice('L', { orientation: 'inline', index: 3 });
    for (const p of [90, 98, 99.5]) {
      expect(percentileOfSorted(s.absSample, p))
        .toBe(amplitudePercentile(s.data, p, { cap: PERCENTILE_CAP }));
    }
  });
});

// ---- brick source: caching, neighbours, budget, cancellation, failure --------------

describe('brick source', () => {
  let vol;
  beforeAll(async () => {
    vol = await brickVolume('dome_ieee', {}, 8);   // 32^3 at 8^3 = 4x4x8 bricks
  });

  test('neighbours in the same brick row are cut from one fetch set and cached', async () => {
    const fetcher = mapFetcher(vol.bricks);
    const eng = new SliceEngine({ budgetBytes: 64 * MB });
    eng.openBricks('B', { manifest: vol.manifest, storagePath: vol.storagePath, fetcher });
    await eng.getSlice('B', { orientation: 'inline', index: 9 });
    const perInline = 4 * 8;
    expect(fetcher.calls.length).toBe(perInline);
    // 8..11 cached (±2 in the same 8-row), no further fetches
    for (const i of [7 + 1, 10, 11]) {
      // eslint-disable-next-line no-await-in-loop
      await eng.getSlice('B', { orientation: 'inline', index: i });
    }
    expect(fetcher.calls.length).toBe(perInline);
    expect(eng.stats().slices.hits).toBe(3);
  });

  test('prefetch warms the next slice at the current step in the background', async () => {
    const fetcher = mapFetcher(vol.bricks);
    const eng = new SliceEngine({ budgetBytes: 64 * MB });
    eng.openBricks('B', { manifest: vol.manifest, storagePath: vol.storagePath, fetcher });
    await eng.getSlice('B', { orientation: 'xline', index: 4, step: 8 });
    eng.prefetch('B', { orientation: 'xline', index: 4, step: 8 });
    for (let n = 0; n < 50 && !eng.slices.has('B|xline|12|0'); n++) {
      // eslint-disable-next-line no-await-in-loop
      await tick();
    }
    expect(eng.slices.has('B|xline|12|0')).toBe(true);
  });

  test('the brick cache stays inside its budget share', async () => {
    const fetcher = mapFetcher(vol.bricks);
    const brickBytes = 8 ** 3 * 4;
    const eng = new SliceEngine({ budgetBytes: 40 * brickBytes });   // 30 bricks + slices
    eng.openBricks('B', { manifest: vol.manifest, storagePath: vol.storagePath, fetcher });
    for (let i = 0; i < 32; i += 8) {
      // eslint-disable-next-line no-await-in-loop
      await eng.getSlice('B', { orientation: 'inline', index: i });
      expect(eng.cache.bytes).toBeLessThanOrEqual(30 * brickBytes);
    }
    expect(eng.stats().bricks.evictions).toBeGreaterThan(0);
  });

  test('moving away cancels the old request and its fetches', async () => {
    const fetcher = mapFetcher(vol.bricks, { delay: 5 });
    const eng = new SliceEngine({ budgetBytes: 64 * MB, assemblyConcurrency: 4, maxConcurrentFetches: 4 });
    eng.openBricks('B', { manifest: vol.manifest, storagePath: vol.storagePath, fetcher });
    const ac = new AbortController();
    const old = eng.getSlice('B', { orientation: 'inline', index: 1 }, { signal: ac.signal });
    await tick();
    ac.abort();
    await expect(old).rejects.toMatchObject({ code: SOURCE_ERRORS.ABORTED });
    const fresh = await eng.getSlice('B', { orientation: 'inline', index: 30 });
    expect(fresh.height).toBe(32);
    // the aborted slice never fetched its whole brick set
    const oldPaths = fetcher.calls.filter((c) => /bricks\/0-/.test(c.path));
    expect(oldPaths.length).toBeLessThan(32);
    expect(oldPaths.some((c) => c.signal.aborted)).toBe(true);
  });

  test('a direct brick request is not cancelled by a scrub', async () => {
    const fetcher = mapFetcher(vol.bricks, { delay: 5 });
    const eng = new SliceEngine({ budgetBytes: 64 * MB });
    eng.openBricks('B', { manifest: vol.manifest, storagePath: vol.storagePath, fetcher });
    const held = eng.getBrick('B', 0, 0, 0);
    const ac = new AbortController();
    const s = eng.getSlice('B', { orientation: 'inline', index: 2 }, { signal: ac.signal });
    await tick();
    ac.abort();
    await expect(s).rejects.toMatchObject({ code: SOURCE_ERRORS.ABORTED });
    await expect(held).resolves.toBeInstanceOf(Float32Array);
  });

  test('two windows asking for the same slice share one assembly', async () => {
    const fetcher = mapFetcher(vol.bricks, { delay: 1 });
    const eng = new SliceEngine({ budgetBytes: 64 * MB });
    eng.openBricks('B', { manifest: vol.manifest, storagePath: vol.storagePath, fetcher });
    const [a, b] = await Promise.all([
      eng.getSlice('B', { orientation: 'time', index: 20 }),
      eng.getSlice('B', { orientation: 'time', index: 20 }),
    ]);
    expect(a).toBe(b);
    expect(fetcher.calls.length).toBe(16);
  });

  test('running out of memory is reported by name and sheds the caches', async () => {
    const fetcher = () => Promise.reject(new RangeError('Array buffer allocation failed'));
    const eng = new SliceEngine({ budgetBytes: 64 * MB });
    eng.openBricks('B', { manifest: vol.manifest, storagePath: vol.storagePath, fetcher });
    const e = await eng.getSlice('B', { orientation: 'inline', index: 0 }).catch((x) => x);
    expect(e.code).toBe(SOURCE_ERRORS.OUT_OF_MEMORY);
    expect(eng.slices.bytes).toBe(0);
  });

  test('a slow brick times out with TIMEOUT', async () => {
    jest.useFakeTimers();
    try {
      const never = (p, signal) => new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('BRICK_FETCH_ABORTED')));
      });
      const f = withFetchTimeout(never, 1000);
      const p = f('x', new AbortController().signal);
      jest.advanceTimersByTime(1001);
      await expect(p).rejects.toMatchObject({ code: SOURCE_ERRORS.TIMEOUT });
    } finally {
      jest.useRealTimers();
    }
  });
});

// ---- worker protocol + client -----------------------------------------------------

/** A Worker stand-in running the real handler in-process. */
function inProcessWorker(env = {}) {
  const w = {
    onmessage: null, onerror: null, onmessageerror: null, terminated: false, posted: [],
  };
  const handler = createSliceWorkerHandler((msg) => {
    if (!w.terminated) setTimeout(() => w.onmessage && w.onmessage({ data: msg }), 0);
  }, {
    makeReader: (file) => bufferReader(file.buf),
    ...env,
  });
  w.handler = handler;
  w.postMessage = (msg) => {
    w.posted.push(msg.type);
    if (!w.terminated) setTimeout(() => handler.onMessage(msg), 0);
  };
  w.terminate = () => { w.terminated = true; };
  w.crash = (message) => w.onerror && w.onerror({ message, preventDefault() {} });
  return w;
}

describe('SliceWorkerClient over the worker protocol', () => {
  const golden = loadGolden('dome_ieee');
  const file = { buf: loadSegy('dome_ieee'), name: 'dome_ieee.sgy', size: 511504 };

  test('open a local file, get a slice, time is refused with the conversion code', async () => {
    const workers = [];
    const client = new SliceWorkerClient({
      createWorker: () => { const w = inProcessWorker(); workers.push(w); return w; },
      budgetBytes: 64 * MB,
    });
    const progress = [];
    const src = await client.openLocal(file, { onProgress: (d, t) => progress.push([d, t]) });
    expect(src.kind).toBe('local');
    expect(src.capabilities.time).toBe(false);
    expect(src.manifest.geometry.il.count).toBe(32);
    expect(src.index.mode).toBe('predicted');
    expect(progress.length).toBeGreaterThan(0);
    const il = (golden.slices.inline.il - golden.geometry.ilines[0]);
    const s = await src.getSlice({ orientation: 'inline', index: il });
    expect(bits(s.data)).toEqual(bits(blobToFloat32(golden.slices.inline)));
    expect(s.final).toBe(true);
    await expect(src.getSlice({ orientation: 'time', index: 3 }))
      .rejects.toMatchObject({ code: SOURCE_ERRORS.TIME_NEEDS_CONVERSION });
    const st = await client.stats();
    expect(st.budgetBytes).toBe(64 * MB);
    expect(workers).toHaveLength(1);
  });

  test('bricks mode asks the main thread for the sign-in token', async () => {
    const vol = await brickVolume('dome_ieee', {}, 16);
    const seen = [];
    const client = new SliceWorkerClient({
      createWorker: () => inProcessWorker({
        makeFetcher: ({ getToken }) => async (p, signal) => {
          seen.push(await getToken(false));
          return mapFetcher(vol.bricks)(p, signal);
        },
      }),
      budgetBytes: 64 * MB,
    });
    const src = await client.openBricks({
      manifest: vol.manifest, storagePath: vol.storagePath, supabaseUrl: 'http://x', getToken: async () => 'tok',
    });
    const s = await src.getSlice({ orientation: 'time', index: 25 });
    expect(bits(s.data)).toEqual(bits(blobToFloat32(golden.slices.time)));
    expect(seen.every((t) => t === 'tok')).toBe(true);
    const b = await src.getBrick(0, 0, 0);
    expect(b).toBeInstanceOf(Float32Array);
    expect(b.length).toBe(16 ** 3);
  });

  test('a crashed worker fails pending requests plainly and the next call recovers', async () => {
    const workers = [];
    const client = new SliceWorkerClient({
      createWorker: () => { const w = inProcessWorker(); workers.push(w); return w; },
      budgetBytes: 64 * MB,
    });
    const src = await client.openLocal(file);
    const pending = src.getSlice({ orientation: 'inline', index: 4 });
    await Promise.resolve();
    workers[0].crash('Out of memory');
    const e = await pending.catch((x) => x);
    expect(e.code).toBe(SOURCE_ERRORS.WORKER_CRASHED);
    expect(friendlySourceMessage(e, { budgetBytes: 256 * MB }))
      .toBe('Seismolord ran out of memory loading this slice. It keeps at most 256 MB of survey '
        + 'data in memory on this machine. Close other tabs or windows to free memory, then press Retry.');
    // Retry: a fresh worker, the source reopened transparently
    const s = await src.getSlice({ orientation: 'inline', index: 4 });
    expect(s.height).toBe(32);
    expect(workers).toHaveLength(2);
  });

  test('cancel and timeout', async () => {
    const client = new SliceWorkerClient({
      createWorker: () => inProcessWorker(), budgetBytes: 64 * MB, sliceTimeoutMs: 1,
    });
    const src = await client.openLocal(file);
    const ac = new AbortController();
    const p = src.getSlice({ orientation: 'xline', index: 1 }, { signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toMatchObject({ code: SOURCE_ERRORS.ABORTED });
    const slow = await src.getSlice({ orientation: 'xline', index: 2 }).catch((x) => x);
    expect(slow.code).toBe(SOURCE_ERRORS.TIMEOUT);
  });
});

// ---- error classification ------------------------------------------------------------

describe('slice timeouts count silence', () => {
  test('a slow slice whose bricks keep arriving lands; a silent one times out', async () => {
    const vol = await brickVolume('dome_ieee', {}, 8);
    // each brick takes 50 ms, so the inline (4 x 8 = 32 bricks, 12 in
    // flight, 3 rounds) takes about 150 ms against a 110 ms timeout, but
    // is never silent for more than about 50 ms
    const client = new SliceWorkerClient({
      createWorker: () => inProcessWorker({
        makeFetcher: () => mapFetcher(vol.bricks, { delay: 50 }),
      }),
      budgetBytes: 64 * MB,
      sliceTimeoutMs: 110,
    });
    const src = await client.openBricks({
      manifest: vol.manifest, storagePath: vol.storagePath, supabaseUrl: 'http://x', getToken: async () => 'tok',
    });
    const progress = [];
    const t0 = Date.now();
    const s = await src.getSlice({ orientation: 'inline', index: 9, prefetch: false }, {
      onProgress: (d, t) => progress.push([d, t]),
    });
    expect(Date.now() - t0).toBeGreaterThan(110);
    expect(s.height).toBe(32);
    expect(progress).toHaveLength(32);
    expect(progress[31]).toEqual([32, 32]);

    // silence: a fetcher that never answers
    const stuck = new SliceWorkerClient({
      createWorker: () => inProcessWorker({
        makeFetcher: () => (p, signal) => new Promise((resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('BRICK_FETCH_ABORTED')));
        }),
      }),
      budgetBytes: 64 * MB,
      sliceTimeoutMs: 110,
    });
    const src2 = await stuck.openBricks({
      manifest: vol.manifest, storagePath: vol.storagePath, supabaseUrl: 'http://x', getToken: async () => 'tok',
    });
    const e = await src2.getSlice({ orientation: 'inline', index: 9, prefetch: false }).catch((x) => x);
    expect(e.code).toBe(SOURCE_ERRORS.TIMEOUT);
  });
});

describe('error classification and copy', () => {
  test('out-of-memory shapes', () => {
    expect(isOutOfMemory(new RangeError('Array buffer allocation failed'))).toBe(true);
    expect(isOutOfMemory(new RangeError('Invalid typed array length: 4294967296'))).toBe(true);
    expect(isOutOfMemory(new RangeError('Offset is outside the bounds of the DataView'))).toBe(false);
    expect(errorCode(new Error('BRICK_FETCH_ABORTED'))).toBe(SOURCE_ERRORS.ABORTED);
    expect(errorCode(new Error('boom'))).toBe(SOURCE_ERRORS.FAILED);
  });

  test('messages follow the copy rule (no em dashes, no contrastives)', () => {
    for (const code of Object.values(SOURCE_ERRORS)) {
      const m = friendlySourceMessage({ code, message: 'x' }, { budgetBytes: 256 * MB });
      expect(m).not.toMatch(/—/);
      expect(m).not.toMatch(/, not /);
    }
  });

  test('SliceCache evicts oldest first by bytes', () => {
    const c = new SliceCache(3 * 400);
    const s = () => ({ data: new Float32Array(100) });
    c.set('a', s()); c.set('b', s()); c.set('c', s());
    c.get('a');
    c.set('d', s());
    expect(c.has('b')).toBe(false);
    expect(c.has('a')).toBe(true);
    expect(c.bytes).toBe(1200);
  });
});
