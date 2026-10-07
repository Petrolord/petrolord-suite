/**
 * @jest-environment node
 */
// avo_volumes (QI programme Q7): three angle stacks whose amplitudes are an
// exact two-term Shuey response with a known A and B per trace give back
// that A and B, the fluid factor of the engine, and the chi projection, as
// derived volumes on the first stack, labelled elastic estimates. Then the
// guards: one lattice, enough angle spread, the output rows, ownership.
import { avoVolumes, validateAvoParams, avoSample } from '../src/handlers/avoVolumes.js';
import { contrastsFromAB } from '../../../packages/engines/engines/qi/avo';
import { NULL_VALUE } from '../../../packages/engines/engines/seismolord/manifest';
import { KINDS } from '../src/handlers/index.js';

jest.setTimeout(120000);
const UID = '11111111-1111-4111-8111-111111111111';
const S = ['21111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '23333333-3333-4333-8333-333333333333'];
const OUT = { A: '31111111-1111-4111-8111-111111111111', B: '32222222-2222-4222-8222-222222222222', FF: '33333333-3333-4333-8333-333333333333' };
const NIL = 6; const NXL = 5; const NS = 32; const BS = 16;
const GRID = [1, 1, NS / BS];
const ANG = [8, 20, 32];
const Aof = (il, xl, s) => 0.05 * Math.sin(s / 4 + il) - 0.01 * xl;
const Bof = (il, xl, s) => -0.12 * Math.cos(s / 5 + xl) + 0.02 * il;
const man = (ns = NS) => ({
  manifest_version: 1, app: 'seismolord', name: 'stack',
  geometry: { il: { min: 1, max: NIL, step: 1, count: NIL }, xl: { min: 1, max: NXL, step: 1, count: NXL }, ns, dt_us: 4000, corners: [[0, 0], [1, 0], [0, 1]] },
  brick: { size: BS, grid: GRID, count: GRID[0] * GRID[1] * GRID[2], dtype: 'float32le', layout: 'il-major,xl,sample-fastest', path_pattern: 'bricks/{i}-{j}-{k}.f32', null_value: 1.0e30 },
  stats: {}, trace_count: NIL * NXL,
});
const store = (angle) => {
  const m = new Map();
  for (let k = 0; k < GRID[2]; k++) m.set(`0-0-${k}`, new Float32Array(BS ** 3).fill(NULL_VALUE));
  const s2 = Math.sin((angle * Math.PI) / 180) ** 2;
  for (let il = 0; il < NIL; il++) for (let xl = 0; xl < NXL; xl++) for (let s = 0; s < NS; s++) {
    m.get(`0-0-${Math.floor(s / BS)}`)[((il % BS) * BS + (xl % BS)) * BS + (s % BS)] = Aof(il, xl, s) + Bof(il, xl, s) * s2;
  }
  return m;
};
const STORES = ANG.map(store);
const rows = () => {
  const r = {};
  S.forEach((id, k) => { r[id] = { id, user_id: UID, status: 'ready', name: `stack ${ANG[k]}`, kind: 'seismic', storage_path: `${UID}/${id}` }; });
  for (const id of Object.values(OUT)) r[id] = { id, user_id: UID, status: 'ingesting', name: `out ${id}`, kind: 'attribute', parent_volume_id: S[0], storage_path: `${UID}/${id}` };
  return r;
};
const adminFor = (r, log = { updates: [] }) => ({
  from: () => { let id = null; const b = { select: () => b, eq: (c, v) => { if (c === 'id') id = v; return b; }, maybeSingle: async () => ({ data: r[id] || null, error: null }), update: (row) => ({ eq: (c, v) => { log.updates.push({ id: v, row }); return { eq: async () => ({ error: null }) }; } }), delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }; return b; },
  rpc: async (name) => ({ data: name.startsWith('seismic_storage_usage') ? 0 : 1e12, error: null }),
  storage: { from: () => ({ remove: async () => ({}) }) },
});
const depsFor = (r = rows(), { manifests = [man(), man(), man()] } = {}) => {
  const uploads = new Map();
  const byPath = Object.fromEntries(S.map((id, k) => [`${UID}/${id}/manifest.json`, manifests[k]]));
  return {
    uploads,
    d: {
      admin: adminFor(r),
      readManifest: async (path) => byPath[path],
      makeFetcher: (m, k) => async (path) => STORES[k].get(path.match(/bricks\/(\d+-\d+-\d+)\.f32$/)[1]).slice().buffer,
      storage: { upload: async (path, bytes) => { uploads.set(path, bytes); return {}; } },
    },
  };
};
const ctxFor = (params) => ({ params, job: { user_id: UID }, progress: () => {}, cancelled: false, log: {} });
const P = { stacks: S.map((id, k) => ({ volume_id: id, angle: ANG[k] })), products: OUT, vs_vp: 0.5 };

test('the kind is registered', () => expect(KINDS).toContain('avo_volumes'));

test('A, B and the fluid factor come back from an exact two-term response', async () => {
  const { d, uploads } = depsFor();
  const out = await avoVolumes(ctxFor(P), d);
  expect(out.volume_ids).toEqual(OUT);
  const at = (id, il, xl, s) => new Float32Array(uploads.get(`${UID}/${id}/bricks/0-0-${Math.floor(s / BS)}.f32`).buffer.slice(0))[((il % BS) * BS + xl) * BS + (s % BS)];
  for (const [il, xl, s] of [[0, 0, 0], [3, 2, 17], [5, 4, 31]]) {
    expect(at(OUT.A, il, xl, s)).toBeCloseTo(Aof(il, xl, s), 5);
    expect(at(OUT.B, il, xl, s)).toBeCloseTo(Bof(il, xl, s), 5);
    expect(at(OUT.FF, il, xl, s)).toBeCloseTo(contrastsFromAB(Aof(il, xl, s), Bof(il, xl, s), 0.5).fluidFactor, 4);
  }
  const m = JSON.parse(new TextDecoder().decode(uploads.get(`${UID}/${OUT.B}/manifest.json`)));
  expect(m.attribute).toMatchObject({ name: 'qi_avo', params: { product: 'B', qi_class: 'elastic_estimate' } });
});

test('guards', async () => {
  expect(validateAvoParams({ ...P, stacks: P.stacks.slice(0, 1) })).toMatch(/two to four/);
  expect(validateAvoParams({ ...P, stacks: [{ volume_id: S[0], angle: 10 }, { volume_id: S[1], angle: 12 }] })).toMatch(/5 degrees/);
  expect(validateAvoParams({ ...P, products: { Z: OUT.A } })).toMatch(/products/);
  await expect(avoVolumes(ctxFor(P), depsFor(rows(), { manifests: [man(), man(48), man()] }).d)).rejects.toMatchObject({ stage: 'validate_failed', message: expect.stringMatching(/one lattice/) });
  const r = rows(); r[S[1]].user_id = 'x';
  await expect(avoVolumes(ctxFor(P), depsFor(r).d)).rejects.toMatchObject({ stage: 'not_found' });
  const r2 = rows(); r2[OUT.A].parent_volume_id = S[1];
  await expect(avoVolumes(ctxFor(P), depsFor(r2).d)).rejects.toMatchObject({ stage: 'validate_failed' });
  expect(Number.isNaN(avoSample([10, 30], [NaN, 0.1], { vsVp: 0.5, chiDeg: 20 }).A)).toBe(true);
});

test('negative control: stacks given the wrong angles return a wrong gradient', async () => {
  const { d, uploads } = depsFor();
  const swapped = { ...P, stacks: [{ volume_id: S[0], angle: 32 }, { volume_id: S[1], angle: 20 }, { volume_id: S[2], angle: 8 }] };
  await avoVolumes(ctxFor(swapped), d);
  const at = (id, s) => new Float32Array(uploads.get(`${UID}/${id}/bricks/0-0-${Math.floor(s / BS)}.f32`).buffer.slice(0))[((3 % BS) * BS + 2) * BS + (s % BS)];
  let off = 0;
  for (let s = 0; s < NS; s++) if (Math.abs(at(OUT.B, s) - Bof(3, 2, s)) > 0.01) off += 1;
  expect(off).toBeGreaterThan(NS / 2);
});
