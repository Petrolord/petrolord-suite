#!/usr/bin/env node
/**
 * EPE Cash Flow Engine — Validation Harness (D1)
 * ==============================================
 *
 * Path in repo:  tools/validation/epe-validation.ts
 * Engine under test:  supabase/functions/_shared/epe-engine.ts
 * Plan of record:  docs/scope/Economics-ROADMAP.md (phase D1)
 *
 * Run:
 *   cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite
 *   npx tsx tools/validation/epe-validation.ts
 *
 * Cases:
 *   1. PIA 2021 worked example (regression contract, EPE.md §6.7/§7):
 *      inputs frozen from the byte-validated shared-DB case; NPV must be
 *      $135,185,570.34 (±$0.01) and every line item within $0.01.
 *   2. JV analytic case: two years with round numbers; royalty, tax,
 *      net cash flow, NPV, IRR, and payback all hand-derived in
 *      closed form in the comments below.
 *   3. PSC cost-recovery carryforward: hand-derived two-year case where
 *      year-2 cost oil is dominated by the year-1 unrecovered pool; the
 *      expected numbers only come out if carryforward works.
 *   4. NTA 2025 vs PIA framework switch: same inputs run under
 *      force_pia and force_nta must differ ONLY by TET (2.5%) vs
 *      Development Levy (4%) on the same assessable-profit base.
 *   5. Production allowance volume cap, mid-year crossing (EPE.md §4.1):
 *      new shallow-water lease at 99 MMbbl prior cumulative crosses the
 *      100 MMbbl Sixth Schedule cap mid-year; the eligible-bbl split and
 *      subsequent-year zero allowance are asserted exactly.
 *   6. CPR cessation forfeiture (EPE.md §4.1): a case ending with an
 *      unrecovered CPR pool must flag the forfeited amount on the final
 *      year row and in KPIs.
 *
 * Exit code 0 on full pass, 1 on any failure.
 */

import { computeCashFlow } from '../../supabase/functions/_shared/epe-engine.ts';
import {
  PIA_WORKED_EXAMPLE_CFG,
  PIA_WORKED_EXAMPLE_PROD,
  PIA_WORKED_EXAMPLE_CAPEX,
  PIA_WORKED_EXAMPLE_OPEX,
  PIA_WORKED_EXAMPLE_EXPECTED,
} from './fixtures/epe-pia-worked-example.ts';

let passCount = 0;
let failCount = 0;
const failures: string[] = [];

