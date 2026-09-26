// EPE PIA 2021 worked example: frozen validation fixture
// ======================================================
//
// LEGACY-SWITCH GOLDEN since engines 3.12.0 (EC7, owner decision D1,
// 2026-09-26). PIA_WORKED_EXAMPLE_CFG carries pia_legacy_pre_audit: true and
// pins the pre-audit engine, which departs from the gazetted PIA 2021 and the
// Petroleum Royalty Regulations 2022 (packages/engines/tools/validation/
// economics/AUDIT-PIA-2021.md; its 182,500,000 production royalty is 12.5%
// flat where Regulations r.13(2)(d) give 11.25% at 50,000 bopd). It mirrors
// packages/engines/test-data/economics/fixtures/pia-worked-example.json.
//
// The DEFAULT-path reference is the same inputs without the switch and with
// the TET rate left to the statute (PIA_WORKED_EXAMPLE_DEFAULT_CFG below),
// pinned by the independent oracle oracle_pia2021.py in
// packages/engines/test-data/economics/goldens/pia2021_cases.json (case
// worked_example_inputs_default).
//
// Inputs: a verbatim local copy of the shared-DB validation case, so the
// regression contract does not depend on database access:
//   epe_run_configs.id  53828290-e35b-47b1-9779-5a71434d55e4
//   epe_cases.id        c17087c1-6cc4-4c84-908b-491004f0ec2f
// Snapshot taken 2026-08-14 (D1, docs/scope/Economics-ROADMAP.md).
//
// Case: shallow-water PML, converted lease, $80 oil flat, 18.25 MMbbl in
// 2025 (12 equal months), $300MM capex, $182.5MM opex, 10% discount,
// 3% inflation, real PV basis, PIA-only framework (base_year 2025).
//
// REGRESSION CONTRACT (EPE.md section 7, re-frozen 2026-09-26):
//   default path  NPV 141,236,909.83 (within $0.01) and the default line items
//   legacy switch NPV 135,185,570.34 (within $0.01) and the legacy line items

export const PIA_WORKED_EXAMPLE_CFG = {
  oil_price_usd_bbl: 80,
  gas_price_usd_mscf: 4.5,
  condensate_price_usd_bbl: 70,
  discount_rate_pct: 10,
  inflation_rate_pct: 3,
  base_year: 2025,
  fiscal_regime: 'PIA',
  pia_legacy_pre_audit: true,
  jv_working_interest_pct: 100,
  jv_royalty_pct: 10,
  jv_tax_rate_pct: 50,
  psc_royalty_pct: 10,
  psc_cost_oil_cap_pct: 80,
  psc_contractor_profit_share_pct: 50,
  psc_tax_rate_pct: 50,
  oil_price_escalator_pct: 0,
  gas_price_escalator_pct: 0,
  condensate_price_escalator_pct: 0,
  opex_escalator_pct: 0,
  capex_escalator_pct: 0,
  present_value_basis: 'real',
  pia_terrain: 'shallow_water',
  pia_license_type: 'PML',
  pia_lease_status: 'converted',
  pia_water_depth_m: 100,
  pia_marginal_field_pre_2021: false,
  pia_hct_rate_override_pct: null,
  pia_cit_rate_pct: 30,
  pia_tet_rate_pct: 2.5,
  pia_nddc_levy_pct_of_opex: 3,
  pia_nddc_levy_fixed_usd: 15000000,
  pia_prior_year_opex_usd: 170000000,
  pia_capex_recovery_years: 5,
  pia_cpr_limit_pct: 65,
  pia_production_allowance_per_bbl_converted: 2.5,
  pia_production_allowance_per_bbl_new: 8,
  pia_production_allowance_pct_of_price: 20,
  pia_under_nta_2025_override: 'auto',
  pia_deep_offshore_hct_interpretation: 'conservative_zero',
  pia_deep_offshore_hct_custom_rate_pct: null,
  pia_development_levy_rate_pct: 4,
  pia_apply_minimum_etr: false,
  pia_minimum_etr_pct: 15,
  pia_new_lease_prod_alw_cap_onshore_bbl: 50000000,
  pia_new_lease_prod_alw_cap_shallow_bbl: 100000000,
  pia_new_lease_prod_alw_cap_deep_bbl: 500000000,
  pia_prior_cumulative_oil_bbl: 0,
};

