/**
 * @jest-environment node
 */
// prestack_inversion (QI programme Q8b): five angle stacks made with the
// Fatti model from known AI, SI and density; the blind table equals the run
// module's on the same traces, and a volume run writes AI, SI, density and
// Vp/Vs that match the truth at a well. Then the guards.
import { packLog } from '../../../src/pages/apps/QIStudio/services/logPacking.js';
import { prestackInversion, validatePrestackJob } from '../src/handlers/prestackInversion.js';
import {
  meanVsVp, prestackLfm, prestackWaveletScale, makeCdpInverter, prestackBlindTable, PRESTACK_DEFAULTS, simultaneousIssues,
} from '../../../src/pages/apps/QIStudio/services/prestackRun';
import { horizonsAtFrom } from '../../../src/pages/apps/QIStudio/services/inversionRun';
import { forwardFatti } from '../../../packages/engines/engines/qi/prestackInversion';
import { NULL_VALUE } from '../../../packages/engines/engines/seismolord/manifest';
import { KINDS } from '../src/handlers/index.js';

jest.setTimeout(240000);
const UID = '11111111-1111-4111-8111-111111111111';
const THETA = [4, 12, 20, 28, 36];
const S = THETA.map((_, k) => `2${k}111111-1111-4111-8111-111111111111`);
const OUT = { ai: '31111111-1111-4111-8111-111111111111', si: '32222222-2222-4222-8222-222222222222', rho: '33333333-3333-4333-8333-333333333333', vpvs: '34444444-4444-4444-8444-444444444444' };
const HZ = ['41111111-1111-4111-8111-111111111111', '42222222-2222-4222-8222-222222222222'];
const NIL = 5; const NXL = 4; const NS = 128; const BS = 16; const DT = 4; const GRID = [1, 1, NS / BS];
const ricker = Array.from({ length: 31 }, (_, i) => { const t = ((i - 15) * DT) / 1000; const a = (Math.PI * 25 * t) ** 2; return (1 - 2 * a) * Math.exp(-a); });
const topAt = (il) => 160 + 10 * il; const baseAt = (il) => 330 + 14 * il;
const layer = (il, a, b, c) => Float64Array.from({ length: NS }, (_, k) => { const t = k * DT; return t < topAt(il) ? a : t < baseAt(il) ? b : c; });
const truth = (il) => ({ lnAi: layer(il, Math.log(7000), Math.log(6200), Math.log(7600)), lnSi: layer(il, Math.log(3500), Math.log(3450), Math.log(3800)), lnRho: layer(il, Math.log(2.4), Math.log(2.2), Math.log(2.45)) });
const STORES = THETA.map((_, k) => {
  const m = new Map(); for (let kk = 0; kk < GRID[2]; kk++) m.set(`0-0-${kk}`, new Float32Array(BS ** 3).fill(NULL_VALUE));
  for (let il = 0; il < NIL; il++) {
    const tr = forwardFatti(truth(il), THETA, ricker, 0.5)[k];
    for (let xl = 0; xl < NXL; xl++) for (let s = 0; s < NS; s++) m.get(`0-0-${Math.floor(s / BS)}`)[((il % BS) * BS + xl) * BS + (s % BS)] = Math.fround(1.8 * tr[s]);
  }
  return m;
});
const GRIDS = { h1: Float32Array.from({ length: NIL * NXL }, (_, c) => topAt(Math.floor(c / NXL)) / DT), h2: Float32Array.from({ length: NIL * NXL }, (_, c) => baseAt(Math.floor(c / NXL)) / DT) };
const man = { manifest_version: 1, geometry: { il: { min: 1, max: NIL, step: 1, count: NIL }, xl: { min: 1, max: NXL, step: 1, count: NXL }, ns: NS, dt_us: DT * 1000, corners: [[0, 0], [1, 0], [0, 1]] }, brick: { size: BS, grid: GRID, count: GRID[2], dtype: 'float32le', layout: 'il-major,xl,sample-fastest', path_pattern: 'bricks/{i}-{j}-{k}.f32', null_value: 1e30 }, stats: {}, trace_count: NIL * NXL };
const win = (arr) => JSON.parse(JSON.stringify(Array.from(arr, (v, k) => (k * DT >= 100 && k * DT <= 450 ? v : NaN))));
const wellAt = (name, il, xl) => { const t = truth(il); return { name, il, xl, ln_ai: win(t.lnAi), ln_si: win(t.lnSi), ln_rho: win(t.lnRho) }; };
const WELLS = [wellAt('A', 0, 0), wellAt('B', 2, 3), wellAt('C', 4, 1)];
const rows = () => {
  const r = {}; S.forEach((id, k) => { r[id] = { id, user_id: UID, status: 'ready', name: `stack ${THETA[k]}`, kind: 'seismic', storage_path: `${UID}/${id}` }; });
  for (const id of Object.values(OUT)) r[id] = { id, user_id: UID, status: 'ingesting', name: `out ${id}`, kind: 'attribute', parent_volume_id: S[0], storage_path: `${UID}/${id}` };
  return r;
};
const HROWS = { [HZ[0]]: { id: HZ[0], user_id: UID, volume_id: S[0], name: 'Top', storage_path: 'h1' }, [HZ[1]]: { id: HZ[1], user_id: UID, volume_id: S[0], name: 'Base', storage_path: 'h2' } };
const depsFor = (r = rows()) => {
  const uploads = new Map();
  return {
    uploads,
    d: {
      admin: {
        from: (t) => { let id = null; const b = { select: () => b, eq: (c, v) => { if (c === 'id') id = v; return b; }, maybeSingle: async () => ({ data: (t === 'seismic_horizons' ? HROWS : r)[id] || null, error: null }), update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }), delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }; return b; },
        rpc: async (name) => ({ data: name.startsWith('seismic_storage_usage') ? 0 : 1e12, error: null }),
        storage: { from: () => ({ remove: async () => ({}) }) },
      },
      readManifest: async () => man,
      readBlob: async (path) => GRIDS[path].slice().buffer,
      makeFetcher: (m, k) => async (path) => STORES[k].get(path.match(/bricks\/(\d+-\d+-\d+)\.f32$/)[1]).slice().buffer,
      storage: { upload: async (path, bytes) => { uploads.set(path, bytes); return {}; } },
    },
  };
};
const ctxFor = (params) => ({ params, job: { user_id: UID }, progress: () => {}, cancelled: false, log: {} });
const P = (mode) => ({ mode, ...(mode === 'volume' ? { volume_ids: OUT } : {}), inversion: { stacks: S.map((id, k) => ({ volume_id: id, angle: THETA[k] })), wavelet: { samples: ricker, dt_ms: DT }, wells: WELLS, horizon_ids: HZ, iters: 150 } });

