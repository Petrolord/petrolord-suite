/**
 * @jest-environment node
 */
// avo_volumes calibration (QI upgrade P2.10): three stacks reaching 38
// degrees carry an exact three-term Shuey response scaled by a gain that
// drifts across the survey. With terms auto and a scale field from the wells
// the volumes return A, B and C in reflectivity at the wells, and the class
// volume is the one classifier's code. Negative controls: a two-term fit
// biases B; one pooled scale misses the far side of the drift.
import { avoVolumes, validateAvoParams } from '../src/handlers/avoVolumes.js';
import { avoClassCode } from '../../../packages/engines/engines/qi/avoCalibration';
import { NULL_VALUE } from '../../../packages/engines/engines/seismolord/manifest';

jest.setTimeout(120000);
const UID = '11111111-1111-4111-8111-111111111111';
const S = ['21111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '23333333-3333-4333-8333-333333333333'];
const OUT = { A: '31111111-1111-4111-8111-111111111111', B: '32222222-2222-4222-8222-222222222222', C: '33333333-3333-4333-8333-333333333333', class: '34444444-4444-4444-8444-444444444444' };
const NIL = 6; const NXL = 5; const NS = 32; const BS = 16; const GRID = [1, 1, NS / BS];
const ANG = [8, 22, 38];
const Aof = (il, xl, s) => 0.06 * Math.sin(s / 4 + il) - 0.01 * xl;
const Bof = (il, xl, s) => -0.15 * Math.cos(s / 5 + xl) + 0.02 * il;
const Cof = () => 0.04;
const gain = (il) => 1000 * (1 + 0.5 * il);
const man = () => ({ manifest_version: 1, geometry: { il: { min: 1, max: NIL, step: 1, count: NIL }, xl: { min: 1, max: NXL, step: 1, count: NXL }, ns: NS, dt_us: 4000, corners: [[0, 0], [1, 0], [0, 1]] }, brick: { size: BS, grid: GRID, count: GRID[2], dtype: 'float32le', layout: 'il-major,xl,sample-fastest', path_pattern: 'bricks/{i}-{j}-{k}.f32', null_value: 1e30 }, stats: {}, trace_count: NIL * NXL });
const R = (t) => (t * Math.PI) / 180;
const store = (angle) => {
  const m = new Map(); for (let k = 0; k < GRID[2]; k++) m.set(`0-0-${k}`, new Float32Array(BS ** 3).fill(NULL_VALUE));
  const s2 = Math.sin(R(angle)) ** 2; const t2 = Math.tan(R(angle)) ** 2;
  for (let il = 0; il < NIL; il++) for (let xl = 0; xl < NXL; xl++) for (let s = 0; s < NS; s++) m.get(`0-0-${Math.floor(s / BS)}`)[(il * BS + xl) * BS + (s % BS)] = gain(il) * (Aof(il, xl, s) + Bof(il, xl, s) * s2 + Cof() * (t2 - s2));
  return m;
};
const STORES = ANG.map(store);
const rows = () => { const r = {}; S.forEach((id, k) => { r[id] = { id, user_id: UID, status: 'ready', name: `stack ${ANG[k]}`, kind: 'seismic', storage_path: `${UID}/${id}` }; }); for (const id of Object.values(OUT)) r[id] = { id, user_id: UID, status: 'ingesting', name: `out ${id}`, kind: 'attribute', parent_volume_id: S[0], storage_path: `${UID}/${id}` }; return r; };
const run = async (extra, products = OUT) => {
  const uploads = new Map(); const r = rows();
  const d = {
    admin: { from: () => { let id = null; const b = { select: () => b, eq: (c, v) => { if (c === 'id') id = v; return b; }, maybeSingle: async () => ({ data: r[id] || null, error: null }), update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }), delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }; return b; }, rpc: async (n) => ({ data: n.startsWith('seismic_storage_usage') ? 0 : 1e12, error: null }), storage: { from: () => ({ remove: async () => ({}) }) } },
    readManifest: async () => man(), makeFetcher: (m, k) => async (path) => STORES[k].get(path.match(/bricks\/(\d+-\d+-\d+)\.f32$/)[1]).slice().buffer,
    storage: { upload: async (path, bytes) => { uploads.set(path, bytes); return {}; } },
  };
  const out = await avoVolumes({ params: { stacks: S.map((id, k) => ({ volume_id: id, angle: ANG[k] })), products, ...extra }, job: { user_id: UID }, progress: () => {}, cancelled: false, log: {} }, d);
  const at = (key, il, xl, s) => new Float32Array(uploads.get(`${UID}/${products[key]}/bricks/0-0-${Math.floor(s / BS)}.f32`).buffer.slice(0))[(il * BS + xl) * BS + (s % BS)];
  return { out, at, uploads };
};
const WELLS = [0, 2, 5].map((il) => ({ name: `W${il}`, x: il, y: 2, scale: gain(il) }));

test('terms auto and a scale field: A, B and C in reflectivity at the wells; the class volume is the classifier\'s code', async () => {
  const { out, at, uploads } = await run({ terms: 'auto', scale_field: { wells: WELLS } });
  expect(out.terms).toBe(3);
  expect(out.calibrated).toBe('scale field');
  for (const il of [0, 2, 5]) for (const s of [3, 11, 25]) {
    expect(at('A', il, 2, s)).toBeCloseTo(Aof(il, 2, s), 5);
    expect(at('B', il, 2, s)).toBeCloseTo(Bof(il, 2, s), 4);
    expect(at('C', il, 2, s)).toBeCloseTo(Cof(), 4);
    expect(at('class', il, 2, s)).toBe(avoClassCode(Math.fround(at('A', il, 2, s)), Math.fround(at('B', il, 2, s))));
  }
  const m = JSON.parse(new TextDecoder().decode(uploads.get(`${UID}/${OUT.class}/manifest.json`)));
  expect(m.attribute.params).toMatchObject({ product: 'class', qi_class: 'interpretation', terms: 3 });
});

test('negative controls: two terms bias B; one pooled scale misses the far side of the drift', async () => {
  const two = await run({ terms: 2, scale_field: { wells: WELLS } }, { A: OUT.A, B: OUT.B });
  const errTwo = Math.abs(two.at('B', 2, 2, 11) - Bof(2, 2, 11));
  expect(errTwo).toBeGreaterThan(0.005);
  const pooled = await run({ terms: 3, scale: gain(2) }, { A: OUT.A, B: OUT.B });
  expect(Math.abs(pooled.at('A', 5, 2, 3) - Aof(5, 2, 3)) / Math.abs(Aof(5, 2, 3))).toBeGreaterThan(0.2);
});

test('refusals: C needs three terms, a class needs a calibration, a field needs positions', () => {
  const base = { stacks: S.map((id, k) => ({ volume_id: id, angle: ANG[k] })) };
  expect(validateAvoParams({ ...base, products: { C: OUT.C } })).toMatch(/three-term/);
  expect(validateAvoParams({ ...base, products: { class: OUT.class } })).toMatch(/reflectivity/);
  expect(validateAvoParams({ ...base, products: { A: OUT.A }, scale_field: { wells: [{ name: 'x', scale: 2 }] } })).toMatch(/position/);
  expect(validateAvoParams({ ...base, stacks: base.stacks.slice(0, 2), products: { A: OUT.A }, terms: 3 })).toMatch(/three stacks/);
});
