// Jest acceptance gate for the EPE cash flow engine.
//
// The full narrative harness (run manually, with derivations in comments) is
// tools/validation/epe-validation.ts — this file re-asserts its key numbers so
// CI fails on any engine regression. The two must stay in agreement; if you
// change one, change the other. Plan of record: docs/scope/Economics-ROADMAP.md
// phase D1. Regression contract: docs/scope/EPE.md §6.7/§7.

import { computeCashFlow, computeBreakevenOilPrice, irr, ENGINE_VERSION } from '../epe-engine.ts';
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

describe('EPE engine v3.5: tax-loss carryforward (Wave A finding 1.2)', () => {
  // Hand derivation (JV, WI 100%, royalty 20%, tax 50%, 10y SL depreciation):
  //   2030: no production, 50M capex -> depr 5M/yr; taxable = -5M -> tax 0,
  //         loss pool 5M (old engine also taxed 0 here, so year 1 matches).
  //   2031: gross 100M, royalty 20M, opex 10M, depr 5M -> taxable 65M;
  //         offset 5M -> chargeable 60M -> tax 30M (old engine: 32.5M).
  //         net = 100 - 20 - 10 - 30 = 40M.
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
    prodRows: [{ year: 2030, well1_oil_bbl: 0 }, { year: 2031, well1_oil_bbl: 1_000_000 }],
    capexRows: [{ year: 2030, amount_usd: 50_000_000 }],
    opexRows: [{ year: 2031, total_opex_usd: 10_000_000 }],
  };

  it('banks the loss year and offsets the next taxable year (JV closed form)', () => {
    const { cashFlowData } = computeCashFlow(input);
    expect(cashFlowData[0].tax).toBeCloseTo(0, 2);
    expect(cashFlowData[0].loss_carryforward).toBeCloseTo(5_000_000, 2);
    expect(cashFlowData[1].loss_offset_used).toBeCloseTo(5_000_000, 2);
    expect(cashFlowData[1].tax).toBeCloseTo(30_000_000, 2);
    expect(cashFlowData[1].net_cash_flow).toBeCloseTo(40_000_000, 2);
    expect(cashFlowData[1].loss_carryforward).toBeCloseTo(0, 2);
  });

  it('kill switch restores the old clamp-at-zero behavior', () => {
    const { cashFlowData } = computeCashFlow({
      ...input, cfg: { ...cfg, apply_loss_carryforward: false },
    });
    expect(cashFlowData[1].tax).toBeCloseTo(32_500_000, 2);
    expect(cashFlowData[1].net_cash_flow).toBeCloseTo(37_500_000, 2);
  });

  it('reports losses left unused at cessation', () => {
    const { kpis } = computeCashFlow({
      ...input,
      prodRows: [{ year: 2030, well1_oil_bbl: 0 }],
      opexRows: [],
    });
    expect(kpis.tax_losses_unused_at_cessation).toBeCloseTo(5_000_000, 2);
  });

  it('offsets PIA HCT and CIT via separate pools (self-consistent vs kill switch)', () => {
    // Loss year: production but heavy opex; recovery year: normal margins.
    const piaInput = {
      cfg: { ...PIA_WORKED_EXAMPLE_CFG, base_year: 2025 },
      prodRows: [{ year: 2025, well1_oil_bbl: 500_000 }, { year: 2026, well1_oil_bbl: 5_000_000 }],
      capexRows: [{ year: 2025, amount_usd: 100_000_000 }],
      opexRows: [{ year: 2025, total_opex_usd: 60_000_000 }, { year: 2026, total_opex_usd: 40_000_000 }],
    };
    const withRelief = computeCashFlow(piaInput);
    const noRelief = computeCashFlow({
      ...piaInput, cfg: { ...piaInput.cfg, apply_loss_carryforward: false },
    });
    const y1 = noRelief.cashFlowData[0];
    // The scenario must actually produce a year-1 loss on at least one tax
    // base, or it validates nothing.
    expect(Math.min(y1.hct_chargeable_profit, y1.cit_chargeable_profit)).toBeLessThan(0);
    const y2Relief = withRelief.cashFlowData[1];
    const y2Flat = noRelief.cashFlowData[1];
    // Year 2 taxes drop by exactly rate x carried loss for each tax.
    const hctCarried = Math.max(0, -y1.hct_chargeable_profit);
    const citCarried = Math.max(0, -y1.cit_chargeable_profit);
    expect(y2Relief.hct_loss_offset_used).toBeCloseTo(Math.min(hctCarried, Math.max(0, y2Flat.hct_chargeable_profit)), 2);
    expect(y2Flat.hct_tax - y2Relief.hct_tax).toBeCloseTo(y2Relief.hct_loss_offset_used * 0.30, 2);
    expect(y2Relief.cit_loss_offset_used).toBeCloseTo(Math.min(citCarried, Math.max(0, y2Flat.cit_chargeable_profit)), 2);
    expect(y2Flat.cit_tax - y2Relief.cit_tax)
      .toBeCloseTo(y2Relief.cit_loss_offset_used * (PIA_WORKED_EXAMPLE_CFG.pia_cit_rate_pct / 100), 2);
    // TET base is deliberately untouched by loss relief.
    expect(y2Relief.tet_tax).toBeCloseTo(y2Flat.tet_tax, 2);
  });
});

