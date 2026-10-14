/**
 * @jest-environment node
 */
// Depth-domain import (QI upgrade P1.6, 2026-10-15): a depth declaration on
// the ingest record reaches the manifest (geometry.vertical, dt_us = the
// declared interval x 1000) and the row's survey_meta on both the browser
// and the server path, identically; the bricks are the time import's; a time
// import carries no vertical block (negative control).
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

async function serverRun(buffer = fix.buffer, admin = adminMock({ dataset: goodDataset(), volume: goodVolume() }), rec = ingestRec) {
  const storage = storageMock();
  const result = await stackToV4(ctxFor({ params: { ...params(), ingest_rec: rec } }), {
    admin, storage, scratchDir: scratch, codec: ZLIB, convertOptions: CONVERT,
    makeReader: () => bufferReader(buffer),
  });
  return { storage, admin, result };
}

async function browserRun(rec = ingestRec) {
  const storage = storageMock();
  const rows = new Map();
  const m = createImportJobManager({
    prepare: async () => {
      rows.set(VOL, { id: VOL, status: V4_STATUS.CONVERTING });
      return { volumeId: VOL, userId: UID, name: 'Parity survey', ingestRec: rec, crsPlan, customDefs: {} };
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


const DEPTH = { domain: 'depth', unit: 'm', dz: 12.5, values: { kind: 'velocity', type: 'interval', unit: 'm/s' } };
const depthRec = { ...ingestRec, vertical: DEPTH };

describe('depth-domain import', () => {
  let timeServer; let depthServer; let depthBrowser;
  beforeAll(async () => {
    timeServer = await serverRun();
    depthServer = await serverRun(fix.buffer, adminMock({ dataset: goodDataset(), volume: goodVolume() }), depthRec);
    depthBrowser = await browserRun(depthRec);
  });

  test('the manifest carries the declared depth axis on the server path', () => {
    const m = manifestOf(depthServer.storage);
    expect(m.geometry.vertical).toEqual(DEPTH);
    expect(m.geometry.dt_us).toBe(12500);
  });

  test('browser and server write the same manifest and survey_meta for a depth volume', () => {
    const strip = (m) => { const c = structuredClone(m); delete c.transcode?.peakBytes; delete c.transcode?.passesPerBand; return c; };
    expect(strip(manifestOf(depthServer.storage))).toEqual(strip(manifestOf(depthBrowser.storage)));
    const row = depthServer.admin.tables.seismic_volumes[0];
    expect(row.survey_meta.vertical).toEqual(DEPTH);
    expect(row.survey_meta.dt_us).toBe(12500);
    expect(row.survey_meta).toEqual(depthBrowser.row.survey_meta);
  });

  test('the bricks are the time import\'s: only the axis is declared', () => {
    for (const [key, bytes] of timeServer.storage.objects) {
      if (key.endsWith('manifest.json')) continue;
      expect([key, same(depthServer.storage.objects.get(key), bytes)]).toEqual([key, true]);
    }
  });

  test('negative control: a time import carries no vertical block and keeps the header interval', () => {
    const m = manifestOf(timeServer.storage);
    expect(m.geometry.vertical).toBeUndefined();
    expect(m.geometry.dt_us).toBe(4000);
    expect(timeServer.admin.tables.seismic_volumes[0].survey_meta.vertical).toBeUndefined();
  });
});
