/**
 * @jest-environment node
 */
// radon_demultiple and fx_denoise (QI round 3): a prestack SEG-Y with known
// primaries (each with its own intercept and gradient), parabolic multiples
// (one on a primary) and random noise goes through the real ingest_gathers;
// the conditioning kinds write new stores whose gathers, read back from the
// stored float32 blocks, keep the primaries' AVO and lose the multiples or
// the noise, with numbers. The source store is untouched. Negative control:
// a cut above the multiples' moveout leaves them in.
import { ingestGathers } from '../src/handlers/ingestGathers.js';
import { radonDemultipleJob, fxDenoiseJob, validateConditionParams } from '../src/handlers/conditionGathers.js';
import { readGather, gatherBlockKey, foldBlockKey } from '../../../packages/engines/engines/qi/gatherStore';
import { writeSegy } from '../../../packages/engines/engines/seismolord/segyWrite';
import { KINDS } from '../src/handlers/index.js';

jest.setTimeout(300000);
const UID = '11111111-1111-4111-8111-111111111111';
const RAW = '22222222-2222-4222-8222-222222222222';
const IDS = ['33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666'];
const NIL = 2; const NXL = 3; const NS = 400; const DT = 4; const W = 100; const NB = 24;
const OFFS = Array.from({ length: NB }, (_, b) => (b + 0.5) * W);
const XM = OFFS[NB - 1];
const ricker = (t) => { const a = (Math.PI * 25 * t / 1000) ** 2; return (1 - 2 * a) * Math.exp(-a); };
const PRIM = [[400, 1, -0.6], [800, 0.7, 0.5], [1200, -0.5, -0.4]];
const MULT = [[600, 0.8, 80], [800, 0.6, 140], [1000, -0.6, 120]];
let seed = 11; const u = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
const g = () => { let s = 0; for (let k = 0; k < 12; k++) s += u(); return s; };
const prim = (x, i) => PRIM.reduce((s, [t0, A, B]) => s + (A + B * (x / XM) ** 2) * ricker(i * DT - t0), 0);
const mult = (x, i) => MULT.reduce((s, [t0, a, q]) => s + a * ricker(i * DT - t0 - q * (x / XM) ** 2), 0);
function file({ multiples = true, noise = 0 } = {}) {
  const traces = [];
  for (let i = 0; i < NIL; i++) for (let j = 0; j < NXL; j++) for (const o of OFFS) {
    traces.push({ il: 1 + i, xl: 1 + j, x: 25 * j, y: 25 * i, offset: o, samples: Array.from({ length: NS }, (_, s) => prim(o, s) + (multiples ? mult(o, s) : 0) + noise * g()) });
  }
  return writeSegy({ dtUs: DT * 1000, ns: NS, traces });
}
function world(raw) {
  const objects = new Map(); const rows = new Map(); let n = 0;
  rows.set(RAW, { id: RAW, user_id: UID, status: 'uploaded', kind: 'segy_upload', name: 'Synthetic CDP', original_filename: 's.sgy', bucket: 'seismic-raw', object_key: 'raw/s.sgy', bytes: raw.length, part_size: 1 });
  const keyOf = (url) => new URL(url).pathname.slice(1).split('/').slice(1).join('/');
  return {
    objects, rows,
    d: {
      admin: {
        from: () => ({ select: () => ({ eq: (c, id) => ({ maybeSingle: async () => ({ data: rows.get(id) || null, error: null }) }) }), insert: async (r) => { rows.set(r.id, r); return { error: null }; } }),
        rpc: async () => ({ data: 0, error: null }),
      },
      sign: async (method, bucket, key) => `https://store/${bucket}/${key}?m=${method}`,
      fetchImpl: async (url, init = {}) => {
        const key = keyOf(url);
        if (init.method === 'PUT') { objects.set(key, new Uint8Array(init.body)); return { ok: true, status: 200 }; }
        if (init.method === 'DELETE') { objects.delete(key); return { ok: true, status: 204 }; }
        const o = objects.get(key); return o ? { ok: true, status: 200, arrayBuffer: async () => o.slice().buffer } : { ok: false, status: 404 };
      },
      makeReader: () => ({ size: raw.length, read: async (off, len) => raw.slice(off, off + len).buffer }),
      newId: () => IDS[n++], workBucket: 'seismic-work',
    },
  };
}
const ctxFor = (params) => ({ params, job: { id: 'j', user_id: UID }, progress: () => {}, cancelled: false });
/** the gather of CDP (li, lj) of block 0-0 of a stored store */
const gatherOf = (w, id, li, lj) => {
  const data = new Float32Array(w.objects.get(`gathers/${UID}/${id}/${gatherBlockKey(0, 0)}`).slice().buffer);
  const fold = new Uint16Array(w.objects.get(`gathers/${UID}/${id}/${foldBlockKey(0, 0)}`).slice().buffer);
  return readGather(data, fold, { cb: 4, nBins: NB, ns: NS }, li, lj);
};
const XS = OFFS.map((x) => (x / XM) ** 2);
const avoAt = (traces, t0) => {
  const ys = traces.map((t) => t[t0 / DT]); const n = XS.length;
  const mx = XS.reduce((a, b) => a + b) / n; const my = ys.reduce((a, b) => a + b) / n;
  let sxy = 0; let sxx = 0; XS.forEach((x, k) => { sxy += (x - mx) * (ys[k] - my); sxx += (x - mx) ** 2; });
  const B = sxy / sxx; return { A: my - B * mx, B };
};
const multEnergy = (traces) => { let s = 0; traces.forEach((t, b) => { for (let i = 0; i < NS; i++) s += (t[i] - prim(OFFS[b], i)) ** 2; }); return s; };

