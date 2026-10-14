/**
 * @jest-environment node
 */
// Crop before upload (2026-10-14), the Suite side.
//  - Unusual real-world layouts (little-endian rev 2, 16-bit integers, an
//    extended textual header, IBM EBCDIC rev 0, crossline-sorted, an
//    irregular outline) crop to a file the SEG-Y door reads, whose samples
//    are the source's window samples as the door decodes them.
//  - The cropped file goes through the resumable upload as a virtual file:
//    the store assembles exactly the cropped bytes, across a pause and a
//    resume, and a second crop of the same file never continues the first
//    one's upload.
//  - Estimates, durations and the measured speed.
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import { bufferReader } from '../engine/reader';
import { decodeSamples } from '../engine/segyDecode';
import { openSegyDoor } from '../lib/segyDoor';
import { scanGeometry } from '../engine/segyScan';
import {
  planImportCrop, cropSource, cropFileLike, cropEstimate, formatDuration, uploadSeconds, speedMeter,
  spotCheckCrop, cropKeyOf, keptCells, conversionView, rememberCropFor, recallCropFor, forgetCropFor,
} from '../services/cropImport';
import { normalizeCrop } from '../engine/segyCrop';
import { uploadLargeFile, fileFingerprint } from '@/lib/qiUpload';
import { fileFingerprint as sampledFingerprint } from '../services/ingestResume';
import { startServerImport, startRemoteConversion, uploadForQi } from '../services/serverImport';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

