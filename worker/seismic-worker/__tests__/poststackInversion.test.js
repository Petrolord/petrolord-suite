/**
 * @jest-environment node
 */
// poststack_inversion (QI programme Q8a): the server's blind-well table is
// the run module's on the same traces; a volume run publishes AI that
// matches the truth at the wells and registers the row; then the guards:
// settings, ownership, horizons, cancel, and the job's logs arriving as JSON
// (NaN gaps as null).
import { poststackInversion, validatePoststackParams, inversionSummary } from '../src/handlers/poststackInversion.js';
import {
  lfmWells, horizonsAtFrom, waveletScale, makeTraceInverter, blindWellTable, INVERSION_DEFAULTS,
} from '../../../src/pages/apps/QIStudio/services/inversionRun';
import { forwardPoststack } from '../../../packages/engines/engines/qi/inversion';
import { NULL_VALUE } from '../../../packages/engines/engines/seismolord/manifest';
import { KINDS } from '../src/handlers/index.js';
import { surveyAffine, ilxlToWorld } from '../../../packages/engines/engines/seismolord/surveyGeometry';

jest.setTimeout(240000);
const UID = '11111111-1111-4111-8111-111111111111';
const VOL = '22222222-2222-4222-8222-222222222222';
const OUT = '33333333-3333-4333-8333-333333333333';
const HZ1 = '44444444-4444-4444-8444-444444444444';
const HZ2 = '55555555-5555-4555-8555-555555555555';
const NIL = 7; const NXL = 5; const NS = 160; const B = 16; const DT_MS = 4; const SCALE = 2.5;
const GRID = [Math.ceil(NIL / B), Math.ceil(NXL / B), Math.ceil(NS / B)];
const MANIFEST = {
  manifest_version: 1, app: 'seismolord', volume_id: VOL, name: 'Inversion Dome',
  geometry: { il: { min: 1, max: NIL, step: 1, count: NIL }, xl: { min: 1, max: NXL, step: 1, count: NXL }, ns: NS, dt_us: DT_MS * 1000, corners: [[0, 0], [25 * (NIL - 1), 0], [0, 25 * (NXL - 1)]] },
  brick: { size: B, grid: GRID, count: GRID[0] * GRID[1] * GRID[2], dtype: 'float32le', layout: 'il-major,xl,sample-fastest', path_pattern: 'bricks/{i}-{j}-{k}.f32', null_value: 1.0e30 },
  stats: { min: -1, max: 1, mean: 0, rms: 0.5, live_samples: NIL * NXL * NS },
  trace_count: NIL * NXL,
};
const ricker = Array.from({ length: 31 }, (_, i) => {
  const t = ((i - 15) * DT_MS) / 1000; const a = (Math.PI * 25 * t) ** 2;
  return (1 - 2 * a) * Math.exp(-a);
});
const topAt = (il) => 200 + 12 * il;
const baseAt = (il) => 400 + 20 * il;
const truth = (il) => Float64Array.from({ length: NS }, (_, k) => {
  const t = k * DT_MS; const top = topAt(il); const base = baseAt(il);
  const tex = (p) => 0.03 * Math.sin(2 * Math.PI * 4 * p);
  if (t < top) return 8.4 + tex((t - top) / 150);
  if (t < base) return 8.75 + tex((t - top) / (base - top));
  return 8.6 + tex((t - base) / 150);
});
const seis = (il) => forwardPoststack(truth(il), ricker).map((v) => Math.fround(SCALE * v));
function store() {
  const bricks = new Map();
  for (let i = 0; i < GRID[0]; i++) for (let j = 0; j < GRID[1]; j++) for (let k = 0; k < GRID[2]; k++) bricks.set(`${i}-${j}-${k}`, new Float32Array(B ** 3).fill(NULL_VALUE));
  for (let il = 0; il < NIL; il++) {
    const tr = seis(il);
    for (let xl = 0; xl < NXL; xl++) for (let s = 0; s < NS; s++) {
      bricks.get(`${Math.floor(il / B)}-${Math.floor(xl / B)}-${Math.floor(s / B)}`)[((il % B) * B + (xl % B)) * B + (s % B)] = tr[s];
    }
  }
  return bricks;
}
const STORE = store();
const fetcher = () => async (path) => STORE.get(path.match(/bricks\/(\d+-\d+-\d+)\.f32$/)[1]).slice().buffer;
const GRIDS = {
  [HZ1]: Float32Array.from({ length: NIL * NXL }, (_, c) => topAt(Math.floor(c / NXL)) / DT_MS),
  [HZ2]: Float32Array.from({ length: NIL * NXL }, (_, c) => baseAt(Math.floor(c / NXL)) / DT_MS),
};
// the logs travel as JSON, so their gaps arrive as null
const wellAt = (name, il, xl) => ({
  name, il, xl,
  ln_ai: JSON.parse(JSON.stringify(Array.from(truth(il), (v, k) => (k * DT_MS >= 120 && k * DT_MS <= 560 ? v : NaN)))),
});
const WELLS = [wellAt('A', 0, 0), wellAt('B', 3, 4), wellAt('C', 6, 1), wellAt('D', 6, 4)];

