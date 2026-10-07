/**
 * @jest-environment node
 */
// ingest_gathers (QI programme Q3): an inline-sorted prestack SEG-Y (written
// with the engines' writer, offsets at byte 37) goes into the gather store;
// any CDP's gather read back from its block is that CDP's traces in their
// offset bins, two traces in one bin are their mean, the fold says so, the
// manifest has the geometry, bins and affine, and the store is registered.
// Then the guards: an unsorted file is refused with what to do, the bins and
// the memory budget, ownership and cancel.
import { ingestGathers, validateGatherParams } from '../src/handlers/ingestGathers.js';
import { writeSegy } from '../../../packages/engines/engines/seismolord/segyWrite';
import { readGather } from '../../../packages/engines/engines/qi/gatherStore';
import { KINDS } from '../src/handlers/index.js';

jest.setTimeout(120000);
const UID = '11111111-1111-4111-8111-111111111111';
const DS = '22222222-2222-4222-8222-222222222222';
const NEW = '33333333-3333-4333-8333-333333333333';
const NIL = 6; const NXL = 5; const NS = 20; const OFFS = [100, 300, 500, 700, 720];
const value = (i, j, o, s) => Math.fround(Math.sin(s / 3 + i + j / 2) * (1 + o / 1000));
function prestack({ sorted = true } = {}) {
  const traces = [];
  for (let i = 0; i < NIL; i++) for (let j = 0; j < NXL; j++) for (const o of OFFS) {
    traces.push({ il: 100 + i, xl: 200 + 2 * j, x: 431000 + 25 * j, y: 6512000 + 25 * i, offset: o, samples: Array.from({ length: NS }, (_, s) => value(i, j, o, s)) });
  }
  if (!sorted) traces.reverse();
  return writeSegy({ lines: ['prestack test'], dtUs: 4000, ns: NS, traces });
}
const ROW = { id: DS, user_id: UID, status: 'uploaded', kind: 'segy_upload', name: 'Keta gathers', original_filename: 'keta_cdp.sgy', bucket: 'seismic-raw', object_key: `${UID}/${DS}/keta_cdp.sgy` };
function deps({ bytes = prestack(), row = ROW, used = 0, extra = {} } = {}) {
  const objects = new Map(); const inserts = [];
  return {
    objects, inserts,
    d: {
      admin: {
        from: (t) => ({
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: t === 'qi_datasets' ? row : null, error: null }) }) }),
          insert: async (r) => { inserts.push(r); return { error: null }; },
        }),
        rpc: async () => ({ data: used, error: null }),
      },
      sign: async (method, bucket, key) => `https://store/${bucket}/${key}?m=${method}`,
      fetchImpl: async (url, init) => {
        const key = new URL(url).pathname.slice(1).split('/').slice(1).join('/');
        if (init.method === 'PUT') objects.set(key, new Uint8Array(init.body));
        if (init.method === 'DELETE') objects.delete(key);
        return { ok: true, status: 200 };
      },
      makeReader: () => ({ size: bytes.length, read: async (o, n) => bytes.slice(o, o + n).buffer }),
      newId: () => NEW,
      workBucket: 'seismic-work',
      ...extra,
    },
  };
}
const ctxFor = (params, { cancelled = false } = {}) => ({ params, job: { id: 'job-1', user_id: UID }, progress: () => {}, get cancelled() { return cancelled; } });

test('the kind is registered', () => expect(KINDS).toContain('ingest_gathers'));

