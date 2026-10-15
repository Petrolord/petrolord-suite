/**
 * @jest-environment node
 */
// zone_maps (QI upgrade P1.5): map products between two horizons or a
// horizon and a window. Every map cell equals the engine's zoneProducts on
// the whole trace (the handler only reads the zone's bricks), a linear
// volume gives its closed-form zone mean, the confidence spread is the
// designed one, and the guards hold: one lattice, own horizons on a volume
// of the lattice, quota, cancel. Negative control: the map from the wrong
// base horizon differs.
import { zoneMaps, validateZoneMapParams } from '../src/handlers/zoneMaps.js';
import { zoneRange, zoneProducts } from '../../../packages/engines/engines/qi/zoneMaps.js';
import { NULL_VALUE } from '../../../packages/engines/engines/seismolord/manifest';
import { KINDS } from '../src/handlers/index.js';

const UID = '11111111-1111-4111-8111-111111111111';
const V = ['21111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '23333333-3333-4333-8333-333333333333', '24444444-4444-4444-8444-444444444444'];
const HT = '41111111-1111-4111-8111-111111111111';
const HB = '42222222-2222-4222-8222-222222222222';
const HX = '43333333-3333-4333-8333-333333333333';
const NIL = 20; const NXL = 18; const NS = 96; const B = 16; const DT = 4;
const GRID = [Math.ceil(NIL / B), Math.ceil(NXL / B), Math.ceil(NS / B)];
const manifest = (extra = {}) => ({
  manifest_version: 1,
  geometry: { il: { min: 1, max: NIL, step: 1, count: NIL }, xl: { min: 1, max: NXL, step: 1, count: NXL }, ns: NS, dt_us: DT * 1000, corners: [[0, 0], [25 * (NIL - 1), 0], [0, 25 * (NXL - 1)]] },
  brick: { size: B, grid: GRID, count: GRID[0] * GRID[1] * GRID[2], dtype: 'float32le', layout: 'il-major,xl,sample-fastest', path_pattern: 'bricks/{i}-{j}-{k}.f32', null_value: 1e30 },
  stats: {}, trace_count: NIL * NXL, ...extra,
});
// value volume: linear in sample, plus a lateral term; Q10/Q50/Q90 around it
const val = (il, xl, s) => 0.2 + 0.001 * s + 0.01 * il - 0.005 * xl;
const VALUES = [
  val,
  (il, xl, s) => val(il, xl, s) - 0.02 - 0.001 * il,
  (il, xl, s) => val(il, xl, s),
  (il, xl, s) => val(il, xl, s) + 0.03,
];
function store(fn) {
  const m = new Map();
  for (let i = 0; i < GRID[0]; i++) for (let j = 0; j < GRID[1]; j++) for (let k = 0; k < GRID[2]; k++) m.set(`${i}-${j}-${k}`, new Float32Array(B ** 3).fill(NULL_VALUE));
  for (let il = 0; il < NIL; il++) for (let xl = 0; xl < NXL; xl++) for (let s = 0; s < NS; s++) {
    if (il === 3 && xl === 4 && s > 40 && s < 44) continue; // a few dead samples
    m.get(`${Math.floor(il / B)}-${Math.floor(xl / B)}-${Math.floor(s / B)}`)[((il % B) * B + (xl % B)) * B + (s % B)] = Math.fround(fn(il, xl, s));
  }
  return m;
}
const STORES = VALUES.map(store);
const trace = (k, il, xl) => Float32Array.from({ length: NS }, (_, s) => STORES[k].get(`${Math.floor(il / B)}-${Math.floor(xl / B)}-${Math.floor(s / B)}`)[((il % B) * B + (xl % B)) * B + (s % B)]);
const topAt = (il, xl) => 20.3 + 0.5 * il + 0.2 * xl;
const baseAt = (il, xl) => 50.6 + 0.8 * il - 0.1 * xl;
const GRIDS = {
  ht: Float32Array.from({ length: NIL * NXL }, (_, c) => (c === 5 ? NULL_VALUE : topAt(Math.floor(c / NXL), c % NXL))),
  hb: Float32Array.from({ length: NIL * NXL }, (_, c) => baseAt(Math.floor(c / NXL), c % NXL)),
  hx: Float32Array.from({ length: NIL * NXL }, (_, c) => baseAt(Math.floor(c / NXL), c % NXL) + 9),
};
const rows = (over = {}) => {
  const r = {};
  V.forEach((id, k) => { r[id] = { id, user_id: UID, status: 'ready', name: `vol ${k}`, storage_path: `${UID}/${id}`, parent_volume_id: k ? V[0] : null }; });
  return { ...r, ...over };
};
const HROWS = {
  [HT]: { id: HT, user_id: UID, volume_id: V[0], name: 'Top', storage_path: 'ht' },
  [HB]: { id: HB, user_id: UID, volume_id: V[0], name: 'Base', storage_path: 'hb' },
  [HX]: { id: HX, user_id: UID, volume_id: V[0], name: 'Deeper', storage_path: 'hx' },
};
const depsFor = ({ volumes = rows(), horizons = HROWS, mans = {}, quota = 1e12 } = {}) => {
  const uploads = new Map();
  return {
    uploads,
    d: {
      admin: {
        from: (t) => { let id = null; const b = { select: () => b, eq: (c, v) => { if (c === 'id') id = v; return b; }, maybeSingle: async () => ({ data: (t === 'seismic_horizons' ? horizons : volumes)[id] || null, error: null }) }; return b; },
        rpc: async (name) => ({ data: name.startsWith('seismic_storage_usage') ? 0 : quota, error: null }),
      },
      readManifest: async (path) => mans[path.split('/')[1]] || manifest(),
      readBlob: async (path) => GRIDS[path].slice().buffer,
      makeFetcher: (m, k) => async (path) => STORES[k].get(path.match(/bricks\/(\d+-\d+-\d+)\.f32$/)[1]).slice().buffer,
      storage: { upload: async (path, bytes) => { uploads.set(path, Float32Array.from(new Float32Array(bytes.buffer.slice(0)))); return {}; } },
    },
  };
};
const ctxFor = (params, { cancelled = false } = {}) => ({ params, job: { id: 'job-1', user_id: UID }, progress: () => {}, get cancelled() { return cancelled; }, log: {} });
const PRODUCTS = [
  { key: 'mean', kind: 'stat', input: 0, stat: 'mean' },
  { key: 'rms', kind: 'stat', input: 0, stat: 'rms' },
  { key: 'frac', kind: 'stat', input: 0, stat: 'frac', cutoff: 0.3 },
  { key: 'conf', kind: 'spread', q10: 1, q50: 2, q90: 3 },
  { key: 'rel', kind: 'spread', q10: 1, q50: 2, q90: 3, relative: true },
  { key: 'thick', kind: 'thickness' },
];
const params = (over = {}) => ({ volume_ids: V, top_horizon_id: HT, base_horizon_id: HB, products: PRODUCTS, ...over });

test('the job kind is registered', () => expect(KINDS).toContain('zone_maps'));

test('every map cell equals the engine on the whole trace; the linear volume gives its closed form', async () => {
  const { d, uploads } = depsFor();
  const out = await zoneMaps(ctxFor(params()), d);
  expect(out.products.map((x) => x.key)).toEqual(PRODUCTS.map((x) => x.key));
  const map = (key) => uploads.get(`${UID}/qi-zone-maps/job-1/${key}.f32`);
  let checked = 0;
  for (let il = 0; il < NIL; il++) for (let xl = 0; xl < NXL; xl++) {
    const c = il * NXL + xl;
    const t = GRIDS.ht[c]; const bs = GRIDS.hb[c];
    if (c === 5) { for (const p of PRODUCTS) expect(map(p.key)[c]).toBe(Math.fround(1e30)); continue; }
    const range = zoneRange(t, bs, NS);
    const ref = zoneProducts({ traces: [0, 1, 2, 3].map((k) => trace(k, il, xl)), products: PRODUCTS, range, top: t, base: bs, dtMs: DT });
    PRODUCTS.forEach((p, o) => expect(map(p.key)[c]).toBe(Math.fround(ref[o])));
    if (!(il === 3 && xl === 4)) {
      const [s0, s1] = range;
      expect(map('mean')[c]).toBeCloseTo(val(il, xl, (s0 + s1) / 2), 5);
      expect(map('conf')[c]).toBeCloseTo(0.05 + 0.001 * il, 5);
    }
    checked += 1;
  }
  expect(checked).toBe(NIL * NXL - 1);
  expect(out.traces_with_zone).toBe(NIL * NXL - 1);
  expect(out.products[0].live).toBe(NIL * NXL - 1);
});

test('negative control: the map with the wrong base horizon differs; a window below the top works', async () => {
  const a = depsFor(); await zoneMaps(ctxFor(params()), a.d);
  const b = depsFor(); await zoneMaps(ctxFor(params({ base_horizon_id: HX })), b.d);
  const ma = a.uploads.get(`${UID}/qi-zone-maps/job-1/mean.f32`); const mb = b.uploads.get(`${UID}/qi-zone-maps/job-1/mean.f32`);
  expect(Math.abs(ma[100] - mb[100])).toBeGreaterThan(1e-3);
  const w = depsFor();
  const out = await zoneMaps(ctxFor(params({ base_horizon_id: undefined, window_ms: 40 })), w.d);
  expect(out.window_ms).toBe(40);
  const c = 7 * NXL + 9;
  const r = zoneRange(GRIDS.ht[c], null, NS, { windowSamples: 10 });
  expect(w.uploads.get(`${UID}/qi-zone-maps/job-1/mean.f32`)[c]).toBeCloseTo(val(7, 9, (r[0] + r[1]) / 2), 5);
});

test('guards: settings, one lattice, own horizons on the lattice, quota, cancel', async () => {
  expect(validateZoneMapParams(params({ base_horizon_id: HT }))).toMatch(/other than the top/);
  expect(validateZoneMapParams(params({ base_horizon_id: undefined }))).toMatch(/window/);
  expect(validateZoneMapParams(params({ products: [{ key: 'x', kind: 'stat', input: 9, stat: 'mean' }] }))).toMatch(/volumes/);
  expect(validateZoneMapParams(params({ products: [{ key: 'x', kind: 'stat', input: 0, stat: 'frac' }] }))).toMatch(/cutoff/);
  expect(validateZoneMapParams(params({ products: [PRODUCTS[0], PRODUCTS[0]] }))).toMatch(/share the key/);
  expect(validateZoneMapParams(params())).toBeNull();
  await expect(zoneMaps(ctxFor(params()), depsFor({ volumes: rows({ [V[2]]: { ...rows()[V[2]], user_id: 'x' } }) }).d)).rejects.toMatchObject({ stage: 'not_found' });
  const other = manifest(); other.geometry = { ...other.geometry, ns: NS + 4 };
  await expect(zoneMaps(ctxFor(params()), depsFor({ mans: { [V[1]]: other } }).d)).rejects.toMatchObject({ stage: 'validate_failed' });
  await expect(zoneMaps(ctxFor(params()), depsFor({ horizons: { ...HROWS, [HB]: { ...HROWS[HB], user_id: 'x' } } }).d)).rejects.toMatchObject({ stage: 'not_found' });
  await expect(zoneMaps(ctxFor(params()), depsFor({ quota: 10 }).d)).rejects.toMatchObject({ stage: 'over_quota' });
  expect(await zoneMaps(ctxFor(params(), { cancelled: true }), depsFor().d)).toBeNull();
});
