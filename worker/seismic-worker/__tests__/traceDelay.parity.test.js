/**
 * @jest-environment node
 */
// SEG-Y trace delay (byte 109) honoured on import (QI benchmark F-5). Known
// truth: every sample of the file is a function of its TRUE time, written
// with the first sample at the delay, so file sample k holds truth(40 + 4k).
// Every import path must store truth(4m) at volume sample m (0 ms origin),
// nulls above the first recorded sample:
//   server   an uploaded file, stack_to_v4 (the browser's preview scan is
//            stale: it has the file's own sample count)
//   browser  importJobs with the conversion worker's reader and delayShift
//   link     stack_to_v4 cropping a stored file by a window in true times
//   upload   the cropped SEG-Y (its delay is the source's plus the window's
//            top), stack_to_v4
//   browser crop, and gathers (ingest_gathers)
// Negative controls: the door's reader converted as it is (the behaviour
// before F-5) stores truth(4m + 40); delays that differ between traces are
// not applied and say so.
import zlib from 'node:zlib';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { TextEncoder, TextDecoder } from 'node:util';
import { stackToV4 } from '../src/handlers/stackToV4.js';
import { ingestGathers } from '../src/handlers/ingestGathers.js';
import { createImportJobManager, V4_STATUS } from '../../../src/pages/apps/Seismolord/services/importJobs';
import { memorySpool } from '../../../src/pages/apps/Seismolord/services/brickSpool';
import { convertToSpool } from '../../../src/pages/apps/Seismolord/services/conversionV4';
import {
  planImportCrop, cropSource, conversionView, scanConversionView, cropRequest, cropConversionReader, importCropProvenance, conversionSourceReader,
} from '../../../src/pages/apps/Seismolord/services/cropImport';
import { openSegyDoor, alignTraceDelay, scanOnReader } from '../../../src/pages/apps/Seismolord/lib/segyDoor';
import { bufferReader } from '../../../packages/engines/engines/seismolord/reader';
import { DEFLATE_RAW, decodeF32Brick } from '../../../packages/engines/engines/seismolord/brickCodecV4';
import { writeSegy } from '../../../packages/engines/engines/seismolord/segyWrite';
import { readGather } from '../../../packages/engines/engines/qi/gatherStore';
import { makeSegy, scanOf } from '../../../packages/engines/__tests__/seismolordSegyFixture';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
if (!global.TextEncoder) global.TextEncoder = TextEncoder;
if (!global.TextDecoder) global.TextDecoder = TextDecoder;
jest.setTimeout(120000);

const ZLIB = {
  compression: DEFLATE_RAW,
  deflate: async (b) => new Uint8Array(zlib.deflateRawSync(b)),
  inflate: async (b) => new Uint8Array(zlib.inflateRawSync(b)),
};
const B = 8;
const CONVERT = { brickSize: B, levels: 2 };
const UID = '11111111-1111-4111-8111-111111111111';
const VOL = '22222222-2222-4222-8222-222222222222';
const DS = '33333333-3333-4333-8333-333333333333';
const DT = 4;
const DELAY = 40;
const shape = { nIl: 12, nXl: 10, ns: 61, il0: 100, xl0: 200 };
const truth = (i, x, tMs) => Math.fround(500 * Math.sin(0.07 * tMs + 0.3 * i) + 3 * x + tMs / 10);
const MAP = { ilByte: 189, xlByte: 193 };
const crsPlan = { needsTransform: false, storeTag: 'UNKNOWN' };
const ingestRec = { fingerprint: { algo: 'x' }, pipeline: 'v4' };
const noSleep = () => new Promise((r) => setImmediate(r));

/** A file whose first sample is at delay(i, x) ms. */
function delayedFile(delay = () => DELAY) {
  const f = makeSegy({ ...shape, format: 5, amp: (i, x, s) => truth(i, x, delay(i, x) + DT * s) });
  const v = new DataView(f.buffer);
  for (let t = 0; t < f.traces; t++) {
    const i = Math.floor(t / shape.nXl); const x = t % shape.nXl;
    v.setInt16(3600 + t * f.traceBytes + 108, delay(i, x), false);
  }
  return f;
}
const scanFor = () => ({ ...scanOf({ ...shape, format: 5 }), dtUs: 4000, coordScalar: -100, corners: { first: null, last: null }, affine: null });

