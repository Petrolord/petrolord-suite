// ReservoirCalc Pro upgrade U1: the handoff to Prospect Risking and Risked
// Reserves Valuation (RCP-U1-003, 004, 005, 025). Calls the shipped engine,
// the handoff module and Risked Reserves Valuation's own mapper.

import { MonteCarloEngine } from '../services/MonteCarloEngine';
import { unriskedFromRun, portfolioInMMboe, toMMboe } from '../services/prospectVolumes';
import { fromRcpProspect } from '@/pages/apps/riskedreserves/services/rrvStore';
import { valueProspect } from '@/utils/prospectValuation';

jest.setTimeout(120000);
const tri = (min, mode, max) => ({ type: 'triangular', min, mode, max });
const oil = {
  area: tri(800, 1000, 1200), thickness: tri(40, 50, 60), porosity: tri(0.16, 0.2, 0.24),
  sw: tri(0.24, 0.3, 0.36), fvf: tri(1.1, 1.2, 1.3), ntg: { type: 'constant', value: 1 },
};

describe('RCP-U1-003 the prospect carries recoverable volumes', () => {
  it('an oil run hands over STOIIP x RF, not STOIIP (4x at RF 25%)', async () => {
    const run = await MonteCarloEngine.runSimulation({ fluidType: 'oil', unitSystem: 'field', iterations: 3000, recovery: 25 }, oil);
    const u = unriskedFromRun(run, 'oil', 'field');
    expect(u.basis).toBe('recoverable');
    expect(u.unit).toBe('MMbbl');
    expect(u.mean).toBeCloseTo((run.stats.stooip.mean * 0.25) / 1e6, 6);
    // what the valuation reads is the recoverable volume
    const p = fromRcpProspect({ id: 'x', name: 'X', pg_factors: {}, inputs: { ...u }, risked: { pg: 0.3, success: u } });
    expect(p.p50).toBeCloseTo(u.p50, 4);
    expect(p.volumeNote).toBe('');
  });
  it('a run from before U1 comes back as in-place and the valuation says so', () => {
    const legacy = { stats: { stooip: { mean: 228.89e6, p90: 178.81e6, p50: 225.54e6, p10: 284.03e6 }, giip: {} } };
    const u = unriskedFromRun(legacy, 'oil', 'field');
    expect(u).toMatchObject({ basis: 'in-place', unit: 'MMbbl', mean: 228.89 });
    const p = fromRcpProspect({ id: 'l', name: 'L', pg_factors: {}, inputs: { mean: 228.89, unit: 'MMbbl', basis: 'in-place' }, risked: { pg: 0.3 } });
    expect(p.volumeNote).toMatch(/IN-PLACE/);
    const old = fromRcpProspect({ id: 'o', name: 'O', pg_factors: {}, inputs: { mean: 228.89, p90: 178.81, p50: 225.54, p10: 284.03 }, risked: { pg: 0.3 } });
    expect(old.volumeNote).toMatch(/may be in-place/);
  });
});

describe('RCP-U1-025 oil with a gas cap is handed over as oil equivalent', () => {
  it('MMboe = recoverable oil + recoverable gas / 6 Mscf', async () => {
    const run = await MonteCarloEngine.runSimulation(
      { fluidType: 'oil_gas', unitSystem: 'field', iterations: 3000, gasCapFraction: 0.3, recovery: 30, recoveryGas: 60 },
      { ...oil, bg: tri(0.005, 0.005, 0.005) },
    );
    const u = unriskedFromRun(run, 'oil_gas', 'field');
    expect(u.unit).toBe('MMboe');
    const expected = (run.stats.recoverableOil.mean + run.stats.recoverableGas.mean / 6000) / 1e6;
    expect(u.mean).toBeCloseTo(expected, 6);
    // the gas cap is in it (the old handoff sent the oil leg alone)
    expect(u.mean).toBeGreaterThan((run.stats.recoverableOil.mean / 1e6) * 1.05);
  });
  it('metric oil + gas also arrives in boe', async () => {
    const run = await MonteCarloEngine.runSimulation(
      { fluidType: 'oil_gas', unitSystem: 'metric', iterations: 1000, gasCapFraction: 0.3, recovery: 30, recoveryGas: 60 },
      { ...oil, area: tri(3, 4, 5), thickness: tri(12, 15, 18), bg: tri(0.005, 0.005, 0.005) },
    );
    const u = unriskedFromRun(run, 'oil_gas', 'metric');
    const expected = (run.stats.recoverableOil.mean * 6.289811 + (run.stats.recoverableGas.mean * 35.3147) / 6000) / 1e6;
    expect(u.mean).toBeCloseTo(expected, 6);
  });
});

describe('RCP-U1-004 Risked Reserves Valuation keeps the Pg', () => {
  it('a gas prospect keeps Pg 0.30 (it arrived as 0.05)', () => {
    const p = fromRcpProspect({ id: 'g', name: 'G', pg_factors: {}, inputs: { mean: 100, p90: 50, p50: 90, p10: 160, unit: 'Bcf', basis: 'recoverable' }, risked: { pg: 0.3, success: { mean: 100, p90: 50, p50: 90, p10: 160 } } });
    expect(p.pg).toBe(0.3);
    expect(p.p50).toBeCloseTo(15, 9);
    // and the EMV moves with it
    expect(valueProspect(p).pg).toBe(0.3);
  });
  it('a metric prospect keeps Pg 0.30 (it arrived as 1.89 and was refused)', () => {
    const p = fromRcpProspect({ id: 'm', name: 'M', pg_factors: {}, inputs: { mean: 10, p90: 5, p50: 9, p10: 16, unit: 'MMsm3' }, risked: { pg: 0.3 } });
    expect(p.pg).toBe(0.3);
  });
  it('a legacy raw-STB row keeps its Pg (it arrived as 3e-7)', () => {
    const p = fromRcpProspect({ id: 's', name: 'S', pg_factors: {}, inputs: { p90: 178.81e6, p50: 225.54e6, p10: 284.03e6 }, risked: { pg: 0.3 } });
    expect(p.pg).toBe(0.3);
  });
});

describe('RCP-U1-005 the portfolio is added in one unit', () => {
  it('MMSTB, Bscf and MMsm3 rows are converted to MMboe before adding', () => {
    const rows = [
      { pg: 0.5, inputs: { mean: 60, unit: 'MMbbl' }, risked: { risked_mean: 30 } },
      { pg: 0.5, inputs: { mean: 600, unit: 'Bcf' }, risked: { risked_mean: 300 } },
      { pg: 0.5, inputs: { mean: 10, unit: 'MMsm3' }, risked: { risked_mean: 5 } },
      { pg: 0.5, inputs: { mean: 999 }, risked: { risked_mean: 500 } },
    ];
    const r = portfolioInMMboe(rows);
    expect(r.expectedRiskedVolume).toBeCloseTo(30 + 50 + 5 * 6.289811, 9);
    expect(r.successCaseMeanTotal).toBeCloseTo(60 + 100 + toMMboe(10, 'MMsm3'), 9);
    expect(r.unstated).toBe(1);
    expect(r.count).toBe(3);
    // negative control: the raw sum the old roll-up showed
    expect(30 + 300 + 5).not.toBeCloseTo(r.expectedRiskedVolume, 0);
  });
});
