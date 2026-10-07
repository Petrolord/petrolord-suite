/**
 * @jest-environment node
 */
// angle_stacks (QI programme Q3b): a gather store with a known AVO response
// (an event whose amplitude is A + B sin^2 of its Walden angle) gives near
// and far stacks as SEG-Y files the server import can convert: the near
// stack is brighter than the far one by the trend, each file reads back
// with the engines' reader, and each is registered as a server file. The
// usable-angle map comes beside them. Negative control: a velocity far too
// fast puts the far range out of the data, and the job says so.
import { ingestGathers } from '../src/handlers/ingestGathers.js';
import { angleStacks, validateAngleParams, stackCdp } from '../src/handlers/angleStacks.js';
import { writeSegy } from '../../../packages/engines/engines/seismolord/segyWrite';
import { waldenAngle } from '../../../packages/engines/engines/qi/prestack';
import { readFileHeaders, scanGeometry } from '../../../packages/engines/engines/seismolord/segyScan';
import { decodeSamples, readHeaderInt32 } from '../../../packages/engines/engines/seismolord/segyDecode';
import { KINDS } from '../src/handlers/index.js';

jest.setTimeout(180000);
const UID = '11111111-1111-4111-8111-111111111111';
const RAW = '22222222-2222-4222-8222-222222222222';
const GATH = '33333333-3333-4333-8333-333333333333';
const NIL = 5; const NXL = 4; const NS = 120; const DT = 4; const V = 2500; const EV = 100; const A = 0.12; const B = -0.3;
const OFFS = Array.from({ length: 24 }, (_, k) => 60 + 120 * k);
function prestack() {
  const traces = [];
  for (let i = 0; i < NIL; i++) for (let j = 0; j < NXL; j++) for (const o of OFFS) {
    const th = (waldenAngle(o, (EV * DT) / 1000, V, V) * Math.PI) / 180;
    const samples = Array.from({ length: NS }, (_, s) => (s === EV ? A + B * Math.sin(th) ** 2 : 0));
    traces.push({ il: 10 + i, xl: 20 + j, x: 500 + 25 * j, y: 900 + 25 * i, offset: o, samples });
  }
  return writeSegy({ lines: ['avo'], dtUs: DT * 1000, ns: NS, traces });
}

function world() {
  const objects = new Map(); const rows = new Map(); const inserts = [];
  const raw = prestack();
  rows.set(RAW, { id: RAW, user_id: UID, status: 'uploaded', kind: 'segy_upload', name: 'Keta CDP', original_filename: 'keta_cdp.sgy', bucket: 'seismic-raw', object_key: 'raw/keta_cdp.sgy', bytes: raw.length });
  objects.set('raw/keta_cdp.sgy', raw);
  const keyOf = (url) => decodeURIComponent(new URL(url).pathname.slice(1).split('/').slice(1).join('/'));
  const uploads = new Map();
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url); const key = keyOf(url); const method = init.method || 'GET';
    if (method === 'POST' && u.searchParams.has('uploads')) { uploads.set(key, []); return { ok: true, text: async () => '<UploadId>U</UploadId>' }; }
    if (method === 'PUT' && u.searchParams.has('partNumber')) { uploads.get(key).push(new Uint8Array(init.body)); return { ok: true, headers: { get: () => '"e"' } }; }
    if (method === 'POST') { const parts = uploads.get(key); const n = parts.reduce((a, b) => a + b.length, 0); const out = new Uint8Array(n); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } objects.set(key, out); return { ok: true, status: 200 }; }
    if (method === 'PUT') { objects.set(key, new Uint8Array(init.body)); return { ok: true, status: 200 }; }
    if (method === 'DELETE') { objects.delete(key); uploads.delete(key); return { ok: true, status: 204 }; }
    const obj = objects.get(key);
    if (!obj) return { ok: false, status: 404 };
    const range = init.headers?.Range;
    if (range) { const [a, b] = range.replace('bytes=', '').split('-').map(Number); return { ok: true, status: 206, arrayBuffer: async () => obj.slice(a, b + 1).buffer }; }
    return { ok: true, status: 200, arrayBuffer: async () => obj.slice().buffer };
  };
  let n = 0;
  const admin = {
    from: () => ({
      select: () => ({ eq: (c, id) => ({ maybeSingle: async () => ({ data: rows.get(id) || null, error: null }) }) }),
      insert: async (r) => { inserts.push(r); rows.set(r.id, r); return { error: null }; },
    }),
    rpc: async () => ({ data: 0, error: null }),
  };
  const deps = {
    admin, fetchImpl, workBucket: 'seismic-work',
    sign: async (method, bucket, key, q = {}) => `https://store/${bucket}/${key}?${new URLSearchParams(q)}`,
    makeReader: (ds) => ({ size: objects.get(ds.object_key).length, read: async (o, len) => objects.get(ds.object_key).slice(o, o + len).buffer }),
    newId: () => (n++ === 0 ? GATH : `44444444-4444-4444-8444-44444444444${n}`),
    fingerprint: async () => ({ algo: 'test', hash: 'h' }),
    partSize: 4096,
  };
  return { objects, inserts, deps };
}
const ctxFor = (params) => ({ params, job: { id: 'job-1', user_id: UID }, progress: () => {}, cancelled: false });
const RANGES = [{ name: 'near', from: 0, to: 15 }, { name: 'far', from: 25, to: 40 }];
const VEL = { t_ms: [0, 1000], vrms: [V, V] };