function storageMock() {
  const objects = new Map();
  return {
    objects,
    async upload(p, bytes, { upsert } = {}) { if (objects.has(p) && !upsert) return 'exists'; objects.set(p, new Uint8Array(bytes)); return 'uploaded'; },
    async list(dir) { const pre = `${dir}/`; return [...objects.keys()].filter((k) => k.startsWith(pre) && !k.slice(pre.length).includes('/')).map((k) => k.slice(pre.length)); },
  };
}
function adminMock({ dataset, volume }) {
  const tables = { qi_datasets: [dataset], seismic_volumes: [volume] };
  const builder = (table) => {
    const filters = []; let patch = null;
    const b = {
      select: () => b, update: (p) => { patch = p; return b; }, eq: (c, v) => { filters.push([c, v]); return b; },
      maybeSingle: async () => ({ data: tables[table].find((r) => filters.every(([c, v]) => r[c] === v)) || null, error: null }),
      then: (resolve) => { tables[table].filter((r) => filters.every(([c, v]) => r[c] === v)).forEach((r) => Object.assign(r, patch)); resolve({ error: null }); },
    };
    return b;
  };
  return { tables, from: builder, rpc: async (fn) => ({ data: fn.startsWith('seismic_storage_quota_bytes') ? 20 * 1024 ** 3 : 0, error: null }) };
}

let scratch;
beforeAll(() => { scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'delay-v4-')); });
afterAll(() => fs.rmSync(scratch, { recursive: true, force: true }));

async function serverRun(buffer, extraParams, scanParam) {
  const storage = storageMock();
  const admin = adminMock({
    dataset: { id: DS, user_id: UID, status: 'uploaded', bucket: 'seismic-raw', object_key: 'k', bytes: buffer.byteLength, original_filename: 'delayed.sgy' },
    volume: { id: VOL, user_id: UID, status: 'converting', name: 'Delayed' },
  });
  const ctx = {
    job: { id: 'j', attempt: 1, user_id: UID }, progress: () => {}, cancelled: false, log: console,
    params: { dataset_id: DS, volume_id: VOL, name: 'Delayed', file_name: 'delayed.sgy', scan: scanParam, crs_plan: crsPlan, custom_defs: {}, ingest_rec: ingestRec, ...extraParams },
  };
  await stackToV4(ctx, { admin, storage, scratchDir: scratch, codec: ZLIB, convertOptions: CONVERT, makeReader: () => bufferReader(buffer) });
  return { storage, row: admin.tables.seismic_volumes[0] };
}

async function browserRun({ buffer, scan, crop = null, traceDelay = null }) {
  const storage = storageMock();
  const rows = new Map();
  const m = createImportJobManager({
    prepare: async () => { rows.set(VOL, { id: VOL, status: V4_STATUS.CONVERTING }); return { volumeId: VOL, userId: UID, name: 'Delayed', ingestRec, crsPlan, customDefs: {} }; },
    updateRow: async (id, patch) => { rows.set(id, { ...rows.get(id), ...patch }); return rows.get(id); },
    getRow: async (id) => rows.get(id) || null,
    openSpool: async () => memorySpool(), listSpools: async () => [], removeSpool: async () => {},
    // the conversion worker's own reader (workers/convertV4.worker.js)
    convert: async ({ spool, onProgress, crop: c, scan: s, delayShift }) => {
      const reader = await conversionSourceReader(bufferReader(buffer), c, delayShift);
      return convertToSpool({ reader, scan: s, spool, codec: ZLIB, ...CONVERT, onProgress });
    },
    storage,
    uploadOptions: { network: { isOnline: () => true, onOnline: () => () => {} }, sleep: noSleep },
  });
  const { done } = await m.start({ file: { name: 'delayed.sgy', size: buffer.byteLength }, mapping: MAP, scan, crop, traceDelay });
  await done;
  return { storage, row: rows.get(VOL) };
}