test('the kinds are registered', () => { expect(KINDS).toContain('radon_demultiple'); expect(KINDS).toContain('fx_denoise'); });

test('radon_demultiple: multiples removed by over 15 dB, the primaries\' AVO kept, the source untouched, the removed part stored', async () => {
  const w = world(file());
  await ingestGathers(ctxFor({ dataset_id: RAW, bin_width_m: W, cb: 4 }), w.d);
  const before = new Uint8Array(w.objects.get(`gathers/${UID}/${IDS[0]}/gathers/0-0.f32`));
  const out = await radonDemultipleJob(ctxFor({ dataset_id: IDS[0], cut_ms: 30, keep_removed: true }), w.d);
  expect(out).toMatchObject({ dataset_id: IDS[1], removed_dataset_id: IDS[2], cdps: NIL * NXL, failed_cdps: 0 });
  expect(w.objects.get(`gathers/${UID}/${IDS[0]}/gathers/0-0.f32`)).toEqual(before);
  const input = gatherOf(w, IDS[0], 1, 2).traces; const dem = gatherOf(w, IDS[1], 1, 2).traces; const rem = gatherOf(w, IDS[2], 1, 2).traces;
  const removedDb = 10 * Math.log10(multEnergy(input) / multEnergy(dem));
  expect(removedDb).toBeGreaterThan(15);
  // isolated primaries: A within 2 percent, B within 5 percent
  for (const [t0, A, B] of PRIM.filter(([t]) => t !== 800)) {
    const f = avoAt(dem, t0);
    expect(Math.abs((f.A - A) / A)).toBeLessThan(0.02);
    expect(Math.abs((f.B - B) / B)).toBeLessThan(0.05);
  }
  // the 800 ms primary has a multiple starting on it, the hard case: A within 6 percent, B within 14 percent, from 30 percent or more before
  const hard = avoAt(dem, 800);
  expect(Math.abs((hard.A - 0.7) / 0.7)).toBeLessThan(0.06);
  expect(Math.abs((hard.B - 0.5) / 0.5)).toBeLessThan(0.14);
  expect(Math.abs((avoAt(input, 800).B - 0.5) / 0.5)).toBeGreaterThan(0.3);
  // input = demultipled + removed, sample by sample (float32)
  for (let b = 0; b < NB; b += 5) for (let i = 0; i < NS; i += 7) expect(dem[b][i] + rem[b][i]).toBeCloseTo(input[b][i], 4);
  expect(w.rows.get(IDS[1])).toMatchObject({ kind: 'gathers_offset', status: 'uploaded', meta: { source_gathers: IDS[0], conditioning: { radon: { cut_ms: 30, high_res: 3, avo_terms: true } } } });
  expect(w.rows.get(IDS[2]).meta.removed_part_of).toBe(IDS[1]);
  expect(out.bands).toHaveLength(4);
  // the multiples live between 600 and 1100 ms: the second and third quarters lose the most
  expect(out.bands[1].removed_share + out.bands[2].removed_share).toBeGreaterThan(out.bands[0].removed_share + 0.2);
});

