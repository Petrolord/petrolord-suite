/**
 * @jest-environment node
 */
// ZGY import, phase B (2026-10-16): the worker reads an uploaded ZGY itself.
// The browser import of a ZGY (the conversion worker's steps: the SEG-Y view,
// the clip of a compressed file, convertToSpool) and stack_to_v4 on the raw
// ZGY bytes must store exactly the same objects, for an int8 and a ZFP
// compressed file; scan_dataset must scan a ZGY as the browser's scan worker
// does. A legacy Petrel compressed ZGY fails with the re-export advice, and
// the gathers job refuses a ZGY. Negative control: one changed byte in a
// stored brick changes the stored bricks.
import zlib from 'node:zlib';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { TextEncoder, TextDecoder } from 'node:util';
import { stackToV4 } from '../src/handlers/stackToV4.js';
import { scanDataset } from '../src/handlers/scanDataset.js';
import { ingestGathers } from '../src/handlers/ingestGathers.js';
import { zgySignature } from '../src/zgySource.js';
import { createImportJobManager, V4_STATUS } from '../../../src/pages/apps/Seismolord/services/importJobs';
import { memorySpool } from '../../../src/pages/apps/Seismolord/services/brickSpool';
import { convertToSpool } from '../../../src/pages/apps/Seismolord/services/conversionV4';
import { conversionSourceReader } from '../../../src/pages/apps/Seismolord/services/cropImport';
import { importSourceReader, sourceClip } from '../../../src/pages/apps/Seismolord/services/zgySource';
import { openSegyDoor } from '../../../src/pages/apps/Seismolord/lib/segyDoor';
import { scanGeometry } from '../../../packages/engines/engines/seismolord/segyScan';
import { bufferReader } from '../../../packages/engines/engines/seismolord/reader';
import { openZgy } from '../../../packages/engines/engines/seismolord/zgy';
import { DEFLATE_RAW } from '../../../packages/engines/engines/seismolord/brickCodecV4';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
if (!global.TextEncoder) global.TextEncoder = TextEncoder;
if (!global.TextDecoder) global.TextDecoder = TextDecoder;
jest.setTimeout(120000);

const ZLIB = {
  compression: DEFLATE_RAW,
  deflate: async (b) => new Uint8Array(zlib.deflateRawSync(b)),
  inflate: async (b) => new Uint8Array(zlib.inflateRawSync(b)),
};
const CONVERT = { brickSize: 16, levels: 2 };
const UID = '11111111-1111-4111-8111-111111111111';
const VOL = '22222222-2222-4222-8222-222222222222';
const DS = '33333333-3333-4333-8333-333333333333';
const crsPlan = { needsTransform: false, storeTag: 'UNKNOWN' };
const ingestRec = { fingerprint: { algo: 'x' }, pipeline: 'v4' };
const noSleep = () => new Promise((r) => setImmediate(r));
const FIX = path.join(__dirname, '../../../packages/engines/test-data/seismolord/zgy');
const zgyBytes = (name) => {
  const b = zlib.gunzipSync(fs.readFileSync(path.join(FIX, `${name}.zgy.gz`)));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
const fileOf = (buf, name) => ({ name, size: buf.byteLength, lastModified: 1, slice: (a, b) => ({ arrayBuffer: async () => buf.slice(a, b) }) });

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

function adminMock({ dataset, volume }) {
  const tables = { qi_datasets: dataset ? [dataset] : [], seismic_volumes: volume ? [volume] : [] };
  const builder = (table) => {
    const filters = [];
    let patch = null;
    const b = {
      select: () => b,
      update: (p) => { patch = p; return b; },
      eq: (col, val) => { filters.push([col, val]); return b; },
      maybeSingle: async () => ({ data: tables[table].find((r) => filters.every(([c, v]) => r[c] === v)) || null, error: null }),
      then: (resolve) => {
        tables[table].filter((r) => filters.every(([c, v]) => r[c] === v)).forEach((r) => Object.assign(r, patch));
        resolve({ error: null });
      },
    };
    return b;
  };
  return { tables, from: builder, rpc: async (fn) => ({ data: fn.startsWith('seismic_storage_quota_bytes') ? 20 * 1024 ** 3 : 0, error: null }) };
}

const dataset = (bytes, name) => ({ id: DS, user_id: UID, status: 'uploaded', kind: 'segy_upload', bucket: 'seismic-raw', object_key: `${UID}/${DS}/${name}`, bytes, original_filename: name });

let scratch;
beforeAll(() => { scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'zgy-v4-')); });
afterAll(() => fs.rmSync(scratch, { recursive: true, force: true }));