test('the kind is registered', () => expect(KINDS).toContain('prestack_inversion'));

test('blind mode equals the run module on the same traces', async () => {
  const out = await prestackInversion(ctxFor(P('blind')), depsFor().d);
  const wells = WELLS.map((w) => ({ ...w, ln_ai: w.ln_ai.map((v) => (Number.isFinite(v) ? v : NaN)), ln_si: w.ln_si.map((v) => (Number.isFinite(v) ? v : NaN)), ln_rho: w.ln_rho.map((v) => (Number.isFinite(v) ? v : NaN)) }));
  const posOf = (il, xl) => ({ x: il, y: xl });
  const at = horizonsAtFrom([GRIDS.h1, GRIDS.h2], NXL, DT);
  const traces = tracesOf(wells);
  expect(out.blind).toEqual(handBlind(wells, traces, posOf, at));
  for (const r of out.blind) expect(r.blind.ai.rmsPct).toBeLessThan(5);
  expect(out.blind_protocol.excluded_from).toEqual(['the three low-frequency models', 'the wavelet scale', 'the background Vs/Vp']);
});

const cleanWells = (ws) => ws.map((w) => ({ ...w, ln_ai: w.ln_ai.map((v) => (Number.isFinite(v) ? v : NaN)), ln_si: w.ln_si.map((v) => (Number.isFinite(v) ? v : NaN)), ln_rho: w.ln_rho.map((v) => (Number.isFinite(v) ? v : NaN)) }));
const tracesOf = (wells) => wells.map((w) => THETA.map((_, k) => Float32Array.from({ length: NS }, (_, s) => STORES[k].get(`0-0-${Math.floor(s / BS)}`)[((w.il % BS) * BS + w.xl) * BS + (s % BS)])));
/** The truly blind table by hand (QI upgrade P1.2): each held-back well out of the models, the scale and the Vs/Vp. */
function handBlind(wells, traces, posOf, at) {
  const lfm = prestackLfm(wells, { dtMs: DT, lfmHz: 8, posOf, horizonsAt: at });
  const build = (exclude) => {
    const keep = wells.map((w, k) => k).filter((k) => wells[k].name !== exclude);
    const vsVp = meanVsVp(keep.map((k) => wells[k]));
    const { scale } = prestackWaveletScale(keep.map((k) => ({ well: wells[k], traces: traces[k] })), THETA, Float64Array.from(ricker), vsVp);
    return makeCdpInverter({ inv: { ...PRESTACK_DEFAULTS, iters: 150 }, thetaDeg: THETA, wavelet: Float64Array.from(ricker).map((v) => v * scale), lfm, posOf, horizonsAt: at, ns: NS, dtMs: DT, vsVp });
  };
  const full = build(null);
  const invert = (tr, il, xl, exclude) => (exclude ? build(exclude)(tr, il, xl, exclude) : full(tr, il, xl));
  return prestackBlindTable({ invert, wells, tracesByWell: traces, dtMs: DT, truthHz: 50 });
}

