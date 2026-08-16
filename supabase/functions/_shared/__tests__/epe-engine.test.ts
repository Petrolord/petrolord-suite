// Jest acceptance gate for the EPE cash flow engine.
//
// The full narrative harness (run manually, with derivations in comments) is
// tools/validation/epe-validation.ts — this file re-asserts its key numbers so
// CI fails on any engine regression. The two must stay in agreement; if you
// change one, change the other. Plan of record: docs/scope/Economics-ROADMAP.md
// phase D1. Regression contract: docs/scope/EPE.md §6.7/§7.

import { computeCashFlow, computeBreakevenOilPrice } from '../epe-engine.ts';
import {
  PIA_WORKED_EXAMPLE_CFG,
  PIA_WORKED_EXAMPLE_PROD,
  PIA_WORKED_EXAMPLE_CAPEX,
  PIA_WORKED_EXAMPLE_OPEX,
  PIA_WORKED_EXAMPLE_EXPECTED,
} from '../../../../tools/validation/fixtures/epe-pia-worked-example.ts';

const runWorkedExample = (cfgOverrides = {}) => computeCashFlow({
  cfg: { ...PIA_WORKED_EXAMPLE_CFG, ...cfgOverrides },
  prodRows: PIA_WORKED_EXAMPLE_PROD,
  capexRows: PIA_WORKED_EXAMPLE_CAPEX,
  opexRows: PIA_WORKED_EXAMPLE_OPEX,
});

describe('EPE engine: PIA worked example regression contract', () => {
  const { cashFlowData, kpis } = runWorkedExample();

  it('reproduces NPV $135,185,570.34 within $0.01', () => {
    expect(kpis.npv).toBeCloseTo(PIA_WORKED_EXAMPLE_EXPECTED.npv, 2);
  });

  it('holds every validated line item within $0.01', () => {
    const row = cashFlowData[0];
    for (const [k, v] of Object.entries(PIA_WORKED_EXAMPLE_EXPECTED.line_items)) {
      expect(Math.abs(row[k] - (v as number))).toBeLessThanOrEqual(0.01);
    }
  });

  it('keeps PIA-only invariants (framework, zero dev levy)', () => {
    expect(kpis.fiscal_framework).toBe('pia_only');
    expect(kpis.total_dev_levy).toBe(0);
  });
});

describe('EPE engine: JV analytic case (hand-derived)', () => {
  // Derivation in tools/validation/epe-validation.ts Case 2.
  const cfg = {
    fiscal_regime: 'JV', base_year: 2030,
    oil_price_usd_bbl: 100, gas_price_usd_mscf: 0, condensate_price_usd_bbl: 0,
    discount_rate_pct: 10, inflation_rate_pct: 0,
    oil_price_escalator_pct: 0, gas_price_escalator_pct: 0,
    condensate_price_escalator_pct: 0, opex_escalator_pct: 0, capex_escalator_pct: 0,
    present_value_basis: 'nominal',
    jv_working_interest_pct: 100, jv_royalty_pct: 20, jv_tax_rate_pct: 50,
  };
  const { cashFlowData, kpis } = computeCashFlow({
    cfg,
    prodRows: [{ year: 2030, well1_oil_bbl: 1_000_000 }, { year: 2031, well1_oil_bbl: 1_000_000 }],
    capexRows: [{ year: 2030, amount_usd: 50_000_000 }],
    opexRows: [{ year: 2030, total_opex_usd: 10_000_000 }, { year: 2031, total_opex_usd: 10_000_000 }],
  });

  it('matches the closed-form royalty, tax, and net cash flows', () => {
    expect(cashFlowData[0].royalty).toBeCloseTo(20_000_000, 2);
    expect(cashFlowData[0].tax).toBeCloseTo(32_500_000, 2);
    expect(cashFlowData[0].net_cash_flow).toBeCloseTo(-12_500_000, 2);
    expect(cashFlowData[1].net_cash_flow).toBeCloseTo(37_500_000, 2);
  });

  it('matches the closed-form NPV, IRR, and payback', () => {
    expect(kpis.npv).toBeCloseTo(-12_500_000 + 37_500_000 / 1.1, 2);
    expect(kpis.irr).toBeCloseTo(200, 3);
    expect(kpis.payback).toBe('1.33 years');
  });
});

