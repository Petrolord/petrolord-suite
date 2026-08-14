// Jest acceptance gate for the EPE cash flow engine.
//
// The full narrative harness (run manually, with derivations in comments) is
// tools/validation/epe-validation.ts — this file re-asserts its key numbers so
// CI fails on any engine regression. The two must stay in agreement; if you
// change one, change the other. Plan of record: docs/scope/Economics-ROADMAP.md
// phase D1. Regression contract: docs/scope/EPE.md §6.7/§7.

import { computeCashFlow } from '../epe-engine.ts';
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
