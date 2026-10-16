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
import { unpackLog } from '../../../src/pages/apps/QIStudio/services/logPacking';
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

/**
 * The truly blind table built by hand (QI upgrade P1.2): each held-back well
 * inverted with the wavelet scaled on the OTHER wells only and the model
 * without it; with the well, the scale on every well.
 */
function handBlind(wells, traces, posOf, at, { wavelets = {} } = {}) {
  const inv = { ...INVERSION_DEFAULTS, method: 'model_based', iters: 40 };
  const lfm = lfmWells(wells, { dtMs: DT_MS, lfmHz: inv.lfmHz, posOf, horizonsAt: at });
  const inverterFor = (exclude) => {
    const keep = wells.map((w, k) => k).filter((k) => wells[k].name !== exclude);
    const w0 = (exclude && wavelets[exclude]) || ricker;
    const { scale } = waveletScale(keep.map((k) => ({ trace: traces[k], lnAi: wells[k].ln_ai })), w0);
    return makeTraceInverter({ inv, wavelet: w0.map((v) => v * scale), wells: lfm, posOf, horizonsAt: at, ns: NS, dtMs: DT_MS });
  };
  const full = inverterFor(null);
  const invert = (trace, il, xl, exclude) => (exclude ? inverterFor(exclude)(trace, il, xl, exclude) : full(trace, il, xl));
  return blindWellTable({ invert, wells, traces, dtMs: DT_MS, truthHz: inv.truthHz, absolute: true });
}

test('the job kind is registered', () => expect(KINDS).toContain('poststack_inversion'));