describe('EPE engine: PSC cost-recovery carryforward (hand-derived)', () => {
  // Derivation in tools/validation/epe-validation.ts Case 3. Year 2 only
  // produces these numbers if the year-1 unrecovered pool carries forward.
  const cfg = {
    fiscal_regime: 'PSC', base_year: 2030,
    oil_price_usd_bbl: 100, gas_price_usd_mscf: 0, condensate_price_usd_bbl: 0,
    discount_rate_pct: 10, inflation_rate_pct: 0,
    oil_price_escalator_pct: 0, gas_price_escalator_pct: 0,
    condensate_price_escalator_pct: 0, opex_escalator_pct: 0, capex_escalator_pct: 0,
    present_value_basis: 'nominal',
    psc_royalty_pct: 10, psc_cost_oil_cap_pct: 40,
    psc_contractor_profit_share_pct: 50, psc_tax_rate_pct: 50,
  };
  const { cashFlowData, kpis } = computeCashFlow({
    cfg,
    prodRows: [{ year: 2030, well1_oil_bbl: 1_000_000 }, { year: 2031, well1_oil_bbl: 1_000_000 }],
    capexRows: [{ year: 2030, amount_usd: 80_000_000 }],
    opexRows: [{ year: 2030, total_opex_usd: 10_000_000 }, { year: 2031, total_opex_usd: 10_000_000 }],
  });

  it('caps year-1 cost oil and carries the unrecovered pool', () => {
    expect(cashFlowData[0].taxable_income).toBeCloseTo(27_000_000, 2);
    expect(cashFlowData[0].net_cash_flow).toBeCloseTo(-40_500_000, 2);
  });

  it('consumes the carryforward in year 2', () => {
    expect(cashFlowData[1].taxable_income).toBeCloseTo(27_000_000, 2);
    expect(cashFlowData[1].net_cash_flow).toBeCloseTo(39_500_000, 2);
    expect(kpis.npv).toBeCloseTo(-40_500_000 + 39_500_000 / 1.1, 2);
  });
});

describe('EPE engine: NTA 2025 framework switch', () => {
  const pia = runWorkedExample({ pia_under_nta_2025_override: 'force_pia' });
  const nta = runWorkedExample({ pia_under_nta_2025_override: 'force_nta' });

  it('swaps TET for Development Levy on the same assessable base', () => {
    expect(nta.kpis.fiscal_framework).toBe('nta_2025');
    expect(nta.kpis.total_tet).toBe(0);
    expect(pia.kpis.total_dev_levy).toBe(0);
    const tet = pia.cashFlowData[0].tet_tax;
    const dev = nta.cashFlowData[0].dev_levy_tax;
    expect(dev).toBeCloseTo(tet * 1.6, 2); // 4% vs 2.5% of the same base
    expect(nta.cashFlowData[0].net_cash_flow)
      .toBeCloseTo(pia.cashFlowData[0].net_cash_flow + tet - dev, 2);
  });
});

describe('EPE engine: production allowance volume cap (EPE.md §4.1)', () => {
  const { cashFlowData } = computeCashFlow({
    cfg: { ...PIA_WORKED_EXAMPLE_CFG, pia_lease_status: 'new', pia_prior_cumulative_oil_bbl: 99_000_000 },
    prodRows: [{ year: 2025, well1_oil_bbl: 2_000_000 }, { year: 2026, well1_oil_bbl: 1_000_000 }],
    capexRows: [{ year: 2025, amount_usd: 50_000_000 }],
    opexRows: [{ year: 2025, total_opex_usd: 20_000_000 }, { year: 2026, total_opex_usd: 20_000_000 }],
  });

  it('splits the crossing year at the 100 MMbbl shallow-water cap', () => {
    expect(cashFlowData[0].prod_alw_eligible_bbl).toBeCloseTo(1_000_000, 6);
    expect(cashFlowData[0].production_allowance).toBeCloseTo(8_000_000, 2);
    expect(cashFlowData[0].prod_alw_cap_applied).toBe(true);
  });

  it('grants zero allowance once capacity is exhausted', () => {
    expect(cashFlowData[1].prod_alw_eligible_bbl).toBe(0);
    expect(cashFlowData[1].production_allowance).toBe(0);
    expect(cashFlowData[1].cumulative_oil_bbl_lifetime).toBeCloseTo(102_000_000, 6);
  });
});

