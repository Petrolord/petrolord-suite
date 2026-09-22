/**
 * Large surveys: the slice engine reading a v4 store's 8-bit display copy
 * (coarse levels first, then level 0), which is what the first inline over
 * a slow link and uncached steps wait on.
 *
 * Oracles, both independent of the slice path under test:
 *  - level 0: the v1 transcoder's exact float32 slice, quantised and
 *    dequantised with the engine's own codec functions (the display copy is
 *    defined as exactly that);
 *  - coarse levels: codes read straight out of the stored display bricks by
 *    voxel address (layout il-major, xl, sample-fastest), repeated over the
 *    full slice the way a coarse local slice is.
 */
import zlib from 'node:zlib';
import { SliceEngine } from '../sources/sliceEngine';
import { bufferReader } from '../engine/reader';
import { transcodeToBricks } from '../engine/brickTranscode';
import { transcodeV4, gridFromScan } from '../engine/brickTranscodeV4';
import {
  DEFLATE_RAW, decodeU8Brick, quantizeU8, dequantizeU8, v4BrickFetcher,
} from '../engine/brickCodecV4';
import {
  NULL_VALUE, buildManifestV4, withV4Complete, displayBrickRelPath, f32BrickRelPath,
} from '../engine/manifest';
import { assembleSlices } from '../engine/sliceAssembly';
import { makeSegy, scanOf } from '../../../../../packages/engines/__tests__/seismolordSegyFixture';

const ZLIB = {
  compression: DEFLATE_RAW,
  deflate: async (b) => new Uint8Array(zlib.deflateRawSync(b)),
  inflate: async (b) => new Uint8Array(zlib.inflateRawSync(b)),
};
const DIR = 'user-1/vol-1';
const B = 8;
const LEVELS = 2;
const NULL_F32 = Math.fround(NULL_VALUE);
const shape = { nIl: 21, nXl: 13, ns: 37 };
const amp = (il, xl, s) => (il === 2 && xl === 3 ? NULL_VALUE : 800 * Math.sin(0.3 * s + 0.1 * il + 0.05 * xl));
const scan = {
  ...scanOf(shape), dtUs: 4000, coordScalar: -100, corners: { first: null, last: null }, affine: null,
};

let fix;
let objects;          // path -> Uint8Array, as Storage holds them
let manifest;         // display complete, f32 complete
let exact;            // v1 bricks, the float32 oracle

beforeAll(async () => {
  fix = makeSegy({ ...shape, amp });
  objects = new Map();
  const result = await transcodeV4(bufferReader(fix.buffer), gridFromScan(scan), {
    codec: ZLIB,
    brickSize: B,
    levels: LEVELS,
    onBrick: async (b) => {
      const rel = b.kind === 'f32' ? f32BrickRelPath(b.i, b.j, b.k) : displayBrickRelPath(b.level, b.i, b.j, b.k);
      objects.set(`${DIR}/${rel}`, b.bytes);
    },
  });
  manifest = withV4Complete(buildManifestV4({
    volumeId: 'vol-1', name: 'T', scan, transcode: result, sourceFileName: 's.sgy', sourceFileSize: fix.buffer.byteLength,
  }), { display: true, f32: true });
  exact = new Map();
  await transcodeToBricks(bufferReader(fix.buffer), { ...scan, sampled: false, regular: true, inlineSorted: true }, {
    brickSize: B, onBrick: ({ i, j, k, data }) => { exact.set(`${i}-${j}-${k}`, data); },
  });
});

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

/** Storage stand-in that records every path asked for; `delay(path)` ms
 *  models a slow link. */
function storage(delay = () => 0) {
  const log = [];
  const raw = async (path) => {
    log.push(path);
    const ms = delay(path);
    if (ms) await sleep(ms);
    const o = objects.get(path);
    if (!o) throw new Error(`no object ${path}`);
    return o.slice().buffer;
  };
  return { log, raw };
}

function open(m, st, budgetBytes = 64 * 1024 * 1024, opts = {}) {
  const eng = new SliceEngine({ budgetBytes, ...opts });
  // the worker handler's wrap: v1 names to v4 objects; display paths pass through
  const fetcher = v4BrickFetcher(st.raw, m, { inflate: ZLIB.inflate });
  const info = eng.openBricks('V', {
    manifest: m, storagePath: DIR, fetcher, inflate: ZLIB.inflate,
  });
  return { eng, info };
}