/** The browser's scan worker on a picked ZGY. */
async function browserScan(buf, name) {
  const { reader } = await openSegyDoor(await importSourceReader(fileOf(buf, name)));
  return scanGeometry(reader, {}, { maxTraces: 20000 });
}

/** The browser import, as the conversion worker runs it on a picked ZGY. */
async function browserRun(buf, name, scan) {
  const storage = storageMock();
  const rows = new Map();
  const m = createImportJobManager({
    prepare: async () => {
      rows.set(VOL, { id: VOL, status: V4_STATUS.CONVERTING });
      return { volumeId: VOL, userId: UID, name: 'ZGY survey', ingestRec, crsPlan, customDefs: {} };
    },
    updateRow: async (id, patch) => { rows.set(id, { ...rows.get(id), ...patch }); return rows.get(id); },
    getRow: async (id) => rows.get(id) || null,
    openSpool: async () => memorySpool(),
    listSpools: async () => [],
    removeSpool: async () => {},
    convert: async ({ spool, onProgress }) => {
      const source = await importSourceReader(fileOf(buf, name));
      const clip = await sourceClip(source);
      const reader = await conversionSourceReader(source, null, 0);
      return convertToSpool({ reader, scan, spool, codec: ZLIB, ...CONVERT, ...(clip ? { clip } : {}), onProgress });
    },
    storage,
    uploadOptions: { network: { isOnline: () => true, onOnline: () => () => {} }, sleep: noSleep },
  });
  const { done } = await m.start({ file: { name, size: buf.byteLength }, mapping: {}, scan });
  await done;
  return { storage, row: rows.get(VOL) };
}

async function serverRun(buf, name, scan) {
  const storage = storageMock();
  const admin = adminMock({ dataset: dataset(buf.byteLength, name), volume: { id: VOL, user_id: UID, status: 'converting', name: 'ZGY survey' } });
  const ctx = {
    job: { id: 'job-z', attempt: 1, user_id: UID },
    params: { dataset_id: DS, volume_id: VOL, name: 'ZGY survey', file_name: name, scan, crs_plan: crsPlan, custom_defs: {}, ingest_rec: ingestRec },
    progress: () => {}, cancelled: false, log: console,
  };
  const result = await stackToV4(ctx, { admin, storage, scratchDir: scratch, codec: ZLIB, convertOptions: CONVERT, makeReader: () => bufferReader(buf) });
  return { storage, admin, result };
}

const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);
const manifestOf = (storage) => JSON.parse(new TextDecoder().decode(storage.objects.get(`${UID}/${VOL}/manifest.json`)));