describe('EPE engine: real-world CSV schema ingestion (ALAOMA shapes)', () => {
  // Mirrors the alaoma_*_base.csv uploads that used to produce a silent
  // $0-revenue/$0-capex run: bare oil_bbl (not per-well *_oil_bbl), capex in
  // cost_usd (not amount_usd), monthly YYYY-MM dates, extra non-volume columns.
  const cfg = {
    fiscal_regime: 'JV', base_year: 2027,
    oil_price_usd_bbl: 75, gas_price_usd_mscf: 4.5, condensate_price_usd_bbl: 70,
    discount_rate_pct: 10, inflation_rate_pct: 0,
    oil_price_escalator_pct: 0, gas_price_escalator_pct: 0,
    condensate_price_escalator_pct: 0, opex_escalator_pct: 0, capex_escalator_pct: 0,
    present_value_basis: 'nominal',
    jv_working_interest_pct: 100, jv_royalty_pct: 10, jv_tax_rate_pct: 50,
  };
  const prodRows = [
    { date: '2027-01', days_in_month: 31, oil_rate_bopd: 3225.8, oil_bbl: 100_000, liquid_bbl: 120_000, water_bbl: 20_000, watercut_pct: 16.7 },
    { date: '2027-02', days_in_month: 28, oil_rate_bopd: 3214.3, oil_bbl: 90_000, liquid_bbl: 115_000, water_bbl: 25_000, watercut_pct: 21.7 },
  ];
  const capexRows = [
    { date: '2027-01', category: 'Drilling', item: 'Well A1', cost_usd: 30_000_000, basis_note: 'AFE' },
    { date: '2027-06', category: 'Facilities', item: 'Flowline', cost_usd: 10_000_000, basis_note: 'estimate' },
  ];
  const opexRows = [
    { date: '2027-01', fixed_opex_usd: 500_000, variable_oil_usd: 200_000, variable_water_usd: 50_000, total_opex_usd: 750_000, oil_bbl_basis: 100_000, unit_opex_usd_per_bbl: 7.5 },
    { date: '2027-02', fixed_opex_usd: 500_000, variable_oil_usd: 180_000, variable_water_usd: 60_000, total_opex_usd: 740_000, oil_bbl_basis: 90_000, unit_opex_usd_per_bbl: 8.2 },
  ];

  it('yields nonzero revenue, capex, and opex from all three files', () => {
    const { kpis } = computeCashFlow({ cfg, prodRows, capexRows, opexRows });
    expect(kpis.total_revenue).toBeCloseTo(190_000 * 75, 2);   // oil_bbl only — liquid/water carry no price
    expect(kpis.total_capex).toBeCloseTo(40_000_000, 2);        // cost_usd alias
    expect(kpis.total_opex).toBeCloseTo(1_490_000, 2);          // total_opex_usd preferred
    expect(kpis.total_revenue).toBeGreaterThan(0);
    expect(kpis.total_capex).toBeGreaterThan(0);
    expect(kpis.total_opex).toBeGreaterThan(0);
  });

  it('matches headers case-insensitively', () => {
    const { kpis } = computeCashFlow({
      cfg,
      prodRows: [{ Date: '2027-01', 'Oil_BBL': 100_000, 'Water_BBL': 20_000 }],
      capexRows: [{ DATE: '2027-01', Category: 'Drilling', 'Cost_USD': 30_000_000 }],
      opexRows: [{ date: '2027-01', 'Total_Opex_USD': 750_000 }],
    });
    expect(kpis.total_revenue).toBeCloseTo(100_000 * 75, 2);
    expect(kpis.total_capex).toBeCloseTo(30_000_000, 2);
    expect(kpis.total_opex).toBeCloseTo(750_000, 2);
  });

  it('still prefers per-well columns and ignores total_* rollups alongside them', () => {
    const { kpis } = computeCashFlow({
      cfg,
      prodRows: [{ year: 2027, well1_oil_bbl: 60_000, well2_oil_bbl: 40_000, total_oil_bbl: 100_000 }],
      capexRows: [],
      opexRows: [],
    });
    expect(kpis.total_revenue).toBeCloseTo(100_000 * 75, 2); // not double-counted
  });
});