const clip = () => manifest.display.clip;
const bits = (a) => new Uint32Array(a.buffer, a.byteOffset, a.length);
const shapeOf = (o) => (o === 'time' ? { width: shape.nXl, height: shape.nIl } : { width: shape.ns, height: o === 'inline' ? shape.nXl : shape.nIl });
const count = (o) => (o === 'inline' ? shape.nIl : o === 'xline' ? shape.nXl : shape.ns);

/** Level 0 oracle: the exact slice through the display codec. */
async function expectedLevel0(o, index) {
  const out = await assembleSlices(async (i, j, k) => exact.get(`${i}-${j}-${k}`),
    { ...shape, brickSize: B, grid: manifest.brick.grid }, o, [index]);
  const s = out.get(index).data;
  const e = new Float32Array(s.length);
  for (let n = 0; n < s.length; n++) e[n] = dequantizeU8(quantizeU8(s[n], clip()), clip());
  return e;
}

/** Coarse oracle: codes by voxel address from the stored level-L bricks. */
async function expectedCoarse(o, index, L) {
  const lvl = manifest.display.levels.find((l) => l.level === L);
  const decoded = new Map();
  const code = async (il, xl, s) => {
    const key = `${il >> 3}-${xl >> 3}-${s >> 3}`;
    if (!decoded.has(key)) {
      decoded.set(key, await decodeU8Brick(objects.get(`${DIR}/${displayBrickRelPath(L, il >> 3, xl >> 3, s >> 3)}`), ZLIB));
    }
    return decoded.get(key)[((il % B) * B + (xl % B)) * B + (s % B)];
  };
  expect(lvl.dims).toEqual([Math.ceil(shape.nIl / 2 ** L), Math.ceil(shape.nXl / 2 ** L), Math.ceil(shape.ns / 2 ** L)]);
  const { width, height } = shapeOf(o);
  const e = new Float32Array(width * height);
  const c = index >> L;
  for (let r = 0; r < height; r++) {
    for (let w = 0; w < width; w++) {
      let q;
      if (o === 'inline') q = await code(c, r >> L, w >> L);
      else if (o === 'xline') q = await code(r >> L, c, w >> L);
      else q = await code(r >> L, w >> L, c);
      e[r * width + w] = dequantizeU8(q, clip());
    }
  }
  return e;
}

