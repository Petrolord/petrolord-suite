import {
  validateInversionParams, lfmWells, horizonsAtFrom, waveletScale, makeTraceInverter,
  blindWellTable, colouredFromWells, INVERSION_DEFAULTS, halfWindowFor,
} from '../services/inversionRun';
import { forwardPoststack } from '../engine/inversion';

// A small survey with known truth: two horizons dipping across the inlines,
// three layers between and around them, a thin-bed texture inside each layer
// that keeps its proportional position, and a seismic amplitude scale the
// wavelet has to recover.
const nIl = 7; const nXl = 5; const ns = 220; const dtMs = 4; const SCALE = 3.5;
const NULL = 1e30;
const ricker = Array.from({ length: 41 }, (_, i) => {
  const t = ((i - 20) * dtMs) / 1000; const a = (Math.PI * 25 * t) ** 2;
  return (1 - 2 * a) * Math.exp(-a);
});
const topAt = (il) => 300 + 20 * il; // ms
const baseAt = (il) => 520 + 35 * il;
const texture = (p) => 0.03 * Math.sin(2 * Math.PI * 5 * p);
function truthTrace(il) {
  const top = topAt(il); const base = baseAt(il);
  return Float64Array.from({ length: ns }, (_, k) => {
    const t = k * dtMs;
    if (t < top) return 8.4 + texture((t - top) / 200);
    if (t < base) return 8.75 + texture((t - top) / (base - top));
    return 8.6 + texture((t - base) / 200);
  });
}
const seismic = (il) => {
  const d = forwardPoststack(truthTrace(il), ricker).map((v) => SCALE * v);
  return Float32Array.from(d);
};
const grids = [
  Float32Array.from({ length: nIl * nXl }, (_, c) => topAt(Math.floor(c / nXl)) / dtMs),
  Float32Array.from({ length: nIl * nXl }, (_, c) => baseAt(Math.floor(c / nXl)) / dtMs),
];
const posOf = (il, xl) => ({ x: il * 25, y: xl * 25 });
// wells log a window of the truth: 160 to 800 ms
const wellAt = (name, il, xl) => ({
  name, il, xl,
  ln_ai: Array.from(truthTrace(il), (v, k) => (k * dtMs >= 160 && k * dtMs <= 800 ? v : NaN)),
});
const WELLS = [wellAt('A', 0, 0), wellAt('B', 3, 4), wellAt('C', 6, 1), wellAt('D', 6, 4)];

describe('inversion job params', () => {
  const ok = { mode: 'blind', inversion: { method: 'model_based', wavelet: { samples: ricker, dt_ms: dtMs }, wells: WELLS } };
  test('a complete job passes', () => expect(validateInversionParams(ok)).toBeNull());
  test.each([
    [{ ...ok, mode: 'x' }, /mode/],
    [{ ...ok, inversion: { ...ok.inversion, method: 'magic' } }, /Unknown inversion method/],
    [{ ...ok, inversion: { ...ok.inversion, wavelet: { samples: [1, 2, 3, 4] } } }, /odd number/],
    [{ ...ok, inversion: { ...ok.inversion, wells: [] } }, /at least one well/],
    [{ ...ok, inversion: { ...ok.inversion, wells: [WELLS[0]] } }, /at least two wells/],
    [{ ...ok, inversion: { ...ok.inversion, wells: [{ name: 'X', il: 0, xl: 0, ln_ai: [NaN] }, WELLS[1]] } }, /no impedance log/],
    [{ ...ok, inversion: { ...ok.inversion, horizon_ids: Array(7).fill('h') } }, /at most 6/],
  ])('refuses %#', (p, re) => expect(validateInversionParams(p)).toMatch(re));
});

describe('horizons at a trace', () => {
  test('times in ms, and null when a pick is missing or the order is wrong', () => {
    const at = horizonsAtFrom(grids, nXl, dtMs);
    expect(at(2, 3)).toEqual([topAt(2), baseAt(2)]);
    const holed = [Float32Array.from(grids[0]), grids[1]];
    holed[0][2 * nXl + 3] = NULL;
    expect(horizonsAtFrom(holed, nXl, dtMs)(2, 3)).toBeNull();
    expect(horizonsAtFrom([grids[1], grids[0]], nXl, dtMs)(2, 3)).toBeNull();
    expect(horizonsAtFrom([], nXl, dtMs)(2, 3)).toBeNull();
  });
});

