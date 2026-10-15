/**
 * @jest-environment node
 */
// spectral_balance (QI round 3): a far stack recorded with a 20 Hz wavelet is
// given the 35 Hz near stack's bandwidth by one operator for the survey. The
// balanced traces follow the near-bandwidth truth (the same reflectivity
// through the near wavelet), a trace twice as bright as its neighbour stays
// exactly twice as bright, and the stack keeps its band energy. Negative
// control: a flat target in a narrow low band does not reach the truth.
import { balanceStacksJob, validateBalanceParams, BALANCE_ATTRIBUTE } from '../src/handlers/balanceStacks.js';
import { NULL_VALUE } from '../../../packages/engines/engines/seismolord/manifest';
import { KINDS } from '../src/handlers/index.js';

jest.setTimeout(180000);
const UID = '11111111-1111-4111-8111-111111111111';
const NEAR = '21111111-1111-4111-8111-111111111111'; const FAR = '22222222-2222-4222-8222-222222222222'; const OUT = '33333333-3333-4333-8333-333333333333';
const NIL = 6; const NXL = 6; const NS = 256; const BS = 16; const DT = 2; const GRID = [1, 1, NS / BS];
const ricker = (t, f) => { const a = (Math.PI * f * t / 1000) ** 2; return (1 - 2 * a) * Math.exp(-a); };
let seed = 5; const u = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
const REFL = Array.from({ length: NIL * NXL }, () => Float64Array.from({ length: NS }, () => (u() > 0.4 ? u() : 0)));
REFL[2 * NXL + 3] = REFL[2 * NXL + 2]; // (2,3) has (2,2)'s geology at twice the amplitude
const gainOf = (il, xl) => (il === 2 && xl === 3 ? 2 : 1);
const conv = (r, f, g) => Float64Array.from({ length: NS }, (_, i) => { let s = 0; for (let k = -40; k <= 40; k++) { const j = i - k; if (j >= 0 && j < NS) s += r[j] * ricker(k * DT, f); } return s * g; });
const nearTrace = (il, xl) => conv(REFL[il * NXL + xl], 35, gainOf(il, xl));
const farTrace = (il, xl) => conv(REFL[il * NXL + xl], 20, 0.7 * gainOf(il, xl));
const truthTrace = (il, xl) => conv(REFL[il * NXL + xl], 35, 0.7 * gainOf(il, xl));
const store = (fn) => {
  const m = new Map(); for (let k = 0; k < GRID[2]; k++) m.set(`0-0-${k}`, new Float32Array(BS ** 3).fill(NULL_VALUE));
  for (let il = 0; il < NIL; il++) for (let xl = 0; xl < NXL; xl++) { const t = fn(il, xl); for (let s = 0; s < NS; s++) m.get(`0-0-${Math.floor(s / BS)}`)[((il % BS) * BS + xl) * BS + (s % BS)] = t[s]; }
  return m;
};
const man = { manifest_version: 1, geometry: { il: { min: 1, max: NIL, step: 1, count: NIL }, xl: { min: 1, max: NXL, step: 1, count: NXL }, ns: NS, dt_us: DT * 1000, corners: [[0, 0], [1, 0], [0, 1]] }, brick: { size: BS, grid: GRID, count: GRID[2], dtype: 'float32le', layout: 'il-major,xl,sample-fastest', path_pattern: 'bricks/{i}-{j}-{k}.f32', null_value: 1e30 }, stats: {}, trace_count: NIL * NXL };
const rows = { [NEAR]: { id: NEAR, user_id: UID, status: 'ready', name: 'near', kind: 'seismic', storage_path: `${UID}/${NEAR}` }, [FAR]: { id: FAR, user_id: UID, status: 'ready', name: 'far', kind: 'seismic', storage_path: `${UID}/${FAR}` }, [OUT]: { id: OUT, user_id: UID, status: 'ingesting', name: 'far balanced', kind: 'attribute', parent_volume_id: FAR, storage_path: `${UID}/${OUT}` } };
const STORES = { [NEAR]: store(nearTrace), [FAR]: store(farTrace) };
const deps = () => {
  const uploads = new Map(); const updates = [];
  return {
    uploads, updates,
    d: {
      admin: {
        from: () => { let id = null; const b = { select: () => b, eq: (c, v) => { if (c === 'id') id = v; return b; }, maybeSingle: async () => ({ data: rows[id] || null, error: null }), update: (r) => { updates.push(r); return { eq: () => ({ eq: async () => ({ error: null }) }) }; }, delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }; return b; },
        rpc: async (name) => ({ data: name.startsWith('seismic_storage_usage') ? 0 : 1e12, error: null }),
        storage: { from: () => ({ remove: async () => ({}) }) },
      },
      readManifest: async () => man,
      makeFetcher: (m, k) => async (path) => STORES[path.split('/')[1]].get(path.match(/bricks\/(\d+-\d+-\d+)\.f32$/)[1]).slice().buffer,
      storage: { upload: async (path, bytes) => { uploads.set(path, bytes); return {}; } },
    },
  };
};
const ctxFor = (params) => ({ params, job: { user_id: UID }, progress: () => {}, cancelled: false, log: {} });
const outTrace = (uploads, il, xl) => Float64Array.from({ length: NS }, (_, s) => new Float32Array(uploads.get(`${UID}/${OUT}/bricks/0-0-${Math.floor(s / BS)}.f32`).buffer.slice(0))[((il % BS) * BS + xl) * BS + (s % BS)]);
const corr = (a, b, i0 = 40, i1 = 216) => { let s = 0; let x = 0; let y = 0; for (let i = i0; i < i1; i++) { s += a[i] * b[i]; x += a[i] ** 2; y += b[i] ** 2; } return s / Math.sqrt(x * y); };
const rms = (t) => Math.sqrt(t.reduce((a, v) => a + v * v, 0) / t.length);
const meanCorr = (fn) => { let s = 0; for (let il = 0; il < NIL; il++) for (let xl = 0; xl < NXL; xl++) s += corr(fn(il, xl), truthTrace(il, xl)); return s / (NIL * NXL); };