describe('EPE engine v3.4: decision KPI bundle (hand-derived on the JV analytic case)', () => {
  const cfg = {
    fiscal_regime: 'JV', base_year: 2030,
    oil_price_usd_bbl: 100, gas_price_usd_mscf: 0, condensate_price_usd_bbl: 0,
    discount_rate_pct: 10, inflation_rate_pct: 0,
    oil_price_escalator_pct: 0, gas_price_escalator_pct: 0,
    condensate_price_escalator_pct: 0, opex_escalator_pct: 0, capex_escalator_pct: 0,
    present_value_basis: 'nominal',
    jv_working_interest_pct: 100, jv_royalty_pct: 20, jv_tax_rate_pct: 50,
  };
  const input = {
    cfg,
    prodRows: [{ year: 2030, well1_oil_bbl: 1_000_000 }, { year: 2031, well1_oil_bbl: 1_000_000 }],
    capexRows: [{ year: 2030, amount_usd: 50_000_000 }],
    opexRows: [{ year: 2030, total_opex_usd: 10_000_000 }, { year: 2031, total_opex_usd: 10_000_000 }],
  };
  const { kpis } = computeCashFlow(input);

  it('reports total volumes and BOE (oil-only case: boe = oil)', () => {
    expect(kpis.total_oil_bbl).toBe(2_000_000);
    expect(kpis.total_gas_mscf).toBe(0);
    expect(kpis.total_boe).toBe(2_000_000);
  });

  it('computes unit technical cost and opex/boe', () => {
    // (50M capex + 20M opex) / 2M boe = 35; 20M / 2M = 10
    expect(kpis.unit_technical_cost_usd_per_boe).toBeCloseTo(35, 6);
    expect(kpis.opex_usd_per_boe).toBeCloseTo(10, 6);
  });

  it('computes government take as royalties + taxes over pre-take value', () => {
    // pre-take = 200M - 50M - 20M = 130M; take = 40M royalties + 65M tax = 105M
    expect(kpis.government_take_pct).toBeCloseTo((105 / 130) * 100, 6);
  });

  it('computes PV(capex) and DPI on the NPV basis', () => {
    expect(kpis.pv_capex).toBeCloseTo(50_000_000, 2); // year-0 capex, nominal basis
    expect(kpis.dpi).toBeCloseTo(kpis.npv / 50_000_000, 10);
  });

  it('computes numeric and discounted payback', () => {
    // nominal CFs [-12.5M, +37.5M] -> 1 + 12.5/37.5; discounted [-12.5M, +34.0909M]
    expect(kpis.payback_years).toBeCloseTo(1 + 12.5 / 37.5, 6);
    expect(kpis.discounted_payback_years).toBeCloseTo(1 + 12.5 / (37.5 / 1.1), 6);
  });

  it('finds the breakeven oil price (engine NPV at that price is ~0)', () => {
    const breakeven = computeBreakevenOilPrice(input);
    expect(breakeven).not.toBeNull();
    expect(breakeven).toBeGreaterThan(0);
    expect(breakeven).toBeLessThan(100); // base case is NPV-positive at $100
    const atBreakeven = computeCashFlow({
      ...input, cfg: { ...cfg, oil_price_usd_bbl: breakeven },
    });
    expect(Math.abs(atBreakeven.kpis.npv)).toBeLessThan(2_000); // price tol 0.001 x ~0.8M $/bbl-$ sensitivity
  });
});