const manifestOf = (st) => JSON.parse(new TextDecoder().decode(st.objects.get(`${UID}/${VOL}/manifest.json`)));
async function valueAt(st, i, j, k) {
  const bytes = st.objects.get(`${UID}/${VOL}/v4/f/${Math.floor(i / B)}-${Math.floor(j / B)}-${Math.floor(k / B)}.f32z`);
  const f = await decodeF32Brick(bytes, ZLIB);
  return f[((i % B) * B + (j % B)) * B + (k % B)];
}
/** Every kept sample m equals truth(4m) at its inline and crossline; above `firstLive`, nulls. */
async function assertOnTrueAxis(st, { ns, firstLive, il0 = 0, xl0 = 0, nIl, nXl }) {
  expect(manifestOf(st).geometry.ns).toBe(ns);
  let checked = 0;
  for (let i = 0; i < nIl; i += 3) for (let j = 0; j < nXl; j += 3) for (let k = 0; k < ns; k++) {
    const v = await valueAt(st, i, j, k);
    if (k < firstLive) { expect(Math.abs(v)).toBeGreaterThanOrEqual(1e29); continue; }
    expect(v).toBe(truth(i + il0, j + xl0, DT * k));
    checked += 1;
  }
  return checked;
}

describe('a 40 ms trace delay: every path stores the samples at their true times', () => {
  const fix = delayedFile();
  const raw = () => bufferReader(fix.buffer);
  let server;
  beforeAll(async () => { server = await serverRun(fix.buffer, {}, scanFor()); });

  test('server upload: 10 nulls above, then truth(4m), from a stale preview scan', async () => {
    const n = await assertOnTrueAxis(server.storage, { ns: 71, firstLive: 10, nIl: 12, nXl: 10 });
    expect(n).toBe(4 * 4 * 61);
    const m = manifestOf(server.storage);
    expect(m.source.trace_delay).toMatchObject({ delay_ms: 40, applied: true, shift_samples: 10, applied_ms: 40, residual_ms: 0 });
    expect(server.row.survey_meta.ingest.trace_delay.applied).toBe(true);
  });

  test('negative control: the file converted as read before F-5 stores truth(4m + 40)', async () => {
    const { reader } = await openSegyDoor(raw());
    const spool = memorySpool();
    await convertToSpool({ reader, scan: scanFor(), spool, codec: ZLIB, ...CONVERT });
    const unshifted = server.storage.objects.get(`${UID}/${VOL}/v4/f/0-0-2.f32z`);
    const key = (await spool.keys()).find((k) => k.endsWith('0-0-2.f32z'));
    // volume sample 20 (80 ms): the shifted volume holds truth(80); the old conversion truth(120)
    const f = await decodeF32Brick(unshifted, ZLIB);
    const g = await decodeF32Brick(await spool.get(key), ZLIB);
    expect(f[4]).toBe(truth(0, 0, 80));
    expect(g[4]).toBe(truth(0, 0, 120));
    expect(g[4]).not.toBe(f[4]);
    const { traceDelay } = await alignTraceDelay(reader);
    expect(traceDelay.note).toMatch(/first sample is at 40 ms/);
  });

  test('browser background import: the same bricks as the server', async () => {
    const { reader } = await openSegyDoor(raw());
    const { reader: aligned, traceDelay } = await alignTraceDelay(reader);
    const scan = await scanOnReader(scanFor(), aligned);
    expect(scan.ns).toBe(71);
    const b = await browserRun({ buffer: fix.buffer, scan, traceDelay });
    const keys = [...server.storage.objects.keys()].filter((k) => !k.endsWith('manifest.json')).sort();
    expect([...b.storage.objects.keys()].filter((k) => !k.endsWith('manifest.json')).sort()).toEqual(keys);
    for (const k of keys) expect(Buffer.compare(Buffer.from(b.storage.objects.get(k)), Buffer.from(server.storage.objects.get(k)))).toBe(0);
    expect(manifestOf(b.storage).source.trace_delay.shift_samples).toBe(10);
  });

  describe('crop by a window in true times (100 to 180 ms) with the delay', () => {
    const DEF = { name: 'Pilot', il: { from: 103, to: 110 }, xl: { from: 202, to: 208 }, window: { from: 100, to: 180 } };
    let prep; let link; let upload; let browser; let croppedBytes;
    beforeAll(async () => {
      prep = await planImportCrop({ raw: raw(), scan: scanFor(), def: DEF, mapping: MAP });
      const cropped = cropSource(raw(), prep, { sourceName: 'delayed.sgy', mapping: MAP });
      croppedBytes = (await cropped.read(0, cropped.size)).slice(0);
      const convScan = { ...(await scanConversionView(await conversionView(cropped, prep.crop), MAP)), coordScalar: -100, corners: { first: null, last: null }, affine: null };
      const provenance = importCropProvenance(prep, { file: { name: 'delayed.sgy', size: fix.buffer.byteLength }, mode: 'browser' });
      link = await serverRun(fix.buffer, { crop: { def: DEF } }, scanFor());
      upload = await serverRun(croppedBytes, { pad_top_samples: prep.crop.samples.first, crop_provenance: { ...provenance, mode: 'upload' } }, convScan);
      browser = await browserRun({ buffer: fix.buffer, scan: convScan, crop: { request: cropRequest(prep, 'delayed.sgy', MAP), provenance, bytes: croppedBytes.byteLength } });
    });

    test('the window keeps file samples 15 to 35 (40 + 4k ms = 100 to 180)', () => {
      expect(prep.crop.samples).toEqual({ first: 15, last: 35, count: 21 });
      expect(prep.crop.window).toEqual({ from: 100, to: 180 });
      expect(prep.traceDelay).toMatchObject({ applied: true, shift_samples: 10 });
      // the cropped file's delay is the window's top: 40 + 15 x 4
      expect(new DataView(croppedBytes, 3600 + 108, 2).getInt16(0, false)).toBe(100);
    });

    test('the preview scan\'s survey (the dialog\'s) gives the same crop as reading the first traces', async () => {
      const { reader } = await openSegyDoor(raw());
      const { traceDelay } = await alignTraceDelay(reader);
      const withSurvey = await planImportCrop({ raw: raw(), scan: { ...scanFor(), door: { traceDelay } }, def: DEF, mapping: MAP });
      expect(withSurvey.crop).toEqual(prep.crop);
      expect(withSurvey.traceDelay).toBe(traceDelay);
      // a depth import reads the window from 0
      const depth = await planImportCrop({ raw: raw(), scan: scanFor(), def: { ...DEF, window: { from: 60, to: 140 } }, mapping: MAP, dtUs: 4000 });
      expect(depth.crop.samples.first).toBe(15);
      expect(depth.traceDelay).toBeNull();
    });

    test('link: 25 nulls, then truth(4m) to 180 ms', async () => {
      await assertOnTrueAxis(link.storage, { ns: 46, firstLive: 25, il0: 3, xl0: 2, nIl: 8, nXl: 7 });
      const m = manifestOf(link.storage);
      expect(m.source.crop).toMatchObject({ window: { from: 100, to: 180 }, samples: { first: 15, last: 35, count: 21 } });
      expect(m.source.crop.trace_delay.applied_ms).toBe(40);
      expect(m.source.crop.trace_delay).toMatchObject({ delay_ms: 40, shift_samples: 10 });
      expect(m.source.trace_delay.delay_ms).toBe(40);
    });

    test('upload and browser crop store the identical bricks', () => {
      const keys = [...link.storage.objects.keys()].filter((k) => !k.endsWith('manifest.json')).sort();
      for (const other of [upload, browser]) {
        expect([...other.storage.objects.keys()].filter((k) => !k.endsWith('manifest.json')).sort()).toEqual(keys);
        for (const k of keys) expect(Buffer.compare(Buffer.from(other.storage.objects.get(k)), Buffer.from(link.storage.objects.get(k)))).toBe(0);
      }
      expect(manifestOf(upload.storage).source.trace_delay.delay_ms).toBe(40);
    });

    test('the crop card is still checked: a pad that disagrees is refused', async () => {
      await expect(serverRun(croppedBytes, { pad_top_samples: 14 }, scanFor())).rejects.toMatchObject({ stage: 'validate_failed' });
    });
  });
});

