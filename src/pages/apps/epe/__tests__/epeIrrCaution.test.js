/**
 * A reported IRR that reads backwards. Found on the Ekene field without
 * Ekene-11 (EPE video programme, 2026-10-13): the run shows NPV -$459K and
 * IRR 13.53% at a 10% discount rate, because the producing field earns first
 * and pays its abandonment last. The caution is checked on cash flows the
 * engine itself computed (computeCashFlow), so the sign pattern is the
 * engine's and not restated here. Negative control: a spend-first project
 * whose NPV and IRR agree gets no caution.
 */
import { computeCashFlow } from '../../../../../supabase/functions/_shared/epe-engine.ts';
import { epeIrrCaution, epeIrrReason } from '../epeIrrReason';

const CFG = {
  oil_price_usd_bbl: 75, gas_price_usd_mscf: 0, condensate_price_usd_bbl: 0,
  discount_rate_pct: 10, inflation_rate_pct: 0, base_year: 2026,
  fiscal_regime: 'JV', jv_working_interest_pct: 100, jv_royalty_pct: 10, jv_tax_rate_pct: 30,
  oil_price_escalator_pct: 0, gas_price_escalator_pct: 0, condensate_price_escalator_pct: 0,
  opex_escalator_pct: 0, capex_escalator_pct: 0, present_value_basis: 'real',
};
const prodRows = [0, 1, 2, 3, 4, 5].map((i) => ({ year: 2026 + i, oil_bbl: Math.round(40000 * 0.88 ** i) }));
const opexRows = prodRows.map((r) => ({ year: r.year, total_opex_usd: 800000 }));

describe('epeIrrCaution', () => {
  it('a producing field that owes its abandonment: the engine reports a rate below the discount rate with a positive NPV', () => {
    const { kpis } = computeCashFlow({ cfg: { ...CFG, abandonment_cost_usd: 6000000 }, prodRows, capexRows: [], opexRows });
    expect(kpis.irr_status).toBe('ok');
    expect(kpis.npv).toBeGreaterThan(0);
    expect(kpis.irr).toBeLessThan(10);
    const text = epeIrrCaution(kpis);
    expect(text).toMatch(/brings money in first and pays it out later/);
    expect(text).toMatch(/a higher rate is worse/);
    expect(text).toMatch(/The NPV at 10\.00% is positive/);
    expect(epeIrrReason(kpis)).toBeNull();
  });

  it('negative control: spend first, earn later, NPV and IRR agree, no caution', () => {
    const { kpis } = computeCashFlow({ cfg: CFG, prodRows: prodRows.map((r) => ({ ...r, year: r.year + 1 })), capexRows: [{ year: 2026, capex_usd: 3000000 }], opexRows: opexRows.map((r) => ({ ...r, year: r.year + 1 })) });
    expect(kpis.irr_status).toBe('ok');
    expect(kpis.npv > 0).toBe(kpis.irr > 10);
    expect(epeIrrCaution(kpis)).toBeNull();
  });

  it('the Ekene field without Ekene-11 as the live run reported it', () => {
    expect(epeIrrCaution({ npv: -459223.89, irr: 13.534144, discount_rate_applied_pct: 10 })).toMatch(/13\.53% is the rate that money costs.*The NPV at 10\.00% is negative/);
  });

  it('no caution without a rate, an NPV of zero or missing figures', () => {
    expect(epeIrrCaution({ npv: 1e6, irr: null, discount_rate_applied_pct: 10 })).toBeNull();
    expect(epeIrrCaution({ npv: 0, irr: 5, discount_rate_applied_pct: 10 })).toBeNull();
    expect(epeIrrCaution({ npv: -1, irr: 12 })).toBeNull();
    expect(epeIrrCaution({ npv: -1, irr: 12 }, 10)).not.toBeNull();
  });
});

describe('Monte Carlo IRR percentiles', () => {
  // eslint-disable-next-line global-require
  const { irrStatsView, MIN_IRR_SHARE } = require('../EpeMonteCarloPanel');
  it('held back when most iterations have no IRR (Ekene: 99.9% none, all three percentiles -8.1%)', () => {
    expect(irrStatsView({ irr: { p90: -8.1, p50: -8.1, p10: -8.1, mean: -8.1, nullShare: 0.999 } })).toEqual({ show: false, held: true });
  });
  it('shown when at least half the iterations have one, and for older runs without the share', () => {
    expect(MIN_IRR_SHARE).toBe(0.5);
    expect(irrStatsView({ irr: { p50: 18, nullShare: 0.5 } })).toEqual({ show: true, held: false });
    expect(irrStatsView({ irr: { p50: 18 } })).toEqual({ show: true, held: false });
    expect(irrStatsView({ irr: { p50: null } })).toEqual({ show: false, held: false });
    expect(irrStatsView(null)).toEqual({ show: false, held: false });
  });
});
