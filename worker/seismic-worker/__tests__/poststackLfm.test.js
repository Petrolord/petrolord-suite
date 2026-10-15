/**
 * @jest-environment node
 */
// poststack_inversion low-frequency model options (QI upgrade P2.8): kriging
// and faults equal a hand-built engine model; a velocity trend calibrated at
// the wells beats inverse distance where velocity varies between wells (known
// truth), is calibrated without the held-back well, and the scenarios come
// back as a table. Negative controls: inverse distance in the same survey;
// a velocity volume on another lattice is refused.
import { poststackInversion } from '../src/handlers/poststackInversion.js';
import {
  lfmWells, horizonsAtFrom, waveletScale, makeTraceInverter, blindWellTable, INVERSION_DEFAULTS, validateInversionParams,
} from '../../../src/pages/apps/QIStudio/services/inversionRun';
import { forwardPoststack } from '../../../packages/engines/engines/qi/inversion';
import { NULL_VALUE } from '../../../packages/engines/engines/seismolord/manifest';
import { surveyAffine, ilxlToWorld } from '../../../packages/engines/engines/seismolord/surveyGeometry';

jest.setTimeout(240000);
const UID = '11111111-1111-4111-8111-111111111111';
const VOL = '22222222-2222-4222-8222-222222222222';
const VEL = '33333333-3333-4333-8333-333333333334';
const NIL = 9; const NXL = 3; const NS = 128; const B = 16; const DT = 4; const SCALE = 2;
const GRID = [1, 1, NS / B];
const geometry = { il: { min: 1, max: NIL, step: 1, count: NIL }, xl: { min: 1, max: NXL, step: 1, count: NXL }, ns: NS, dt_us: DT * 1000, corners: [[0, 0], [100 * (NIL - 1), 0], [0, 100 * (NXL - 1)]] };
const MAN = (extra = {}) => ({ manifest_version: 1, geometry, brick: { size: B, grid: GRID, count: GRID[2], dtype: 'float32le', layout: 'il-major,xl,sample-fastest', path_pattern: 'bricks/{i}-{j}-{k}.f32', null_value: 1e30 }, stats: {}, trace_count: NIL * NXL, ...extra });
// interval velocity varies non-linearly along the inlines; Gardner gives the impedance
const vel = (il, k) => 2300 + 500 * Math.sin(il / 1.3) + 4 * k + 60 * Math.sin(k / 6);
const lnAi = (il, k) => Math.log(0.31) + 1.25 * Math.log(vel(il, k));
const ricker = Array.from({ length: 31 }, (_, i) => { const t = ((i - 15) * DT) / 1000; const a = (Math.PI * 25 * t) ** 2; return (1 - 2 * a) * Math.exp(-a); });
const seis = (il) => forwardPoststack(Float64Array.from({ length: NS }, (_, k) => lnAi(il, k)), ricker).map((v) => Math.fround(SCALE * v));
const store = (fn) => { const m = new Map(); for (let k = 0; k < GRID[2]; k++) m.set(`0-0-${k}`, new Float32Array(B ** 3).fill(NULL_VALUE)); for (let il = 0; il < NIL; il++) { const tr = fn(il); for (let xl = 0; xl < NXL; xl++) for (let s = 0; s < NS; s++) m.get(`0-0-${Math.floor(s / B)}`)[(il * B + xl) * B + s % B] = tr[s]; } return m; };
const S = store(seis); const V = store((il) => Float32Array.from({ length: NS }, (_, k) => vel(il, k)));
const wellAt = (name, il) => ({ name, il, xl: 1, ln_ai: JSON.parse(JSON.stringify(Array.from({ length: NS }, (_, k) => (k >= 15 && k <= 110 ? lnAi(il, k) : NaN)))) });
const WELLS = [wellAt('A', 0), wellAt('B', 4), wellAt('C', 8)];
const rows = { [VOL]: { id: VOL, user_id: UID, status: 'ready', name: 'Stack', kind: 'stack', storage_path: `${UID}/${VOL}` }, [VEL]: { id: VEL, user_id: UID, status: 'ready', name: 'Interval velocity', kind: 'stack', storage_path: `${UID}/${VEL}` } };
const deps = (velMan = MAN()) => ({
  admin: { from: () => { let id = null; const b = { select: () => b, eq: (c, v) => { if (c === 'id') id = v; return b; }, maybeSingle: async () => ({ data: rows[id] || null, error: null }) }; return b; }, rpc: async (n) => ({ data: n.startsWith('seismic_storage_usage') ? 0 : 1e12, error: null }), storage: { from: () => ({ remove: async () => ({}) }) } },
  makeFetcher: (m, k) => async (path) => (k === 1 ? V : S).get(path.match(/bricks\/(\d+-\d+-\d+)\.f32$/)[1]).slice().buffer,
  readManifest: async (path) => (path.includes(VEL) ? velMan : MAN()),
});
const ctx = (inversion) => ({ params: { mode: 'blind', parent_volume_id: VOL, inversion: { method: 'model_based', wavelet: { samples: ricker, dt_ms: DT }, wells: WELLS, iters: 40, ...inversion } }, job: { user_id: UID }, progress: () => {}, cancelled: false, log: {} });
const clean = WELLS.map((w) => ({ ...w, ln_ai: w.ln_ai.map((v) => (Number.isFinite(v) ? v : NaN)) }));
const aff = surveyAffine(geometry);
const posOf = aff ? (il, xl) => ilxlToWorld(aff, il, xl) : (il, xl) => ({ x: il, y: xl });
const at = horizonsAtFrom([], NXL, DT);
const traces = clean.map((w) => Float32Array.from(seis(w.il)));
const hand = (inv) => {
  const s = { ...INVERSION_DEFAULTS, method: 'model_based', iters: 40, ...inv };
  const lfm = lfmWells(clean, { dtMs: DT, lfmHz: s.lfmHz, posOf, horizonsAt: at });
  const build = (ex) => { const keep = clean.map((w, k) => k).filter((k) => clean[k].name !== ex); const sc = waveletScale(keep.map((k) => ({ trace: traces[k], lnAi: clean[k].ln_ai })), ricker).scale; return makeTraceInverter({ inv: s, wavelet: ricker.map((v) => v * sc), wells: lfm, posOf, horizonsAt: at, ns: NS, dtMs: DT }); };
  const full = build(null);
  return blindWellTable({ invert: (t, il, xl, ex) => (ex ? build(ex)(t, il, xl, ex) : full(t, il, xl)), wells: clean, traces, dtMs: DT, truthHz: s.truthHz, absolute: true });
};

