import {
  validatePrestackParams, meanVsVp, prestackLfm, prestackWaveletScale, makeCdpInverter, prestackBlindTable, prestackProducts, PRESTACK_DEFAULTS,
} from '../services/prestackRun';
import { horizonsAtFrom } from '../services/inversionRun';
import { forwardFatti } from '../engine/prestackInversion';

// A survey with known AI, SI and density: two dipping horizons, three
// layers, a gas-like middle layer (AI and density down, SI barely), and
// five angle stacks made with the Fatti forward model at a known scale.
const nIl = 6; const nXl = 4; const ns = 160; const dtMs = 4; const SCALE = 2.2; const VSVP = 0.5;
const ricker = Array.from({ length: 31 }, (_, i) => { const t = ((i - 15) * dtMs) / 1000; const a = (Math.PI * 25 * t) ** 2; return (1 - 2 * a) * Math.exp(-a); });
const THETA = [4, 12, 20, 28, 36];
const topAt = (il) => 200 + 10 * il; const baseAt = (il) => 400 + 16 * il;
const layer = (il, a, b, c) => Float64Array.from({ length: ns }, (_, k) => { const t = k * dtMs; return t < topAt(il) ? a : t < baseAt(il) ? b : c; });
const truth = (il) => ({
  lnAi: layer(il, Math.log(7000), Math.log(6200), Math.log(7600)),
  lnSi: layer(il, Math.log(3500), Math.log(3450), Math.log(3800)),
  lnRho: layer(il, Math.log(2.40), Math.log(2.20), Math.log(2.45)),
});
const stacksAt = (il) => forwardFatti(truth(il), THETA, ricker, VSVP).map((t) => Float32Array.from(t, (v) => SCALE * v));
const grids = [
  Float32Array.from({ length: nIl * nXl }, (_, c) => topAt(Math.floor(c / nXl)) / dtMs),
  Float32Array.from({ length: nIl * nXl }, (_, c) => baseAt(Math.floor(c / nXl)) / dtMs),
];
const posOf = (il, xl) => ({ x: il * 25, y: xl * 25 });
const win = (arr) => Array.from(arr, (v, k) => (k * dtMs >= 120 && k * dtMs <= 560 ? v : NaN));
const wellAt = (name, il, xl) => { const t = truth(il); return { name, il, xl, ln_ai: win(t.lnAi), ln_si: win(t.lnSi), ln_rho: win(t.lnRho) }; };
const WELLS = [wellAt('A', 0, 0), wellAt('B', 3, 3), wellAt('C', 5, 1)];
const at = horizonsAtFrom(grids, nXl, dtMs);

function setup({ horizons = true } = {}) {
  const h = horizons ? at : () => null;
  const vsVp = meanVsVp(WELLS);
  const lfm = prestackLfm(WELLS, { dtMs, lfmHz: 8, posOf, horizonsAt: h });
  const { scale } = prestackWaveletScale(WELLS.map((w) => ({ well: w, traces: stacksAt(w.il) })), THETA, ricker, vsVp);
  const invert = makeCdpInverter({ inv: { ...PRESTACK_DEFAULTS, iters: 200 }, thetaDeg: THETA, wavelet: ricker.map((v) => v * scale), lfm, posOf, horizonsAt: h, ns, dtMs, vsVp });
  return { invert, scale, vsVp };
}

test('settings', () => {
  const ok = { mode: 'blind', inversion: { stacks: THETA.map((a) => ({ angle: a })), wavelet: { samples: ricker, dt_ms: dtMs }, wells: WELLS } };
  expect(validatePrestackParams(ok)).toBeNull();
  expect(validatePrestackParams({ ...ok, inversion: { ...ok.inversion, stacks: THETA.slice(0, 2).map((a) => ({ angle: a })) } })).toMatch(/three to six/);
  expect(validatePrestackParams({ ...ok, inversion: { ...ok.inversion, stacks: [4, 8, 12].map((a) => ({ angle: a })) } })).toMatch(/25 degrees/);
  expect(validatePrestackParams({ ...ok, inversion: { ...ok.inversion, wells: [{ ...WELLS[0], ln_si: [NaN] }, WELLS[1]] } })).toMatch(/no SI log/);
});

test('the wells give the background Vs/Vp and the wavelet scale', () => {
  const { scale, vsVp } = setup();
  expect(vsVp).toBeGreaterThan(0.45); expect(vsVp).toBeLessThan(0.6);
  expect(Math.abs(scale - SCALE) / SCALE).toBeLessThan(0.1); // the wells' Vs/Vp is not the 0.5 the stacks were made with
});

test('blind wells: AI, SI and density each follow the left-out well', () => {
  const { invert } = setup();
  const rows = prestackBlindTable({ invert, wells: WELLS, tracesByWell: WELLS.map((w) => stacksAt(w.il)), dtMs, truthHz: 50 });
  for (const r of rows) {
    expect(r.blind.ai.rmsPct).toBeLessThan(4);
    expect(r.blind.si.rmsPct).toBeLessThan(4);
    expect(r.blind.rho.rmsPct).toBeLessThan(5);
  }
});

test('negative control: without horizons the dipping layers are misplaced and the blind AI error grows', () => {
  const err = (h) => {
    const { invert } = setup({ horizons: h });
    const rows = prestackBlindTable({ invert, wells: WELLS, tracesByWell: WELLS.map((w) => stacksAt(w.il)), dtMs, truthHz: 50 });
    return Math.max(...rows.map((r) => r.blind.ai.rmsPct));
  };
  expect(err(false)).toBeGreaterThan(1.5 * err(true));
});

test('products: AI, SI, density and Vp/Vs, nulls where every stack is null', () => {
  const { invert } = setup();
  const tr = stacksAt(2).map((t) => { const c = Float32Array.from(t); c[5] = 1e30; return c; });
  const m = invert(tr, 2, 1);
  const [ai, si, rho, vpvs] = prestackProducts(m);
  expect(Number.isNaN(ai[5])).toBe(true);
  expect(vpvs[100]).toBeCloseTo(ai[100] / si[100], 9);
  expect(rho[300 / 4]).toBeGreaterThan(2.0);
});