describe('truly blind wells (QI upgrade P1.2)', () => {
  // well D's log carries a doubled contrast, so a wavelet scale that sees D
  // differs from one that does not: the held-back well must not set the
  // scale its own blind result is judged with
  const odd = (w) => ({ ...w, ln_ai: w.ln_ai.map((v) => (Number.isFinite(v) ? 8.6 + 2 * (v - 8.6) : v)) });
  const WELLS2 = [WELLS[0], WELLS[1], WELLS[2], odd(WELLS[3])];
  const geo = () => {
    const aff = surveyAffine(MANIFEST.geometry);
    return { posOf: aff ? (il, xl) => ilxlToWorld(aff, il, xl) : (il, xl) => ({ x: il, y: xl }), at: horizonsAtFrom([GRIDS[HZ1], GRIDS[HZ2]], NXL, DT_MS) };
  };
  const clean = (ws) => ws.map((w) => ({ ...w, ln_ai: w.ln_ai.map((v) => (Number.isFinite(v) ? v : NaN)) }));

  test('a held-back well is out of the wavelet scale: the table equals the hand-built one, and the old protocol does not', async () => {
    const out = await poststackInversion(ctxFor(params('blind', { wells: WELLS2 })), depsFor({ volumes: { [VOL]: PARENT }, horizons: HZ_ROWS }));
    const wells = clean(WELLS2); const { posOf, at } = geo();
    const traces = wells.map((w) => seis(w.il));
    expect(out.blind).toEqual(handBlind(wells, traces, posOf, at));
    // negative control: the earlier protocol (one scale on every well, D included)
    const inv = { ...INVERSION_DEFAULTS, method: 'model_based', iters: 40 };
    const { scale } = waveletScale(wells.map((w, k) => ({ trace: traces[k], lnAi: w.ln_ai })), ricker);
    const old = makeTraceInverter({ inv, wavelet: ricker.map((v) => v * scale), wells: lfmWells(wells, { dtMs: DT_MS, lfmHz: inv.lfmHz, posOf, horizonsAt: at }), posOf, horizonsAt: at, ns: NS, dtMs: DT_MS });
    const oldTable = blindWellTable({ invert: old, wells, traces, dtMs: DT_MS, truthHz: inv.truthHz, absolute: true });
    const diff = out.blind.map((r, k) => Math.abs(r.blind.rmsPct - oldTable[k].blind.rmsPct));
    expect(Math.max(...diff.slice(0, 3))).toBeGreaterThan(0.05);
    // the with-well column is the full inversion in both
    expect(out.blind.map((r) => r.withWell)).toEqual(oldTable.map((r) => r.withWell));
    // every held-back scale is recorded, and D's absence moves the scale back towards the true one
    const held = Object.fromEntries(out.blind_protocol.held_back.map((h) => [h.name, h.scale]));
    expect(Math.abs(held.D - SCALE)).toBeLessThan(Math.abs(out.settings.wavelet_scale - SCALE));
  });

  test('blind wavelets (the other ties\' average) are used for the held-back well', async () => {
    const other = ricker.map((v, i) => (i < 31 ? v * (1 + 0.2 * Math.cos(i)) : v));
    const out = await poststackInversion(ctxFor(params('blind', { blind_wavelets: [{ name: 'A', samples: other, dt_ms: DT_MS }] })), depsFor({ volumes: { [VOL]: PARENT }, horizons: HZ_ROWS }));
    const wells = clean(WELLS); const { posOf, at } = geo();
    const traces = wells.map((w) => seis(w.il));
    expect(out.blind).toEqual(handBlind(wells, traces, posOf, at, { wavelets: { A: Float64Array.from(other) } }));
    expect(out.blind_protocol.excluded_from).toContain('the field wavelet average');
    // negative control: without it, A's blind row is different
    expect(out.blind[0].blind.rmsPct).not.toBeCloseTo(handBlind(wells, traces, posOf, at)[0].blind.rmsPct, 6);
  });

  test('a volume run records each well\'s held-back estimate for the property check', async () => {
    const uploads = new Map();
    const storage = { upload: async (path, bytes) => { uploads.set(path, bytes); return {}; } };
    await poststackInversion(ctxFor(params('volume', { wells: WELLS2 })), depsFor({ volumes: { [VOL]: PARENT, [OUT]: DERIVED }, horizons: HZ_ROWS }, { storage }));
    const manifest = JSON.parse(new TextDecoder().decode(uploads.get(`${UID}/${OUT}/manifest.json`)));
    const bt = manifest.attribute.params.blind_traces;
    expect(bt.map((x) => x.name)).toEqual(['A', 'B', 'C', 'D']);
    expect(manifest.attribute.params.blind_protocol.version).toBe('held-back-v2');
    // the recorded trace is the held-back inversion at that well (within the packing step)
    const wells = clean(WELLS2); const { posOf, at } = geo();
    const traces = wells.map((w) => seis(w.il));
    const inv = { ...INVERSION_DEFAULTS, method: 'model_based', iters: 40 };
    const keep = [0, 1, 2];
    const { scale } = waveletScale(keep.map((k) => ({ trace: traces[k], lnAi: wells[k].ln_ai })), ricker);
    const lfm = lfmWells(wells, { dtMs: DT_MS, lfmHz: inv.lfmHz, posOf, horizonsAt: at });
    const ref = makeTraceInverter({ inv, wavelet: ricker.map((v) => v * scale), wells: lfm, posOf, horizonsAt: at, ns: NS, dtMs: DT_MS })(traces[3], 6, 4, 'D');
    const got = unpackLog(bt[3].ln_ai);
    let worst = 0;
    for (let i = 0; i < NS; i++) if (Number.isFinite(ref[i])) worst = Math.max(worst, Math.abs(got[i] - ref[i]));
    expect(worst).toBeLessThan(1e-3);
    // the volume's own trace at D is not blind: it differs from the held-back one
    const brick = (k) => new Float32Array(uploads.get(`${UID}/${OUT}/bricks/0-0-${k}.f32`).buffer.slice(0));
    let d = 0;
    for (let s2 = 40; s2 < 130; s2++) d = Math.max(d, Math.abs(Math.log(brick(Math.floor(s2 / B))[((6 % B) * B + 4) * B + (s2 % B)]) - got[s2]));
    expect(d).toBeGreaterThan(1e-3);
  });

  test('coloured inversion holds the well back from its operator', async () => {
    const out = await poststackInversion(ctxFor(params('blind', { method: 'coloured' })), depsFor({ volumes: { [VOL]: PARENT }, horizons: HZ_ROWS }));
    expect(out.blind_protocol.excluded_from[1]).toMatch(/coloured operator/);
    expect(out.blind_protocol.held_back.every((h) => Number.isFinite(h.slope))).toBe(true);
  });
});

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
  const ref = handBlind(wells, traces, posOf, at);
  expect(out.blind).toEqual(ref);
  expect(out.settings.wavelet_scale).toBeCloseTo(SCALE, 4);
  expect(out.blind_protocol.version).toBe('held-back-v2');
  expect(out.blind_protocol.excluded_from).toEqual(['the low-frequency model', 'the wavelet scale']);
  expect(out.blind_protocol.held_back.map((h) => h.name)).toEqual(['A', 'B', 'C', 'D']);
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
  // a horizon on a volume that is not the user's
  const foreign = { ...PARENT, id: OUT, user_id: 'someone-else' };
  await expect(poststackInversion(ctxFor(params('blind')), depsFor({ ...own, volumes: { [VOL]: PARENT, [OUT]: foreign }, horizons: { [HZ1]: { ...HZ_ROWS[HZ1], volume_id: OUT }, [HZ2]: HZ_ROWS[HZ2] } }))).rejects.toMatchObject({ stage: 'not_found' });
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

