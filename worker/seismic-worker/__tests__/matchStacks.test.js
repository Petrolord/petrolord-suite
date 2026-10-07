/**
 * @jest-environment node
 */
// match_stacks (QI programme Q5): a far stack made 6 ms late, rotated 30
// degrees and at half the amplitude of the reference is measured as such and
// written back onto the reference; one operator for the survey, so a trace
// twice as bright as its neighbour stays twice as bright (the AVO amplitudes).
import { matchStacksJob, validateMatchParams, surveyOperator } from '../src/handlers/matchStacks.js';
import { rotatePhase, shiftTrace } from '../../../packages/engines/engines/qi/conditioning';
import { NULL_VALUE } from '../../../packages/engines/engines/seismolord/manifest';
import { KINDS } from '../src/handlers/index.js';

jest.setTimeout(180000);
const UID = '11111111-1111-4111-8111-111111111111';
const REF = '21111111-1111-4111-8111-111111111111'; const FAR = '22222222-2222-4222-8222-222222222222'; const OUT = '33333333-3333-4333-8333-333333333333';
const NIL = 6; const NXL = 6; const NS = 256; const BS = 16; const DT = 2; const GRID = [1, 1, NS / BS];
const ricker = (t) => { const a = (Math.PI * 30 * t / 1000) ** 2; return (1 - 2 * a) * Math.exp(-a); };
const refTrace = (il, xl) => Float64Array.from({ length: NS }, (_, s) => (1 + (il === 2 && xl === 2 ? 1 : 0)) * (ricker(s * DT - 200 - 4 * il) - 0.7 * ricker(s * DT - 300 - 3 * xl)));
const farTrace = (il, xl) => rotatePhase(shiftTrace(refTrace(il, xl), 6, DT).map((v) => (Number.isFinite(v) ? v : 0)), 30).map((v) => 0.5 * v);
const store = (fn) => {
  const m = new Map(); for (let k = 0; k < GRID[2]; k++) m.set(`0-0-${k}`, new Float32Array(BS ** 3).fill(NULL_VALUE));
  for (let il = 0; il < NIL; il++) for (let xl = 0; xl < NXL; xl++) { const t = fn(il, xl); for (let s = 0; s < NS; s++) m.get(`0-0-${Math.floor(s / BS)}`)[((il % BS) * BS + xl) * BS + (s % BS)] = t[s]; }
  return m;
};
const STORES = [store(refTrace), store(farTrace)];
const man = { manifest_version: 1, geometry: { il: { min: 1, max: NIL, step: 1, count: NIL }, xl: { min: 1, max: NXL, step: 1, count: NXL }, ns: NS, dt_us: DT * 1000, corners: [[0, 0], [1, 0], [0, 1]] }, brick: { size: BS, grid: GRID, count: GRID[2], dtype: 'float32le', layout: 'il-major,xl,sample-fastest', path_pattern: 'bricks/{i}-{j}-{k}.f32', null_value: 1e30 }, stats: {}, trace_count: NIL * NXL };
const rows = { [REF]: { id: REF, user_id: UID, status: 'ready', name: 'near', kind: 'seismic', storage_path: `${UID}/${REF}` }, [FAR]: { id: FAR, user_id: UID, status: 'ready', name: 'far', kind: 'seismic', storage_path: `${UID}/${FAR}` }, [OUT]: { id: OUT, user_id: UID, status: 'ingesting', name: 'far matched', kind: 'attribute', parent_volume_id: FAR, storage_path: `${UID}/${OUT}` } };
const deps = () => {
  const uploads = new Map();
  return {
    uploads,
    d: {
      admin: {
        from: () => { let id = null; const b = { select: () => b, eq: (c, v) => { if (c === 'id') id = v; return b; }, maybeSingle: async () => ({ data: rows[id] || null, error: null }), update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }), delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }; return b; },
        rpc: async (name) => ({ data: name.startsWith('seismic_storage_usage') ? 0 : 1e12, error: null }),
        storage: { from: () => ({ remove: async () => ({}) }) },
      },
      readManifest: async () => man,
      makeFetcher: (m, k) => async (path) => STORES[k].get(path.match(/bricks\/(\d+-\d+-\d+)\.f32$/)[1]).slice().buffer,
      storage: { upload: async (path, bytes) => { uploads.set(path, bytes); return {}; } },
    },
  };
};
const ctxFor = (params) => ({ params, job: { user_id: UID }, progress: () => {}, cancelled: false, log: {} });

test('the kind is registered', () => expect(KINDS).toContain('match_stacks'));

test('the far stack is measured (6 ms, 30 degrees, half amplitude) and matched onto the reference', async () => {
  const { d, uploads } = deps();
  const out = await matchStacksJob(ctxFor({ reference_volume_id: REF, stacks: [FAR], volume_ids: { [FAR]: OUT } }), d);
  const s = out.stacks[0];
  expect(s.shift_ms).toBeCloseTo(-6, 0);
  expect(Math.abs(s.phase_deg + 30)).toBeLessThan(4);
  expect(s.scale).toBeCloseTo(2, 1);
  expect(s.corr_after).toBeGreaterThan(0.98);
  const at = (il, xl, smp) => new Float32Array(uploads.get(`${UID}/${OUT}/bricks/0-0-${Math.floor(smp / BS)}.f32`).buffer.slice(0))[((il % BS) * BS + xl) * BS + (smp % BS)];
  // matched traces follow the reference, and the bright trace stays twice as bright (one operator for all)
  let c = 0; let e1 = 0; let e2 = 0;
  for (let smp = 40; smp < 220; smp++) { const r = refTrace(3, 3)[smp]; const m = at(3, 3, smp); c += r * m; e1 += r * r; e2 += m * m; }
  expect(c / Math.sqrt(e1 * e2)).toBeGreaterThan(0.97);
  const peak = (il, xl) => { let mx = 0; for (let smp = 60; smp < 140; smp++) mx = Math.max(mx, Math.abs(at(il, xl, smp))); return mx; };
  expect(peak(2, 2) / peak(2, 3)).toBeCloseTo(2, 0);
});

test('guards, and the survey operator ignores poor matches', () => {
  expect(validateMatchParams({ reference_volume_id: REF, stacks: [REF], volume_ids: { [REF]: OUT } })).toMatch(/itself/);
  expect(validateMatchParams({ reference_volume_id: REF, stacks: [FAR], volume_ids: {} })).toMatch(/output volume/);
  const op = surveyOperator([{ shiftMs: 2, phaseDeg: 10, scale: 1.5, corrBefore: 0.5, corrAfter: 0.9 }, { shiftMs: 40, phaseDeg: 170, scale: 9, corrBefore: 0.1, corrAfter: 0.2 }, { shiftMs: 2, phaseDeg: 12, scale: 1.4, corrBefore: 0.5, corrAfter: 0.9 }]);
  expect(op.traces).toBe(2);
  expect(op.shiftMs).toBe(2);
  expect(op.phaseDeg).toBeCloseTo(11, 6);
});