test('negative control: a cut above the multiples\' moveout leaves them in', async () => {
  const w = world(file());
  await ingestGathers(ctxFor({ dataset_id: RAW, bin_width_m: W, cb: 4 }), w.d);
  await radonDemultipleJob(ctxFor({ dataset_id: IDS[0], cut_ms: 250 }), w.d);
  const input = gatherOf(w, IDS[0], 0, 0).traces; const dem = gatherOf(w, IDS[1], 0, 0).traces;
  expect(10 * Math.log10(multEnergy(input) / multEnergy(dem))).toBeLessThan(3);
});

test('the area: CDPs outside are left out (fold 0)', async () => {
  const w = world(file());
  await ingestGathers(ctxFor({ dataset_id: RAW, bin_width_m: W, cb: 4 }), w.d);
  const out = await radonDemultipleJob(ctxFor({ dataset_id: IDS[0], area: { il: [1, 1], xl: [2, 3] }, high_res: 0 }), w.d);
  expect(out.cdps).toBe(2);
  expect(gatherOf(w, IDS[1], 1, 0).fold.every((f) => f === 0)).toBe(true);
  expect(gatherOf(w, IDS[1], 0, 1).fold.some((f) => f > 0)).toBe(true);
});

test('fx_denoise: random noise (S/N about 6 dB) down by over 4 dB, the primaries\' intercepts within 7 percent (the documented shrinkage)', async () => {
  const w = world(file({ multiples: false, noise: 0.06 }));
  await ingestGathers(ctxFor({ dataset_id: RAW, bin_width_m: W, cb: 4 }), w.d);
  const out = await fxDenoiseJob(ctxFor({ dataset_id: IDS[0] }), w.d);
  expect(out.cdps).toBe(NIL * NXL);
  let gain = 0; const biasA = PRIM.map(() => 0);
  for (let li = 0; li < NIL; li++) for (let lj = 0; lj < NXL; lj++) {
    const input = gatherOf(w, IDS[0], li, lj).traces; const den = gatherOf(w, IDS[1], li, lj).traces;
    gain += 10 * Math.log10(multEnergy(input) / multEnergy(den)) / (NIL * NXL);
    PRIM.forEach(([t0, A], k) => { biasA[k] += (avoAt(den, t0).A - A) / Math.abs(A) / (NIL * NXL); });
  }
  expect(gain).toBeGreaterThan(4);
  for (const b of biasA) expect(Math.abs(b)).toBeLessThan(0.07);
  expect(w.rows.get(IDS[1]).meta.conditioning.fx).toMatchObject({ filter_length: 3, window_ms: 200 });
});

test('settings', () => {
  const id = IDS[0];
  expect(validateConditionParams('radon_demultiple', { dataset_id: id })).toBeNull();
  expect(validateConditionParams('radon_demultiple', { dataset_id: id, cut_ms: 0 })).toMatch(/above zero/);
  expect(validateConditionParams('radon_demultiple', { dataset_id: id, cut_ms: 400 })).toMatch(/between/);
  expect(validateConditionParams('radon_demultiple', { dataset_id: id, high_res: 9 })).toMatch(/0 to 5/);
  expect(validateConditionParams('radon_demultiple', { dataset_id: id, cut_ms: '' })).toMatch(/number/);
  expect(validateConditionParams('fx_denoise', { dataset_id: id, filter_length: 12 })).toMatch(/1 to 8/);
  expect(validateConditionParams('fx_denoise', { dataset_id: id, area: { il: [5, 2], xl: [1, 2] } })).toMatch(/area/);
});

test('refusals: another user\'s store, a non-store', async () => {
  const w = world(file());
  await ingestGathers(ctxFor({ dataset_id: RAW, bin_width_m: W, cb: 4 }), w.d);
  w.rows.get(IDS[0]).user_id = '99999999-9999-4999-8999-999999999999';
  await expect(radonDemultipleJob(ctxFor({ dataset_id: IDS[0] }), w.d)).rejects.toThrow(/not found/);
  await expect(fxDenoiseJob(ctxFor({ dataset_id: RAW }), w.d)).rejects.toThrow(/gather store/);
});