describe('seismic residual (QI upgrade P1.4)', () => {
  const RES = '77777777-7777-4777-8777-777777777777';
  test('the residual volume is the input minus the synthetic of the inverted AI, and small where the inversion fits', async () => {
    const uploads = new Map();
    const storage = { upload: async (path, bytes) => { uploads.set(path, bytes); return {}; } };
    const volumes = { [VOL]: PARENT, [OUT]: DERIVED, [RES]: { ...DERIVED, id: RES, storage_path: `${UID}/${RES}` } };
    const out = await poststackInversion(ctxFor({ ...params('volume', { residual: true }), residual_volume_id: RES }), depsFor({ volumes, horizons: HZ_ROWS }, { storage }));
    expect(out.residual_volume_id).toBe(RES);
    const at = (id, il, xl, s) => new Float32Array(uploads.get(`${UID}/${id}/bricks/0-0-${Math.floor(s / B)}.f32`).buffer.slice(0))[((il % B) * B + xl) * B + (s % B)];
    // identity: the residual plus the synthetic of the stored AI is the input (the synthetic through the job's own scaled wavelet)
    const scaled = Float64Array.from(ricker, (v) => v * out.settings.wavelet_scale);
    for (const [il, xl] of [[2, 1], [5, 3]]) {
      const ln = Float64Array.from({ length: NS }, (_, s) => Math.log(at(OUT, il, xl, s)));
      const syn = forwardPoststack(ln, scaled);
      const d = seis(il);
      let worst = 0; let sr = 0; let sd = 0;
      for (let s = 20; s < NS - 20; s++) { worst = Math.max(worst, Math.abs(at(RES, il, xl, s) + syn[s] - d[s])); sr += at(RES, il, xl, s) ** 2; sd += d[s] ** 2; }
      expect(worst).toBeLessThan(2e-3 * Math.sqrt(sd / (NS - 40)));
      expect(Math.sqrt(sr / sd)).toBeLessThan(0.1); // under 10 percent of the seismic
      // negative control: with the unscaled wavelet the "residual" is most of the seismic
      const bad = forwardPoststack(ln, Float64Array.from(ricker));
      let sb = 0; for (let s = 20; s < NS - 20; s++) sb += (d[s] - bad[s]) ** 2;
      expect(Math.sqrt(sb / sd)).toBeGreaterThan(0.5);
    }
    const man = JSON.parse(new TextDecoder().decode(uploads.get(`${UID}/${RES}/manifest.json`)));
    expect(man.attribute.params).toMatchObject({ product: 'residual', output: 'seismic residual' });
    expect(man.attribute.params.blind_traces).toBeUndefined();
    expect(out.residual_at_wells.map((w) => w.name)).toEqual(['A', 'B', 'C', 'D']);
    for (const w of out.residual_at_wells) expect(w.pct).toBeLessThan(10);
  });
  test('the residual is refused for coloured inversion and for an uncertainty run, and needs its volume id', () => {
    expect(validatePoststackParams({ ...params('volume', { residual: true }) })).toMatch(/residual_volume_id/);
    expect(validatePoststackParams({ ...params('volume', { residual: true, method: 'coloured' }), residual_volume_id: RES })).toMatch(/absolute method/);
    expect(validatePoststackParams({ ...params('volume', { residual: true, sensitivity: { lfm_factors: [0.5, 1] } }), residual_volume_id: RES, volume_ids: {} })).toMatch(/single inversion/);
  });
});

