// ReservoirCalc Pro upgrade U1 (practitioner lens, 2026-09-30): the Monte
// Carlo findings. Every test calls the shipped function or renders the
// shipped component; the numeric ones were run against the unfixed code
// first and failed (negative control, recorded in
// docs/upgrade/ReservoirCalcPro-UPGRADE.md).

import React, { useEffect } from 'react';
import { render, screen, act } from '@testing-library/react';
import { MonteCarloEngine } from '../services/MonteCarloEngine';
import { ContactVolumetricsEngine } from '../services/ContactVolumetricsEngine';
import { inPlaceScale, runContext } from '../services/volumeDisplay';
import { recentreDist, formatDistributions, distKeysFor, defaultDist, syncDistParams } from '../services/distributions';
import { buildChartData } from '../components/results/ProbabilisticResultsDisplay';
import ProbabilisticSummaryTable from '../components/results/ProbabilisticSummaryTable';
import { ReservoirCalcProvider, useReservoirCalc } from '../contexts/ReservoirCalcContext';
import { makeInMemoryRcpBackend } from '../services/rcpBackend';

jest.setTimeout(120000);

const tri = (min, mode, max) => ({ type: 'triangular', min, mode, max });
const analyticOil = {
  area: tri(800, 1000, 1200), thickness: tri(40, 50, 60), porosity: tri(0.16, 0.2, 0.24),
  sw: tri(0.24, 0.3, 0.36), fvf: tri(1.1, 1.2, 1.3), ntg: { type: 'constant', value: 1 },
};

// A dome in elevation metres: crest -1500 m, z = -1500 - 0.0001 r^2
const domeSurface = () => {
  const points = [];
  for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) {
    const x = 501000 + i * 50; const y = 6699000 + j * 50;
    points.push({ x, y, z: -1500 - 0.0001 * ((x - 502000) ** 2 + (y - 6700000) ** 2) });
  }
  return { points, xyUnit: 'm', depthUnit: 'm', zConvention: 'elevation' };
};

