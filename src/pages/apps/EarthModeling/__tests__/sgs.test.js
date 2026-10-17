/**
 * Sequential Gaussian simulation (3D grid upgrade, owner decision 4):
 * validation first. Known truth is the model itself: on a synthetic grid
 * the realisations must reproduce the variogram the kriging used and the
 * histogram they were given (Deutsch and Journel 1998, GSLIB V.2.3; the
 * reproduction check of Leuangthong, McLennan and Deutsch 2004). Every
 * number comes from sgs3d, the function the build calls.
 * Negative control: with no neighbours in the kriging (white noise) the
 * same variogram gate fails.
 */
import { sgs3d, structure, experimentalVariogram, normalScoreTable, toNormalScore, fromNormalScore, inverseNormal, normalCdf, mulberry32 } from '../services/grid3d/sgs';

// a skewed porosity-like reference histogram (deterministic)
const rng = mulberry32(7);
const REF = Array.from({ length: 400 }, () => { const u = rng(); return 0.08 + 0.2 * u ** 1.6; });
const quant = (xs, p) => { const s = Float64Array.from(xs.filter(Number.isFinite)).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

const NX = 96; const RANGE = 16;
function meanVariogram({ neighbours = 12, seeds = [1, 2, 3, 4, 5, 6, 7, 8], nk = 1, axis = 'i', lags, dz = 1, rangeVM = 1, nx = NX, ny = NX, range = RANGE }) {
  const sum = lags.map(() => 0);
  for (const seed of seeds) {
    const r = sgs3d({ nx, ny, nk, dx: 1, dy: 1, dz, data: [], reference: REF, variogram: { model: 'spherical', rangeM: range, rangeVM, nugget: 0 }, seed, neighbours });
    experimentalVariogram(r.scores, nx, ny, nk, axis, lags).forEach((g, q) => { sum[q] += g.gamma; });
  }
  return sum.map((s) => s / seeds.length);
}

describe('the normal-score transform', () => {
  test('inverse normal and the CDF are each other\'s inverse', () => {
    for (const p of [0.001, 0.05, 0.3, 0.5, 0.8, 0.975, 0.999]) expect(normalCdf(inverseNormal(p))).toBeCloseTo(p, 6);
    expect(inverseNormal(0.975)).toBeCloseTo(1.959964, 5);
  });
  test('a value goes to its score and back exactly at every data value', () => {
    const t = normalScoreTable(REF);
    for (const v of REF.slice(0, 50)) expect(fromNormalScore(t, toNormalScore(t, v))).toBeCloseTo(v, 10);
  });
});

describe('unconditional SGS reproduces the variogram and the histogram (96 x 96, spherical range 16 cells)', () => {
  const lags = [1, 2, 4, 6, 8, 12, 16, 20, 24];
  let gi; let gj;
  beforeAll(() => { gi = meanVariogram({ lags }); gj = meanVariogram({ lags, axis: 'j' }); });
  test('the mean experimental variogram of 8 realisations is within 0.12 of the model at every lag, in both directions', () => {
    lags.forEach((L, q) => {
      const model = structure('spherical', L / RANGE);
      expect(Math.abs(gi[q] - model)).toBeLessThan(0.12);
      expect(Math.abs(gj[q] - model)).toBeLessThan(0.12);
    });
  });
  test('the histogram is the reference histogram: P10, P50 and P90 within 0.01 porosity', () => {
    const r = sgs3d({ nx: NX, ny: NX, nk: 1, dx: 1, dy: 1, dz: 1, data: [], reference: REF, variogram: { model: 'spherical', rangeM: RANGE, nugget: 0 }, seed: 11 });
    for (const p of [0.1, 0.5, 0.9]) expect(Math.abs(quant(Array.from(r.values), p) - quant(REF, p))).toBeLessThan(0.01);
  });
  test('negative control: with no neighbours in the kriging (white noise) the same gate fails', () => {
    const g = meanVariogram({ lags: [1, 2, 4], neighbours: 0, seeds: [1, 2] });
    const misfit = Math.max(...[1, 2, 4].map((L, q) => Math.abs(g[q] - structure('spherical', L / RANGE))));
    expect(misfit).toBeGreaterThan(0.5);
  });
});

test('the vertical variogram is reproduced across the layers (range 6 layers)', () => {
  const lags = [1, 2, 3, 4, 6, 8];
  const g = meanVariogram({ lags, nk: 24, nx: 24, ny: 24, axis: 'k', rangeVM: 6, range: 8, seeds: [1, 2, 3, 4] });
  lags.forEach((L, q) => expect(Math.abs(g[q] - structure('spherical', L / 6))).toBeLessThan(0.15));
});

describe('conditioning and the seed', () => {
  const data = [{ i: 10, j: 10, k: 0, v: 0.25 }, { i: 30, j: 12, k: 0, v: 0.1 }, { i: 20, j: 30, k: 1, v: 0.18 }];
  const run = (seed) => sgs3d({ nx: 40, ny: 40, nk: 2, dx: 25, dy: 25, dz: 0.762, data, variogram: { rangeM: 400, rangeVM: 3 }, seed });
  test('the data cells hold the data exactly, and the cells next to them stay close', () => {
    const r = run(5);
    for (const d of data) expect(r.values[d.k * 1600 + d.j * 40 + d.i]).toBeCloseTo(d.v, 6);
    expect(Math.abs(r.values[0 * 1600 + 10 * 40 + 11] - 0.25)).toBeLessThan(0.08);
  });
  test('one seed gives one realisation; another seed another', () => {
    const a = run(5); const b = run(5); const c = run(6);
    expect(Array.from(a.values)).toEqual(Array.from(b.values));
    expect(Array.from(a.values)).not.toEqual(Array.from(c.values));
  });
  test('inactive cells are left empty', () => {
    const active = new Uint8Array(3200).fill(1); active[5] = 0;
    const r = sgs3d({ nx: 40, ny: 40, nk: 2, dx: 25, dy: 25, dz: 0.762, data, active, variogram: { rangeM: 400 }, seed: 1 });
    expect(Number.isNaN(r.values[5])).toBe(true);
    expect(Number.isFinite(r.values[6])).toBe(true);
  });
});