test('the kind is registered', () => expect(KINDS).toContain('angle_stacks'));

test('near and far stacks keep the AVO trend, read back, and are registered for conversion', async () => {
  const w = world();
  await ingestGathers(ctxFor({ dataset_id: RAW, bin_width_m: 120, cb: 4 }), w.deps);
  const out = await angleStacks(ctxFor({ dataset_id: GATH, velocity: VEL, ranges: RANGES }), w.deps);
  expect(out.stacks.map((s) => s.name)).toEqual(['near', 'far']);
  expect(out.stacks.every((s) => s.traces === NIL * NXL)).toBe(true);
  const amp = (k) => {
    const bytes = w.objects.get(`stacks/${UID}/${out.stacks[k].dataset_id}/${out.stacks[k].file_name}`);
    const dv = new DataView(bytes.buffer, 3600 + 0 * (240 + 4 * NS));
    expect(readHeaderInt32(new DataView(bytes.buffer, 3600, 240), 189)).toBe(10);
    return { bytes, v: decodeSamples(new DataView(bytes.buffer, 3600 + 240, 4 * NS), 0, NS, 5)[EV] };
  };
  const near = amp(0); const far = amp(1);
  const s2 = (deg) => Math.sin((deg * Math.PI) / 180) ** 2;
  expect(near.v).toBeLessThanOrEqual(A + B * s2(0) + 1e-6);
  expect(near.v).toBeGreaterThanOrEqual(A + B * s2(15) - 1e-6);
  expect(far.v).toBeLessThanOrEqual(A + B * s2(25) + 1e-6);
  expect(far.v).toBeGreaterThanOrEqual(A + B * s2(40) - 1e-6);
  expect(near.v).toBeGreaterThan(far.v);
  const reader = { size: near.bytes.length, read: async (o, n) => near.bytes.slice(o, o + n).buffer };
  const h = await readFileHeaders(reader);
  expect([h.ns, h.dtUs, h.formatCode, h.totalTraces]).toEqual([NS, DT * 1000, 5, NIL * NXL]);
  const g = await scanGeometry(reader);
  expect([g.il.min, g.il.max, g.xl.min, g.xl.max]).toEqual([10, 14, 20, 23]);
  const reg = w.inserts.filter((r) => r.meta?.partial_stack);
  expect(reg.map((r) => [r.kind, r.status, r.meta.partial_stack.name])).toEqual([['segy_upload', 'uploaded', 'near'], ['segy_upload', 'uploaded', 'far']]);
  expect(out.usable_angle.cdps).toBe(NIL * NXL);
  expect(out.usable_angle.q50).toBeGreaterThan(30);
});

test('negative control: a wrong (too fast) velocity misplaces the angles, and the far stack leaves its true bounds', async () => {
  const w = world();
  await ingestGathers(ctxFor({ dataset_id: RAW, bin_width_m: 120, cb: 4 }), w.deps);
  const out = await angleStacks(ctxFor({ dataset_id: GATH, velocity: { t_ms: [0], vrms: [4000] }, ranges: RANGES }), w.deps);
  const far = out.stacks[1];
  const bytes = w.objects.get(`stacks/${UID}/${far.dataset_id}/${far.file_name}`);
  const v = decodeSamples(new DataView(bytes.buffer, 3600 + 240, 4 * NS), 0, NS, 5)[EV];
  const s2 = (deg) => Math.sin((deg * Math.PI) / 180) ** 2;
  expect(v).toBeLessThan(A + B * s2(40) - 0.01); // it took traces from true angles of about 37 to 53 degrees
});

test('settings, and the per-CDP stack weighting by fold', () => {
  expect(validateAngleParams({ dataset_id: GATH, velocity: VEL, ranges: [] })).toMatch(/one to four/);
  expect(validateAngleParams({ dataset_id: GATH, velocity: VEL, ranges: [{ name: 'a', from: 20, to: 10 }] })).toMatch(/from must be below to/);
  expect(validateAngleParams({ dataset_id: GATH, velocity: { t_ms: [0], vrms: [300] }, ranges: RANGES })).toMatch(/1000 to 8000/);
  expect(validateAngleParams({ dataset_id: GATH, velocity: VEL, ranges: [RANGES[0], RANGES[0]] })).toMatch(/differ/);
  // two bins in one range: weights 3 and 1
  const r = stackCdp({ traces: [Float32Array.of(1), Float32Array.of(5)], fold: [3, 1] }, [Float32Array.of(5), Float32Array.of(10)], [{ from: 0, to: 15 }], 1, 1);
  expect(r.stacks[0][0]).toBe(2);
  expect(r.usable).toBe(10);
});