test('a negative delay (-20 ms): the 5 samples before 0 ms are dropped', async () => {
  const fix = delayedFile(() => -20);
  const st = await serverRun(fix.buffer, {}, scanFor());
  expect(manifestOf(st.storage).geometry.ns).toBe(56);
  for (let k = 0; k < 56; k += 5) expect(await valueAt(st.storage, 2, 3, k)).toBe(truth(2, 3, DT * k));
  expect(manifestOf(st.storage).source.trace_delay).toMatchObject({ delay_ms: -20, shift_samples: -5 });
});

test('delays that differ between traces are not applied, and the volume says so', async () => {
  const fix = delayedFile((i) => (i < 6 ? 40 : 48));
  const st = await serverRun(fix.buffer, {}, scanFor());
  const m = manifestOf(st.storage);
  expect(m.geometry.ns).toBe(61);
  expect(m.source.trace_delay).toMatchObject({ applied: false, uniform: false, range_ms: [40, 48] });
  expect(m.source.trace_delay.note).toMatch(/differ between traces/);
  expect(await valueAt(st.storage, 0, 0, 0)).toBe(truth(0, 0, 40)); // as read, at 0 ms
});

test('a depth import does not move its samples', async () => {
  const fix = delayedFile();
  const st = await serverRun(fix.buffer, { ingest_rec: { ...ingestRec, vertical: { domain: 'depth', unit: 'm', dz: 4 } } }, scanFor());
  expect(manifestOf(st.storage).geometry.ns).toBe(61);
  expect(manifestOf(st.storage).source.trace_delay).toMatchObject({ applied: false });
});