function adminFor({ volumes, horizons = {}, updates = [], deletes = [] }) {
  return {
    from: (table) => {
      let id = null;
      const b = {
        select: () => b,
        eq: (col, v) => { if (col === 'id') id = v; return b; },
        maybeSingle: async () => ({ data: (table === 'seismic_horizons' ? horizons : volumes)[id] || null, error: null }),
        update: (row) => { updates.push({ table, row }); return { eq: () => ({ eq: async () => ({ error: null }) }) }; },
        delete: () => { deletes.push(table); return { eq: () => ({ eq: async () => ({ error: null }) }) }; },
      };
      return b;
    },
    rpc: async (name) => ({ data: name.startsWith('seismic_storage_usage') ? 0 : 1e12, error: null }),
    storage: { from: () => ({ remove: async () => ({}) }) },
  };
}
const PARENT = { id: VOL, user_id: UID, status: 'ready', name: 'Inversion Dome', kind: 'stack', storage_path: `${UID}/${VOL}` };
const DERIVED = { id: OUT, user_id: UID, status: 'ingesting', name: 'Dome AI', kind: 'attribute', parent_volume_id: VOL, storage_path: `${UID}/${OUT}` };
const HZ_ROWS = {
  [HZ1]: { id: HZ1, user_id: UID, volume_id: VOL, name: 'Top', storage_path: 'h1' },
  [HZ2]: { id: HZ2, user_id: UID, volume_id: VOL, name: 'Base', storage_path: 'h2' },
};
const ctxFor = (params, { cancelled = false } = {}) => ({ params, job: { user_id: UID }, progress: () => {}, get cancelled() { return cancelled; }, log: {} });
const depsFor = (state, extra = {}) => ({
  admin: adminFor(state),
  makeFetcher: fetcher,
  readManifest: async () => MANIFEST,
  readBlob: async (path) => (path === 'h1' ? GRIDS[HZ1] : GRIDS[HZ2]).slice().buffer,
  ...extra,
});
const params = (mode, over = {}) => ({
  mode, parent_volume_id: VOL, ...(mode === 'volume' ? { volume_id: OUT } : {}),
  inversion: { method: 'model_based', wavelet: { samples: ricker, dt_ms: DT_MS }, wells: WELLS, horizon_ids: [HZ1, HZ2], iters: 40, ...over },
});

test('the job kind is registered', () => expect(KINDS).toContain('poststack_inversion'));

test('blind mode returns the run module table on the same traces', async () => {
  const out = await poststackInversion(ctxFor(params('blind')), depsFor({ volumes: { [VOL]: PARENT }, horizons: HZ_ROWS }));
  expect(out.mode).toBe('blind');
  expect(out.blind).toHaveLength(4);
  // the same computation, by hand
  const wells = WELLS.map((w) => ({ ...w, ln_ai: w.ln_ai.map((v) => (Number.isFinite(v) ? v : NaN)) }));
  const aff = surveyAffine(MANIFEST.geometry);
  const posOf = aff ? (il, xl) => ilxlToWorld(aff, il, xl) : (il, xl) => ({ x: il, y: xl });
  const at = horizonsAtFrom([GRIDS[HZ1], GRIDS[HZ2]], NXL, DT_MS);
  const traces = wells.map((w) => seis(w.il));
  const { scale } = waveletScale(wells.map((w, k) => ({ trace: traces[k], lnAi: w.ln_ai })), ricker);
  const inv = { ...INVERSION_DEFAULTS, method: 'model_based', iters: 40 };
  const invert = makeTraceInverter({ inv, wavelet: ricker.map((v) => v * scale), wells: lfmWells(wells, { dtMs: DT_MS, lfmHz: inv.lfmHz, posOf, horizonsAt: at }), posOf, horizonsAt: at, ns: NS, dtMs: DT_MS });
  const ref = blindWellTable({ invert, wells, traces, dtMs: DT_MS, truthHz: inv.truthHz, absolute: true });
  expect(out.blind).toEqual(ref);
  expect(out.settings.wavelet_scale).toBeCloseTo(SCALE, 4);
  expect(out.settings.qi_class).toBe('elastic_estimate');
  for (const r of out.blind) expect(r.blind.rmsPct).toBeLessThan(5);
});

