/**
 * @jest-environment node
 */
// prestack_qc (QI programme Q4b): a gather store with a known residual
// moveout (8 ms at the far offset) is measured as such, the stretch mute
// and the fold come back, and the issues follow. Negative control: flat
// gathers raise no moveout issue.
import { ingestGathers } from '../src/handlers/ingestGathers.js';
import { prestackQc, validatePrestackQcParams } from '../src/handlers/prestackQc.js';
import { stretchMuteOffset } from '../../../packages/engines/engines/qi/prestackQc';
import { writeSegy } from '../../../packages/engines/engines/seismolord/segyWrite';
import { KINDS } from '../src/handlers/index.js';

jest.setTimeout(180000);
const UID = '11111111-1111-4111-8111-111111111111';
const RAW = '22222222-2222-4222-8222-222222222222';
const GATH = '33333333-3333-4333-8333-333333333333';
const NIL = 6; const NXL = 5; const NS = 300; const DT = 2;
const OFFS = Array.from({ length: 20 }, (_, k) => 75 + 150 * k);
const ricker = (t) => { const a = (Math.PI * 30 * t / 1000) ** 2; return (1 - 2 * a) * Math.exp(-a); };
function file(rmoFar) {
  const far = OFFS[OFFS.length - 1];
  const traces = [];
  for (let i = 0; i < NIL; i++) for (let j = 0; j < NXL; j++) for (const o of OFFS) {
    const dt = (rmoFar * o * o) / (far * far);
    traces.push({ il: 1 + i, xl: 1 + j, x: 25 * j, y: 25 * i, offset: o, samples: Array.from({ length: NS }, (_, s) => ricker(s * DT - (300 + dt))) });
  }
  return writeSegy({ dtUs: DT * 1000, ns: NS, traces });
}
function world(rmoFar) {
  const objects = new Map(); const rows = new Map();
  const raw = file(rmoFar);
  rows.set(RAW, { id: RAW, user_id: UID, status: 'uploaded', kind: 'segy_upload', name: 'Keta CDP', original_filename: 'k.sgy', bucket: 'seismic-raw', object_key: 'raw/k.sgy', bytes: raw.length });
  const keyOf = (url) => new URL(url).pathname.slice(1).split('/').slice(1).join('/');
  const deps = {
    admin: {
      from: () => ({ select: () => ({ eq: (c, id) => ({ maybeSingle: async () => ({ data: rows.get(id) || null, error: null }) }) }), insert: async (r) => { rows.set(r.id, r); return { error: null }; } }),
      rpc: async () => ({ data: 0, error: null }),
    },
    sign: async (method, bucket, key) => `https://store/${bucket}/${key}?m=${method}`,
    fetchImpl: async (url, init = {}) => {
      const key = keyOf(url);
      if (init.method === 'PUT') { objects.set(key, new Uint8Array(init.body)); return { ok: true, status: 200 }; }
      const o = objects.get(key); return o ? { ok: true, status: 200, arrayBuffer: async () => o.slice().buffer } : { ok: false, status: 404 };
    },
    makeReader: () => ({ size: raw.length, read: async (off, n) => raw.slice(off, off + n).buffer }),
    newId: () => GATH, workBucket: 'seismic-work',
  };
  return deps;
}
const ctxFor = (params) => ({ params, job: { id: 'j', user_id: UID }, progress: () => {}, cancelled: false });

test('the kind is registered', () => expect(KINDS).toContain('prestack_qc'));

test('a known residual moveout is measured, with the stretch mute, the fold and the issues', async () => {
  const d = world(8);
  await ingestGathers(ctxFor({ dataset_id: RAW, bin_width_m: 150, cb: 4 }), d);
  const r = await prestackQc(ctxFor({ dataset_id: GATH, times_ms: [300], velocity: { t_ms: [0], vrms: [2500] }, max_stretch: 0.3 }), d);
  expect(r.cdps).toBe(NIL * NXL);
  expect(r.times[0].rmoMedian).toBeCloseTo(8, 0);
  expect(r.times[0].stretchMuteM).toBeCloseTo(stretchMuteOffset(0.3, 2500, 0.3), 6);
  expect(r.fold.median).toBe(OFFS.length);
  expect(r.issues.map((i) => i.title)).toEqual(expect.arrayContaining(['Residual moveout at 300 ms', 'NMO stretch at 300 ms']));
  expect(r.issues.find((i) => /Residual/.test(i.title)).severity).toBe('medium');
});

test('negative control: flat gathers raise no moveout issue', async () => {
  const d = world(0);
  await ingestGathers(ctxFor({ dataset_id: RAW, bin_width_m: 150, cb: 4 }), d);
  const r = await prestackQc(ctxFor({ dataset_id: GATH, times_ms: [300] }), d);
  expect(r.times[0].rmoQ90).toBeLessThan(0.5);
  expect(r.issues.some((i) => /Residual/.test(i.title))).toBe(false);
});

test('settings', () => {
  expect(validatePrestackQcParams({ dataset_id: 'x' })).toMatch(/dataset_id/);
  expect(validatePrestackQcParams({ dataset_id: GATH, times_ms: [1, 2, 3, 4, 5] })).toMatch(/one to four/);
  expect(validatePrestackQcParams({ dataset_id: GATH, max_stretch: 2 })).toMatch(/between 0 and 1/);
});