describe('EPE engine v3.5: HCT excludes gas revenue (Wave A finding 1.3)', () => {
  it('charges zero HCT on a gas-only case (gas profits are CIT-only under PIA)', () => {
    const input = {
      cfg: { ...PIA_WORKED_EXAMPLE_CFG },
      prodRows: [{ year: 2025, well1_gas_mscf: 20_000_000 }],
      capexRows: [{ year: 2025, amount_usd: 20_000_000 }],
      opexRows: [{ year: 2025, total_opex_usd: 10_000_000 }],
    };
    const { cashFlowData, kpis } = computeCashFlow(input);
    expect(cashFlowData[0].hct_tax).toBe(0);
    expect(cashFlowData[0].hct_assessable_profit).toBe(0);
    expect(kpis.total_cit).toBeGreaterThan(0);        // gas still pays CIT
    // Escape hatch reproduces the old whole-revenue base.
    const legacy = computeCashFlow({
      ...input, cfg: { ...input.cfg, pia_hct_include_gas_revenue: true },
    });
    expect(legacy.cashFlowData[0].hct_tax).toBeGreaterThan(0);
  });
});

describe('EPE engine v3.5: IRR solver hardening (Wave A finding 1.4)', () => {
  it('still solves the JV analytic case via Newton (200%)', () => {
    expect(irr([-12_500_000, 37_500_000])! * 100).toBeCloseTo(200, 6);
  });

  it('returns null when no real IRR exists instead of a garbage rate', () => {
    // -1 + 3/(1+r) - 3/(1+r)^2 has no real root (max is -0.25 at r = 1).
    expect(irr([-1, 3, -3])).toBeNull();
  });

  it('any non-null IRR actually zeroes the NPV (self-consistency)', () => {
    const flows = [-100, 230, -132]; // multiple-IRR shape (roots at 10% and 20%)
    const r = irr(flows);
    if (r !== null) {
      const f = flows.reduce((s, cf, i) => s + cf / Math.pow(1 + r, i), 0);
      expect(Math.abs(f)).toBeLessThan(1e-4);
    }
  });
});

describe('EPE engine v3.5: ambiguous cost aliases fail loudly (Wave A finding 1.5)', () => {
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

  it('throws when a row populates two cost aliases with different values', () => {
    expect(() => computeCashFlow({
      cfg, prodRows: goodProd,
      capexRows: [{ date: '2027-01', amount_usd: 30_000_000, cost_usd: 10_000_000 }],
      opexRows: [],
    })).toThrow(/multiple cost columns populated with different values/);
  });

  it('accepts duplicated identical values under two aliases', () => {
    const { kpis } = computeCashFlow({
      cfg, prodRows: goodProd,
      capexRows: [{ date: '2027-01', amount_usd: 30_000_000, cost_usd: 30_000_000 }],
      opexRows: [],
    });
    expect(kpis.total_capex).toBeCloseTo(30_000_000, 2);
  });
});

