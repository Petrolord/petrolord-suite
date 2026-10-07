/**
 * @jest-environment node
 */
// trim_gathers (QI programme Q5): gathers with random static shifts come out
// flatter as a new store (the mean correlation with the gather stack rises,
// and prestack_qc on the trimmed store measures less residual), the source
// store is left as it was, and the new one is registered with what was done.
import { ingestGathers } from '../src/handlers/ingestGathers.js';
import { trimGathers, validateTrimParams } from '../src/handlers/trimGathers.js';
import { writeSegy } from '../../../packages/engines/engines/seismolord/segyWrite';
import { KINDS } from '../src/handlers/index.js';

jest.setTimeout(180000);
const UID = '11111111-1111-4111-8111-111111111111';
const RAW = '22222222-2222-4222-8222-222222222222';
const G1 = '33333333-3333-4333-8333-333333333333';
const G2 = '44444444-4444-4444-8444-444444444444';
const NIL = 4; const NXL = 4; const NS = 300; const DT = 2;
const OFFS = Array.from({ length: 12 }, (_, k) => 100 + 250 * k);
const ricker = (t) => { const a = (Math.PI * 30 * t / 1000) ** 2; return (1 - 2 * a) * Math.exp(-a); };
let seed = 9; const u = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; };
function file() {
  const traces = [];
  for (let i = 0; i < NIL; i++) for (let j = 0; j < NXL; j++) for (const o of OFFS) {
    const st = 10 * u();
    traces.push({ il: 1 + i, xl: 1 + j, x: 25 * j, y: 25 * i, offset: o, samples: Array.from({ length: NS }, (_, s) => ricker(s * DT - (300 + st)) - 0.5 * ricker(s * DT - (360 + st))) });
  }
  return writeSegy({ dtUs: DT * 1000, ns: NS, traces });
}
const raw = file();
function world() {
  const objects = new Map(); const rows = new Map(); let n = 0;
  rows.set(RAW, { id: RAW, user_id: UID, status: 'uploaded', kind: 'segy_upload', name: 'Keta CDP', original_filename: 'k.sgy', bucket: 'seismic-raw', object_key: 'raw/k.sgy', bytes: raw.length, part_size: 1 });
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
      newId: () => (n++ === 0 ? G1 : G2), workBucket: 'seismic-work',
    },
  };
}
const ctxFor = (params) => ({ params, job: { id: 'j', user_id: UID }, progress: () => {}, cancelled: false });

test('the kind is registered', () => expect(KINDS).toContain('trim_gathers'));

test('trimmed gathers are flatter, written as a new store, the source kept', async () => {
  const w = world();
  await ingestGathers(ctxFor({ dataset_id: RAW, bin_width_m: 250, cb: 4 }), w.d);
  const before = new Uint8Array(w.objects.get(`gathers/${UID}/${G1}/gathers/0-0.f32`));
  const out = await trimGathers(ctxFor({ dataset_id: G1, centre_ms: 330, window_ms: 120, max_shift_ms: 8 }), w.d);
  expect(out.dataset_id).toBe(G2);
  expect(out.cdps).toBe(NIL * NXL);
  expect(out.corrAfter).toBeGreaterThan(0.97);
  expect(out.corrAfter).toBeGreaterThan(out.corrBefore + 0.03);
  expect(w.objects.get(`gathers/${UID}/${G1}/gathers/0-0.f32`)).toEqual(before);
  expect(w.rows.get(G2)).toMatchObject({ kind: 'gathers_offset', status: 'uploaded', meta: { source_gathers: G1, conditioning: { trim: { centre_ms: 330 } } } });
});

test('settings', () => {
  expect(validateTrimParams({ dataset_id: G1 })).toMatch(/event time/);
  expect(validateTrimParams({ dataset_id: G1, centre_ms: 300, max_shift_ms: 80 })).toMatch(/40 ms/);
});