describe.each([['gen-int8', 'legacy_int8.zgy'], ['gen-zfp-snr30', 'stack_zfp.zgy']])('%s: stack_to_v4 on the raw ZGY equals the browser import', (fixture, name) => {
  let buf; let scan; let browser; let server;
  beforeAll(async () => {
    buf = zgyBytes(fixture);
    scan = await browserScan(buf, name);
    browser = await browserRun(buf, name, scan);
    server = await serverRun(buf, name, scan);
  });

  test('the same objects, every brick byte-identical', () => {
    expect([...server.storage.objects.keys()].sort()).toEqual([...browser.storage.objects.keys()].sort());
    expect(server.storage.objects.size).toBeGreaterThan(10);
    for (const [key, bytes] of browser.storage.objects) {
      if (key.endsWith('manifest.json')) continue;
      expect([key, same(server.storage.objects.get(key), bytes)]).toEqual([key, true]);
    }
  });

  test('the same manifest and survey_meta; the row ends ready', () => {
    const strip = (m) => { const c = structuredClone(m); delete c.transcode?.peakBytes; delete c.transcode?.passesPerBand; delete c.source?.fileSize; delete c.source?.file_size; return c; };
    expect(strip(manifestOf(server.storage))).toEqual(strip(manifestOf(browser.storage)));
    const row = server.admin.tables.seismic_volumes[0];
    expect(row.status).toBe('ready');
    expect(row.survey_meta).toEqual(browser.row.survey_meta);
    expect(server.result.trace_count).toBe(66 * 70);
  });

  test('scan_dataset scans the stored ZGY as the browser scans it', async () => {
    const admin = adminMock({ dataset: dataset(buf.byteLength, name) });
    const ctx = { job: { id: 's', attempt: 1, user_id: UID }, params: { dataset_id: DS, mapping: {} }, progress: () => {} };
    const out = await scanDataset(ctx, { admin, makeReader: () => bufferReader(buf) });
    expect(out.scan.il).toEqual(scan.il);
    expect(out.scan.xl).toEqual(scan.xl);
    expect(out.scan.ns).toBe(scan.ns);
    expect(out.scan.corners).toEqual(scan.corners);
    expect(out.textLines.join('\n')).toMatch(/PETROLORD ZGY V1 SOURCE=/);
  });
});

test('negative control: one changed byte in a stored int8 brick changes the server bricks', async () => {
  const buf = zgyBytes('gen-int8');
  const scan = await browserScan(buf, 'a.zgy');
  const a = await serverRun(buf, 'a.zgy', scan);
  const t = new Uint8Array(buf.slice(0));
  const e = (await openZgy(bufferReader(buf))).entry(0, 0, 0);
  expect(e.status).toBe('normal');
  t[e.offset + (3 * 64 + 5) * 64 + 7] ^= 0x55; // inline 3, crossline 5, sample 7 of brick (0, 0, 0)
  const b = await serverRun(t.buffer, 'a.zgy', scan);
  const differs = [...a.storage.objects].some(([k, v]) => !k.endsWith('manifest.json') && !same(b.storage.objects.get(k), v));
  expect(differs).toBe(true);
  // the scratch copy of the ZGY and the spool are gone afterwards
  expect(fs.readdirSync(scratch)).toEqual([]);
});

test('a legacy Petrel compressed ZGY fails with the re-export advice; gathers refuse a ZGY', async () => {
  const u8 = new Uint8Array(zgyBytes('gen-int8'));
  u8.set([0x56, 0x43, 0x53, 0], 0);
  expect(await zgySignature(bufferReader(u8.buffer))).toBe('legacy');
  const admin = adminMock({ dataset: dataset(u8.byteLength, 'old.zgy') });
  const ctx = { job: { id: 's', attempt: 1, user_id: UID }, params: { dataset_id: DS, mapping: {} }, progress: () => {} };
  await expect(scanDataset(ctx, { admin, makeReader: () => bufferReader(u8.buffer) }))
    .rejects.toMatchObject({ stage: 'not_segy', message: expect.stringMatching(/export the volume as SEG-Y/) });
  const g = zgyBytes('gen-int8');
  const gAdmin = adminMock({ dataset: dataset(g.byteLength, 'v.zgy') });
  const gCtx = { job: { id: 'g', attempt: 1, user_id: UID }, params: { dataset_id: DS, mapping: {}, name: 'g' }, progress: () => {} };
  await expect(ingestGathers(gCtx, { admin: gAdmin, makeReader: () => bufferReader(g), sign: async () => '', fetchImpl: async () => ({}) }))
    .rejects.toMatchObject({ stage: 'validate_failed', message: expect.stringMatching(/ZGY volume/) });
});
