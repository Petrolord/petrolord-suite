/**
 * Incremental economics on the engine's own valuation (epeIncremental.js).
 * Gate: two runs computed by the vendored cash-flow engine, a field with and
 * without a new well, history before the valuation year treated as sunk.
 * When both runs share valuation year, convention, basis and rate the
 * incremental NPV must equal NPV(with) - NPV(without) to the cent. The page
 * used to discount from the base run's first year and include sunk years, which
 * fails this gate (on the Ekene demo runs it showed 1,377,011 USD for an
 * increment of 2,439,459 USD).
 */
import { computeCashFlow } from '../../../../../supabase/functions/_shared/epe-engine.ts';
import { PIA_WORKED_EXAMPLE_DEFAULT_CFG } from '../../../../../tools/validation/fixtures/epe-pia-worked-example.ts';
import { computeIncremental, incrementalIrrNote, incrementalIrrLabel, valuationOf } from '../epeIncremental';

const YEARS = Array.from({ length: 18 }, (_, i) => 2020 + i);
const fieldOil = (y) => Math.round(100000 * Math.exp(-0.18 * (y - 2020)));
const wellOil = (y) => (y < 2027 ? 0 : Math.round(110000 * Math.exp(-0.25 * (y - 2027))));

const cfg = (over = {}) => ({
  ...PIA_WORKED_EXAMPLE_DEFAULT_CFG,
  oil_price_usd_bbl: 75,
  gas_price_usd_mscf: 0,
  inflation_rate_pct: 0,
  oil_price_escalator_pct: 0,
  gas_price_escalator_pct: 0,
  condensate_price_escalator_pct: 0,
  opex_escalator_pct: 0,
  capex_escalator_pct: 0,
  discount_rate_pct: 10,
  base_year: 2026,
  valuation_year: 2026,
  treat_prior_as_sunk: true,
  pia_water_depth_m: 35,
  pia_under_nta_2025_override: 'auto',
  ...over,
});

const run = (withWell, over = {}) => {
  const prodRows = YEARS.map((y) => ({ year: y, field_oil_bbl: fieldOil(y) + (withWell ? wellOil(y) : 0) }));
  const capexRows = withWell ? [{ year: 2027, category: 'Drilling', cost_usd: 12400000 }] : [];
  const opexRows = YEARS.map((y) => ({ year: y, total_opex_usd: 600000 + (withWell && y >= 2027 ? 100000 : 0) }));
  const out = computeCashFlow({ cfg: cfg(over), prodRows, capexRows, opexRows });
  return { id: withWell ? 'with' : 'without', name: withWell ? 'With well' : 'Without well', kpis: out.kpis, cashFlowData: out.cashFlowData, config: cfg(over) };
};

describe('incremental economics on the engine valuation', () => {
  test('incremental NPV equals the difference of the two NPVs (sunk history, valuation 2026)', () => {
    const base = run(false);
    const second = run(true);
    expect(base.cashFlowData.some((r) => r.sunk === true)).toBe(true);
    const inc = computeIncremental(base, second);
    expect(inc.npv).toBeCloseTo(second.kpis.npv - base.kpis.npv, 2);
    expect(inc.rows[0].year).toBe(2026);
    expect(inc.mismatches).toEqual([]);
  });

  test('mid-year discounting: the invariant holds too', () => {
    const base = run(false, { discounting_convention: 'mid_year' });
    const second = run(true, { discounting_convention: 'mid_year' });
    const inc = computeIncremental(base, second);
    expect(inc.convention).toBe('mid_year');
    expect(inc.npv).toBeCloseTo(second.kpis.npv - base.kpis.npv, 2);
  });

  test('the IRR comes from the shared contract and its roots zero the incremental NPV', () => {
    const inc = computeIncremental(run(false), run(true));
    const npvAt = (r) => inc.rows.reduce((s, row) => s + row.delta / Math.pow(1 + r, row.year - inc.valuationYear), 0);
    const rates = inc.irr != null ? [inc.irr] : inc.irrRoots;
    expect(rates.length).toBeGreaterThan(0);
    for (const r of rates) expect(Math.abs(npvAt(r / 100))).toBeLessThan(1);
  });

  test('a different valuation year is named as a mismatch', () => {
    const inc = computeIncremental(run(false), run(true, { valuation_year: 2027 }));
    expect(inc.mismatches).toContain('valuation year');
  });

  test('valuationOf falls back to the config when the KPIs carry no valuation year', () => {
    expect(valuationOf({ kpis: { discount_rate_applied_pct: 10 }, config: { base_year: 2027 } })).toEqual({ valuationYear: 2027, convention: 'end_year', basis: 'real', ratePct: 10 });
  });

  test('several roots are listed in plain words', () => {
    const inc = { irr: null, irrStatus: 'multiple-roots', irrRoots: [-11.9213, 24.9087], irrRootAboveBand: false };
    expect(incrementalIrrLabel(inc)).toBe('Several rates');
    expect(incrementalIrrNote(inc)).toBe('Two rates zero the incremental NPV: -11.92% and 24.91%. Read the incremental NPV.');
    expect(incrementalIrrLabel({ irr: 24.9087, irrStatus: 'ok' })).toBe('24.91%');
    expect(incrementalIrrNote({ irr: 24.9087, irrStatus: 'ok' })).toBeNull();
  });
});
