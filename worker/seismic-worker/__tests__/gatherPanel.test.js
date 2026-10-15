/**
 * @jest-environment node
 */
// gather_panel (QI upgrade P1.7): the gathers of a store built by
// ingest_gathers come back in the panel exactly as the SEG-Y traces went in
// (per bin, in the time window), with the fold, for one CDP, a stretch of a
// line, world positions, and a store beside its trimmed copy. Negative
// controls: the neighbouring CDP's gather differs; another user's store and
// over-large requests are refused.
import { ingestGathers } from '../src/handlers/ingestGathers.js';
import { trimGathers } from '../src/handlers/trimGathers.js';
import { gatherPanel, validateGatherPanelParams, panelCdps, MAX_GATHERS } from '../src/handlers/gatherPanel.js';
import { writeSegy } from '../../../packages/engines/engines/seismolord/segyWrite';
import { KINDS } from '../src/handlers/index.js';

jest.setTimeout(180000);
const UID = '11111111-1111-4111-8111-111111111111';
const OTHER = '99999999-9999-4999-8999-999999999999';
const RAW = '22222222-2222-4222-8222-222222222222';
const GATH = '33333333-3333-4333-8333-333333333333';
const TRIM = '44444444-4444-4444-8444-444444444444';
const NIL = 6; const NXL = 5; const NS = 200; const DT = 4;
const OFFS = Array.from({ length: 8 }, (_, k) => 75 + 150 * k);
// every sample tells where it came from: inline, crossline, offset bin and time
const value = (i, j, b, s) => 1000 * i + 100 * j + 10 * b + s / 1000;
function file() {
  const traces = [];
  for (let i = 0; i < NIL; i++) for (let j = 0; j < NXL; j++) OFFS.forEach((o, b) => {
    traces.push({ il: 10 + 2 * i, xl: 100 + j, x: 1000 + 25 * j, y: 5000 + 25 * i, offset: o, samples: Array.from({ length: NS }, (_, s) => value(i, j, b, s)) });
  });
  return writeSegy({ dtUs: DT * 1000, ns: NS, traces });
}
function world() {
  const objects = new Map(); const rows = new Map(); const puts = [];
  const raw = file();
  rows.set(RAW, { id: RAW, user_id: UID, status: 'uploaded', kind: 'segy_upload', name: 'Keta CDP', original_filename: 'k.sgy', bucket: 'seismic-raw', object_key: 'raw/k.sgy', bytes: raw.length });
  const keyOf = (url) => new URL(url).pathname.slice(1).split('/').slice(1).join('/');
  let nextId = GATH;
  return {
    rows, objects, puts,
    admin: {
      from: () => ({ select: () => ({ eq: (c, id) => ({ maybeSingle: async () => ({ data: rows.get(id) || null, error: null }) }) }), insert: async (r) => { rows.set(r.id, r); return { error: null }; } }),
      rpc: async () => ({ data: 0, error: null }),
    },
    sign: async (method, bucket, key) => `https://store/${bucket}/${key}?m=${method}`,
    fetchImpl: async (url, init = {}) => {
      const key = keyOf(url);
      if (init.method === 'PUT') { objects.set(key, new Uint8Array(init.body)); puts.push(key); return { ok: true, status: 200 }; }
      const o = objects.get(key); return o ? { ok: true, status: 200, arrayBuffer: async () => o.slice().buffer } : { ok: false, status: 404 };
    },
    makeReader: () => ({ size: raw.length, read: async (off, n) => raw.slice(off, off + n).buffer }),
    newId: () => { const id = nextId; nextId = TRIM; return id; }, workBucket: 'seismic-work',
  };
}
const ctxFor = (params, uid = UID) => ({ params, job: { id: 'job-1', user_id: uid }, progress: () => {}, cancelled: false });
const panelOf = (d, r) => new Float32Array(d.objects.get(r.key).slice().buffer);

let d;
beforeAll(async () => {
  d = world();
  await ingestGathers(ctxFor({ dataset_id: RAW, bin_width_m: 150, cb: 4 }), d);
});

test('the kind is registered', () => expect(KINDS).toContain('gather_panel'));

test('one CDP: every bin and sample comes back as it went in, with the fold and line numbers', async () => {
  const r = await gatherPanel(ctxFor({ dataset_id: GATH, mode: 'cdp', il: 4, xl: 3 }), d);
  expect(r.gathers).toEqual([expect.objectContaining({ i: 4, j: 3, il: 18, xl: 103, fold: new Array(8).fill(1) })]);
  expect(r.bins.centres).toHaveLength(8);
  expect(r.window).toEqual({ s0: 0, ns: NS, t0_ms: 0, dt_ms: DT });
  expect(r.nmo_corrected).toBe(true);
  expect(r.url).toMatch(/panels\/.*panel\.f32\?m=GET/);
  const p = panelOf(d, r);
  expect(p.length).toBe(8 * NS);
  let worst = 0;
  for (let b = 0; b < 8; b++) for (let s = 0; s < NS; s++) worst = Math.max(worst, Math.abs(p[b * NS + s] - Math.fround(value(4, 3, b, s))));
  expect(worst).toBe(0);
  // negative control: the neighbouring CDP's gather is not this one
  expect(p[3 * NS + 10]).not.toBeCloseTo(value(4, 2, 3, 10), 3);
});

