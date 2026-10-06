/**
 * @jest-environment node
 */
// stack_to_v4 (QI programme Q0): the server conversion must store exactly
// what the browser import stores. Both paths run on one SEG-Y fixture with
// the same codec: the browser's import job manager (importJobs.js) and the
// worker handler. Every stored object, the manifest and the row transitions
// are compared; a one-sample change to the server's input is the negative
// control. Then the handler's own guards: ownership, state, quota, cancel.
import zlib from 'node:zlib';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { TextEncoder, TextDecoder } from 'node:util';
import { stackToV4, validateParams } from '../src/handlers/stackToV4.js';
import { createImportJobManager, V4_STATUS } from '../../../src/pages/apps/Seismolord/services/importJobs';
import { memorySpool } from '../../../src/pages/apps/Seismolord/services/brickSpool';
import { convertToSpool } from '../../../src/pages/apps/Seismolord/services/conversionV4';
import { openSegyDoor } from '../../../src/pages/apps/Seismolord/lib/segyDoor';
import { bufferReader } from '../../../packages/engines/engines/seismolord/reader';
import { DEFLATE_RAW } from '../../../packages/engines/engines/seismolord/brickCodecV4';
import { NULL_VALUE } from '../../../packages/engines/engines/seismolord/manifest';
import { makeSegy, scanOf } from '../../../packages/engines/__tests__/seismolordSegyFixture';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
if (!global.TextEncoder) global.TextEncoder = TextEncoder;
if (!global.TextDecoder) global.TextDecoder = TextDecoder;
jest.setTimeout(60000);

const ZLIB = {
  compression: DEFLATE_RAW,
  deflate: async (b) => new Uint8Array(zlib.deflateRawSync(b)),
  inflate: async (b) => new Uint8Array(zlib.inflateRawSync(b)),
};
const CONVERT = { brickSize: 8, levels: 2 };
const UID = '11111111-1111-4111-8111-111111111111';
const VOL = '22222222-2222-4222-8222-222222222222';
const DS = '33333333-3333-4333-8333-333333333333';
const shape = { nIl: 21, nXl: 13, ns: 37 };
const amp = (il, xl, s) => (il === 2 && xl === 3 ? NULL_VALUE : 800 * Math.sin(0.3 * s + 0.1 * il + 0.05 * xl));
const fix = makeSegy({ ...shape, amp });
const scan = { ...scanOf(shape), dtUs: 4000, coordScalar: -100, corners: { first: null, last: null }, affine: null };
const crsPlan = { needsTransform: false, storeTag: 'UNKNOWN' };
const ingestRec = { fingerprint: { algo: 'x' }, pipeline: 'v4' };
const noSleep = () => new Promise((r) => setImmediate(r));

function storageMock() {
  const objects = new Map();
  return {
    objects,
    async upload(p, bytes, { upsert } = {}) {
      if (objects.has(p) && !upsert) return 'exists';
      objects.set(p, new Uint8Array(bytes));
      return 'uploaded';
    },
    async list(dir) {
      const pre = `${dir}/`;
      return [...objects.keys()].filter((k) => k.startsWith(pre) && !k.slice(pre.length).includes('/')).map((k) => k.slice(pre.length));
    },
  };
}

// Supabase double for the handler: rows by table, row patches logged, RPCs.
function adminMock({ dataset, volume, used = 0, quota = 20 * 1024 ** 3 }) {
  const tables = { qi_datasets: dataset ? [dataset] : [], seismic_volumes: volume ? [volume] : [] };
  const patches = [];
  const builder = (table) => {
    const filters = [];
    let patch = null;
    const b = {
      select: () => b,
      update: (p) => { patch = p; return b; },
      eq: (col, val) => { filters.push([col, val]); return b; },
      maybeSingle: async () => ({ data: tables[table].find((r) => filters.every(([c, v]) => r[c] === v)) || null, error: null }),
      then: (resolve) => {
        const hits = tables[table].filter((r) => filters.every(([c, v]) => r[c] === v));
        hits.forEach((r) => { Object.assign(r, patch); patches.push({ table, ...patch }); });
        resolve({ error: null });
      },
    };
    return b;
  };
  return {
    patches,
    tables,
    from: builder,
    rpc: async (fn) => ({ data: fn.startsWith('seismic_storage_quota_bytes') ? quota : used, error: null }),
  };
}