describe('sensitivity', () => {
  const O = ['66666666-6666-4666-8666-666666666661', '66666666-6666-4666-8666-666666666662', '66666666-6666-4666-8666-666666666663', '66666666-6666-4666-8666-666666666664'];
  const SENS = { lfm_factors: [0.5, 1, 1.5] };
  test('blind mode adds the error spread per well and per scenario', async () => {
    const out = await poststackInversion(ctxFor(params('blind', { sensitivity: SENS })), depsFor({ volumes: { [VOL]: PARENT }, horizons: HZ_ROWS }));
    expect(out.sensitivity.scenarios).toHaveLength(3);
    expect(out.sensitivity.rows).toHaveLength(4);
    for (const r of out.sensitivity.rows) expect(r.q10).toBeLessThanOrEqual(r.q90);
    expect(out.settings.scenarios).toEqual(out.sensitivity.scenarios);
  });
  test('a volume run writes Q10, Q50, Q90 and the spread in one pass', async () => {
    const uploads = new Map();
    const storage = { upload: async (path, bytes) => { uploads.set(path, bytes); return {}; } };
    const volumes = { [VOL]: PARENT };
    O.forEach((id) => { volumes[id] = { ...DERIVED, id, storage_path: `${UID}/${id}` }; });
    const p = { ...params('blind', { sensitivity: SENS }), mode: 'volume', volume_ids: { q10: O[0], q50: O[1], q90: O[2], spread: O[3] } };
    const out = await poststackInversion(ctxFor(p), depsFor({ volumes, horizons: HZ_ROWS }, { storage }));
    expect(out.volume_ids).toEqual({ q10: O[0], q50: O[1], q90: O[2], spread: O[3] });
    const man = O.map((id) => JSON.parse(new TextDecoder().decode(uploads.get(`${UID}/${id}/manifest.json`))));
    expect(man.map((m) => m.attribute.params.product)).toEqual(['q10', 'q50', 'q90', 'spread']);
    const at = (id, il, xl, s) => new Float32Array(uploads.get(`${UID}/${id}/bricks/0-0-${Math.floor(s / B)}.f32`).buffer.slice(0))[((il % B) * B + xl) * B + (s % B)];
    let spreadSeen = 0;
    for (let s = 40; s < 130; s += 5) {
      const [a, b2, c, sp] = O.map((id) => at(id, 3, 2, s));
      expect(a).toBeLessThanOrEqual(b2 + 1e-3);
      expect(b2).toBeLessThanOrEqual(c + 1e-3);
      expect(sp).toBeCloseTo((c - a) / b2, 4);
      if (sp > 1e-4) spreadSeen += 1;
    }
    expect(spreadSeen).toBeGreaterThan(5);
    expect(man[3].stats.max).toBeLessThan(1); // a relative spread, not an impedance
  });
  test('refusals: the four volume ids, an absolute method', () => {
    expect(validatePoststackParams({ ...params('volume', { sensitivity: SENS }) })).toMatch(/volume_ids/);
    expect(validatePoststackParams(params('blind', { sensitivity: SENS, method: 'coloured' }))).toMatch(/absolute/);
  });
});

