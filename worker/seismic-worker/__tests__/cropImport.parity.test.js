/**
 * @jest-environment node
 */
// Crop before upload (2026-10-14): the three ways a crop reaches a volume
// store the same thing, and that thing is the uncropped volume's own values
// inside the crop.
//   browser  the conversion worker reads only the crop of the local file
//   upload   the cropped SEG-Y is uploaded, stack_to_v4 pads its top back
//   link     the whole file is on the server, stack_to_v4 crops while reading
// Reference: an uncropped server conversion of the same file. Every kept
// trace and window sample of the cropped volume equals the reference at the
// same inline, crossline and time; above the window is null. Negative
// controls: a pad that disagrees with the file's crop card is refused, and a
// one-sample change in the source changes the cropped bricks.
import zlib from 'node:zlib';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { TextEncoder, TextDecoder } from 'node:util';
import { stackToV4 } from '../src/handlers/stackToV4.js';
import { createImportJobManager, V4_STATUS } from '../../../src/pages/apps/Seismolord/services/importJobs';
import { memorySpool } from '../../../src/pages/apps/Seismolord/services/brickSpool';
import { convertToSpool } from '../../../src/pages/apps/Seismolord/services/conversionV4';
import {
  planImportCrop, cropSource, conversionView, scanConversionView, cropRequest, cropConversionReader, importCropProvenance,
} from '../../../src/pages/apps/Seismolord/services/cropImport';
import { bufferReader } from '../../../packages/engines/engines/seismolord/reader';
import { DEFLATE_RAW, decodeF32Brick } from '../../../packages/engines/engines/seismolord/brickCodecV4';
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
const shape = { nIl: 26, nXl: 19, ns: 61, il0: 100, xl0: 200 };
const amp = (il, xl, s) => 700 * Math.sin(0.27 * s + 0.11 * il) * Math.cos(0.07 * xl + 0.02 * s) + il - xl;
const fix = makeSegy({ ...shape, amp, format: 1 });
const MAP = { ilByte: 189, xlByte: 193 };
const scan = { ...scanOf({ ...shape, format: 1 }), dtUs: 4000, coordScalar: -100, corners: { first: null, last: null }, affine: null };
const DEF = { name: 'Pilot area', il: { from: 104, to: 117 }, xl: { from: 203, to: 214 }, window: { from: 80, to: 180 } };
const crsPlan = { needsTransform: false, storeTag: 'UNKNOWN' };
const ingestRec = { fingerprint: { algo: 'x' }, pipeline: 'v4' };
const noSleep = () => new Promise((r) => setImmediate(r));

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
beforeAll(() => { scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'crop-v4-')); });
afterAll(() => fs.rmSync(scratch, { recursive: true, force: true }));

async function serverRun(buffer, extraParams, scanParam) {
  const storage = storageMock();
  const admin = adminMock({
    dataset: { id: DS, user_id: UID, status: 'uploaded', bucket: 'seismic-raw', object_key: 'k', bytes: buffer.byteLength, original_filename: 'stack.sgy' },
    volume: { id: VOL, user_id: UID, status: 'converting', name: 'Crop' },
  });
  const ctx = {
    job: { id: 'j', attempt: 1, user_id: UID }, progress: () => {}, cancelled: false, log: console,
    params: { dataset_id: DS, volume_id: VOL, name: 'Crop', file_name: 'stack.sgy', scan: scanParam, crs_plan: crsPlan, custom_defs: {}, ingest_rec: ingestRec, ...extraParams },
  };
  const result = await stackToV4(ctx, { admin, storage, scratchDir: scratch, codec: ZLIB, convertOptions: CONVERT, makeReader: () => bufferReader(buffer) });
  return { storage, row: admin.tables.seismic_volumes[0], result };
}

const manifestOf = (st) => JSON.parse(new TextDecoder().decode(st.objects.get(`${UID}/${VOL}/manifest.json`)));
async function valueAt(st, m, i, j, k) {
  const bytes = st.objects.get(`${UID}/${VOL}/v4/f/${Math.floor(i / B)}-${Math.floor(j / B)}-${Math.floor(k / B)}.f32z`);
  const f = await decodeF32Brick(bytes, ZLIB);
  return f[((i % B) * B + (j % B)) * B + (k % B)];
}