describe('EPE engine v3.4: economic limit test (config-gated)', () => {
  const cfg = {
    fiscal_regime: 'JV', base_year: 2030,
    oil_price_usd_bbl: 100, gas_price_usd_mscf: 0, condensate_price_usd_bbl: 0,
    discount_rate_pct: 10, inflation_rate_pct: 0,
    oil_price_escalator_pct: 0, gas_price_escalator_pct: 0,
    condensate_price_escalator_pct: 0, opex_escalator_pct: 0, capex_escalator_pct: 0,
    present_value_basis: 'nominal',
    jv_working_interest_pct: 100, jv_royalty_pct: 20, jv_tax_rate_pct: 50,
  };
  const prodRows = [
    { year: 2030, well1_oil_bbl: 1_000_000 },
    { year: 2031, well1_oil_bbl: 1_000_000 },
    { year: 2032, well1_oil_bbl: 10_000 },   // $1M revenue vs $10M opex: uneconomic
  ];
  const capexRows = [{ year: 2030, amount_usd: 50_000_000 }];
  const opexRows = [2030, 2031, 2032].map(year => ({ year, total_opex_usd: 10_000_000 }));

  it('is off by default (tail year kept)', () => {
    const { cashFlowData, kpis } = computeCashFlow({ cfg, prodRows, capexRows, opexRows });
    expect(cashFlowData).toHaveLength(3);
    expect(kpis.economic_limit_year).toBeUndefined();
  });

  it('trims the uneconomic tail and reports the limit year', () => {
    const { cashFlowData, kpis } = computeCashFlow({
      cfg: { ...cfg, apply_economic_limit: true }, prodRows, capexRows, opexRows,
    });
    expect(cashFlowData).toHaveLength(2);
    expect(cashFlowData[cashFlowData.length - 1].year).toBe(2031);
    expect(kpis.economic_limit_year).toBe(2031);
    expect(kpis.years_trimmed_by_economic_limit).toBe(1);
    // NPV improves: the -$9M tail year is not incurred
    const base = computeCashFlow({ cfg, prodRows, capexRows, opexRows });
    expect(kpis.npv).toBeGreaterThan(base.kpis.npv);
  });
});

describe('EPE engine v3.4: abandonment cost (config-gated, post-tax)', () => {
  const cfg = {
    fiscal_regime: 'JV', base_year: 2030,
    oil_price_usd_bbl: 100, gas_price_usd_mscf: 0, condensate_price_usd_bbl: 0,
    discount_rate_pct: 10, inflation_rate_pct: 0,
    oil_price_escalator_pct: 0, gas_price_escalator_pct: 0,
    condensate_price_escalator_pct: 0, opex_escalator_pct: 0, capex_escalator_pct: 0,
    present_value_basis: 'nominal',
    jv_working_interest_pct: 100, jv_royalty_pct: 20, jv_tax_rate_pct: 50,
  };
  const prodRows = [{ year: 2030, well1_oil_bbl: 1_000_000 }, { year: 2031, well1_oil_bbl: 1_000_000 }];
  const capexRows = [{ year: 2030, amount_usd: 50_000_000 }];
  const opexRows = [{ year: 2030, total_opex_usd: 10_000_000 }, { year: 2031, total_opex_usd: 10_000_000 }];

  it('applies the lump sum in the final modeled year without touching tax', () => {
    const base = computeCashFlow({ cfg, prodRows, capexRows, opexRows });
    const withAbex = computeCashFlow({
      cfg: { ...cfg, abandonment_cost_usd: 10_000_000 }, prodRows, capexRows, opexRows,
    });
    const last = withAbex.cashFlowData[1];
    expect(last.abandonment_cost).toBe(10_000_000);
    expect(last.tax).toBeCloseTo(base.cashFlowData[1].tax, 2);             // post-tax: no deduction
    expect(last.net_cash_flow).toBeCloseTo(base.cashFlowData[1].net_cash_flow - 10_000_000, 2);
    expect(withAbex.kpis.total_abandonment_cost).toBe(10_000_000);
    expect(withAbex.kpis.abandonment_year).toBe(2031);
    expect(withAbex.kpis.npv).toBeCloseTo(base.kpis.npv - 10_000_000 / 1.1, 2);
  });

  it('appends a standalone year when abandonment_year is beyond the data', () => {
    const { cashFlowData, kpis } = computeCashFlow({
      cfg: { ...cfg, abandonment_cost_usd: 10_000_000, abandonment_year: 2033 },
      prodRows, capexRows, opexRows,
    });
    expect(cashFlowData).toHaveLength(3);
    const abexRow = cashFlowData[2];
    expect(abexRow.year).toBe(2033);
    expect(abexRow.gross_revenue).toBe(0);
    expect(abexRow.abandonment_cost).toBe(10_000_000);
    expect(abexRow.net_cash_flow).toBeCloseTo(-10_000_000, 2);
    expect(kpis.abandonment_year).toBe(2033);
  });
});