// QI pilot sub-volume (2026-10-14): the pilot run is the full run inside its
// window, null outside, and writes only the bricks the window touches; the
// manifest and the row say it is a pilot. Negative control: a different
// regularisation changes the pilot's values.
describe('pilot sub-volume', () => {
  const run = async (over = {}, extra = {}) => {
    const uploads = new Map(); const updates = [];
    const storage = { upload: async (path, bytes) => { uploads.set(path, Uint8Array.from(bytes)); return {}; } };
    const out = await poststackInversion(ctxFor({ ...params('volume', extra), ...over }), depsFor({ volumes: { [VOL]: PARENT, [OUT]: { ...DERIVED } }, horizons: HZ_ROWS, updates }, { storage }));
    return { out, uploads, updates };
  };
  const bricksOf = (u) => [...u.keys()].filter((k) => k.endsWith('.f32')).sort();
  const at = (u, il, xl, s) => {
    const b = u.get(`${UID}/${OUT}/bricks/0-0-${Math.floor(s / B)}.f32`);
    return b ? new Float32Array(b.buffer)[((il % B) * B + (xl % B)) * B + (s % B)] : Math.fround(NULL_VALUE);
  };
  const PILOT = { il: { from: 3, to: 6 }, xl: { from: 2, to: 4 }, t_ms: { from: 200, to: 400 }, crop_name: 'Pilot A' };
  test('equals the full run inside the window, null outside, only its bricks written', async () => {
    const full = await run();
    const pilot = await run({ pilot: PILOT });
    expect(bricksOf(pilot.uploads)).toEqual([`${UID}/${OUT}/bricks/0-0-3.f32`, `${UID}/${OUT}/bricks/0-0-4.f32`, `${UID}/${OUT}/bricks/0-0-5.f32`, `${UID}/${OUT}/bricks/0-0-6.f32`]);
    expect(bricksOf(full.uploads)).toHaveLength(GRID[2]);
    let inside = 0;
    for (let il = 0; il < NIL; il++) for (let xl = 0; xl < NXL; xl++) for (let s = 0; s < NS; s += 3) {
      const inWin = il >= 2 && il <= 5 && xl >= 1 && xl <= 3 && s >= 50 && s <= 100;
      if (inWin) { expect(at(pilot.uploads, il, xl, s)).toBe(at(full.uploads, il, xl, s)); inside += 1; } else expect(at(pilot.uploads, il, xl, s)).toBe(Math.fround(NULL_VALUE));
    }
    expect(inside).toBeGreaterThan(100);
    expect(pilot.out.trace_count).toBe(12);
    expect(pilot.out.pilot).toMatchObject({ il: { from: 3, to: 6 }, xl: { from: 2, to: 4 }, t_ms: { from: 200, to: 400 }, crop_name: 'Pilot A', bricks: { i0: 0, i1: 0, j0: 0, j1: 0, k0: 3, k1: 6 } });
    const m = JSON.parse(new TextDecoder().decode(pilot.uploads.get(`${UID}/${OUT}/manifest.json`)));
    expect(m.pilot.grid).toEqual({ i0: 2, i1: 5, j0: 1, j1: 3, k0: 50, k1: 100 });
    const ready = pilot.updates.find((u) => u.row.status === 'ready');
    expect(ready.row.survey_meta.pilot.crop_name).toBe('Pilot A');
    expect(ready.row.survey_meta.storage_bytes).toBe(4 * B ** 3 * 4);
    // negative control: other settings, other values in the window
    const other = await run({ pilot: PILOT }, { eps: 5 });
    expect(at(other.uploads, 3, 2, 70)).not.toBe(at(pilot.uploads, 3, 2, 70));
  });
  test('a pilot outside the volume or back to front is refused', async () => {
    await expect(run({ pilot: { il: { from: 50, to: 60 } } })).rejects.toMatchObject({ stage: 'validate_failed' });
    await expect(run({ pilot: { il: { from: 5, to: 2 } } })).rejects.toMatchObject({ stage: 'validate_failed' });
  });
});