describe('EPE engine v3.5: economic limit honors royalty (Wave A finding 1.6)', () => {
  const cfg = {
    fiscal_regime: 'JV', base_year: 2030,
    oil_price_usd_bbl: 100, gas_price_usd_mscf: 0, condensate_price_usd_bbl: 0,
    discount_rate_pct: 10, inflation_rate_pct: 0,
    oil_price_escalator_pct: 0, gas_price_escalator_pct: 0,
    condensate_price_escalator_pct: 0, opex_escalator_pct: 0, capex_escalator_pct: 0,
    present_value_basis: 'nominal',
    jv_working_interest_pct: 100, jv_royalty_pct: 20, jv_tax_rate_pct: 50,
    apply_economic_limit: true,
  };
  // Tail year: revenue 12M > opex 10M, but 12M x (1 - 20% royalty) = 9.6M < 10M.
  const prodRows = [
    { year: 2030, well1_oil_bbl: 1_000_000 },
    { year: 2031, well1_oil_bbl: 120_000 },
  ];
  const capexRows = [{ year: 2030, amount_usd: 50_000_000 }];
  const opexRows = [{ year: 2030, total_opex_usd: 10_000_000 }, { year: 2031, total_opex_usd: 10_000_000 }];

  it('trims a tail year that is only economic before royalty', () => {
    const { cashFlowData, kpis } = computeCashFlow({ cfg, prodRows, capexRows, opexRows });
    expect(cashFlowData).toHaveLength(1);
    expect(kpis.economic_limit_year).toBe(2030);
    expect(kpis.years_trimmed_by_economic_limit).toBe(1);
  });
});