test('truly blind: a held-back well is out of the wavelet scale and the Vs/Vp; the old protocol differs', async () => {
  // C's impedance log carries a doubled contrast and its shear log is 15
  // percent slow, so a wavelet scale and a Vs/Vp that see C differ
  const lnAiC = WELLS[2].ln_ai.filter(Number.isFinite);
  const mC = lnAiC.reduce((a, v) => a + v, 0) / lnAiC.length;
  const odd = { ...WELLS[2], ln_ai: WELLS[2].ln_ai.map((v) => (Number.isFinite(v) ? mC + 2 * (v - mC) : v)), ln_si: WELLS[2].ln_si.map((v) => (Number.isFinite(v) ? v + Math.log(0.85) : v)) };
  const params = P('blind'); params.inversion.wells = [WELLS[0], WELLS[1], odd];
  const out = await prestackInversion(ctxFor(params), depsFor().d);
  const wells = cleanWells([WELLS[0], WELLS[1], odd]);
  const posOf = (il, xl) => ({ x: il, y: xl });
  const at = horizonsAtFrom([GRIDS.h1, GRIDS.h2], NXL, DT);
  const traces = tracesOf(wells);
  expect(out.blind).toEqual(handBlind(wells, traces, posOf, at));
  // negative control: one scale and one Vs/Vp on every well (the protocol before 2026-10-15)
  const vsVp = meanVsVp(wells);
  const { scale } = prestackWaveletScale(wells.map((w, k) => ({ well: w, traces: traces[k] })), THETA, Float64Array.from(ricker), vsVp);
  const old = makeCdpInverter({ inv: { ...PRESTACK_DEFAULTS, iters: 150 }, thetaDeg: THETA, wavelet: Float64Array.from(ricker).map((v) => v * scale), lfm: prestackLfm(wells, { dtMs: DT, lfmHz: 8, posOf, horizonsAt: at }), posOf, horizonsAt: at, ns: NS, dtMs: DT, vsVp });
  const oldTable = prestackBlindTable({ invert: old, wells, tracesByWell: traces, dtMs: DT, truthHz: 50 });
  const d = out.blind.slice(0, 2).map((r, k) => Math.abs(r.blind.ai.rmsPct - oldTable[k].blind.ai.rmsPct) + Math.abs(r.blind.si.rmsPct - oldTable[k].blind.si.rmsPct));
  expect(Math.max(...d)).toBeGreaterThan(0.1);
  expect(out.blind_protocol.held_back.find((h) => h.name === 'C').vs_vp).not.toBeCloseTo(out.settings.vs_vp, 4);
});