test('gathers in, gathers out: bins, a two-trace bin as the mean, fold, manifest and registration', async () => {
  const { d, objects, inserts } = deps();
  const out = await ingestGathers(ctxFor({ dataset_id: DS, bin_width_m: 200, cb: 4 }), d);
  expect(out.geometry.il).toEqual({ min: 100, max: 105, step: 1, count: 6 });
  expect(out.geometry.xl).toEqual({ min: 200, max: 208, step: 2, count: 5 });
  expect(out.bins).toEqual({ width: 200, count: 4, max_offset_m: 720 });
  expect(out.traces).toBe(NIL * NXL * OFFS.length);
  const prefix = `gathers/${UID}/${NEW}`;
  const manifest = JSON.parse(new TextDecoder().decode(objects.get(`${prefix}/manifest.json`)));
  expect(manifest.kind).toBe('gathers_offset');
  expect(manifest.bins.centres).toEqual([100, 300, 500, 700]);
  expect(manifest.geometry.affine.il_vec.y).toBeCloseTo(25, 6);
  expect(manifest.geometry.affine.xl_vec.x).toBeCloseTo(25, 6);
  expect(manifest.blocks_present).toEqual([[0, 0], [0, 1], [1, 0], [1, 1]]);
  // CDP inline 105 (index 5), crossline 206 (index 3): block (1, 0), slot (1, 3)
  const block = new Float32Array(objects.get(`${prefix}/gathers/1-0.f32`).slice().buffer);
  const fold = new Uint16Array(objects.get(`${prefix}/gathers/1-0.fold.u16`).slice().buffer);
  const g = readGather(block, fold, { cb: 4, nBins: 4, ns: NS }, 1, 3);
  expect(g.fold).toEqual([1, 1, 1, 2]); // 700 and 720 m share the last bin
  for (let s = 0; s < NS; s++) {
    expect(g.traces[0][s]).toBeCloseTo(value(5, 3, 100, s), 6);
    expect(g.traces[3][s]).toBeCloseTo((value(5, 3, 700, s) + value(5, 3, 720, s)) / 2, 6);
  }
  expect(inserts[0]).toMatchObject({ id: NEW, kind: 'gathers_offset', status: 'uploaded', bucket: 'seismic-work', object_key: `${prefix}/manifest.json`, part_count: 1 });
  expect(inserts[0].bytes).toBeGreaterThan(0);
});

test('negative control: a file not sorted by inline is refused with what to do', async () => {
  const { d } = deps({ bytes: prestack({ sorted: false }) });
  await expect(ingestGathers(ctxFor({ dataset_id: DS }), d)).rejects.toMatchObject({ stage: 'not_sorted', message: expect.stringMatching(/Sort it by inline, then crossline/) });
});

test('guards: settings, the bins, the memory budget, quota, ownership, cancel', async () => {
  expect(validateGatherParams({ dataset_id: 'x' })).toMatch(/dataset_id/);
  expect(validateGatherParams({ dataset_id: DS, cb: 5 })).toMatch(/4, 8 or 16/);
  expect(validateGatherParams({ dataset_id: DS, mapping: { offsetByte: 300 } })).toMatch(/1 to 237/);
  await expect(ingestGathers(ctxFor({ dataset_id: DS, bin_width_m: 1 }), deps().d)).rejects.toMatchObject({ stage: 'validate_failed', message: expect.stringMatching(/wider bin/) });
  await expect(ingestGathers(ctxFor({ dataset_id: DS }), deps({ extra: { memoryBudgetBytes: 1000 } }).d)).rejects.toMatchObject({ stage: 'too_large' });
  await expect(ingestGathers(ctxFor({ dataset_id: DS }), deps({ used: 150 * 1024 ** 3 }).d)).rejects.toMatchObject({ stage: 'over_quota' });
  await expect(ingestGathers(ctxFor({ dataset_id: DS }), deps({ row: { ...ROW, user_id: 'x' } }).d)).rejects.toMatchObject({ stage: 'not_found' });
  await expect(ingestGathers(ctxFor({ dataset_id: DS }), deps({ row: { ...ROW, kind: 'gathers_offset' } }).d)).rejects.toMatchObject({ stage: 'validate_failed' });
  const c = deps();
  expect(await ingestGathers(ctxFor({ dataset_id: DS }, { cancelled: true }), c.d)).toBeNull();
  expect(c.objects.size).toBe(0);
});