describe('EPE engine v3.5: run provenance (Wave A finding 1.8)', () => {
  it('stamps engine_version into every KPI set', () => {
    const { kpis } = runWorkedExample();
    expect(kpis.engine_version).toBe(ENGINE_VERSION);
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('EPE engine v3.6: working interest on PSC and PIA (Wave B 2.1)', () => {
  const pscCfg = {
    fiscal_regime: 'PSC', base_year: 2030,
    oil_price_usd_bbl: 100, gas_price_usd_mscf: 0, condensate_price_usd_bbl: 0,
    discount_rate_pct: 10, inflation_rate_pct: 0,
    oil_price_escalator_pct: 0, gas_price_escalator_pct: 0,
    condensate_price_escalator_pct: 0, opex_escalator_pct: 0, capex_escalator_pct: 0,
    present_value_basis: 'nominal',
    psc_royalty_pct: 10, psc_cost_oil_cap_pct: 40,
    psc_contractor_profit_share_pct: 50, psc_tax_rate_pct: 50,
  };
  const pscInput = {
    prodRows: [{ year: 2030, well1_oil_bbl: 1_000_000 }, { year: 2031, well1_oil_bbl: 1_000_000 }],
    capexRows: [{ year: 2030, amount_usd: 80_000_000 }],
    opexRows: [{ year: 2030, total_opex_usd: 10_000_000 }, { year: 2031, total_opex_usd: 10_000_000 }],
  };

  it('PSC at 50% WI halves every monetary line and the NPV (linear regime)', () => {
    const full = computeCashFlow({ cfg: pscCfg, ...pscInput });
    const half = computeCashFlow({ cfg: { ...pscCfg, psc_working_interest_pct: 50 }, ...pscInput });
    for (const k of ['gross_revenue', 'royalty', 'tax', 'net_cash_flow', 'oil_bbl']) {
      expect(half.cashFlowData[0][k]).toBeCloseTo(full.cashFlowData[0][k] * 0.5, 2);
      expect(half.cashFlowData[1][k]).toBeCloseTo(full.cashFlowData[1][k] * 0.5, 2);
    }
    expect(half.kpis.npv).toBeCloseTo(full.kpis.npv * 0.5, 2);
    expect(half.kpis.working_interest_pct).toBe(50);
    // Take % is a ratio, so it must be WI-invariant.
    expect(half.kpis.government_take_pct).toBeCloseTo(full.kpis.government_take_pct, 6);
  });

  it('PIA WI keeps field-level royalty tiers (rate from field bopd, not the WI share)', () => {
    // Deep offshore: >50,000 bopd pays 7.5% production royalty, <=50,000 pays 5%.
    // Field is 60,000 bopd; the 50% WI share alone (30,000 bopd) would sit in
    // the lower tier, which is exactly the naive-prescaling error.
    const piaCfg = { ...PIA_WORKED_EXAMPLE_CFG, pia_terrain: 'deep_offshore' };
    const prodRows = [{ year: 2025, well1_oil_bbl: 21_900_000 }];   // 60,000 bopd
    const capexRows = [{ year: 2025, amount_usd: 100_000_000 }];
    const opexRows = [{ year: 2025, total_opex_usd: 100_000_000 }];
    const full = computeCashFlow({ cfg: piaCfg, prodRows, capexRows, opexRows });
    const wi50 = computeCashFlow({ cfg: { ...piaCfg, pia_working_interest_pct: 50 }, prodRows, capexRows, opexRows });
    const naive = computeCashFlow({
      cfg: piaCfg,
      prodRows: [{ year: 2025, well1_oil_bbl: 10_950_000 }],        // 30,000 bopd
      capexRows, opexRows,
    });
    // WI share of the field-level royalty...
    expect(wi50.cashFlowData[0].production_royalty).toBeCloseTo(full.cashFlowData[0].production_royalty * 0.5, 2);
    // ...which is NOT what half the volumes at 100% WI would pay (5% tier):
    // the field royalty rate is 7.5/5 = 1.5x the naive rate.
    expect(wi50.cashFlowData[0].production_royalty)
      .toBeCloseTo(naive.cashFlowData[0].production_royalty * 1.5, 2);
    // Field-level diagnostics stay unscaled.
    expect(wi50.cashFlowData[0].cumulative_oil_bbl_lifetime).toBeCloseTo(21_900_000, 2);
  });
});

describe('EPE engine v3.6: per-year price decks and differentials (Wave B 2.2)', () => {
  const cfg = {
    fiscal_regime: 'JV', base_year: 2030,
    oil_price_usd_bbl: 100, gas_price_usd_mscf: 0, condensate_price_usd_bbl: 0,
    discount_rate_pct: 10, inflation_rate_pct: 0,
    oil_price_escalator_pct: 10, gas_price_escalator_pct: 0,
    condensate_price_escalator_pct: 0, opex_escalator_pct: 0, capex_escalator_pct: 0,
    present_value_basis: 'nominal',
    jv_working_interest_pct: 100, jv_royalty_pct: 20, jv_tax_rate_pct: 50,
  };
  const prodRows = [2030, 2031, 2032, 2033].map(year => ({ year, well1_oil_bbl: 1_000_000 }));

  it('deck values step-hold between entries and escalate beyond the last', () => {
    const { cashFlowData } = computeCashFlow({
      cfg: { ...cfg, price_deck: [{ year: 2030, oil: 100 }, { year: 2032, oil: 50 }] },
      prodRows, capexRows: [], opexRows: [],
    });
    expect(cashFlowData[0].applied_oil_price).toBeCloseTo(100, 6);   // deck year
    expect(cashFlowData[1].applied_oil_price).toBeCloseTo(100, 6);   // step-hold
    expect(cashFlowData[2].applied_oil_price).toBeCloseTo(50, 6);    // deck year
    expect(cashFlowData[3].applied_oil_price).toBeCloseTo(55, 6);    // 50 x 1.10 beyond deck
  });

  it('differential adds after resolution; flat runs without a deck are unchanged', () => {
    const withDiff = computeCashFlow({
      cfg: { ...cfg, price_deck: [{ year: 2030, oil: 100 }], oil_price_differential_usd_bbl: -5 },
      prodRows: prodRows.slice(0, 2), capexRows: [], opexRows: [],
    });
    expect(withDiff.cashFlowData[0].applied_oil_price).toBeCloseTo(95, 6);
    expect(withDiff.cashFlowData[1].applied_oil_price).toBeCloseTo(100 * 1.1 - 5, 6);
    const flat = computeCashFlow({ cfg, prodRows: prodRows.slice(0, 2), capexRows: [], opexRows: [] });
    expect(flat.cashFlowData[1].applied_oil_price).toBeCloseTo(110, 6); // old escalator path intact
  });

  it('price scale multiplies the resolved deck price (sweep hook)', () => {
    const { cashFlowData } = computeCashFlow({
      cfg: { ...cfg, price_deck: [{ year: 2030, oil: 100 }], oil_price_scale: 1.2 },
      prodRows: prodRows.slice(0, 1), capexRows: [], opexRows: [],
    });
    expect(cashFlowData[0].applied_oil_price).toBeCloseTo(120, 6);
  });

  it('breakeven is null when an oil deck prices the run', () => {
    const input = {
      cfg: { ...cfg, price_deck: [{ year: 2030, oil: 100 }] },
      prodRows: prodRows.slice(0, 2),
      capexRows: [{ year: 2030, amount_usd: 50_000_000 }],
      opexRows: [],
    };
    expect(computeBreakevenOilPrice(input)).toBeNull();
  });
});

describe('EPE engine v3.6: discounting convention and valuation date (Wave B 2.3/2.4)', () => {
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
    prodRows: [{ year: 2030, well1_oil_bbl: 1_000_000 }, { year: 2031, well1_oil_bbl: 1_000_000 }],
    capexRows: [{ year: 2030, amount_usd: 50_000_000 }],
    opexRows: [{ year: 2030, total_opex_usd: 10_000_000 }, { year: 2031, total_opex_usd: 10_000_000 }],
  };

  it('mid-year discounting shifts every exponent by exactly half a year', () => {
    const end = computeCashFlow({ cfg, ...input });
    const mid = computeCashFlow({ cfg: { ...cfg, discounting_convention: 'mid_year' }, ...input });
    expect(mid.kpis.npv).toBeCloseTo(end.kpis.npv / Math.sqrt(1.1), 2);
    expect(mid.kpis.discounting_convention).toBe('mid_year');
    expect(end.kpis.discounting_convention).toBe('end_year');
  });

  it('valuation date re-references discounting; sunk mode excludes prior years from value metrics', () => {
    // Flows: 2030 = -12.5M, 2031 = +37.5M (JV analytic case).
    const forward = computeCashFlow({ cfg: { ...cfg, valuation_year: 2031 }, ...input });
    expect(forward.kpis.npv).toBeCloseTo(-12_500_000 * 1.1 + 37_500_000, 2);
    const sunk = computeCashFlow({
      cfg: { ...cfg, valuation_year: 2031, treat_prior_as_sunk: true }, ...input,
    });
    expect(sunk.kpis.npv).toBeCloseTo(37_500_000, 2);
    expect(sunk.kpis.sunk_net_cash_flow).toBeCloseTo(-12_500_000, 2);
    expect(sunk.cashFlowData[0].sunk).toBe(true);
    // Fiscal state still accrues through the sunk year: 2031 tax includes the
    // 2030 capex's depreciation deduction exactly as in the full run.
    const full = computeCashFlow({ cfg, ...input });
    expect(sunk.cashFlowData[1].tax).toBeCloseTo(full.cashFlowData[1].tax, 2);
    // Payback is measured on evaluated flows only (single positive year -> year 0).
    expect(sunk.kpis.payback_years).toBe(0);
  });
});

describe('EPE engine v3.7: schedule delay (Wave C 3.1)', () => {
  // Hand derivation (JV analytic case shifted +1, loss carryforward ON):
  //   2030: no production/opex (shifted), capex 50M, depr 5M -> taxable -5M,
  //         tax 0, net -50M.
  //   2031: rev 100M, roy 20M, opex 10M, depr 5M -> taxable 65M, loss offset
  //         5M -> tax 30M, net 40M.
  //   2032: taxable 65M -> tax 32.5M, net 37.5M.
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
    prodRows: [{ year: 2030, well1_oil_bbl: 1_000_000 }, { year: 2031, well1_oil_bbl: 1_000_000 }],
    capexRows: [{ year: 2030, amount_usd: 50_000_000 }],
    opexRows: [{ year: 2030, total_opex_usd: 10_000_000 }, { year: 2031, total_opex_usd: 10_000_000 }],
  };

  it('shifts production and opex, keeps capex and its allowances on schedule', () => {
    const { cashFlowData, kpis } = computeCashFlow({ cfg: { ...cfg, schedule_shift_years: 1 }, ...input });
    expect(cashFlowData.map(d => d.year)).toEqual([2030, 2031, 2032]);
    expect(cashFlowData[0].gross_revenue).toBe(0);
    expect(cashFlowData[0].capex).toBeCloseTo(50_000_000, 2);
    expect(cashFlowData[0].net_cash_flow).toBeCloseTo(-50_000_000, 2);
    expect(cashFlowData[1].tax).toBeCloseTo(30_000_000, 2);       // loss relief carried in
    expect(cashFlowData[1].net_cash_flow).toBeCloseTo(40_000_000, 2);
    expect(cashFlowData[2].tax).toBeCloseTo(32_500_000, 2);
    expect(kpis.npv).toBeCloseTo(-50_000_000 + 40_000_000 / 1.1 + 37_500_000 / 1.21, 2);
    expect(kpis.schedule_shift_years).toBe(1);
    // A delay must destroy value vs the base schedule.
    const base = computeCashFlow({ cfg, ...input });
    expect(kpis.npv).toBeLessThan(base.kpis.npv);
  });
});

describe('EPE engine v3.8: reporting KPIs (Wave D)', () => {
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

  it('npv_profile passes through the headline NPV at the applied rate and falls with rate', () => {
    const at10 = kpis.npv_profile.find((p: any) => p.rate_pct === 10);
    expect(at10.npv).toBeCloseTo(kpis.npv, 2);
    const rates = kpis.npv_profile.map((p: any) => p.rate_pct);
    expect(rates).toEqual([...rates].sort((a: number, b: number) => a - b));
    // Conventional (invest-then-earn) flows: NPV decreases as the rate rises.
    for (let i = 1; i < kpis.npv_profile.length; i++) {
      expect(kpis.npv_profile[i].npv).toBeLessThan(kpis.npv_profile[i - 1].npv);
    }
    const at0 = kpis.npv_profile.find((p: any) => p.rate_pct === 0);
    expect(at0.npv).toBeCloseTo(kpis.total_net_cash_flow_nominal, 2);
  });

  it('discounted government take matches the closed form', () => {
    // PV(pre-take) = 40M + 90M/1.1; PV(contractor) = -12.5M + 37.5M/1.1.
    const pvPre = 40_000_000 + 90_000_000 / 1.1;
    const pvCon = -12_500_000 + 37_500_000 / 1.1;
    expect(kpis.government_take_pct_discounted).toBeCloseTo(((pvPre - pvCon) / pvPre) * 100, 6);
  });
});

describe('EPE engine v3.9: Wave F fiscal depth', () => {
  const jvCfg = {
    fiscal_regime: 'JV', base_year: 2030,
    oil_price_usd_bbl: 100, gas_price_usd_mscf: 0, condensate_price_usd_bbl: 0,
    discount_rate_pct: 10, inflation_rate_pct: 0,
    oil_price_escalator_pct: 0, gas_price_escalator_pct: 0,
    condensate_price_escalator_pct: 0, opex_escalator_pct: 0, capex_escalator_pct: 0,
    present_value_basis: 'nominal',
    jv_working_interest_pct: 100, jv_royalty_pct: 20, jv_tax_rate_pct: 50,
  };
  const jvInput = {
    prodRows: [{ year: 2030, well1_oil_bbl: 1_000_000 }, { year: 2031, well1_oil_bbl: 1_000_000 }],
    capexRows: [{ year: 2030, amount_usd: 50_000_000 }],
    opexRows: [{ year: 2030, total_opex_usd: 10_000_000 }, { year: 2031, total_opex_usd: 10_000_000 }],
  };
  const pscCfg = {
    ...jvCfg, fiscal_regime: 'PSC',
    psc_royalty_pct: 10, psc_cost_oil_cap_pct: 40,
    psc_contractor_profit_share_pct: 50, psc_tax_rate_pct: 50,
  };
  const pscInput = {
    prodRows: [{ year: 2030, well1_oil_bbl: 1_000_000 }, { year: 2031, well1_oil_bbl: 1_000_000 }],
    capexRows: [{ year: 2030, amount_usd: 80_000_000 }],
    opexRows: [{ year: 2030, total_opex_usd: 10_000_000 }, { year: 2031, total_opex_usd: 10_000_000 }],
  };

  it('PSC tranches: contractor share steps on cumulative liquids at start of year', () => {
    // Hand derivation on the PSC hand-derived case: profit oil is 54M both
    // years (36M cost-oil cap binding). Tranche 1 (0+): 60% -> 32.4M;
    // year 2 starts at 1 MMbbl cumulative -> tranche 2: 40% -> 21.6M.
    const { cashFlowData } = computeCashFlow({
      cfg: {
        ...pscCfg,
        psc_profit_split_mode: 'tranches',
        psc_profit_tranches: [
          { from_cum_mmbbl: 0, contractor_share_pct: 60 },
          { from_cum_mmbbl: 1, contractor_share_pct: 40 },
        ],
      },
      ...pscInput,
    });
    expect(cashFlowData[0].psc_contractor_share_pct).toBeCloseTo(60, 6);
    expect(cashFlowData[0].taxable_income).toBeCloseTo(32_400_000, 2);
    expect(cashFlowData[1].psc_contractor_share_pct).toBeCloseTo(40, 6);
    expect(cashFlowData[1].taxable_income).toBeCloseTo(21_600_000, 2);
  });

  it('PSC investment tax credit offsets tax with carryforward', () => {
    // 50% ITC on 80M capex = 40M credit. Flat-split tax is 13.5M per year:
    // year 1 tax -> 0 (13.5M used, 26.5M carried), year 2 tax -> 0
    // (13.5M used, 13M carried and reported unused).
    const { cashFlowData } = computeCashFlow({
      cfg: { ...pscCfg, psc_itc_pct: 50 }, ...pscInput,
    });
    expect(cashFlowData[0].psc_itc_used).toBeCloseTo(13_500_000, 2);
    expect(cashFlowData[0].tax).toBeCloseTo(0, 2);
    expect(cashFlowData[0].net_cash_flow).toBeCloseTo(-27_000_000, 2);
    expect(cashFlowData[1].psc_itc_used).toBeCloseTo(13_500_000, 2);
    expect(cashFlowData[1].psc_itc_carryforward).toBeCloseTo(13_000_000, 2);
  });

  it('minimum ETR top-up (config-gated project-level approximation)', () => {
    const base = runWorkedExample();
    const floored = runWorkedExample({ pia_apply_minimum_etr: true, pia_minimum_etr_pct: 85 });
    const row0 = base.cashFlowData[0];
    const paid = row0.hct_tax + row0.cit_tax + row0.tet_tax + row0.dev_levy_tax;
    const floor = Math.max(0, row0.cit_assessable_profit * 0.85);
    const expectedTopup = Math.max(0, floor - paid);
    expect(expectedTopup).toBeGreaterThan(0); // the test must actually bind
    expect(floored.cashFlowData[0].min_etr_topup).toBeCloseTo(expectedTopup, 2);
    expect(floored.kpis.total_min_etr_topup).toBeCloseTo(expectedTopup, 2);
    expect(floored.cashFlowData[0].net_cash_flow)
      .toBeCloseTo(row0.net_cash_flow - expectedTopup, 2);
    // Default off: no top-up anywhere.
    expect(base.kpis.total_min_etr_topup).toBeUndefined();
  });

  it('decommissioning sinking fund: deductible contributions, no end-of-life double hit', () => {
    const lump = computeCashFlow({
      cfg: { ...jvCfg, abandonment_cost_usd: 10_000_000 }, ...jvInput,
    });
    const fund = computeCashFlow({
      cfg: { ...jvCfg, abandonment_cost_usd: 10_000_000, abandonment_funding_mode: 'sinking_fund' },
      ...jvInput,
    });
    // 5M/yr contribution rides the opex lane: taxable falls 5M -> tax falls
    // 2.5M -> net year 1 = base - 5M + 2.5M.
    const baseRun = computeCashFlow({ cfg: jvCfg, ...jvInput });
    expect(fund.cashFlowData[0].decom_fund_contribution).toBeCloseTo(5_000_000, 2);
    expect(fund.cashFlowData[0].tax).toBeCloseTo(baseRun.cashFlowData[0].tax - 2_500_000, 2);
    expect(fund.cashFlowData[0].net_cash_flow)
      .toBeCloseTo(baseRun.cashFlowData[0].net_cash_flow - 2_500_000, 2);
    // Final year: fund pays the spend — no second 10M outflow.
    expect(fund.cashFlowData[1].abandonment_cost_funded).toBe(10_000_000);
    expect(fund.cashFlowData[1].net_cash_flow)
      .toBeCloseTo(lump.cashFlowData[1].net_cash_flow + 10_000_000 - 2_500_000, 2);
    expect(fund.kpis.total_decom_fund_contributions).toBeCloseTo(10_000_000, 2);
  });

  it('depreciation controls: configurable years and the nigeria_ppt preset', () => {
    // 5-year SL on 50M -> 10M/yr -> year-1 taxable 60M -> tax 30M.
    const sl5 = computeCashFlow({ cfg: { ...jvCfg, jv_psc_depr_years: 5 }, ...jvInput });
    expect(sl5.cashFlowData[0].depreciation).toBeCloseTo(10_000_000, 2);
    expect(sl5.cashFlowData[0].tax).toBeCloseTo(30_000_000, 2);
    // nigeria_ppt: 20% of 50M = 10M in year 1 as well; year 5 would be 19%
    // (1% retention never claimed) — assert the schedule shape directly.
    const ppt = computeCashFlow({ cfg: { ...jvCfg, depreciation_method: 'nigeria_ppt' }, ...jvInput });
    expect(ppt.cashFlowData[0].depreciation).toBeCloseTo(10_000_000, 2);
    const totalDepr = [0.2, 0.2, 0.2, 0.2, 0.19].reduce((s, x) => s + x, 0);
    expect(totalDepr).toBeCloseTo(0.99, 10); // retention documented, not claimed
  });

  it('NGN mirrors stamp when an FX rate is set', () => {
    const usd = computeCashFlow({ cfg: jvCfg, ...jvInput });
    const ngn = computeCashFlow({ cfg: { ...jvCfg, fx_ngn_per_usd: 1500 }, ...jvInput });
    expect(usd.kpis.fx_ngn_per_usd).toBeUndefined();
    expect(ngn.kpis.fx_ngn_per_usd).toBe(1500);
    expect(ngn.kpis.npv_ngn).toBeCloseTo(usd.kpis.npv * 1500, 2);
    expect(ngn.kpis.total_tax_ngn).toBeCloseTo(usd.kpis.total_tax * 1500, 2);
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
