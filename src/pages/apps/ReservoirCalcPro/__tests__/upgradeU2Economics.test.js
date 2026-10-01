// ReservoirCalc Pro upgrade U2-012: success-case economics through the
// canonical screening NPV (calculateEconomics), handed to Risked Reserves
// Valuation. The gate calls the engine; nothing here computes an NPV.

import { prospectEconomics, economicsCase, declineProfile, ECONOMICS_DEFAULTS } from '../services/prospectEconomics';
import { calculateEconomics } from '@/utils/npvCalculations';
import { fromRcpProspect, DEFAULT_ECONOMICS } from '@/pages/apps/riskedreserves/services/rrvStore';

describe('U2-012 the success case through calculateEconomics', () => {
  it('the decline profile recovers exactly the success-case mean', () => {
    const p = declineProfile(42.5e6, 15, 12);
    expect(p).toHaveLength(15);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(42.5e6, 3);
    expect(p[1] / p[0]).toBeCloseTo(0.88, 12);
  });

  it('the NPV is the engine\'s NPV of the case it was handed, with and without development', () => {
    const r = prospectEconomics(42.5, 'MMbbl');
    expect(r.ok).toBe(true);
    const direct = calculateEconomics(economicsCase(42.5, ECONOMICS_DEFAULTS), { skipIrr: true }).metrics.npv;
    expect(r.npvMM).toBe(direct);
    expect(r.engine).toMatch(/calculateEconomics/);
  });

  it('value per barrel x volume - development cost = the success-case NPV (what the valuation computes)', () => {
    const r = prospectEconomics(42.5, 'MMbbl');
    expect(r.unitValue * r.meanMMboe - r.devCost).toBeCloseTo(r.npvMM, 9);
    // negative control: the typed capex is not the development cost the
    // valuation should subtract (discounting and the tax shield differ)
    expect(Math.abs(r.unitValue * r.meanMMboe - ECONOMICS_DEFAULTS.capex - r.npvMM)).toBeGreaterThan(10);
  });

  it('a gas prospect in Bscf is valued per boe at 6 Mscf per boe', () => {
    const g = prospectEconomics(255, 'Bcf');
    const o = prospectEconomics(42.5, 'MMbbl');
    expect(g.meanMMboe).toBeCloseTo(42.5, 9);
    expect(g.npvMM).toBeCloseTo(o.npvMM, 9);
  });

  it('refuses a volume with no unit, no mean, or negative assumptions', () => {
    expect(prospectEconomics(10, undefined).reason).toMatch(/no stated unit/);
    expect(prospectEconomics(NaN, 'MMbbl').reason).toMatch(/mean volume/);
    expect(prospectEconomics(10, 'MMbbl', { price: -1 }).reason).toMatch(/price/);
  });
});

describe('U2-012 Risked Reserves Valuation takes the values', () => {
  it('a prospect saved with economics brings its value per barrel and development cost', () => {
    const r = prospectEconomics(42.5, 'MMbbl');
    const row = { id: 'p1', name: 'Keta East', pg_factors: { trap: 0.5 }, inputs: { mean: 42.5, p90: 18, p50: 38, p10: 71, unit: 'MMbbl', basis: 'recoverable', economics: { unitValue: r.unitValue, devCost: r.devCost, npvMM: r.npvMM } }, risked: { pg: 0.5 } };
    const v = fromRcpProspect(row);
    expect(v.unitValue).toBeCloseTo(r.unitValue, 4);
    expect(v.devCost).toBeCloseTo(r.devCost, 3);
    expect(v.economicsNote).toMatch(/success-case economics/);
    // a row without economics keeps the valuation's defaults
    const plain = fromRcpProspect({ ...row, inputs: { ...row.inputs, economics: undefined } });
    expect(plain.unitValue).toBe(DEFAULT_ECONOMICS.unitValue);
    expect(plain.economicsNote).toBeUndefined();
  });
});