describe('v4 display copy through the slice engine', () => {
  test('the manifest opens as a display source; coarse test data has nulls', () => {
    const { info } = open(manifest, storage());
    expect(info.display).toEqual({ clip: clip(), levels: LEVELS + 1 });
    expect(manifest.display.levels.map((l) => l.level)).toEqual([0, 1, 2]);
  });

  test.each(['inline', 'xline', 'time'])('every %s at level 0 equals the exact slice through the display codec', async (o) => {
    const st = storage();
    const { eng } = open(manifest, st);
    for (let index = 0; index < count(o); index++) {
      const s = await eng.getSlice('V', { orientation: o, index });
      const e = await expectedLevel0(o, index);
      expect(s.codec).toBe('u8');
      expect(s.clip).toBe(clip());
      expect(s.final).toBe(true);
      expect(s.level).toBe(0);
      expect([s.width, s.height]).toEqual([shapeOf(o).width, shapeOf(o).height]);
      expect(bits(s.data)).toEqual(bits(e));
    }
    // the view reads the display copy only: no float32 object fetched
    expect(st.log.every((p) => p.includes('/v4/d0/'))).toBe(true);
  });

  test('the null trace stays null', async () => {
    const { eng } = open(manifest, storage());
    const s = await eng.getSlice('V', { orientation: 'inline', index: 2 });
    expect(s.data[3 * shape.ns + 5]).toBe(NULL_F32);
    expect(s.data[4 * shape.ns + 5]).not.toBe(NULL_F32);
  });

  test.each(['inline', 'xline', 'time'])('a cold %s on a fast link: the coarsest level, then level 0', async (o) => {
    const st = storage();
    const { eng } = open(manifest, st);
    const index = Math.min(count(o) - 1, 11);
    const partials = [];
    const progress = [];
    const s = await eng.getSlice('V', { orientation: o, index }, {
      onPartial: (p) => partials.push(p),
      onProgress: (d, t) => progress.push([d, t]),
    });
    // level 0 lands inside the pace check: level 1 would only delay it
    expect(partials.map((p) => p.level)).toEqual([2]);
    const p = partials[0];
    expect(p.final).toBe(false);
    expect(p.codec).toBe('u8');
    expect([p.width, p.height]).toEqual([shapeOf(o).width, shapeOf(o).height]);
    expect(bits(p.data)).toEqual(bits(await expectedCoarse(o, index, 2)));
    expect(bits(s.data)).toEqual(bits(await expectedLevel0(o, index)));
    // the coarsest level was fetched before any level-0 brick, level 1 never
    const firstD0 = st.log.findIndex((q) => q.includes('/v4/d0/'));
    expect(firstD0).toBeGreaterThan(0);
    expect(st.log.slice(0, firstD0).every((q) => q.includes('/v4/d2/'))).toBe(true);
    expect(st.log.some((q) => q.includes('/v4/d1/'))).toBe(false);
    // level 0's progress, ending complete
    const [d, t] = progress.at(-1);
    expect(d).toBe(t);
  });

  test.each(['inline', 'xline', 'time'])('a cold %s on a slow link: level 2, then level 1 alongside level 0, then level 0', async (o) => {
    // level 0 bricks are slow; the pace check runs early and every
    // remaining time counts as slow
    const st = storage((p) => (p.includes('/v4/d0/') ? 25 : 0));
    const { eng } = open(manifest, st, 64 * 1024 * 1024, { sharpenCheckMs: 5, sharpenIfRemainingMs: 0 });
    const index = Math.min(count(o) - 1, 11);
    const partials = [];
    const s = await eng.getSlice('V', { orientation: o, index }, { onPartial: (p) => partials.push(p) });
    expect(partials.map((p) => p.level)).toEqual([2, 1]);
    for (const p of partials) {
      expect(bits(p.data)).toEqual(bits(await expectedCoarse(o, index, p.level)));
    }
    expect(s.level).toBe(0);
    expect(bits(s.data)).toEqual(bits(await expectedLevel0(o, index)));
  });

  test('negative control: a pace threshold no link reaches never fetches level 1', async () => {
    const st = storage((p) => (p.includes('/v4/d0/') ? 25 : 0));
    // one brick at a time, so the pace is measured on a few landed bricks
    // with the rest still to come (no brick landed yet counts as slow)
    const { eng } = open(manifest, st, 64 * 1024 * 1024, {
      sharpenCheckMs: 60, sharpenIfRemainingMs: 1e9, assemblyConcurrency: 1,
    });
    const partials = [];
    await eng.getSlice('V', { orientation: 'inline', index: 11 }, { onPartial: (p) => partials.push(p) });
    expect(partials.map((p) => p.level)).toEqual([2]);
    expect(st.log.some((q) => q.includes('/v4/d1/'))).toBe(false);
  });

  test('warm level-0 bricks skip the coarse levels', async () => {
    const st = storage();
    const { eng } = open(manifest, st);
    await eng.getSlice('V', { orientation: 'inline', index: 8 });
    const partials = [];
    // index 12 sits in the same brick row as 8 but beyond the neighbours cut with it
    await eng.getSlice('V', { orientation: 'inline', index: 12 }, { onPartial: (p) => partials.push(p) });
    expect(partials).toEqual([]);
    expect(st.log.some((p) => /\/v4\/d[12]\//.test(p))).toBe(false);
  });

  test('display bricks sit in the cache at one byte a voxel', async () => {
    const { eng } = open(manifest, storage());
    await eng.getSlice('V', { orientation: 'inline', index: 0 });
    const g = manifest.display.levels[0].bricks;
    expect(eng.stats().brickBytes).toBe(g[1] * g[2] * B ** 3);
  });

  test('computation still reads float32, exactly, through the v1 names', async () => {
    const st = storage();
    const { eng } = open(manifest, st);
    const b = await eng.getBrick('V', 1, 1, 2);
    expect(bits(b)).toEqual(bits(exact.get('1-1-2')));
    expect(st.log).toEqual([`${DIR}/v4/f/1-1-2.f32z`]);
  });

  test('negative control: without the display copy the slice is the exact float32 one', async () => {
    const st = storage();
    const noDisplay = withV4Complete(manifest, { display: false });
    const { eng, info } = open(noDisplay, st);
    expect(info.display).toBeNull();
    const s = await eng.getSlice('V', { orientation: 'inline', index: 5 });
    expect(s.codec).toBe('f32');
    const e = await expectedLevel0('inline', 5);
    // the display codec is lossy, so the gate above can tell the two apart
    expect(bits(s.data)).not.toEqual(bits(e));
    expect(st.log.every((p) => p.includes('/v4/f/'))).toBe(true);
  });
});