function check(label: string, actual: number | string | boolean | null | undefined, expected: number | string | boolean, tolAbs = 0.01) {
  let ok: boolean;
  let detail: string;
  if (typeof expected === 'number') {
    ok = typeof actual === 'number' && Math.abs(actual - expected) <= tolAbs;
    detail = `expected ${expected} ±${tolAbs}, got ${actual}`;
  } else {
    ok = actual === expected;
    detail = `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
  }
  if (ok) {
    passCount++;
    console.log(`  PASS  ${label}`);
  } else {
    failCount++;
    failures.push(`${label}: ${detail}`);
    console.log(`  FAIL  ${label}  (${detail})`);
  }
}

// ============================================================================
// CASE 1 — PIA WORKED EXAMPLE REGRESSION
// ============================================================================
console.log('\n=== Case 1: PIA 2021 worked example (regression contract) ===');
{
  const { cashFlowData, kpis } = computeCashFlow({
    cfg: PIA_WORKED_EXAMPLE_CFG,
    prodRows: PIA_WORKED_EXAMPLE_PROD,
    capexRows: PIA_WORKED_EXAMPLE_CAPEX,
    opexRows: PIA_WORKED_EXAMPLE_OPEX,
  });
  check('NPV = $135,185,570.34', kpis.npv, PIA_WORKED_EXAMPLE_EXPECTED.npv, 0.01);
  check('fiscal_framework = pia_only', kpis.fiscal_framework, 'pia_only');
  check('total_dev_levy = 0 (PIA-only invariant)', kpis.total_dev_levy, 0, 1e-9);
  const row = cashFlowData[0];
  for (const [k, v] of Object.entries(PIA_WORKED_EXAMPLE_EXPECTED.line_items)) {
    check(`2025 ${k}`, row[k], v as number, 0.01);
  }
}

// ============================================================================
// CASE 2 — JV ANALYTIC (closed form)
// ============================================================================
// cfg: WI 100%, royalty 20%, tax 50%, $100 oil flat, 10% discount,
// zero inflation/escalation, nominal PV basis, JV depreciation life 10y.
// 2030: 1,000,000 bbl -> gross 100M; capex 50M (depr 5M/yr); opex 10M.
//   royalty = 20M; taxable = 100-20-10-5 = 65M; tax = 32.5M
//   net = 100-20-10-50-32.5 = -12.5M
// 2031: same volumes/opex, no capex, depr 5M.
//   taxable = 65M; tax = 32.5M; net = 100-20-10-32.5 = +37.5M
// NPV(10%, t = year-2030) = -12.5M + 37.5M/1.1 = 21,590,909.0909...
// IRR: -12.5 + 37.5/(1+r) = 0 -> r = 2.0 (200%)
// Payback: crosses zero in year 2 at fraction 12.5/37.5 -> "1.33 years"
console.log('\n=== Case 2: JV analytic case (hand-derived closed form) ===');
{
  const cfg = {
    fiscal_regime: 'JV',
    base_year: 2030,
    oil_price_usd_bbl: 100,
    gas_price_usd_mscf: 0,
    condensate_price_usd_bbl: 0,
    discount_rate_pct: 10,
    inflation_rate_pct: 0,
    oil_price_escalator_pct: 0,
    gas_price_escalator_pct: 0,
    condensate_price_escalator_pct: 0,
    opex_escalator_pct: 0,
    capex_escalator_pct: 0,
    present_value_basis: 'nominal',
    jv_working_interest_pct: 100,
    jv_royalty_pct: 20,
    jv_tax_rate_pct: 50,
  };
  const prodRows = [
    { year: 2030, well1_oil_bbl: 1_000_000 },
    { year: 2031, well1_oil_bbl: 1_000_000 },
  ];
  const capexRows = [{ year: 2030, amount_usd: 50_000_000 }];
  const opexRows = [
    { year: 2030, total_opex_usd: 10_000_000 },
    { year: 2031, total_opex_usd: 10_000_000 },
  ];
  const { cashFlowData, kpis } = computeCashFlow({ cfg, prodRows, capexRows, opexRows });
  check('2030 royalty = 20M', cashFlowData[0].royalty, 20_000_000);
  check('2030 taxable = 65M', cashFlowData[0].taxable_income, 65_000_000);
  check('2030 tax = 32.5M', cashFlowData[0].tax, 32_500_000);
  check('2030 net = -12.5M', cashFlowData[0].net_cash_flow, -12_500_000);
  check('2031 net = +37.5M', cashFlowData[1].net_cash_flow, 37_500_000);
  check('NPV = 21,590,909.09', kpis.npv, -12_500_000 + 37_500_000 / 1.1, 0.01);
  check('IRR = 200%', kpis.irr, 200, 0.001);
  check('payback = "1.33 years"', kpis.payback, '1.33 years');
}

// ============================================================================
// CASE 3 — PSC COST-RECOVERY CARRYFORWARD (hand-derived)
// ============================================================================
// cfg: royalty 10%, cost oil cap 40% of post-royalty revenue, contractor
// profit share 50%, tax 50%, $100 oil flat, nominal basis, no escalation.
// 2030: gross 100M; capex 80M; opex 10M.
//   royalty 10M; rev after royalty 90M; recoverable = 80+10 = 90M
//   cost oil cap = 0.4*90 = 36M -> recovery 36M, CARRY FORWARD 54M
//   profit oil = 90-36 = 54M; contractor 27M; tax 13.5M
//   net = 36 + 27 - 13.5 - 80 - 10 = -40.5M
// 2031: gross 100M; opex 10M; no capex.
//   recoverable = 54 (carry) + 10 = 64M; cap 36M -> recovery 36M, carry 28M
//   profit oil = 54M; contractor 27M; tax 13.5M
//   net = 36 + 27 - 13.5 - 10 = +39.5M
// Without carryforward, 2031 recoverable would be 10M (< cap) and net
// would differ; these numbers only come out if the pool carries.
console.log('\n=== Case 3: PSC unrecovered-cost carryforward (hand-derived) ===');
{
  const cfg = {
    fiscal_regime: 'PSC',
    base_year: 2030,
    oil_price_usd_bbl: 100,
    gas_price_usd_mscf: 0,
    condensate_price_usd_bbl: 0,
    discount_rate_pct: 10,
    inflation_rate_pct: 0,
    oil_price_escalator_pct: 0,
    gas_price_escalator_pct: 0,
    condensate_price_escalator_pct: 0,
    opex_escalator_pct: 0,
    capex_escalator_pct: 0,
    present_value_basis: 'nominal',
    psc_royalty_pct: 10,
    psc_cost_oil_cap_pct: 40,
    psc_contractor_profit_share_pct: 50,
    psc_tax_rate_pct: 50,
  };
  const prodRows = [
    { year: 2030, well1_oil_bbl: 1_000_000 },
    { year: 2031, well1_oil_bbl: 1_000_000 },
  ];
  const capexRows = [{ year: 2030, amount_usd: 80_000_000 }];
  const opexRows = [
    { year: 2030, total_opex_usd: 10_000_000 },
    { year: 2031, total_opex_usd: 10_000_000 },
  ];
  const { cashFlowData, kpis } = computeCashFlow({ cfg, prodRows, capexRows, opexRows });
  check('2030 royalty = 10M', cashFlowData[0].royalty, 10_000_000);
  check('2030 contractor profit oil = 27M', cashFlowData[0].taxable_income, 27_000_000);
  check('2030 tax = 13.5M', cashFlowData[0].tax, 13_500_000);
  check('2030 net = -40.5M', cashFlowData[0].net_cash_flow, -40_500_000);
  check('2031 contractor profit oil = 27M (carry consumed)', cashFlowData[1].taxable_income, 27_000_000);
  check('2031 net = +39.5M', cashFlowData[1].net_cash_flow, 39_500_000);
  check('NPV = -4,590,909.09', kpis.npv, -40_500_000 + 39_500_000 / 1.1, 0.01);
}

// ============================================================================
// CASE 4 — NTA 2025 FRAMEWORK SWITCH (TET vs Development Levy)
// ============================================================================
// Same worked-example inputs run under force_pia and force_nta. The only
// framework-dependent lines for a shallow-water PML are TET (2.5%) vs
// Development Levy (4%), both on cit_assessable_profit. Therefore:
//   dev_levy / tet = 4 / 2.5 = 1.6 exactly
//   net cash flow (NTA) = net (PIA) + tet - dev_levy
console.log('\n=== Case 4: NTA 2025 framework switch (TET vs Dev Levy) ===');
{
  const runWith = (override: string) => computeCashFlow({
    cfg: { ...PIA_WORKED_EXAMPLE_CFG, pia_under_nta_2025_override: override },
    prodRows: PIA_WORKED_EXAMPLE_PROD,
    capexRows: PIA_WORKED_EXAMPLE_CAPEX,
    opexRows: PIA_WORKED_EXAMPLE_OPEX,
  });
  const pia = runWith('force_pia');
  const nta = runWith('force_nta');
  check('force_pia framework', pia.kpis.fiscal_framework, 'pia_only');
  check('force_nta framework', nta.kpis.fiscal_framework, 'nta_2025');
  check('NTA total_tet = 0 (invariant)', nta.kpis.total_tet, 0, 1e-9);
  check('PIA total_dev_levy = 0 (invariant)', pia.kpis.total_dev_levy, 0, 1e-9);
  const tet = pia.cashFlowData[0].tet_tax;
  const dev = nta.cashFlowData[0].dev_levy_tax;
  check('dev_levy = 1.6 x tet (same assessable base)', dev, tet * 1.6, 0.01);
  check('cit_assessable identical across frameworks', nta.cashFlowData[0].cit_assessable_profit, pia.cashFlowData[0].cit_assessable_profit, 0.01);
  check('net(NTA) = net(PIA) + tet - dev_levy', nta.cashFlowData[0].net_cash_flow, pia.cashFlowData[0].net_cash_flow + tet - dev, 0.01);
}

// ============================================================================
// CASE 5 — PRODUCTION ALLOWANCE VOLUME CAP, MID-YEAR CROSSING (§4.1)
// ============================================================================
// New shallow-water lease (cap 100 MMbbl), prior cumulative 99 MMbbl.
// 2025 production 2 MMbbl crosses the cap mid-year:
//   eligible = 1 MMbbl, allowance = min(20% x $80, $8/bbl new) x 1M = $8M
// 2026 production 1 MMbbl: capacity exhausted -> eligible 0, allowance 0.
console.log('\n=== Case 5: production allowance cap mid-year crossing ===');
{
  const cfg = {
    ...PIA_WORKED_EXAMPLE_CFG,
    pia_lease_status: 'new',
    pia_prior_cumulative_oil_bbl: 99_000_000,
  };
  const prodRows = [
    { year: 2025, well1_oil_bbl: 2_000_000 },
    { year: 2026, well1_oil_bbl: 1_000_000 },
  ];
  const capexRows = [{ year: 2025, amount_usd: 50_000_000 }];
  const opexRows = [
    { year: 2025, total_opex_usd: 20_000_000 },
    { year: 2026, total_opex_usd: 20_000_000 },
  ];
  const { cashFlowData } = computeCashFlow({ cfg, prodRows, capexRows, opexRows });
  const y0 = cashFlowData[0];
  const y1 = cashFlowData[1];
  check('2025 eligible bbl = 1,000,000 (split at cap)', y0.prod_alw_eligible_bbl, 1_000_000, 1e-6);
  check('2025 allowance = $8M ($8/bbl on eligible only)', y0.production_allowance, 8_000_000);
  check('2025 cap_applied = true', y0.prod_alw_cap_applied, true);
  check('2025 cumulative lifetime = 101 MMbbl', y0.cumulative_oil_bbl_lifetime, 101_000_000, 1e-6);
  check('2026 eligible bbl = 0 (capacity exhausted)', y1.prod_alw_eligible_bbl, 0, 1e-9);
  check('2026 allowance = 0', y1.production_allowance, 0, 1e-9);
  check('2026 cap_applied = true', y1.prod_alw_cap_applied, true);
  check('2026 cumulative lifetime = 102 MMbbl', y1.cumulative_oil_bbl_lifetime, 102_000_000, 1e-6);
  check('HCT chargeable = assessable - cap allowance claimed - prod allowance',
    y0.hct_chargeable_profit,
    y0.hct_assessable_profit - (y0.cpr_costs_claimed - Math.min(y0.opex, y0.cpr_costs_claimed)) - y0.production_allowance,
    0.01);
}

// ============================================================================
// CASE 6 — CPR CESSATION FORFEITURE (§4.1)
// ============================================================================
// Converted shallow-water lease, single-year project:
//   gross = 1 MMbbl x $80 = 80M; opex 40M; capex 100M over 5y -> 20M/yr
//   recoverable = 40 + 20 = 60M; CPR cap = 65% x 80M = 52M
//   claimed 52M (opex first: 40M opex + 12M capital allowance)
//   deferred 8M -> project ends -> 8M forfeited, flagged on final row + KPIs
console.log('\n=== Case 6: CPR cessation forfeiture diagnostic ===');
{
  const cfg = { ...PIA_WORKED_EXAMPLE_CFG };
  const prodRows = [{ year: 2025, well1_oil_bbl: 1_000_000 }];
  const capexRows = [{ year: 2025, amount_usd: 100_000_000 }];
  const opexRows = [{ year: 2025, total_opex_usd: 40_000_000 }];
  const { cashFlowData, kpis } = computeCashFlow({ cfg, prodRows, capexRows, opexRows });
  const row = cashFlowData[0];
  check('CPR cap = 52M (65% of 80M gross)', row.cpr_cap, 52_000_000);
  check('CPR claimed = 52M', row.cpr_costs_claimed, 52_000_000);
  check('CPR deferred = 8M', row.cpr_deferred_to_next, 8_000_000);
  check('final-year forfeiture flag = 8M', row.cpr_forfeited_at_cessation, 8_000_000);
  check('KPI cpr_forfeited_at_cessation = 8M', kpis.cpr_forfeited_at_cessation, 8_000_000);
}

// ============================================================================
// SUMMARY
// ============================================================================
console.log(`\n${'='.repeat(60)}`);
console.log(`EPE validation: ${passCount} passed, ${failCount} failed`);
if (failCount > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