describe('wavelet scale at the wells', () => {
  test('recovers the seismic amplitude scale', () => {
    const { scale, samples } = waveletScale(WELLS.map((w) => ({ trace: seismic(w.il), lnAi: w.ln_ai })), ricker);
    expect(scale).toBeCloseTo(SCALE, 6);
    expect(samples).toBeGreaterThan(400);
  });
  test('refuses when the wells overlap no seismic', () => {
    expect(() => waveletScale([{ trace: new Float32Array(ns).fill(NULL), lnAi: WELLS[0].ln_ai }], ricker)).toThrow(/too little seismic/);
  });
});

function setup(method, { horizons = true, ...extra } = {}) {
  const inv = { ...INVERSION_DEFAULTS, method, ...extra };
  const at = horizons ? horizonsAtFrom(grids, nXl, dtMs) : () => null;
  const wells = lfmWells(WELLS, { dtMs, lfmHz: inv.lfmHz, posOf, horizonsAt: at });
  const wavelet = ricker.map((v) => v * SCALE);
  let coloured = null;
  if (method === 'coloured') {
    coloured = colouredFromWells({ wellTraces: WELLS.map((w) => seismic(w.il)), wellLogs: WELLS.map((w) => w.ln_ai), dtMs, ns, band: inv.band }).operator;
  }
  const invert = makeTraceInverter({ inv, wavelet, wells, posOf, horizonsAt: at, ns, dtMs, coloured });
  return { invert, inv };
}

describe('blind wells', () => {
  test('model-based: each well left out of the model is still matched', () => {
    const { invert, inv } = setup('model_based');
    const rows = blindWellTable({ invert, wells: WELLS, traces: WELLS.map((w) => seismic(w.il)), dtMs, truthHz: inv.truthHz, absolute: true });
    for (const r of rows) {
      expect(r.blind.corr).toBeGreaterThan(0.95);
      expect(r.blind.rmsPct).toBeLessThan(3);
      expect(r.withWell.rmsPct).toBeLessThan(3);
    }
  });
  test('negative control: without horizons the dipping layers are misplaced and the blind error grows', () => {
    const run = (horizons) => {
      const { invert, inv } = setup('model_based', { horizons });
      const rows = blindWellTable({ invert, wells: WELLS, traces: WELLS.map((w) => seismic(w.il)), dtMs, truthHz: inv.truthHz, absolute: true });
      return Math.max(...rows.map((r) => r.blind.rmsPct));
    };
    expect(run(false)).toBeGreaterThan(2 * run(true));
  });
  test('sparse-spike and blocky also pass the blind check', () => {
    for (const method of ['sparse_spike', 'blocky']) {
      const { invert, inv } = setup(method);
      const rows = blindWellTable({ invert, wells: WELLS, traces: WELLS.map((w) => seismic(w.il)), dtMs, truthHz: inv.truthHz, absolute: true });
      for (const r of rows) expect(r.blind.corr).toBeGreaterThan(0.9);
    }
  });
  test('coloured: relative impedance follows the shape of the log', () => {
    const { invert, inv } = setup('coloured');
    const rows = blindWellTable({ invert, wells: WELLS, traces: WELLS.map((w) => seismic(w.il)), dtMs, truthHz: inv.truthHz, absolute: false });
    for (const r of rows) {
      expect(r.blind.rmsPct).toBeNull();
      expect(r.blind.corr).toBeGreaterThan(0.5);
    }
  });
  test('null input samples stay null in the output', () => {
    const { invert } = setup('model_based');
    const t = seismic(2); t[10] = NULL;
    const out = invert(t, 2, 2);
    expect(out[10]).toBeNaN();
    expect(Number.isFinite(out[11])).toBe(true);
  });
  test('halfWindowFor', () => expect(halfWindowFor(8, 4)).toBe(16));
});