const goodDataset = () => ({ id: DS, user_id: UID, status: 'uploaded', bucket: 'seismic-raw', object_key: `${UID}/${DS}/survey.sgy`, bytes: fix.buffer.byteLength, original_filename: 'survey.sgy' });
const goodVolume = () => ({ id: VOL, user_id: UID, status: 'converting', name: 'Parity survey' });
const params = () => ({ dataset_id: DS, volume_id: VOL, name: 'Parity survey', file_name: 'survey.sgy', scan, crs_plan: crsPlan, custom_defs: {}, ingest_rec: ingestRec });
const ctxFor = (over = {}) => ({ job: { id: 'job-1', attempt: 1, user_id: UID }, params: params(), progress: () => {}, cancelled: false, log: console, ...over });

let scratch;
beforeAll(() => { scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'stack-to-v4-')); });
afterAll(() => fs.rmSync(scratch, { recursive: true, force: true }));

async function serverRun(buffer = fix.buffer, admin = adminMock({ dataset: goodDataset(), volume: goodVolume() })) {
  const storage = storageMock();
  const result = await stackToV4(ctxFor(), {
    admin, storage, scratchDir: scratch, codec: ZLIB, convertOptions: CONVERT,
    makeReader: () => bufferReader(buffer),
  });
  return { storage, admin, result };
}

async function browserRun() {
  const storage = storageMock();
  const rows = new Map();
  const m = createImportJobManager({
    prepare: async () => {
      rows.set(VOL, { id: VOL, status: V4_STATUS.CONVERTING });
      return { volumeId: VOL, userId: UID, name: 'Parity survey', ingestRec, crsPlan, customDefs: {} };
    },
    updateRow: async (id, patch) => { rows.set(id, { ...rows.get(id), ...patch }); return rows.get(id); },
    getRow: async (id) => rows.get(id) || null,
    openSpool: async () => memorySpool(),
    listSpools: async () => [],
    removeSpool: async () => {},
    // as the browser's conversion worker does: the door reader, then convertToSpool
    convert: async ({ spool, onProgress }) => {
      const { reader } = await openSegyDoor(bufferReader(fix.buffer));
      return convertToSpool({ reader, scan, spool, codec: ZLIB, ...CONVERT, onProgress });
    },
    storage,
    uploadOptions: { network: { isOnline: () => true, onOnline: () => () => {} }, sleep: noSleep },
  });
  const { done } = await m.start({ file: { name: 'survey.sgy', size: fix.buffer.byteLength }, mapping: {}, scan });
  await done;
  return { storage, row: rows.get(VOL) };
}

const manifestOf = (storage) => JSON.parse(new TextDecoder().decode(storage.objects.get(`${UID}/${VOL}/manifest.json`)));
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

