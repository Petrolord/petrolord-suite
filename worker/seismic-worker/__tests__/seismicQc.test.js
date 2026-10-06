/**
 * @jest-environment node
 */
// seismic_qc (QI programme Q4a / A5): the server's QC of a stored volume is
// the browser runner's (qcRun.js) on the same bricks, bit for bit; then the
// guards: settings, ownership, state, cancel.
import { seismicQc, validateQcParams } from '../src/handlers/seismicQc.js';
import { runSeismicQc } from '../../../src/pages/apps/QIStudio/services/qcRun';
import { NULL_VALUE } from '../../../packages/engines/engines/seismolord/manifest';

jest.setTimeout(240000);
const UID = '11111111-1111-4111-8111-111111111111';
const VOL = '22222222-2222-4222-8222-222222222222';
const NIL = 16; const NXL = 32; const NS = 192; const B = 16;
const GRID = [Math.ceil(NIL / B), Math.ceil(NXL / B), Math.ceil(NS / B)];
const MANIFEST = {
  manifest_version: 1, app: 'seismolord', volume_id: VOL, name: 'QC Dome',
  geometry: { il: { min: 1, max: NIL, step: 1, count: NIL }, xl: { min: 1, max: NXL, step: 1, count: NXL }, ns: NS, dt_us: 2000, corners: [[0, 0], [1, 0], [0, 1]] },
  brick: { size: B, grid: GRID, count: GRID[0] * GRID[1] * GRID[2], dtype: 'float32le', layout: 'il-major,xl,sample-fastest', path_pattern: 'bricks/{i}-{j}-{k}.f32', null_value: 1.0e30 },
  stats: { min: -1, max: 1, mean: 0, rms: 0.5, live_samples: NIL * NXL * NS },
  trace_count: NIL * NXL,
};
function store() {
  const bricks = new Map();
  for (let i = 0; i < GRID[0]; i++) for (let j = 0; j < GRID[1]; j++) for (let k = 0; k < GRID[2]; k++) bricks.set(`${i}-${j}-${k}`, new Float32Array(B ** 3).fill(NULL_VALUE));
  for (let il = 0; il < NIL; il++) for (let xl = 0; xl < NXL; xl++) for (let s = 0; s < NS; s++) {
    const v = Math.fround(Math.sin(s * 0.37 + il * 0.2) * Math.cos(s * 0.11) * (xl % 4 === 0 ? 1.5 : 1) + 0.2 * Math.sin(il * 13.1 + xl * 7.7 + s * 3.3));
    bricks.get(`${Math.floor(il / B)}-${Math.floor(xl / B)}-${Math.floor(s / B)}`)[((il % B) * B + (xl % B)) * B + (s % B)] = v;
  }
  return bricks;
}
const STORE = store();
const fetcher = () => async (path) => STORE.get(path.match(/bricks\/(\d+-\d+-\d+)\.f32$/)[1]).slice().buffer;
const adminFor = (row) => ({
  from: () => {
    const b = { select: () => b, eq: () => b, maybeSingle: async () => ({ data: row, error: null }) };
    return b;
  },
});
const ctxFor = (params, { cancelled = false } = {}) => ({ params, job: { user_id: UID }, progress: () => {}, get cancelled() { return cancelled; }, log: {} });
const deps = (row) => ({ admin: adminFor(row), makeFetcher: fetcher, readManifest: async () => MANIFEST });
const OWN = { id: VOL, user_id: UID, status: 'ready', name: 'QC Dome', storage_path: `${UID}/${VOL}` };

test('the server result is the browser runner on the same bricks', async () => {
  const out = await seismicQc(ctxFor({ volume_id: VOL, inlines: 6 }), deps(OWN));
  const getBrick = async (i, j, k) => new Float32Array(STORE.get(`${i}-${j}-${k}`).slice().buffer);
  const ref = await runSeismicQc({ getBrick, geom: { nIl: NIL, nXl: NXL, ns: NS, brickSize: B, grid: GRID }, dtMs: 2, inlines: 6 });
  expect(out.qc).toEqual(ref);
  expect(out.volume_name).toBe('QC Dome');
  expect(Array.isArray(out.issues)).toBe(true);
  expect(out.qc.windows).toHaveLength(3);
});

test('guards: settings, ownership, state and cancel', async () => {
  expect(validateQcParams({ volume_id: 'x' })).toMatch(/volume_id/);
  expect(validateQcParams({ volume_id: VOL, inlines: 1 })).toMatch(/inlines/);
  expect(validateQcParams({ volume_id: VOL })).toBeNull();
  await expect(seismicQc(ctxFor({ volume_id: VOL }), deps({ ...OWN, user_id: 'someone-else' }))).rejects.toMatchObject({ stage: 'not_found' });
  await expect(seismicQc(ctxFor({ volume_id: VOL }), deps({ ...OWN, status: 'ingesting' }))).rejects.toMatchObject({ stage: 'validate_failed' });
  expect(await seismicQc(ctxFor({ volume_id: VOL }, { cancelled: true }), deps(OWN))).toBeNull();
});
