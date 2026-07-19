/**
 * NA3 gas-lift screening gates: response-curve shape (rise, peak,
 * diminishing returns) on a liquid-loaded well.
 */
import { gasLiftScreening } from '../gasLift.js';
import { computeIpr } from '../ipr.js';
import { buildFluidModel } from '../pvt.js';
import { buildTrajectory } from '../trajectory.js';
import { linearGeothermal } from '../temperature.js';
import { linspace } from '../numerics.js';

const fluidModel = buildFluidModel({ api: 32, gasSg: 0.75, gor: 150, salinityPpm: 30000 });
const vertical = buildTrajectory({ mode: 'vertical', depthFt: 7000 });
const tAt = linearGeothermal({ whtF: 100, bhtF: 170, tvdMaxFt: 7000 });

// Wet, low-GOR well: the classic gas-lift candidate.
const vlp = {
  fluidModel,
  trajectory: vertical,
  tAt,
  idIn: 2.441,
  correlation: 'beggsBrill',
  whp: 150,
  nodeMd: 7000,
  stepFt: 250,
  rates: { wct: 0.7, gor: 150 },
};
const ipr = computeIpr({ model: 'composite', pr: 2600, pb: 1800, pi: 2.5 });

describe('gas-lift screening', () => {
  const result = gasLiftScreening({
    ipr,
    vlp,
    qgis: linspace(0, 1600, 9),
    nGrid: 25,
  });

  test('the well is a true gas-lift candidate: dead naturally, alive with gas', () => {
    expect(result.baseline.status).toBe('dead');
    expect(result.baseline.q).toBe(0);
    expect(result.best.q).toBeGreaterThan(400);
    expect(result.best.qgi).toBeGreaterThan(0);
  });

  test('response curve is concave: gains shrink as injection grows', () => {
    const { response } = result;
    const slopes = [];
    for (let i = 1; i < response.length; i += 1) {
      slopes.push((response[i].q - response[i - 1].q) / (response[i].qgi - response[i - 1].qgi));
    }
    // first step gains the most; slopes never increase by more than noise
    for (let i = 1; i < slopes.length; i += 1) {
      expect(slopes[i]).toBeLessThan(slopes[0] + 1e-6);
    }
    // unimodal within tolerance: once past the peak, no later point beats it
    const peakIdx = response.indexOf(result.best);
    for (let i = peakIdx + 1; i < response.length; i += 1) {
      expect(response[i].q).toBeLessThanOrEqual(result.best.q + 1e-6);
    }
  });

  test('economic point exists and stops at or before the peak', () => {
    expect(result.econ).not.toBeNull();
    expect(result.econ.qgi).toBeLessThanOrEqual(result.best.qgi + 1e-9);
  });

  test('every injected point flows; only the natural baseline is dead', () => {
    for (const pt of result.response) {
      if (pt.qgi > 0) expect(pt.status).toBe('flowing');
    }
  });
});