test('a time window and an inline stretch with a step', async () => {
  const r = await gatherPanel(ctxFor({ dataset_id: GATH, mode: 'inline', il: 2, from: 0, to: 4, step: 2, t_ms: [100, 200] }), d);
  expect(r.gathers.map((g) => g.j)).toEqual([0, 2, 4]);
  expect(r.window).toEqual({ s0: 25, ns: 26, t0_ms: 100, dt_ms: DT });
  const p = panelOf(d, r);
  expect(p[1 * 8 * 26 + 5 * 26 + 3]).toBe(Math.fround(value(2, 2, 5, 28)));
});

test('world positions land on their CDPs, and one outside is listed as skipped', async () => {
  const r = await gatherPanel(ctxFor({ dataset_id: GATH, mode: 'points', points: [{ x: 1000 + 25 * 1, y: 5000 + 25 * 3, label: 'KETA-1' }, { x: -9e6, y: 0, label: 'FAR-1' }] }), d);
  expect(r.gathers).toEqual([expect.objectContaining({ i: 3, j: 1, label: 'KETA-1' })]);
  expect(r.skipped).toEqual([{ label: 'FAR-1', reason: 'outside the gather store' }]);
});

test('a store beside its trimmed copy: both panels, the source first', async () => {
  await trimGathers(ctxFor({ dataset_id: GATH, centre_ms: 400, window_ms: 40, max_shift_ms: 8 }), d);
  expect(d.rows.get(TRIM)?.kind).toBe('gathers_offset');
  const r = await gatherPanel(ctxFor({ dataset_id: GATH, compare_dataset_id: TRIM, mode: 'cdp', il: 1, xl: 1 }), d);
  expect(r.stores).toBe(2);
  expect(r.gathers[0].compareFold).toHaveLength(8);
  const p = panelOf(d, r);
  expect(p.length).toBe(2 * 8 * NS);
  expect(p[2 * NS + 7]).toBe(Math.fround(value(1, 1, 2, 7)));
});

test('refusals: another user, too many gathers, a bad window, a non-store', async () => {
  await expect(gatherPanel(ctxFor({ dataset_id: GATH, mode: 'cdp' }, OTHER), d)).rejects.toThrow(/not found in your account/);
  await expect(gatherPanel(ctxFor({ dataset_id: RAW, mode: 'cdp' }), d)).rejects.toThrow(/gather store/);
  await expect(gatherPanel(ctxFor({ dataset_id: GATH, mode: 'cdp', il: 50, xl: 0 }), d)).rejects.toThrow(/outside/);
  expect(() => panelCdps({ mode: 'crossline', xl: 0, from: 0, to: 4000, step: 1 }, { il: { count: 5000 }, xl: { count: 10 } })).toThrow(new RegExp(`at most ${MAX_GATHERS}`));
  expect(validateGatherPanelParams({ dataset_id: GATH, mode: 'cdp', t_ms: [200, 100] })).toMatch(/later end/);
  expect(validateGatherPanelParams({ dataset_id: GATH, mode: 'points', points: [] })).toMatch(/at least one/);
  expect(validateGatherPanelParams({ dataset_id: GATH, compare_dataset_id: GATH, mode: 'cdp' })).toMatch(/another store/);
});

// Links for the browser are signed for the public endpoint (found by the QI
// round 3 live check: links signed for the internal seaweedfs host never opened).
import { makeSigner, makeLinkSigner } from '../src/s3.js';
test('browser links use the public endpoint; the worker keeps the internal one for its own I/O', async () => {
  const s3 = { endpoint: 'http://seaweedfs:8333', publicEndpoint: 'https://storage.petrolord.com', region: 'us-east-1', accessKeyId: 'k', secretAccessKey: 's' };
  expect(new URL(await makeLinkSigner(s3)('GET', 'seismic-work', 'panels/a/b.f32', {}, 7200)).host).toBe('storage.petrolord.com');
  expect(new URL(await makeSigner(s3)('GET', 'seismic-work', 'panels/a/b.f32')).host).toBe('seaweedfs:8333');
});

test('the panel link comes from the link signer; the panel itself is written through the worker signer', async () => {
  const d2 = { ...d, linkSign: async (method, bucket, key) => `https://public/${bucket}/${key}?m=${method}` };
  const r = await gatherPanel(ctxFor({ dataset_id: GATH, mode: 'cdp', il: 4, xl: 3 }), d2);
  expect(r.url).toMatch(/^https:\/\/public\/seismic-work\/panels\/.*panel\.f32\?m=GET$/);
  expect(panelOf(d, r).length).toBe(8 * NS);
});