// F3 benchmark F-3 (2026-10-15): a poor tie shrinks the least-squares wavelet
// scale towards zero and the absolute inversion overflows. The tie behind the
// scale is measured and recorded; under 0.3 the run is refused. Negative
// control: logs that do not belong to their traces.
test('the wavelet scale needs a tie: recorded when good, refused when the logs do not match the seismic', async () => {
  const { scaleTieQuality, MIN_SCALE_TIE } = await import('../../../src/pages/apps/QIStudio/services/inversionRun.js');
  const good = WELLS.map((w) => ({ trace: seis(w.il), lnAi: w.ln_ai.map((v) => (v == null ? NaN : v)) }));
  expect(scaleTieQuality(good, ricker).corr).toBeGreaterThan(0.99);
  // the same logs with their texture moved by a quarter cycle: no longer the seismic's reflectivity
  const wrong = WELLS.map((w) => ({ ...w, ln_ai: w.ln_ai.map((v, k) => (v == null ? null : 8.6 + 0.03 * Math.cos(2 * Math.PI * k / 7.3))) }));
  expect(scaleTieQuality(wrong.map((w) => ({ trace: seis(w.il), lnAi: w.ln_ai.map((v) => (v == null ? NaN : v)) })), ricker).corr).toBeLessThan(MIN_SCALE_TIE);
  const ok = await poststackInversion(ctxFor(params('blind')), depsFor({ volumes: { [VOL]: PARENT }, horizons: HZ_ROWS }));
  expect(ok.settings.wavelet_scale_tie.corr).toBeGreaterThan(0.99);
  await expect(poststackInversion(ctxFor(params('blind', { wells: wrong })), depsFor({ volumes: { [VOL]: PARENT }, horizons: HZ_ROWS }))).rejects.toThrow(/tie too poorly/);
});

// F3 benchmark F-6 (2026-10-15): the coloured operator is built from
// amplitude spectra, so on reversed-polarity seismic its output ran against
// the logs. The polarity now comes from the wells. Negative control: the
// same seismic with its sign flipped gives the same blind correlations.
test('coloured inversion takes its polarity from the wells: reversed seismic gives the same blind correlations', async () => {
  const flipped = () => async (path) => Float32Array.from(new Float32Array(STORE.get(path.match(/bricks\/(\d+-\d+-\d+)\.f32$/)[1]).slice().buffer), (v) => (Math.abs(v) < 1e29 ? -v : v)).buffer;
  const run = (extra) => poststackInversion(ctxFor(params('blind', { method: 'coloured' })), depsFor({ volumes: { [VOL]: PARENT }, horizons: HZ_ROWS }, extra));
  const a = await run({});
  const b = await run({ makeFetcher: flipped });
  for (let k = 0; k < a.blind.length; k++) {
    expect(a.blind[k].blind.corr).toBeGreaterThan(0.3);
    expect(b.blind[k].blind.corr).toBeCloseTo(a.blind[k].blind.corr, 6);
  }
  const { colouredFromWells } = await import('../../../src/pages/apps/QIStudio/services/inversionRun.js');
  const logs = WELLS.map((w) => w.ln_ai.map((v) => (v == null ? NaN : v)));
  const args = (sign) => ({ wellTraces: WELLS.map((w) => seis(w.il).map((v) => sign * v)), wellLogs: logs, dtMs: DT_MS, ns: NS, band: [5, 60] });
  expect(colouredFromWells(args(1)).polarity).toBe(1);
  expect(colouredFromWells(args(-1)).polarity).toBe(-1);
});

// F3 benchmark F-10 (QI round 3, 2026-10-15): each held-out coloured run
// takes its polarity from the wells it kept; the blind protocol records it per
// well so the blind table can show it. Each recorded polarity equals the
// operator built on the kept wells alone, and reversed seismic flips them all
// (negative control: the recorded value is not a constant).
test('coloured blind runs record the polarity each held-out well used', async () => {
  const flipped = () => async (path) => Float32Array.from(new Float32Array(STORE.get(path.match(/bricks\/(\d+-\d+-\d+)\.f32$/)[1]).slice().buffer), (v) => (Math.abs(v) < 1e29 ? -v : v)).buffer;
  const run = (extra) => poststackInversion(ctxFor(params('blind', { method: 'coloured' })), depsFor({ volumes: { [VOL]: PARENT }, horizons: HZ_ROWS }, extra));
  const a = await run({});
  const b = await run({ makeFetcher: flipped });
  const { colouredFromWells } = await import('../../../src/pages/apps/QIStudio/services/inversionRun.js');
  const logs = WELLS.map((w) => w.ln_ai.map((v) => (v == null ? NaN : v)));
  expect(a.blind_protocol.held_back.map((h) => h.name).sort()).toEqual(WELLS.map((w) => w.name).sort());
  for (const h of a.blind_protocol.held_back) {
    const keep = WELLS.map((w, k) => k).filter((k) => WELLS[k].name !== h.name);
    const ref = colouredFromWells({ wellTraces: keep.map((k) => seis(WELLS[k].il)), wellLogs: keep.map((k) => logs[k]), dtMs: DT_MS, ns: NS, band: [5, 60] }).polarity;
    expect(h.polarity).toBe(ref);
    expect(h.polarity).toBe(1);
  }
  for (const h of b.blind_protocol.held_back) expect(h.polarity).toBe(-1);
  expect(a.settings.coloured_polarity).toBe(1);
  expect(b.settings.coloured_polarity).toBe(-1);
});