test('the kind is registered', () => expect(KINDS).toContain('spectral_balance'));

test('the far stack takes the near bandwidth with one operator, the bright trace stays twice as bright', async () => {
  const { d, uploads, updates } = deps();
  const out = await balanceStacksJob(ctxFor({ stacks: [FAR], volume_ids: { [FAR]: OUT }, target: 'reference', reference_volume_id: NEAR, f_lo_hz: 6, f_hi_hz: 70 }), d);
  const s = out.stacks[0];
  const before = meanCorr(farTrace); const after = meanCorr((il, xl) => outTrace(uploads, il, xl));
  expect(before).toBeLessThan(0.8);
  expect(after).toBeGreaterThan(0.93);
  expect(rms(outTrace(uploads, 2, 3)) / rms(outTrace(uploads, 2, 2))).toBeCloseTo(2, 5);
  // the band centroid closes over 80 percent of the gap to the reference's
  expect(s.centroid_hz_after).toBeGreaterThan(s.centroid_hz_before + 5);
  expect(Math.abs(s.centroid_hz_after - s.centroid_hz_reference)).toBeLessThan(0.2 * (s.centroid_hz_reference - s.centroid_hz_before));
  expect(s.operator.length).toBeGreaterThan(10);
  // the stack keeps its level: RMS within 15 percent over the whole stack
  let e0 = 0; let e1 = 0; for (let il = 0; il < NIL; il++) for (let xl = 0; xl < NXL; xl++) { e0 += rms(farTrace(il, xl)) ** 2; e1 += rms(outTrace(uploads, il, xl)) ** 2; }
  expect(Math.sqrt(e1 / e0)).toBeGreaterThan(0.85); expect(Math.sqrt(e1 / e0)).toBeLessThan(1.15);
  const manifest = JSON.parse(new TextDecoder().decode(uploads.get(`${UID}/${OUT}/manifest.json`)));
  expect(manifest.attribute.name).toBe(BALANCE_ATTRIBUTE);
  expect(manifest.attribute.params).toMatchObject({ target: 'reference', reference_volume_id: NEAR });
  expect(updates[0]).toMatchObject({ status: 'ready' });
});

test('negative control: a flat target in a narrow low band does not reach the truth', async () => {
  const { d, uploads } = deps();
  await balanceStacksJob(ctxFor({ stacks: [FAR], volume_ids: { [FAR]: OUT }, target: 'flat', f_lo_hz: 6, f_hi_hz: 18 }), d);
  expect(meanCorr((il, xl) => outTrace(uploads, il, xl))).toBeLessThan(0.8);
  // still one operator: the bright trace stays twice as bright
  expect(rms(outTrace(uploads, 2, 3)) / rms(outTrace(uploads, 2, 2))).toBeCloseTo(2, 5);
});

test('settings and refusals', async () => {
  expect(validateBalanceParams({ stacks: [FAR], volume_ids: { [FAR]: OUT }, target: 'flat' })).toBeNull();
  expect(validateBalanceParams({ stacks: [FAR], volume_ids: { [FAR]: OUT }, target: 'reference' })).toMatch(/reference/);
  expect(validateBalanceParams({ stacks: [FAR], volume_ids: { [FAR]: OUT }, target: 'flat', f_lo_hz: 50, f_hi_hz: 52 })).toMatch(/band/);
  expect(validateBalanceParams({ stacks: [FAR, FAR], volume_ids: { [FAR]: OUT }, target: 'flat' })).toMatch(/twice/);
  const { d } = deps();
  await expect(balanceStacksJob(ctxFor({ stacks: [NEAR], volume_ids: { [NEAR]: OUT }, target: 'flat' }), d)).rejects.toThrow(/output volume/);
});