const HOSTILE = path.join(__dirname, '../../../../../e2e/fixtures/seis/hostile');
const load = (f) => { const b = fs.readFileSync(path.join(HOSTILE, f)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const MAP = { ilByte: 189, xlByte: 193 };

/** Every trace of a door-presented reader, decoded: [{il, xl, samples}]. */
async function decodedTraces(reader, map = MAP) {
  const { reader: r } = await openSegyDoor(reader);
  const h = new DataView(await r.read(3200, 400));
  const ns = h.getInt16(20, false);
  const fmt = h.getInt16(24, false);
  const tb = 240 + ns * 4;
  const n = (r.size - 3600) / tb;
  const all = new DataView(await r.read(3600, n * tb));
  const out = [];
  for (let t = 0; t < n; t++) {
    const o = t * tb;
    out.push({ il: all.getInt32(o + map.ilByte - 1, false), xl: all.getInt32(o + map.xlByte - 1, false), samples: Array.from(decodeSamples(all, o + 240, ns, fmt, new Float32Array(ns))) });
  }
  return out;
}

describe('hostile layouts crop to a file the door reads, holding the source window', () => {
  const cases = [
    ['rev2_little_endian.sgy', MAP],
    ['fmt3_int16.sgy', MAP],
    ['rev1_ext_textual.sgy', MAP],
    ['rev0_ibm_ebcdic_9_21.sgy', { ilByte: 9, xlByte: 21 }],
    ['crossline_sorted.sgy', MAP],
    ['irregular_outline.sgy', MAP],
  ];
  test.each(cases)('%s', async (name, map) => {
    const raw = bufferReader(load(name));
    const { reader } = await openSegyDoor(raw);
    const scan = await scanGeometry(reader, map);
    const ilMid = Math.round((scan.il.min + scan.il.max) / 2);
    const def = {
      il: { from: scan.il.min + scan.il.step, to: ilMid }, xl: { from: scan.xl.min, to: scan.xl.max - scan.xl.step },
      window: { from: (scan.dtUs / 1000) * 2, to: (scan.dtUs / 1000) * (scan.ns - 3) },
    };
    const prep = await planImportCrop({ raw, scan, def, mapping: map });
    const cropped = cropSource(raw, prep, { sourceName: name, mapping: map });
    if (prep.plan.verify) await spotCheckCrop(cropped, prep.plan);
    const src = await decodedTraces(raw, map);
    const out = await decodedTraces(cropped, map);
    const { first, count } = prep.crop.samples;
    const want = src.filter((t) => t.il >= prep.crop.il.from && t.il <= prep.crop.il.to && t.xl >= prep.crop.xl.from && t.xl <= prep.crop.xl.to);
    expect(out.length).toBe(want.length);
    expect(out.length).toBeGreaterThan(0);
    out.forEach((t, k) => {
      expect([t.il, t.xl]).toEqual([want[k].il, want[k].xl]);
      expect(t.samples).toEqual(want[k].samples.slice(first, first + count));
    });
    // and the converters' view puts the window back at its own times
    const view = await conversionView(cropped, prep.crop);
    const padded = await decodedTraces(view, map);
    expect(padded[0].samples.length).toBe(first + count);
    expect(padded[0].samples.slice(first)).toEqual(want[0].samples.slice(first, first + count));
  });
});

describe('the cropped file through the resumable upload', () => {
  const PART = 5000;
  function server() {
    const uploads = new Map();
    let id = 0;
    const invoke = async (b) => {
      if (b.action === 'start') {
        const hit = b.fingerprint && [...uploads].find(([, u]) => u.status === 'uploading' && u.bytes === b.bytes && u.fp === b.fingerprint.hash);
        if (hit) return { dataset_id: hit[0], part_size: PART, part_count: hit[1].n, resumed: true };
        const k = `ds-${++id}`;
        uploads.set(k, { bytes: b.bytes, n: Math.ceil(b.bytes / PART), parts: new Map(), status: 'uploading', fp: b.fingerprint?.hash });
        return { dataset_id: k, part_size: PART, part_count: Math.ceil(b.bytes / PART) };
      }
      const u = uploads.get(b.dataset_id);
      if (b.action === 'sign') return { urls: Object.fromEntries(b.part_numbers.map((n) => [n, `https://s/${b.dataset_id}/${n}`])) };
      if (b.action === 'parts') return { part_size: PART, part_count: u.n, parts: [...u.parts].map(([n, x]) => ({ partNumber: n, size: x.length })) };
      if (b.action === 'complete') {
        const out = new Uint8Array(u.bytes);
        for (const [n, x] of u.parts) out.set(x, (n - 1) * PART);
        u.status = 'uploaded'; u.assembled = out;
        return { dataset: { id: b.dataset_id, status: 'uploaded' } };
      }
      throw new Error(b.action);
    };
    let inFlight = 0; let maxInFlight = 0; let failAfter = Infinity; let puts = 0;
    const fetchImpl = async (url, init) => {
      inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setImmediate(r));
      inFlight -= 1;
      puts += 1;
      if (puts > failAfter) throw Object.assign(new Error('paused'), { name: 'AbortError' });
      const [, k, n] = new URL(url).pathname.split('/');
      uploads.get(k).parts.set(Number(n), Uint8Array.from(init.body));
      return { ok: true };
    };
    return { invoke, fetchImpl, uploads, stats: () => ({ maxInFlight }), failAfter: (n) => { failAfter = n; puts = 0; } };
  }
  const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
  const digest = (b) => webcrypto.subtle.digest('SHA-256', b);

  async function cropOf(def) {
    const buf = load('rev1_ieee_clean.sgy');
    const raw = bufferReader(buf);
    const { reader } = await openSegyDoor(raw);
    const scan = await scanGeometry(reader, MAP);
    const prep = await planImportCrop({ raw, scan, def, mapping: MAP });
    const cropped = cropSource(raw, prep, { sourceName: 'clean.sgy', mapping: MAP });
    const file = { name: 'clean.sgy', size: buf.byteLength, lastModified: 1700000000000 };
    return { cropped, prep, fileLike: cropFileLike(cropped, { file, crop: prep.crop }), file, scan };
  }

  test('the store assembles exactly the cropped bytes, across a pause and a resume', async () => {
    const s = server();
    const { cropped, fileLike } = await cropOf({ il: { from: 1002, to: 1005 }, window: { from: 8, to: 80 } });
    const storage = mem();
    const fingerprint = (f) => sampledFingerprint(f, digest);
    s.failAfter(1);
    await expect(uploadLargeFile(fileLike, { invoke: s.invoke, fetchImpl: s.fetchImpl, storage, fingerprint, sleep: async () => {} })).rejects.toThrow(/paused/);
    s.failAfter(Infinity);
    const ds = await uploadLargeFile(fileLike, { invoke: s.invoke, fetchImpl: s.fetchImpl, storage: mem(), fingerprint, sleep: async () => {} });
    expect(s.uploads.size).toBe(1); // resumed by the server-side fingerprint, from a "different browser"
    const want = new Uint8Array(await cropped.read(0, cropped.size));
    expect(Buffer.compare(Buffer.from(s.uploads.get(ds.id).assembled), Buffer.from(want))).toBe(0);
    expect(s.stats().maxInFlight).toBeLessThanOrEqual(2);
  });

  test('two crops of one file never share an upload', async () => {
    const a = await cropOf({ il: { from: 1002, to: 1005 }, window: { from: 8, to: 80 } });
    const b = await cropOf({ il: { from: 1002, to: 1005 }, window: { from: 12, to: 84 } });
    expect(a.fileLike.size).toBe(b.fileLike.size);
    expect(fileFingerprint(a.fileLike)).not.toBe(fileFingerprint(b.fileLike));
    const fa = await sampledFingerprint(a.fileLike, digest);
    const fb = await sampledFingerprint(b.fileLike, digest);
    expect(fa.hash).not.toBe(fb.hash);
    expect(cropKeyOf(a.prep.crop, a.file)).toBe(cropKeyOf(a.prep.crop, a.file));
  });

  test('startServerImport uploads the cropped file and tells stack_to_v4 the pad', async () => {
    const { fileLike, prep, file, scan } = await cropOf({ il: { from: 1002, to: 1005 }, window: { from: 8, to: 80 } });
    const deps = {
      upload: jest.fn(async () => ({ id: 'ds-1' })),
      prepare: jest.fn(async () => ({ volumeId: 'vol-1', name: 'clean', crsPlan: {}, customDefs: {}, ingestRec: { crop: 'p' } })),
      enqueue: jest.fn(async () => 'job-1'),
      fingerprint: async () => ({}),
    };
    await startServerImport({ file, mapping: MAP, scan, nativeCrs: 'X', crop: { fileLike, scan: { cropped: true }, padTop: prep.crop.samples.first, provenance: { name: 'A' } } }, deps);
    expect(deps.upload.mock.calls[0][0]).toBe(fileLike);
    expect(deps.prepare.mock.calls[0][0]).toMatchObject({ file: { name: 'clean.sgy', size: fileLike.size }, crop: { name: 'A' } });
    expect(deps.enqueue.mock.calls[0][1]).toMatchObject({ file_name: 'clean.sgy', scan: { cropped: true }, pad_top_samples: 2, crop_provenance: { name: 'A' } });
    const up = jest.fn(async () => ({ id: 'ds-2', name: 'g' }));
    expect(await uploadForQi({ file, crop: { fileLike } }, { upload: up, fingerprint: async () => ({}) })).toEqual({ datasetId: 'ds-2', name: 'g' });
    expect(up.mock.calls[0][0]).toBe(fileLike);
    const enq = jest.fn(async () => 'job-2');
    await startRemoteConversion({ remote: { name: 'r.sgy', size: 9, datasetId: 'ds-3' }, mapping: MAP, scan, crop: { def: { il: { from: 2, to: 4 } }, definitionId: 'd1' } }, { prepare: deps.prepare, enqueue: enq });
    expect(enq.mock.calls[0][1].crop).toEqual({ def: { il: { from: 2, to: 4 } }, definition_id: 'd1' });
  });
});

describe('estimates', () => {
  const scan = { il: { min: 1, max: 400, step: 1, count: 400 }, xl: { min: 1, max: 500, step: 1, count: 500 }, ns: 1501, dtUs: 4000, totalTraces: 200000, inlineSorted: true };
  test('an 80 GB-shaped stack cropped to a tenth: size and upload time', () => {
    const crop = normalizeCrop({ il: { from: 101, to: 230 }, xl: { from: 101, to: 260 }, window: { from: 1500, to: 3000 } }, scan);
    const door = { ns: 1501, dtUs: 4000, sampleBytes: 4, dataStart: 3600 };
    const est = cropEstimate({ crop, scan, door, fileSize: 3600 + 200000 * (240 + 1501 * 4) });
    expect(est.keptTraces).toBe(130 * 160);
    expect(est.approximate).toBe(false);
    expect(est.croppedBytes).toBe(3600 + 20800 * (240 + 376 * 4));
    expect(est.share).toBeLessThan(0.03);
    expect(formatDuration(uploadSeconds(80e9, 0.9))).toBe('24 h 41 min');
    expect(formatDuration(uploadSeconds(est.croppedBytes, 1))).toBe('36 s');
    expect(keptCells(normalizeCrop({ polygon: [[1, 1], [400, 1], [1, 500]] }, scan))).toBeLessThan(400 * 500 * 0.51);
  });
  test('the speed meter waits for the first seconds, then measures', () => {
    let t = 0;
    const m = speedMeter({ now: () => t });
    m.add(0);
    t = 1000; m.add(1e6);
    expect(m.mbPerSecond()).toBeNull();
    t = 5000; m.add(5e6);
    expect(m.mbPerSecond()).toBeCloseTo(1, 6);
  });
  test('the crop of an unfinished upload is remembered per file', () => {
    const m = new Map();
    const st = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
    const f = { name: 'a.sgy', size: 9, lastModified: 3 };
    rememberCropFor(f, { ilFrom: 5 }, st);
    expect(recallCropFor(f, st)).toEqual({ ilFrom: 5 });
    expect(recallCropFor({ ...f, size: 10 }, st)).toBeNull();
    forgetCropFor(f, st);
    expect(recallCropFor(f, st)).toBeNull();
  });
});