describe('RCP-U1-001 in-place display units', () => {
  it('each stream has its own divisor and label', () => {
    expect(inPlaceScale('gas', 'metric')).toMatchObject({ denom: 1e9, label: 'Bsm³' });
    expect(inPlaceScale('gas', 'field')).toMatchObject({ denom: 1e9, label: 'Bscf' });
    expect(inPlaceScale('oil', 'metric')).toMatchObject({ denom: 1e6, label: 'MMsm³' });
    expect(inPlaceScale('oil', 'field')).toMatchObject({ denom: 1e6, label: 'MMSTB' });
  });

  const Seed = ({ pr, fluid = 'oil_gas' }) => {
    const { dispatch, updateInputs } = useReservoirCalc();
    useEffect(() => { updateInputs({ fluidType: fluid }); dispatch({ type: 'SET_PROB_RESULTS', payload: pr }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return <ProbabilisticSummaryTable />;
  };
  const st = (v) => ({ p90: v * 0.5, p50: v, p10: v * 2, mean: v, stdDev: v / 4, min: 0, max: v * 3, cdf: [] });

  it('the Detailed Statistics GIIP row reads Bscf in Bscf (it showed MMscf under a Bscf header)', async () => {
    const pr = { raw: {}, diagnostics: { warnings: [], tracking: {} }, stats: { stooip: st(120e6), giip: st(50e9) }, meta: { unitSystem: 'field', fluidType: 'oil_gas' } };
    await act(async () => { render(<ReservoirCalcProvider backend={makeInMemoryRcpBackend()}><Seed pr={pr} /></ReservoirCalcProvider>); });
    expect(screen.getByTestId('rcp-mc-p50-giip').textContent).toBe('50.00');
    expect(screen.getByTestId('rcp-mc-row-giip').textContent).toContain('Bscf');
    expect(screen.getByTestId('rcp-mc-p50-stooip').textContent).toBe('120.00');
  });

  it('a metric run reads MMsm³ and Bsm³, whatever the workspace shows now (RCP-U1-009)', async () => {
    const pr = { raw: {}, diagnostics: { warnings: [], tracking: {} }, stats: { stooip: st(20e6), giip: st(4e9) }, meta: { unitSystem: 'metric', fluidType: 'oil_gas' } };
    await act(async () => { render(<ReservoirCalcProvider backend={makeInMemoryRcpBackend()}><Seed pr={pr} /></ReservoirCalcProvider>); });
    expect(screen.getByTestId('rcp-mc-row-stooip').textContent).toContain('MMsm³');
    expect(screen.getByTestId('rcp-mc-row-giip').textContent).toContain('Bsm³');
    expect(screen.getByTestId('rcp-mc-p50-giip').textContent).toBe('4.00');
  });
});

describe('RCP-U1-009 a run carries its own unit system and fluid', () => {
  it('meta is stamped and read before the live workspace', async () => {
    const r = await MonteCarloEngine.runSimulation({ fluidType: 'oil', unitSystem: 'metric', iterations: 500 }, analyticOil);
    expect(r.meta).toMatchObject({ unitSystem: 'metric', fluidType: 'oil', grvMode: 'analytic', iterations: 500 });
    expect(runContext(r, { unitSystem: 'field', inputs: { fluidType: 'gas' } })).toMatchObject({ unitSystem: 'metric', fluidType: 'oil', stamped: true });
    // a run saved before U1 falls back to the workspace and says it is unstamped
    expect(runContext({ stats: {} }, { unitSystem: 'field', inputs: { fluidType: 'gas' } })).toMatchObject({ unitSystem: 'field', fluidType: 'gas', stamped: false });
  });
});

describe('RCP-U1-006 the expectation curve is the probability of exceeding', () => {
  it('the 90% line meets the curve at the P90 (low) volume', async () => {
    const r = await MonteCarloEngine.runSimulation({ fluidType: 'oil', unitSystem: 'field', iterations: 4000 }, analyticOil);
    const d = buildChartData(r, 'oil', 'field');
    const p90 = r.stats.stooip.p90 / 1e6;
    const p10 = r.stats.stooip.p10 / 1e6;
    const at = (x) => d.cdf.reduce((best, p) => (Math.abs(p.x - x) < Math.abs(best.x - x) ? p : best), d.cdf[0]).y;
    expect(Math.abs(at(p90) - 90)).toBeLessThan(3);
    expect(Math.abs(at(p10) - 10)).toBeLessThan(3);
    // decreasing from ~100% to 0%
    expect(d.cdf[0].y).toBeGreaterThan(95);
    expect(d.cdf[d.cdf.length - 1].y).toBeLessThan(1);
  });
});

describe('RCP-U1-007 a GOC below the OWC never books gas under the water leg', () => {
  const inputs = { ntg: 1, porosity: 0.2, sw: 0.3, fvf: 1.2, bg: 0.005 };
  it('deterministic: the gas cap stops at the OWC', () => {
    const surf = domeSurface();
    const p = { topSurface: surf, constantThickness: 300, unitSystem: 'metric', options: { resolution: 80 } };
    const toOwc = ContactVolumetricsEngine.calculate({ ...p, inputs: { ...inputs, fluidType: 'gas', goc: -1550 } });
    const r = ContactVolumetricsEngine.calculate({ ...p, inputs: { ...inputs, fluidType: 'oil_gas', owc: -1550, goc: -1600 } });
    expect(r.grvGas).toBeCloseTo(toOwc.grvGas, 3);
    expect(r.grvOil).toBe(0);
    expect(r.warnings.join(' ')).toMatch(/GOC is below the OWC/);
  });
  it('Monte Carlo: overlapping contact ranges are counted and held at the OWC', async () => {
    const surf = domeSurface();
    const hyps = ContactVolumetricsEngine.buildHypsometry({ topSurface: surf, constantThickness: 300, unitSystem: 'metric', options: { resolution: 80 } });
    const r = await MonteCarloEngine.runSimulation(
      { fluidType: 'oil_gas', unitSystem: 'metric', iterations: 2000, grvMode: 'structural', hypsometry: hyps },
      { owc: tri(-1580, -1560, -1540), goc: tri(-1575, -1545, -1520), porosity: tri(0.2, 0.2, 0.2), sw: tri(0.3, 0.3, 0.3), fvf: tri(1.2, 1.2, 1.2), bg: tri(0.005, 0.005, 0.005) },
    );
    expect(r.diagnostics.gocBelowOwc).toBeGreaterThan(0);
    expect(r.diagnostics.warnings.join(' ')).toMatch(/GOC below the OWC/);
    // every realization's gas GRV is at most the rock above its own OWC
    let over = 0;
    for (const smp of r.raw.samples) {
      const grvGas = (r.raw.giip[smp.index] * 0.005) / (0.2 * 0.7);
      if (grvGas > hyps.rockToContact(smp.inputs.owc) * (1 + 1e-9)) over += 1;
    }
    expect(over).toBe(0);
  });
});

describe('RCP-U1-008 distributions move with the base case and malformed ones are refused', () => {
  it('recentring keeps the triangle ordered (a mode above the maximum was sampled silently)', () => {
    const d = defaultDist('porosity', 0.2);
    const moved = recentreDist(d, 0.3, 'porosity');
    expect(moved.p50).toBeCloseTo(0.3, 12);
    expect(moved.p90).toBeCloseTo(0.24, 12);
    expect(moved.p10).toBeCloseTo(0.36, 12);
    const { problems } = formatDistributions({ porosity: moved });
    expect(problems).toEqual([]);
  });
  it('contacts shift rather than scale', () => {
    const d = defaultDist('owc', -8000, 'field');
    const moved = recentreDist(d, -8100, 'owc');
    expect(moved.p90).toBeCloseTo(-8150, 9);
    expect(moved.p10).toBeCloseTo(-8050, 9);
  });
  it('a triangle whose most likely value lies outside Min and Max stops the run with the reason', () => {
    const { formatted, problems } = formatDistributions({ porosity: { type: 'triangular', p90: 0.16, p50: 0.3, p10: 0.24 } });
    expect(formatted.porosity).toBeUndefined();
    expect(problems[0]).toMatch(/most likely value 0.3 lies outside Min 0.16 to Max 0.24/);
  });
  it('the key set follows the input method and fluid (switching kept the old set)', () => {
    const analytic = distKeysFor({ structural: false, fluidType: 'oil', inputMethod: 'simple' });
    const structural = distKeysFor({ structural: true, fluidType: 'oil_gas', inputMethod: 'hybrid' });
    expect(analytic).toEqual(expect.arrayContaining(['area', 'thickness', 'ntg', 'recovery']));
    expect(structural).toEqual(expect.arrayContaining(['owc', 'goc', 'grvFactor', 'bg', 'recoveryGas']));
    expect(structural).not.toContain('area');
    const synced = syncDistParams(syncDistParams({}, analytic, { area: 1000 }), structural, { owc: -8000, goc: -7000 });
    expect(Object.keys(synced).sort()).toEqual([...structural].sort());
    expect(synced.owc.p50).toBe(-8000);
  });
});

describe('RCP-U1-014 and RCP-U1-015 gas-cap fraction and NTG can be uncertain', () => {
  it('a sampled gas-cap fraction splits each realization (it was one constant)', async () => {
    const r = await MonteCarloEngine.runSimulation(
      { fluidType: 'oil_gas', unitSystem: 'field', iterations: 3000 },
      { ...analyticOil, bg: tri(0.005, 0.005, 0.005), gasCapFraction: tri(0.1, 0.3, 0.5) },
    );
    const fracs = r.raw.samples.map((s) => s.inputs.gasCapFraction);
    expect(Math.min(...fracs)).toBeLessThan(0.2);
    expect(Math.max(...fracs)).toBeGreaterThan(0.4);
    expect(r.stats.sensitivity.map((s) => s.parameter)).toContain('gasCapFraction');
  });
  it('NTG is sent as a distribution and sampled', async () => {
    const keys = distKeysFor({ structural: false, fluidType: 'oil' });
    expect(keys).toContain('ntg');
    const { formatted } = formatDistributions({ ntg: { type: 'triangular', p90: 0.5, p50: 0.7, p10: 0.9 } }, ['ntg']);
    expect(formatted.ntg).toEqual({ type: 'triangular', min: 0.5, mode: 0.7, max: 0.9 });
    const r = await MonteCarloEngine.runSimulation({ fluidType: 'oil', unitSystem: 'field', iterations: 2000 }, { ...analyticOil, ntg: formatted.ntg });
    const ntgs = r.raw.samples.map((s) => s.inputs.ntg);
    expect(Math.max(...ntgs) - Math.min(...ntgs)).toBeGreaterThan(0.3);
  });
});

describe('RCP-U1-029 clamped fractions are counted, not silent', () => {
  it('a normal porosity reaching below zero is reported', async () => {
    const r = await MonteCarloEngine.runSimulation(
      { fluidType: 'oil', unitSystem: 'field', iterations: 2000 },
      { ...analyticOil, porosity: { type: 'normal', mean: 0.05, stdDev: 0.05 } },
    );
    expect(r.diagnostics.clamped.porosity).toBeGreaterThan(100);
    expect(r.diagnostics.warnings.join(' ')).toMatch(/drew porosity outside 0 to 1/);
  });
});

describe('RCP-U1-003 recoverable volumes per realization', () => {
  it('recoverable oil = STOIIP x RF, and a sampled RF widens it', async () => {
    const fixed = await MonteCarloEngine.runSimulation({ fluidType: 'oil', unitSystem: 'field', iterations: 2000, recovery: 25 }, analyticOil);
    expect(fixed.stats.recoverableOil.mean / fixed.stats.stooip.mean).toBeCloseTo(0.25, 9);
    const spread = await MonteCarloEngine.runSimulation({ fluidType: 'oil', unitSystem: 'field', iterations: 2000 }, { ...analyticOil, recovery: tri(15, 25, 35) });
    expect(spread.stats.recoverableOil.p10 / spread.stats.recoverableOil.p90).toBeGreaterThan(fixed.stats.recoverableOil.p10 / fixed.stats.recoverableOil.p90);
  });
  it('oil + gas recoverable in boe at 6 Mscf per boe', async () => {
    const r = await MonteCarloEngine.runSimulation(
      { fluidType: 'oil_gas', unitSystem: 'field', iterations: 1000, gasCapFraction: 0.3, recovery: 30, recoveryGas: 60 },
      { ...analyticOil, bg: tri(0.005, 0.005, 0.005) },
    );
    const i = 17;
    expect(r.raw.recBoe[i]).toBeCloseTo(r.raw.stooip[i] * 0.3 + (r.raw.giip[i] * 0.6) / 6000, 3);
  });
});