test('gathers: a 40 ms delay puts each trace on the true axis of the stacks', async () => {
  const NS = 30;
  const traces = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (const o of [100, 300]) {
    traces.push({ il: 100 + i, xl: 200 + j, x: 431000 + 25 * j, y: 6512000 + 25 * i, offset: o, samples: Array.from({ length: NS }, (_, s) => truth(i, j, DELAY + DT * s) + o / 100) });
  }
  const bytes = writeSegy({ lines: ['delayed gathers'], dtUs: 4000, ns: NS, traces });
  const dv = new DataView(bytes.buffer, bytes.byteOffset);
  for (let t = 0; t < traces.length; t++) dv.setInt16(3600 + t * (240 + NS * 4) + 108, DELAY, false);
  const objects = new Map(); const inserts = [];
  const ROW = { id: DS, user_id: UID, status: 'uploaded', kind: 'segy_upload', name: 'g', original_filename: 'g.sgy', bucket: 'seismic-raw', object_key: 'k' };
  const out = await ingestGathers({ params: { dataset_id: DS, bin_width_m: 200, cb: 4 }, job: { id: 'g', user_id: UID }, progress: () => {}, cancelled: false }, {
    admin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: ROW, error: null }) }) }), insert: async (r) => { inserts.push(r); return { error: null }; } }), rpc: async () => ({ data: 0, error: null }) },
    sign: async (m, b, k) => `https://store/${b}/${k}?m=${m}`,
    fetchImpl: async (url, init) => { if (init.method === 'PUT') objects.set(new URL(url).pathname.slice(1).split('/').slice(1).join('/'), new Uint8Array(init.body)); return { ok: true, status: 200 }; },
    makeReader: () => ({ size: bytes.length, read: async (o, n) => bytes.slice(o, o + n).buffer }),
    newId: () => VOL, workBucket: 'seismic-work',
  });
  const prefix = `gathers/${UID}/${VOL}`;
  const manifest = JSON.parse(new TextDecoder().decode(objects.get(`${prefix}/manifest.json`)));
  expect(manifest.geometry.ns).toBe(NS + 10);
  expect(manifest.source.trace_delay).toMatchObject({ delay_ms: 40, shift_samples: 10 });
  const block = new Float32Array(objects.get(`${prefix}/gathers/0-0.f32`).slice().buffer);
  const fold = new Uint16Array(objects.get(`${prefix}/gathers/0-0.fold.u16`).slice().buffer);
  const g = readGather(block, fold, { cb: 4, nBins: out.bins.count, ns: NS + 10 }, 1, 2);
  // the store's bin sums read nulls as 0 (gatherStore.blockBuilder), as for a cropped window's top
  for (let k = 0; k < 10; k++) expect(g.traces[0][k]).toBe(0);
  for (let k = 10; k < NS + 10; k++) expect(g.traces[0][k]).toBe(Math.fround(truth(1, 2, DT * k) + 1));
});