// 12 equal months of 1,520,833 bbl with the December remainder making the
// year total exactly 18,250,000 bbl (as in pia_test_production.csv).
export const PIA_WORKED_EXAMPLE_PROD = Array.from({ length: 12 }, (_, i) => ({
  date: `2025-${String(i + 1).padStart(2, '0')}-01`,
  month_index: i + 1,
  well1_oil_bbl: i === 11 ? 1520837 : 1520833,
}));

export const PIA_WORKED_EXAMPLE_CAPEX = [
  { date: '2025-01-01', category: 'Drilling', amount_usd: 300000000, month_index: 1 },
];

export const PIA_WORKED_EXAMPLE_OPEX = [
  { date: '2025-01-01', month_index: 1, total_opex_usd: 182500000 },
];

// Expected 2025 line items (USD) on the LEGACY switch. Derived from the
// pre-audit engine run; no citation of a published worked example was ever
// recorded (AUDIT-PIA-2021.md section 4).
export const PIA_WORKED_EXAMPLE_EXPECTED = {
  npv: 135185570.34,
  line_items: {
    gross_revenue: 1460000000,
    production_royalty: 182500000,
    price_royalty: 34905145.75989686,
    royalty: 217405145.75989687,
    hcdt: 5100000,
    nddc: 15000000,
    hct_assessable_profit: 1054994854.2401032,
    production_allowance: 45625000,
    hct_chargeable_profit: 949369854.2401032,
    hct_tax: 284810956.27203095,
    cit_assessable_profit: 1039994854.2401032,
    cit_chargeable_profit: 979994854.2401032,
    cit_tax: 293998456.27203095,
    tet_tax: 25999871.356002584,
    dev_levy_tax: 0,
    tax: 604809283.9000645,
    cpr_cap: 949000000,
    cpr_costs_claimed: 242500000,
    cpr_deferred_to_next: 0,
    depreciation: 60000000,
    net_cash_flow: 135185570.34003878,
  },
};

// The default path: the same inputs without the legacy switch and without
// pia_tet_rate_pct, so the statutory 3% applies (Finance Act 2023 s.26).
const { pia_legacy_pre_audit: _legacy, pia_tet_rate_pct: _tet, ...DEFAULT_INPUTS } = PIA_WORKED_EXAMPLE_CFG;
export const PIA_WORKED_EXAMPLE_DEFAULT_CFG = DEFAULT_INPUTS;

// Expected 2025 line items (USD) on the default path, from oracle_pia2021.py
// (pia2021_cases.json, worked_example_inputs_default; FINDINGS-pia2021.md
// section 4). Shallow water at 50,000 bopd: 5% / 7.5% / 12.5% weighted to
// 11.25% (Royalty Regulations r.13(2)(d)); royalty by price on the Regulations
// benchmarks rounded to cents; NDDC in the HCT base; TET 3%; CIT deducts the
// full royalty.
export const PIA_WORKED_EXAMPLE_DEFAULT_EXPECTED = {
  npv: 141236909.83,
  line_items: {
    gross_revenue: 1460000000,
    production_royalty: 164250000,
    liquids_production_royalty: 164250000,
    gas_royalty: 0,
    royalty_rate_liquids: 0.1125,
    royalty_liquids_bopd: 50000,
    price_royalty: 34908351.810790844,
    royalty: 199158351.81079084,
    hcdt: 5100000,
    nddc: 15000000,
    hct_assessable_profit: 1058241648.1892092,
    production_allowance: 45625000,
    hct_chargeable_profit: 952616648.1892092,
    hct_rate: 0.3,
    hct_tax: 285784994.45676273,
    cit_assessable_profit: 1058241648.1892092,
    cit_chargeable_profit: 998241648.1892092,
    cit_tax: 299472494.45676273,
    tet_rate_pct: 3,
    tet_tax: 31747249.44567628,
    dev_levy_tax: 0,
    tax: 617004738.3592018,
    cpr_cap: 949000000,
    cpr_costs_claimed: 242500000,
    cpr_deferred_to_next: 0,
    depreciation: 60000000,
    net_cash_flow: 141236909.83000743,
  },
};