test('volume mode publishes AI that matches the truth at a well, and registers the row', async () => {
  const uploads = new Map();
  const updates = [];
  const storage = { upload: async (path, bytes) => { uploads.set(path, bytes); return {}; } };
  const out = await poststackInversion(ctxFor(params('volume')), depsFor({ volumes: { [VOL]: PARENT, [OUT]: DERIVED }, horizons: HZ_ROWS, updates }, { storage }));
  expect(out.mode).toBe('volume');
  expect(out.trace_count).toBe(NIL * NXL);
  const manifest = JSON.parse(new TextDecoder().decode(uploads.get(`${UID}/${OUT}/manifest.json`)));
  expect(manifest.attribute.name).toBe('qi_inversion');
  expect(manifest.attribute.params.method).toBe('model_based');
  expect(manifest.attribute.params.blind).toHaveLength(4);
  expect(updates.some((u) => u.row.status === 'ready')).toBe(true);
  // the AI trace at well B (il 3, xl 4), inside the log window, against exp(truth)
  const brick = (k) => new Float32Array(uploads.get(`${UID}/${OUT}/bricks/0-0-${k}.f32`).buffer.slice(0));
  const t = truth(3); let se = 0; let n = 0;
  for (let s = 40; s < 130; s++) {
    const v = brick(Math.floor(s / B))[((3 % B) * B + 4) * B + (s % B)];
    se += ((v - Math.exp(t[s])) / Math.exp(t[s])) ** 2; n += 1;
  }
  expect(100 * Math.sqrt(se / n)).toBeLessThan(3);
});

test('guards: settings, ownership, horizons, state and cancel', async () => {
  expect(validatePoststackParams({ ...params('volume'), volume_id: 'x' })).toMatch(/volume_id/);
  expect(validatePoststackParams(params('blind', { horizon_ids: ['nope'] }))).toMatch(/uuid/);
  expect(validatePoststackParams(params('blind'))).toBeNull();
  const own = { volumes: { [VOL]: PARENT }, horizons: HZ_ROWS };
  await expect(poststackInversion(ctxFor(params('blind')), depsFor({ ...own, volumes: { [VOL]: { ...PARENT, user_id: 'x' } } }))).rejects.toMatchObject({ stage: 'not_found' });
  await expect(poststackInversion(ctxFor(params('blind')), depsFor({ ...own, horizons: { [HZ1]: { ...HZ_ROWS[HZ1], volume_id: OUT }, [HZ2]: HZ_ROWS[HZ2] } }))).rejects.toMatchObject({ stage: 'not_found' });
  const far = { ...WELLS[0], il: 99 };
  await expect(poststackInversion(ctxFor(params('blind', { wells: [far, WELLS[1]] })), depsFor(own))).rejects.toMatchObject({ stage: 'validate_failed' });
  const deletes = [];
  await expect(poststackInversion(ctxFor(params('volume')), depsFor({ volumes: { [VOL]: { ...PARENT, status: 'ingesting' }, [OUT]: DERIVED }, horizons: HZ_ROWS, deletes }))).rejects.toMatchObject({ stage: 'validate_failed' });
  expect(deletes).toContain('seismic_volumes'); // the registered row is taken back out
  expect(await poststackInversion(ctxFor(params('blind'), { cancelled: true }), depsFor(own))).toBeNull();
});

test('the recorded settings carry no logs or wavelet samples', () => {
  const s = inversionSummary(params('blind').inversion);
  expect(JSON.stringify(s)).not.toMatch(/ln_ai|samples/);
  expect(s.wells).toEqual(['A', 'B', 'C', 'D']);
});
