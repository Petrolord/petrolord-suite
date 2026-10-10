/**
 * @jest-environment node
 */
// prestack_inversion (QI programme Q8b): five angle stacks made with the
// Fatti model from known AI, SI and density; the blind table equals the run
// module's on the same traces, and a volume run writes AI, SI, density and
// Vp/Vs that match the truth at a well. Then the guards.
import { packLog } from '../../../src/pages/apps/QIStudio/services/logPacking.js';
import { prestackInversion, validatePrestackJob } from '../src/handlers/prestackInversion.js';
import { meanVsVp, prestackLfm, prestackWaveletScale, makeCdpInverter, prestackBlindTable, PRESTACK_DEFAULTS } from '../../../src/pages/apps/QIStudio/services/prestackRun';
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
  const traces = wells.map((w) => THETA.map((_, k) => Float32Array.from({ length: NS }, (_, s) => STORES[k].get(`0-0-${Math.floor(s / BS)}`)[((w.il % BS) * BS + w.xl) * BS + (s % BS)])));
  const vsVp = meanVsVp(wells);
  const { scale } = prestackWaveletScale(wells.map((w, k) => ({ well: w, traces: traces[k] })), THETA, Float64Array.from(ricker), vsVp);
  const invert = makeCdpInverter({ inv: { ...PRESTACK_DEFAULTS, iters: 150 }, thetaDeg: THETA, wavelet: Float64Array.from(ricker).map((v) => v * scale), lfm: prestackLfm(wells, { dtMs: DT, lfmHz: 8, posOf, horizonsAt: at }), posOf, horizonsAt: at, ns: NS, dtMs: DT, vsVp });
  const ref = prestackBlindTable({ invert, wells, tracesByWell: traces, dtMs: DT, truthHz: 50 });
  expect(out.blind).toEqual(ref);
  for (const r of out.blind) expect(r.blind.ai.rmsPct).toBeLessThan(5);
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