describe('crop before upload: three paths, one volume, the source values', () => {
  let prep; let reference; let browser; let upload; let link; let convScan; let croppedBytes;
  beforeAll(async () => {
    const raw = bufferReader(fix.buffer);
    prep = await planImportCrop({ raw, scan, def: DEF, mapping: MAP });
    const cropped = cropSource(raw, prep, { sourceName: 'stack.sgy', mapping: MAP });
    croppedBytes = (await cropped.read(0, cropped.size)).slice(0);
    convScan = { ...(await scanConversionView(await conversionView(cropped, prep.crop), MAP)), coordScalar: -100, corners: { first: null, last: null }, affine: null };
    const provenance = importCropProvenance(prep, { file: { name: 'stack.sgy', size: fix.buffer.byteLength }, mode: 'browser' });

    reference = await serverRun(fix.buffer, {}, scan);
    upload = await serverRun(croppedBytes, { pad_top_samples: prep.crop.samples.first, crop_provenance: { ...provenance, mode: 'upload' } }, convScan);
    link = await serverRun(fix.buffer, { crop: { def: DEF } }, scan);

    // the browser: importJobs with the conversion worker's reader
    const storage = storageMock();
    const rows = new Map();
    const m = createImportJobManager({
      prepare: async () => { rows.set(VOL, { id: VOL, status: V4_STATUS.CONVERTING }); return { volumeId: VOL, userId: UID, name: 'Crop', ingestRec, crsPlan, customDefs: {} }; },
      updateRow: async (id, patch) => { rows.set(id, { ...rows.get(id), ...patch }); return rows.get(id); },
      getRow: async (id) => rows.get(id) || null,
      openSpool: async () => memorySpool(), listSpools: async () => [], removeSpool: async () => {},
      convert: async ({ spool, onProgress, crop, scan: s }) => {
        const reader = await cropConversionReader(bufferReader(fix.buffer), crop);
        return convertToSpool({ reader, scan: s, spool, codec: ZLIB, ...CONVERT, onProgress });
      },
      storage,
      uploadOptions: { network: { isOnline: () => true, onOnline: () => () => {} }, sleep: noSleep },
    });
    const { done } = await m.start({
      file: { name: 'stack.sgy', size: fix.buffer.byteLength }, mapping: MAP, scan: convScan,
      crop: { request: cropRequest(prep, 'stack.sgy', MAP), provenance, bytes: croppedBytes.byteLength },
    });
    await done;
    browser = { storage, row: rows.get(VOL) };
  });

  test('only the crop is uploaded: a valid SEG-Y a fraction of the source', () => {
    expect(prep.plan.keptTraces).toBe(14 * 12);
    expect(croppedBytes.byteLength).toBe(3600 + 168 * (240 + 26 * 4));
    expect(croppedBytes.byteLength / fix.buffer.byteLength).toBeLessThan(0.3);
  });

  test('the three paths store identical bricks', () => {
    const keys = [...browser.storage.objects.keys()].filter((k) => !k.endsWith('manifest.json')).sort();
    for (const other of [upload, link]) {
      expect([...other.storage.objects.keys()].filter((k) => !k.endsWith('manifest.json')).sort()).toEqual(keys);
      for (const k of keys) expect(Buffer.compare(Buffer.from(other.storage.objects.get(k)), Buffer.from(browser.storage.objects.get(k)))).toBe(0);
    }
    expect(link.row.status).toBe('ready');
  });

  test('the cropped volume holds the source values at the same inline, crossline and time', async () => {
    const mc = manifestOf(link.storage);
    const mr = manifestOf(reference.storage);
    expect(mc.geometry.il).toMatchObject({ min: 104, max: 117, count: 14 });
    expect(mc.geometry.xl).toMatchObject({ min: 203, max: 214, count: 12 });
    expect(mc.geometry.ns).toBe(46); // the window ends at 180 ms; the 20 samples above it are null
    let checked = 0;
    for (let i = 0; i < 14; i += 2) for (let j = 0; j < 12; j += 3) for (let k = 0; k < 46; k++) {
      const v = await valueAt(link.storage, mc, i, j, k);
      // an IBM file's padded null decodes to about 1.0E+30: a null under the |v| >= 1.0E+29 rule
      if (k < 20) { expect(Math.abs(v)).toBeGreaterThanOrEqual(1e29); continue; }
      const ref = await valueAt(reference.storage, mr, i + 4, j + 3, k);
      expect(v).toBe(ref);
      checked += 1;
    }
    expect(checked).toBe(7 * 4 * 26);
  });

  test('provenance: source file, original geometry and the crop', () => {
    const m = manifestOf(link.storage);
    expect(m.source.crop).toMatchObject({ name: 'Pilot area', mode: 'server', kept_traces: 168, samples: { first: 20, last: 45, count: 26 }, window: { from: 80, to: 180 } });
    expect(m.source.crop.source).toMatchObject({ file_name: 'stack.sgy', traces: 26 * 19, ns: 61, il: { min: 100, max: 125 } });
    expect(link.row.survey_meta.ingest.crop.name).toBe('Pilot area');
    expect(manifestOf(upload.storage).source.crop.mode).toBe('upload');
    expect(manifestOf(browser.storage).source.crop.mode).toBe('browser');
  });

  test('negative control: a pad that disagrees with the file is refused', async () => {
    await expect(serverRun(croppedBytes, { pad_top_samples: 19 }, convScan)).rejects.toMatchObject({ stage: 'validate_failed' });
  });

  test('negative control: one changed source sample inside the crop changes the cropped bricks', async () => {
    const buf = fix.buffer.slice(0);
    const dv = new DataView(buf);
    const t = (104 - 100) * 19 + (205 - 200); // inline 104, crossline 205
    const pos = 3600 + t * (240 + 61 * 4) + 240 + 4 * 30;
    dv.setUint32(pos, dv.getUint32(pos, false) ^ 0x00010000, false);
    const tampered = await serverRun(buf, { crop: { def: DEF } }, scan);
    const differs = [...link.storage.objects].some(([k, b]) => !k.endsWith('manifest.json') && Buffer.compare(Buffer.from(tampered.storage.objects.get(k)), Buffer.from(b)) !== 0);
    expect(differs).toBe(true);
  });
});