describe('EPE engine: ingestion failures are loud (no silent $0 runs)', () => {
  const cfg = {
    fiscal_regime: 'JV', base_year: 2027,
    oil_price_usd_bbl: 75, gas_price_usd_mscf: 4.5, condensate_price_usd_bbl: 70,
    discount_rate_pct: 10, inflation_rate_pct: 0,
    oil_price_escalator_pct: 0, gas_price_escalator_pct: 0,
    condensate_price_escalator_pct: 0, opex_escalator_pct: 0, capex_escalator_pct: 0,
    present_value_basis: 'nominal',
    jv_working_interest_pct: 100, jv_royalty_pct: 10, jv_tax_rate_pct: 50,
  };
  const goodProd = [{ date: '2027-01', oil_bbl: 100_000 }];

  it('throws when no production volume column is recognized', () => {
    expect(() => computeCashFlow({
      cfg,
      prodRows: [{ date: '2027-01', oil_production: 100_000 }],
      capexRows: [], opexRows: [],
    })).toThrow(/Production file.*no oil\/gas\/condensate volume columns/);
  });

  it('throws when production rows have no usable date', () => {
    expect(() => computeCashFlow({
      cfg,
      prodRows: [{ period: 'Jan-27', oil_bbl: 100_000 }],
      capexRows: [], opexRows: [],
    })).toThrow(/no row had a usable date/);
  });

  it('throws when the capex file has no recognized cost column', () => {
    expect(() => computeCashFlow({
      cfg,
      prodRows: goodProd,
      capexRows: [{ date: '2027-01', category: 'Drilling', spend: 30_000_000 }],
      opexRows: [],
    })).toThrow(/CAPEX file.*no cost column recognized/);
  });

  it('throws when the opex file has no recognized cost column', () => {
    expect(() => computeCashFlow({
      cfg,
      prodRows: goodProd,
      capexRows: [],
      opexRows: [{ date: '2027-01', monthly_cost: 750_000 }],
    })).toThrow(/OPEX file.*no cost column recognized/);
  });

  it('throws when the oil price is unset but oil volumes exist', () => {
    expect(() => computeCashFlow({
      cfg: { ...cfg, oil_price_usd_bbl: null },
      prodRows: goodProd,
      capexRows: [], opexRows: [],
    })).toThrow(/Oil price.*is not set/);
  });
});

describe('EPE engine: CPR cessation forfeiture (EPE.md §4.1)', () => {
  const { cashFlowData, kpis } = computeCashFlow({
    cfg: { ...PIA_WORKED_EXAMPLE_CFG },
    prodRows: [{ year: 2025, well1_oil_bbl: 1_000_000 }],
    capexRows: [{ year: 2025, amount_usd: 100_000_000 }],
    opexRows: [{ year: 2025, total_opex_usd: 40_000_000 }],
  });

  it('flags the unrecovered CPR pool on the final year and in KPIs', () => {
    expect(cashFlowData[0].cpr_cap).toBeCloseTo(52_000_000, 2);
    expect(cashFlowData[0].cpr_costs_claimed).toBeCloseTo(52_000_000, 2);
    expect(cashFlowData[0].cpr_deferred_to_next).toBeCloseTo(8_000_000, 2);
    expect(cashFlowData[0].cpr_forfeited_at_cessation).toBeCloseTo(8_000_000, 2);
    expect(kpis.cpr_forfeited_at_cessation).toBeCloseTo(8_000_000, 2);
  });
});