test('a typed Vs/Vp is kept for every held-back well, and the protocol says so', async () => {
  const params = P('blind'); params.inversion.vs_vp = 0.5;
  const out = await prestackInversion(ctxFor(params), depsFor().d);
  expect(out.blind_protocol.excluded_from).not.toContain('the background Vs/Vp');
  expect(out.blind_protocol.held_back.every((h) => h.vs_vp === 0.5)).toBe(true);
});

test('a volume run records the held-back AI and Vp/Vs at each well for the property check', async () => {
  const { d, uploads } = depsFor();
  await prestackInversion(ctxFor(P('volume')), d);
  const ai = JSON.parse(new TextDecoder().decode(uploads.get(`${UID}/${OUT.ai}/manifest.json`)));
  const vpvs = JSON.parse(new TextDecoder().decode(uploads.get(`${UID}/${OUT.vpvs}/manifest.json`)));
  const si = JSON.parse(new TextDecoder().decode(uploads.get(`${UID}/${OUT.si}/manifest.json`)));
  expect(ai.attribute.params.blind_traces.map((x) => x.name)).toEqual(['A', 'B', 'C']);
  expect(ai.attribute.params.blind_traces[0].ln_ai.packed).toBe(1);
  expect(vpvs.attribute.params.blind_traces[0].vpvs.packed).toBe(1);
  expect(si.attribute.params.blind_traces).toBeUndefined();
});

test('simultaneous blind results become register issues (U2-008)', () => {
  const blind = [
    { name: 'A', blind: { ai: { rmsPct: 4 }, si: { rmsPct: 12 }, rho: { rmsPct: 3, corr: 0.8 } } },
    { name: 'B', blind: { ai: { rmsPct: 24 }, si: { rmsPct: 6 }, rho: { rmsPct: 12, corr: 0.3 } } },
    { name: 'C', blind: { ai: { rmsPct: 3 }, si: { rmsPct: 4 }, rho: { rmsPct: 14, corr: 0.7 } } },
  ];
  const issues = simultaneousIssues(blind, 'near mid far');
  expect(issues.map((i) => [i.key.split(':').slice(-2).join(':'), i.severity])).toEqual([['A:si', 'medium'], ['B:ai', 'high'], ['B:rho-corr', 'medium'], ['C:rho-err', 'low']]);
  expect(issues.every((i) => i.area === 'Simultaneous inversion')).toBe(true);
  expect(simultaneousIssues([{ name: 'D', blind: { ai: { rmsPct: 2 }, si: { rmsPct: 2 }, rho: { rmsPct: 2, corr: 0.9 } } }])).toEqual([]);
});

test('packed logs (the client form since 2026-10-10) give the same blind table as plain arrays, within the packing step', async () => {
  const plain = await prestackInversion(ctxFor(P('blind')), depsFor().d);
  const packedWells = WELLS.map((w) => ({ ...w, ln_ai: packLog(w.ln_ai), ln_si: packLog(w.ln_si), ln_rho: packLog(w.ln_rho) }));
  const params = P('blind'); params.inversion.wells = packedWells;
  const packed = await prestackInversion(ctxFor(params), depsFor().d);
  expect(packed.blind.map((r) => r.name)).toEqual(plain.blind.map((r) => r.name));
  packed.blind.forEach((r, k) => expect(Math.abs(r.blind.ai.rmsPct - plain.blind[k].blind.ai.rmsPct)).toBeLessThan(0.05));
});