test('kriging and a fault give the hand-built engine model exactly', async () => {
  const krig = { method: 'kriging', variogram: { model: 'spherical', range: 12 } };
  expect((await poststackInversion(ctx({ lfm: krig }), deps())).blind).toEqual(hand({ lfm: krig }));
  const p2 = posOf(2, 0); const fault = { barriers: [[{ x: p2.x, y: p2.y - 1e4 }, { x: p2.x, y: p2.y + 1e4 }]] };
  const out = await poststackInversion(ctx({ lfm: fault }), deps());
  expect(out.blind).toEqual(hand({ lfm: fault }));
  expect(out.settings.lfm_faults).toBe(1);
  // negative control: without the fault the blind table differs
  expect((await poststackInversion(ctx({}), deps())).blind).not.toEqual(out.blind);
});

test('a volume run with the velocity trend reads the velocity beside each column and follows the truth between wells', async () => {
  const OUT = '44444444-4444-4444-8444-444444444445';
  rows[OUT] = { id: OUT, user_id: UID, status: 'ingesting', name: 'AI', kind: 'attribute', parent_volume_id: VOL, storage_path: `${UID}/${OUT}` };
  const run = async (inversion) => {
    const up = new Map();
    const d = { ...deps(), storage: { upload: async (path, bytes) => { up.set(path, bytes); return {}; } } };
    d.admin.from = (() => { const f = deps().admin.from; return (t) => { const b = f(t); b.update = () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }); b.delete = () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }); return b; }; })();
    const c = ctx(inversion); c.params.mode = 'volume'; c.params.volume_id = OUT;
    await poststackInversion(c, d);
    return (il, s2) => new Float32Array(up.get(`${UID}/${OUT}/bricks/0-0-${Math.floor(s2 / B)}.f32`).buffer.slice(0))[(il * B + 1) * B + (s2 % B)];
  };
  const err = (get) => { let se = 0; let n = 0; for (const il of [2, 6]) for (let k = 20; k < 100; k++) { se += ((get(il, k) - Math.exp(lnAi(il, k))) / Math.exp(lnAi(il, k))) ** 2; n += 1; } return 100 * Math.sqrt(se / n); };
  const withTrend = err(await run({ velocity: { volume_id: VEL, kind: 'interval' } }));
  const idw = err(await run({}));
  expect(withTrend).toBeLessThan(idw / 2);
});

test('a velocity trend beats inverse distance at the middle well; calibrated without the held-back well; scenarios as a table', async () => {
  const velocity = { volume_id: VEL, kind: 'interval' };
  const idw = await poststackInversion(ctx({}), deps());
  const tr = await poststackInversion(ctx({ velocity }), deps());
  expect(tr.blind[1].blind.rmsPct).toBeLessThan(idw.blind[1].blind.rmsPct / 2);
  expect(tr.blind_protocol.excluded_from).toContain('the velocity trend calibration');
  expect(Math.abs(tr.settings.lfm_trend.b - 1.25)).toBeLessThan(0.1); // low-passing V and ln AI before the fit bends it slightly
  const sc = await poststackInversion(ctx({ velocity, lfm_scenarios: [{ name: 'Wells only' }, { name: 'Kriging', lfm: { method: 'kriging', variogram: { model: 'exponential', range: 10 } } }, { name: 'Velocity trend', velocity: true }] }), deps());
  expect(sc.lfm_scenarios.map((x) => x.name)).toEqual(['Wells only', 'Kriging', 'Velocity trend']);
  const byName = Object.fromEntries(sc.lfm_scenarios.map((x) => [x.name, x.meanRmsPct]));
  expect(byName['Velocity trend']).toBeLessThan(byName['Wells only']);
});

test('refusals: a velocity volume on another lattice or in depth; settings', async () => {
  const other = MAN(); other.geometry = { ...geometry, ns: NS + 16 };
  await expect(poststackInversion(ctx({ velocity: { volume_id: VEL, kind: 'interval' } }), deps(other))).rejects.toMatchObject({ stage: 'validate_failed' });
  const depth = MAN(); depth.geometry = { ...geometry, vertical: { domain: 'depth' } };
  await expect(poststackInversion(ctx({ velocity: { volume_id: VEL, kind: 'interval' } }), deps(depth))).rejects.toMatchObject({ stage: 'validate_failed' });
  const base = ctx({}).params;
  expect(validateInversionParams({ ...base, inversion: { ...base.inversion, lfm: { method: 'kriging', variogram: {} } } })).toMatch(/range/);
  expect(validateInversionParams({ ...base, inversion: { ...base.inversion, velocity: { volume_id: VEL, kind: 'average' } } })).toMatch(/interval or RMS/);
  expect(validateInversionParams({ ...base, inversion: { ...base.inversion, velocity: { volume_id: VEL, kind: 'rms' }, sensitivity: { lfm_factors: [0.5, 1] } } })).toMatch(/single inversion/);
});