// QI showcase (2026-10-16): the framework is picked on the full stack while
// the angle stacks are inverted; horizons on any of the user's volumes of the
// same lattice now guide the model (worker/seismic-worker/src/horizonLattice.js).
describe('horizons picked on another volume of the lattice', () => {
  const SIB = '99999999-9999-4999-8999-999999999999';
  const SIBLING = { ...PARENT, id: SIB, name: 'Full stack', storage_path: `${UID}/${SIB}` };
  const onSibling = { [HZ1]: { ...HZ_ROWS[HZ1], volume_id: SIB }, [HZ2]: { ...HZ_ROWS[HZ2], volume_id: SIB } };
  test('give exactly the inversion the same picks give on the volume itself', async () => {
    const a = await poststackInversion(ctxFor(params('blind')), depsFor({ volumes: { [VOL]: PARENT }, horizons: HZ_ROWS }));
    const b = await poststackInversion(ctxFor(params('blind')), depsFor({ volumes: { [VOL]: PARENT, [SIB]: SIBLING }, horizons: onSibling }));
    expect(b.blind).toEqual(a.blind);
  });
  test('a volume with another lattice is refused, and the guide matters (negative control)', async () => {
    const other = { ...MANIFEST, geometry: { ...MANIFEST.geometry, il: { ...MANIFEST.geometry.il, count: MANIFEST.geometry.il.count + 1, max: MANIFEST.geometry.il.max + MANIFEST.geometry.il.step } } };
    const readManifest = async (path) => (path.startsWith(`${UID}/${SIB}`) ? other : MANIFEST);
    await expect(poststackInversion(ctxFor(params('blind')), depsFor({ volumes: { [VOL]: PARENT, [SIB]: SIBLING }, horizons: onSibling }, { readManifest }))).rejects.toMatchObject({ stage: 'validate_failed', message: expect.stringMatching(/another lattice/) });
    const none = await poststackInversion(ctxFor(params('blind', { horizon_ids: [] })), depsFor({ volumes: { [VOL]: PARENT }, horizons: {} }));
    const withH = await poststackInversion(ctxFor(params('blind')), depsFor({ volumes: { [VOL]: PARENT, [SIB]: SIBLING }, horizons: onSibling }));
    expect(withH.blind).not.toEqual(none.blind);
  });
});

// QI showcase (2026-10-16): a guiding horizon with a hole (untracked across a
// fault) stopped a survey run at the first trace in the hole with "The trace
// and the well need the same horizons". Engines #380: the model takes constant
// time there.
test('a volume run completes when a guiding horizon has a hole away from the wells', async () => {
  const holed = GRIDS[HZ1].slice();
  holed[2 * NXL + 2] = 1.0e30;   // inline index 2, crossline 2: no well there
  const uploads = new Map();
  const storage = { upload: async (path, bytes) => { uploads.set(path, bytes); return {}; } };
  const readBlob = async (path) => (path === 'h1' ? holed : GRIDS[HZ2]).slice().buffer;
  const out = await poststackInversion(ctxFor(params('volume', { wells: WELLS })), depsFor({ volumes: { [VOL]: PARENT, [OUT]: DERIVED }, horizons: HZ_ROWS }, { storage, readBlob }));
  expect(out).toBeTruthy();
  expect([...uploads.keys()].some((k) => k.endsWith('.f32'))).toBe(true);
});