test('a volume run writes AI, SI, density and Vp/Vs that match the truth at a well', async () => {
  const { d, uploads } = depsFor();
  const out = await prestackInversion(ctxFor(P('volume')), d);
  expect(out.volume_ids).toEqual(OUT);
  const at = (id, il, xl, s) => new Float32Array(uploads.get(`${UID}/${id}/bricks/0-0-${Math.floor(s / BS)}.f32`).buffer.slice(0))[((il % BS) * BS + xl) * BS + (s % BS)];
  const t = truth(2);
  let eAi = 0; let eRho = 0; let n = 0;
  for (let s = 30; s < 110; s++) {
    eAi += ((at(OUT.ai, 2, 3, s) - Math.exp(t.lnAi[s])) / Math.exp(t.lnAi[s])) ** 2;
    eRho += ((at(OUT.rho, 2, 3, s) - Math.exp(t.lnRho[s])) / Math.exp(t.lnRho[s])) ** 2;
    expect(at(OUT.vpvs, 2, 3, s)).toBeCloseTo(at(OUT.ai, 2, 3, s) / at(OUT.si, 2, 3, s), 3);
    n += 1;
  }
  expect(100 * Math.sqrt(eAi / n)).toBeLessThan(4);
  expect(100 * Math.sqrt(eRho / n)).toBeLessThan(6);
  const m = JSON.parse(new TextDecoder().decode(uploads.get(`${UID}/${OUT.ai}/manifest.json`)));
  expect(m.attribute).toMatchObject({ name: 'qi_prestack_inversion', params: { product: 'ai', qi_class: 'elastic_estimate' } });
});

test('guards', async () => {
  expect(validatePrestackJob({ ...P('volume'), volume_ids: { ai: OUT.ai } })).toMatch(/volume_ids/);
  const dup = P('blind'); dup.inversion.stacks[1].volume_id = S[0];
  expect(validatePrestackJob(dup)).toMatch(/different volume/);
  const r = rows(); r[S[2]].user_id = 'x';
  await expect(prestackInversion(ctxFor(P('blind')), depsFor(r).d)).rejects.toMatchObject({ stage: 'not_found' });
});

test('one wavelet per stack is taken (angle-dependent), and a count that does not match the stacks is refused', async () => {
  const per = P('blind'); per.inversion.wavelets = THETA.map(() => ({ samples: ricker, dt_ms: DT }));
  const out = await prestackInversion(ctxFor(per), depsFor().d);
  expect(out.settings.wavelets).toBe('one per stack, from the wells');
  for (const r of out.blind) expect(r.blind.ai.rmsPct).toBeLessThan(5);
  const bad = P('blind'); bad.inversion.wavelets = [{ samples: ricker, dt_ms: DT }];
  expect(validatePrestackJob(bad)).toMatch(/one wavelet per stack/);
});

test('pilot sub-volume: the full run inside the window, null outside, only its bricks', async () => {
  const full = depsFor(); await prestackInversion(ctxFor(P('volume')), full.d);
  const pil = depsFor();
  const out = await prestackInversion(ctxFor({ ...P('volume'), pilot: { il: { from: 2, to: 4 }, xl: { from: 1, to: 3 }, t_ms: { from: 160, to: 300 } } }), pil.d);
  expect(out.pilot.bricks).toEqual({ i0: 0, i1: 0, j0: 0, j1: 0, k0: 2, k1: 4 });
  expect([...pil.uploads.keys()].filter((k) => k.startsWith(`${UID}/${OUT.ai}/bricks`))).toHaveLength(3);
  const f = (u, id, s) => { const b = u.get(`${UID}/${id}/bricks/0-0-${Math.floor(s / BS)}.f32`); return b ? new Float32Array(b.buffer.slice(0)) : null; };
  for (const id of [OUT.ai, OUT.vpvs]) {
    for (let il = 0; il < NIL; il++) for (let xl = 0; xl < NXL; xl++) for (let s = 32; s < 80; s += 2) {
      const i = ((il % BS) * BS + xl) * BS + (s % BS);
      const inside = il >= 1 && il <= 3 && xl <= 2 && s >= 40 && s <= 75;
      expect(f(pil.uploads, id, s)[i]).toBe(inside ? f(full.uploads, id, s)[i] : Math.fround(1e30));
    }
  }
});
