// ReservoirCalc Pro upgrade U2-002: the correlation editor. The pairs are
// applied in the canonical engine's correlation path (Gaussian copula,
// Cholesky); a matrix that cannot hold is refused instead of clamped.

import { MonteCarloEngine } from '../services/MonteCarloEngine';
import { correlationsProblem } from '../components/probabilistic/CorrelationEditor';
import { reviewerLines } from '../services/reportInfo';
import { correlationMatrixProblem, symmetricEigenvalues, cholesky, spearman } from '@/lib/monteCarlo';

jest.setTimeout(120000);

const tri = (min, mode, max) => ({ type: 'triangular', min, mode, max });
const inputs = {
  area: tri(800, 1000, 1300), thickness: tri(40, 50, 70), porosity: tri(0.15, 0.2, 0.25),
  sw: tri(0.2, 0.3, 0.4), ntg: tri(0.7, 0.8, 0.9), fvf: tri(1.1, 1.2, 1.3),
};
const cfg = (extra = {}) => ({ fluidType: 'oil', unitSystem: 'field', iterations: 20000, grvMode: 'analytic', recovery: 25, seed: 9, ...extra });
const rankCorr = (res, a, b) => spearman(res.raw.samples.map((s) => s.inputs[a === 'porosity' ? 'phi' : a]), res.raw.samples.map((s) => s.inputs[b === 'porosity' ? 'phi' : b]));
// Spearman of a Gaussian copula with normal-score correlation rho
const copulaSpearman = (rho) => (6 / Math.PI) * Math.asin(rho / 2);

describe('U2-002 the pairs reach the sampler', () => {
  it('area with thickness at 0.6 gives the copula\'s rank correlation; none gives none (negative control)', () => {
    const on = MonteCarloEngine.simulate(cfg({ correlations: [{ a: 'area', b: 'thickness', rho: 0.6 }] }), inputs);
    expect(Math.abs(rankCorr(on, 'area', 'thickness') - copulaSpearman(0.6))).toBeLessThan(0.03);
    expect(on.meta.correlations).toEqual([{ a: 'area', b: 'thickness', rho: 0.6 }]);
    const off = MonteCarloEngine.simulate(cfg({ correlations: [] }), inputs);
    expect(Math.abs(rankCorr(off, 'area', 'thickness'))).toBeLessThan(0.03);
    // an empty list also drops the old porosity-Sw default: what is typed is what runs
    expect(Math.abs(rankCorr(off, 'porosity', 'sw'))).toBeLessThan(0.03);
  });

  it('with no list the long-standing porosity-Sw -0.8 still applies (older callers)', () => {
    const res = MonteCarloEngine.simulate(cfg(), inputs);
    expect(Math.abs(rankCorr(res, 'porosity', 'sw') - copulaSpearman(-0.8))).toBeLessThan(0.03);
  });

  it('a pair with a constant input is not applied, and the run says so', () => {
    const res = MonteCarloEngine.simulate(cfg({ iterations: 500, correlations: [{ a: 'area', b: 'bg', rho: 0.5 }] }), inputs);
    expect(res.diagnostics.warnings.join(' ')).toMatch(/area with bg \(0.5\) was not applied: bg has no spread/);
  });
});

describe('U2-002 a matrix that cannot hold is refused', () => {
  const bad = [{ a: 'area', b: 'thickness', rho: 0.9 }, { a: 'thickness', b: 'porosity', rho: 0.9 }, { a: 'area', b: 'porosity', rho: -0.9 }];

  it('the engine refuses it with the reason', () => {
    expect(() => MonteCarloEngine.simulate(cfg({ iterations: 200, correlations: bad }), inputs)).toThrow(/cannot hold together.*not positive semidefinite/);
  });

  it('negative control: the bare Cholesky clamps it silently and samples something else', () => {
    const C = [[1, 0.9, -0.9], [0.9, 1, 0.9], [-0.9, 0.9, 1]];
    const L = cholesky(C);
    expect(L.flat().every(Number.isFinite)).toBe(true);
    const LLt = C.map((_, i) => C.map((__, j) => L[i].reduce((s, v, k) => s + v * L[j][k], 0)));
    // the third variable's implied variance is no longer 1: not the matrix typed
    expect(Math.abs(LLt[2][2] - 1)).toBeGreaterThan(0.1);
  });

  it('the editor blocks the same set before the run, naming the variables', () => {
    expect(correlationsProblem(bad)).toMatch(/cannot hold together/);
    expect(correlationsProblem([{ a: 'area', b: 'thickness', rho: 0.9 }])).toBeNull();
    expect(correlationsProblem([{ a: 'area', b: 'area', rho: 0.5 }])).toMatch(/itself/);
    expect(correlationsProblem([{ a: 'area', b: 'thickness', rho: 1 }])).toMatch(/between -1 and 1/);
    expect(correlationsProblem([{ a: 'area', b: 'thickness', rho: 0.2 }, { a: 'thickness', b: 'area', rho: 0.3 }])).toMatch(/paired twice/);
  });

  it('the check itself: eigenvalues of known matrices', () => {
    const ev = symmetricEigenvalues([[2, 1], [1, 2]]);
    expect(ev[0]).toBeCloseTo(1, 10);
    expect(ev[1]).toBeCloseTo(3, 10);
    expect(correlationMatrixProblem([[1, 0.5], [0.5, 1]])).toBeNull();
    expect(correlationMatrixProblem([[1, 1], [1, 1]])).toBeNull(); // semidefinite is allowed
    expect(correlationMatrixProblem([[1, 0.5], [0.4, 1]])).toMatch(/differs/);
  });
});

describe('U2-002 the reviewer sees the correlations', () => {
  it('the PDF block lists them', () => {
    const res = MonteCarloEngine.simulate(cfg({ iterations: 300, correlations: [{ a: 'porosity', b: 'sw', rho: -0.5 }] }), inputs);
    const lines = reviewerLines({ unitSystem: 'field', probResults: res });
    expect(lines.join('\n')).toMatch(/Correlations \(Gaussian copula\): porosity with sw -0.5/);
  });
});
