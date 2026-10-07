/**
 * @jest-environment node
 */
// sample_volumes (QI programme Q7b): the first volume's event (largest
// absolute value in the window) sets the sample, and every volume is read
// there; points outside the survey or with no live sample say so.
import { sampleVolumes, validateSampleParams } from '../src/handlers/sampleVolumes.js';
import { NULL_VALUE } from '../../../packages/engines/engines/seismolord/manifest';
import { KINDS } from '../src/handlers/index.js';

const UID = '11111111-1111-4111-8111-111111111111';
const V = ['21111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const NIL = 4; const NXL = 3; const NS = 32; const BS = 16; const GRID = [1, 1, 2];
const man = { geometry: { il: { min: 1, max: NIL, step: 1, count: NIL }, xl: { min: 1, max: NXL, step: 1, count: NXL }, ns: NS, dt_us: 4000 }, brick: { size: BS, grid: GRID, dtype: 'float32le', path_pattern: 'bricks/{i}-{j}-{k}.f32', null_value: 1e30 } };
const stores = [0, 1].map((k) => {
  const m = new Map(); for (let kk = 0; kk < 2; kk++) m.set(`0-0-${kk}`, new Float32Array(BS ** 3).fill(NULL_VALUE));
  for (let il = 0; il < NIL; il++) for (let xl = 0; xl < NXL; xl++) for (let s = 0; s < NS; s++) {
    // volume 0: an event at sample 20 (80 ms) of amplitude -0.3 at (2,1); volume 1: 10 x the sample index
    const v = k === 0 ? (s === 20 && il === 2 && xl === 1 ? -0.3 : 0.01) : 10 * s;
    if (!(k === 0 && il === 3)) m.get(`0-0-${Math.floor(s / BS)}`)[((il % BS) * BS + (xl % BS)) * BS + (s % BS)] = v;
  }
  return m;
});
const rows = Object.fromEntries(V.map((id) => [id, { id, user_id: UID, status: 'ready', name: id, storage_path: `${UID}/${id}` }]));
const deps = (r = rows) => ({
  admin: { from: () => { let id; const b = { select: () => b, eq: (c, v) => { if (c === 'id') id = v; return b; }, maybeSingle: async () => ({ data: r[id] || null, error: null }) }; return b; } },
  readManifest: async () => man,
  makeFetcher: (m, k) => async (path) => stores[k].get(path.match(/bricks\/(\d+-\d+-\d+)\.f32$/)[1]).slice().buffer,
});
const ctx = (params) => ({ params, job: { user_id: UID }, cancelled: false });

test('the kind is registered', () => expect(KINDS).toContain('sample_volumes'));

test('the event sets the sample and every volume is read there', async () => {
  const out = await sampleVolumes(ctx({ volume_ids: V, points: [{ name: 'W1', il: 2, xl: 1, t_ms: 72 }, { name: 'OUT', il: 9, xl: 0, t_ms: 10 }, { name: 'DEAD', il: 3, xl: 0, t_ms: 40 }], window_ms: 12 }), deps());
  expect(out.points[0]).toEqual({ name: 'W1', t_ms: 80, values: [Math.fround(-0.3), 200] });
  expect(out.points[1]).toEqual({ name: 'OUT', error: 'outside the survey' });
  expect(out.points[2]).toEqual({ name: 'DEAD', error: 'no live sample in the window' });
});

test('negative control: with no window the event 8 ms away is missed', async () => {
  const out = await sampleVolumes(ctx({ volume_ids: V, points: [{ name: 'W1', il: 2, xl: 1, t_ms: 72 }], window_ms: 0 }), deps());
  expect(out.points[0].values[0]).toBeCloseTo(0.01, 6);
});

test('guards', async () => {
  expect(validateSampleParams({ volume_ids: [], points: [] })).toMatch(/one to eight/);
  expect(validateSampleParams({ volume_ids: V, points: [{ il: 1.5, xl: 1, t_ms: 0 }] })).toMatch(/inline and crossline/);
  await expect(sampleVolumes(ctx({ volume_ids: V, points: [{ il: 1, xl: 1, t_ms: 4 }] }), deps({ ...rows, [V[1]]: { ...rows[V[1]], user_id: 'x' } }))).rejects.toMatchObject({ stage: 'not_found' });
});

test('traces mode returns the whole trace of every volume at each point, nulls as null', async () => {
  const out = await sampleVolumes(ctx({ volume_ids: V, points: [{ name: 'W1', il: 2, xl: 1 }, { name: 'DEAD', il: 3, xl: 0 }], traces: true }), deps());
  expect(out.ns).toBe(NS); expect(out.dt_ms).toBe(4);
  expect(out.points[0].traces[0][20]).toBeCloseTo(-0.3, 6);
  expect(out.points[0].traces[1][5]).toBe(50);
  expect(out.points[1].traces[0].every((v) => v === null)).toBe(true);
  expect(validateSampleParams({ volume_ids: V, points: Array.from({ length: 21 }, () => ({ il: 0, xl: 0 })), traces: true })).toMatch(/20 points/);
});