describe('stack_to_v4 parity with the browser import', () => {
  let browser;
  let server;
  beforeAll(async () => {
    browser = await browserRun();
    server = await serverRun();
  });

  test('stores the same set of objects', () => {
    expect([...server.storage.objects.keys()].sort()).toEqual([...browser.storage.objects.keys()].sort());
    expect(server.storage.objects.size).toBeGreaterThan(10);
  });

  test('every brick is byte-identical', () => {
    for (const [key, bytes] of browser.storage.objects) {
      if (key.endsWith('manifest.json')) continue;
      expect([key, same(server.storage.objects.get(key), bytes)]).toEqual([key, true]);
    }
  });

  test('the manifest is identical (apart from the conversion memory figures)', () => {
    const strip = (m) => { const c = structuredClone(m); delete c.transcode?.peakBytes; delete c.transcode?.passesPerBand; return c; };
    expect(strip(manifestOf(server.storage))).toEqual(strip(manifestOf(browser.storage)));
    expect(manifestOf(server.storage).f32.complete).toBe(true);
  });

  test('the row ends ready with the same survey_meta', () => {
    const row = server.admin.tables.seismic_volumes[0];
    expect(row.status).toBe('ready');
    expect(row.survey_meta).toEqual(browser.row.survey_meta);
    expect(server.admin.patches.map((p) => p.status)).toEqual(['display_ready', 'ready']);
    expect(server.result).toMatchObject({ volume_id: VOL, trace_count: shape.nIl * shape.nXl });
  });

  test('negative control: one changed sample in the input changes the stored bricks', async () => {
    const buf = fix.buffer.slice(0);
    const view = new DataView(buf);
    const pos = 3600 + 240 + 4 * 10; // first trace, sample 10 (IEEE format fixture)
    view.setFloat32(pos, view.getFloat32(pos, false) + 123.5, false);
    const tampered = await serverRun(buf);
    const differs = [...browser.storage.objects].some(([k, b]) => !k.endsWith('manifest.json') && !same(tampered.storage.objects.get(k), b));
    expect(differs).toBe(true);
  });
});

describe('stack_to_v4 guards', () => {
  test('settings are validated', () => {
    expect(validateParams(params())).toBeNull();
    expect(validateParams({ ...params(), volume_id: 'nope' })).toMatch(/volume_id/);
    expect(validateParams({ ...params(), scan: null })).toMatch(/scan/);
  });

  test("another user's upload is refused before anything is read", async () => {
    const admin = adminMock({ dataset: { ...goodDataset(), user_id: 'someone-else' }, volume: goodVolume() });
    await expect(serverRun(fix.buffer, admin)).rejects.toMatchObject({ stage: 'not_found' });
  });

  test("another user's volume is refused", async () => {
    const admin = adminMock({ dataset: goodDataset(), volume: { ...goodVolume(), user_id: 'someone-else' } });
    await expect(serverRun(fix.buffer, admin)).rejects.toMatchObject({ stage: 'not_found' });
  });

  test('a volume that is already ready is not overwritten', async () => {
    const admin = adminMock({ dataset: goodDataset(), volume: { ...goodVolume(), status: 'ready' } });
    await expect(serverRun(fix.buffer, admin)).rejects.toMatchObject({ stage: 'validate_failed' });
  });

  test('over quota: refused with the figures, and nothing is uploaded', async () => {
    const admin = adminMock({ dataset: goodDataset(), volume: goodVolume(), used: 20 * 1024 ** 3 - 10, quota: 20 * 1024 ** 3 });
    const storage = storageMock();
    await expect(stackToV4(ctxFor(), { admin, storage, scratchDir: scratch, codec: ZLIB, convertOptions: CONVERT, makeReader: () => bufferReader(fix.buffer) }))
      .rejects.toMatchObject({ stage: 'over_quota' });
    expect(storage.objects.size).toBe(0);
    expect(admin.patches).toEqual([]);
  });

  test('a cancel during conversion stops before anything is uploaded or the row changes', async () => {
    const admin = adminMock({ dataset: goodDataset(), volume: goodVolume() });
    const storage = storageMock();
    const ctx = ctxFor();
    let calls = 0;
    ctx.progress = () => { calls += 1; if (calls > 2) ctx.cancelled = true; };
    const out = await stackToV4(ctx, { admin, storage, scratchDir: scratch, codec: ZLIB, convertOptions: CONVERT, makeReader: () => bufferReader(fix.buffer) })
      .catch((e) => e);
    expect(out === null || /cancel/i.test(out?.message)).toBe(true);
    expect(storage.objects.size).toBe(0);
    expect(admin.patches).toEqual([]);
  });

  test('the scratch spool is removed afterwards', () => {
    expect(fs.readdirSync(scratch)).toEqual([]);
  });
});
