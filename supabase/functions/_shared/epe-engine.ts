// supabase/functions/_shared/epe-engine.ts
//
// PETROLORD EPE CASH FLOW ENGINE — Shared compute library (v3.2, 2026-05-12)
//
// v3.2 changes (B2.5 — NTA 2025 fiscal framework):
//   - determineFiscalFramework(): date-trigger + per-config override switch
//     between PIA-only and NTA-2025 fiscal frameworks
//   - deriveHctRate() extended for NTA-era deep offshore (three legal
//     interpretations: conservative_zero / aggressive_pml_30 / custom)
//   - applyPIA() splits TET vs Development Levy by framework (TET 2.5% under
//     PIA-only, Dev Levy 4% under NTA — same assessable-profit base, either-or)
//   - Production allowance volume caps for NEW leases (PIA Sixth Schedule):
//     50M onshore / 100M shallow / 500M deep, with mid-year split
//   - CPR cessation forfeiture diagnostic (final-year unrecovered costs flagged)
//   - PIAState extended with cumulative_oil_bbl_lifetime
//
// REGRESSION CONTRACT (preserved from v3.1):
//   Pre-2026 PIA cases with override='auto' produce byte-identical output to v3
//   (PIA worked example NPV 135,185,570.34 unchanged)
//
// NEW CONTRACT:
//   NTA-era cases (year >= 2026 OR override='force_nta') apply Dev Levy 4%
//   instead of TET 2.5%, with the volume-cap and CPR-forfeiture behavior.

// ============================================================================
// TYPES
// ============================================================================

export interface AnnualVolumes {
  year: number;
  oil_bbl: number;
  gas_mscf: number;
  condensate_bbl: number;
  water_bbl: number;
}

export interface RegimeInputs {
  gross_revenue: number;
  capex: number;
  opex: number;
  depreciation: number;
  cumulative_unrecovered_cost: number;
}

export interface RegimeOutputs {
  royalty: number;
  taxable_income: number;
  tax: number;
  net_cash_flow: number;
  cumulative_unrecovered_cost_after: number;
}

export type FiscalFramework = 'pia_only' | 'nta_2025';
export type DeepOffshoreInterpretation = 'conservative_zero' | 'aggressive_pml_30' | 'custom';

export interface PIAConfig {
  pia_terrain: string;
  pia_license_type: string;
  pia_lease_status: string;
  pia_water_depth_m: number | null;
  pia_marginal_field_pre_2021: boolean;
  pia_hct_rate_override_pct: number | null;
  pia_cit_rate_pct: number;
  pia_tet_rate_pct: number;
  pia_nddc_levy_pct_of_opex: number;
  pia_nddc_levy_fixed_usd: number | null;
  pia_prior_year_opex_usd: number | null;
  pia_capex_recovery_years: number;
  pia_cpr_limit_pct: number;
  pia_production_allowance_per_bbl_converted: number;
  pia_production_allowance_per_bbl_new: number;
  pia_production_allowance_pct_of_price: number;
  // B2.5 additions
  pia_under_nta_2025_override?: 'auto' | 'force_pia' | 'force_nta';
  pia_deep_offshore_hct_interpretation?: DeepOffshoreInterpretation;
  pia_deep_offshore_hct_custom_rate_pct?: number | null;
  pia_development_levy_rate_pct?: number;
  pia_apply_minimum_etr?: boolean;
  pia_minimum_etr_pct?: number;
  pia_new_lease_prod_alw_cap_onshore_bbl?: number;
  pia_new_lease_prod_alw_cap_shallow_bbl?: number;
  pia_new_lease_prod_alw_cap_deep_bbl?: number;
  pia_prior_cumulative_oil_bbl?: number;
}

export interface PIAState {
  cpr_carryforward: number;
  prior_year_opex_usd: number;
  cumulative_oil_bbl_lifetime: number;  // B2.5: tracks vol-cap progress
}

export interface PIAInputs {
  year: number;
  oil_bbl: number;
  gas_mscf: number;
  condensate_bbl: number;
  fiscal_oil_price_usd_bbl: number;
  gross_revenue: number;
  oil_and_cond_revenue: number;
  capex_inflated: number;
  opex_inflated: number;
  capital_allowance_this_year: number;
  nddc_levy: number;
}

export interface PIAOutputs {
  production_royalty: number;
  price_royalty: number;
  total_royalties: number;
  hcdt: number;
  nddc: number;
  hct_assessable_profit: number;
  production_allowance: number;
  hct_chargeable_profit: number;
  hct_tax: number;
  cit_assessable_profit: number;
  cit_chargeable_profit: number;
  cit_tax: number;
  tet_tax: number;           // 0 under NTA
  dev_levy_tax: number;      // 0 under PIA-only — B2.5 NEW field
  total_tax: number;
  cpr_cap: number;
  cpr_costs_claimed: number;
  cpr_deferred_to_next: number;
  net_cash_flow: number;
  // B2.5 diagnostic fields
  fiscal_framework: FiscalFramework;
  prod_alw_cap_applied: boolean;
  prod_alw_eligible_bbl: number;
}

export interface ComputeInput {
  cfg: any;
  prodRows: any[];
  capexRows: any[];
  opexRows: any[];
}

export interface ComputeOutput {
  cashFlowData: any[];
  kpis: any;
}

// ============================================================================
// FRAMEWORK DETERMINATION (B2.5)
// ============================================================================

export function determineFiscalFramework(cfg: any): FiscalFramework {
  const override = cfg.pia_under_nta_2025_override ?? 'auto';
  if (override === 'force_pia') return 'pia_only';
  if (override === 'force_nta') return 'nta_2025';
  // 'auto' — date trigger
  const baseYear = cfg.base_year ?? 2027;
  return baseYear >= 2026 ? 'nta_2025' : 'pia_only';
}

// ============================================================================
// VOLUME / COST AGGREGATION (unchanged from v3.1)
// ============================================================================

export function extractAnnualVolumes(prodRows: any[], baseYear: number): AnnualVolumes[] {
  if (!prodRows || prodRows.length === 0) return [];
  const oilCols = Object.keys(prodRows[0]).filter(k => k.endsWith('_oil_bbl'));
  const gasCols = Object.keys(prodRows[0]).filter(k => k.endsWith('_gas_mscf'));
  const condCols = Object.keys(prodRows[0]).filter(k => k.endsWith('_condensate_bbl'));
  const waterCols = Object.keys(prodRows[0]).filter(k => k.endsWith('_water_bbl'));

  const filterPerWell = (cols: string[]) => cols.filter(c => !c.startsWith('total_'));
  const oilPerWell = filterPerWell(oilCols);
  const gasPerWell = filterPerWell(gasCols);
  const condPerWell = filterPerWell(condCols);
  const waterPerWell = filterPerWell(waterCols);

  const annual = new Map<number, AnnualVolumes>();
  for (const row of prodRows) {
    let year: number;
    if (row.year !== undefined && row.year !== null) year = parseInt(String(row.year));
    else if (row.date) year = new Date(row.date).getUTCFullYear();
    else if (row.month_index !== undefined && row.month_index !== null) {
      year = baseYear + Math.floor((parseInt(String(row.month_index)) - 1) / 12);
    } else continue;

    if (!annual.has(year)) annual.set(year, { year, oil_bbl: 0, gas_mscf: 0, condensate_bbl: 0, water_bbl: 0 });
    const a = annual.get(year)!;
    const sumCols = (cols: string[]) => cols.reduce((s, c) => s + (Number(row[c]) || 0), 0);
    a.oil_bbl += sumCols(oilPerWell);
    a.gas_mscf += sumCols(gasPerWell);
    a.condensate_bbl += sumCols(condPerWell);
    a.water_bbl += sumCols(waterPerWell);
  }
  return Array.from(annual.values()).sort((a, b) => a.year - b.year);
}

export function extractAnnualCapex(capexRows: any[], baseYear: number): Map<number, number> {
  return aggregateAnnualUsd(capexRows, baseYear, 'amount_usd');
}

export function extractAnnualOpex(opexRows: any[], baseYear: number): Map<number, number> {
  return aggregateAnnualUsd(opexRows, baseYear, 'total_opex_usd', /_usd$/);
}

function aggregateAnnualUsd(rows: any[], baseYear: number, preferredCol: string, fallbackPattern?: RegExp): Map<number, number> {
  const m = new Map<number, number>();
  if (!rows || rows.length === 0) return m;
  for (const row of rows) {
    let year: number;
    if (row.year !== undefined && row.year !== null) year = parseInt(String(row.year));
    else if (row.date) year = new Date(row.date).getUTCFullYear();
    else if (row.month_index !== undefined && row.month_index !== null) {
      year = baseYear + Math.floor((parseInt(String(row.month_index)) - 1) / 12);
    } else continue;
    let amt = Number(row[preferredCol]) || 0;
    if (amt === 0 && fallbackPattern) {
      amt = Object.keys(row)
        .filter(k => fallbackPattern.test(k) && k !== preferredCol && !k.startsWith('total_'))
        .reduce((s, k) => s + (Number(row[k]) || 0), 0);
    }
    m.set(year, (m.get(year) || 0) + amt);
  }
  return m;
}

// ============================================================================
// JV / PSC REGIMES (unchanged)
// ============================================================================

export function applyJV(inputs: RegimeInputs, workingInterest: number, royaltyRate: number, taxRate: number): RegimeOutputs {
  const wi = workingInterest;
  const gross = inputs.gross_revenue * wi;
  const royalty = gross * royaltyRate;
  const opex = inputs.opex * wi;
  const capex = inputs.capex * wi;
  const depr = inputs.depreciation * wi;
  const taxable = gross - royalty - opex - depr;
  const tax = Math.max(0, taxable * taxRate);
  const net = gross - royalty - opex - capex - tax;
  return { royalty, taxable_income: taxable, tax, net_cash_flow: net, cumulative_unrecovered_cost_after: 0 };
}

export function applyPSC(inputs: RegimeInputs, royaltyRate: number, costOilCapPct: number, contractorProfitShare: number, taxRate: number): RegimeOutputs {
  const gross = inputs.gross_revenue;
  const royalty = gross * royaltyRate;
  const revenueAfterRoyalty = gross - royalty;
  const recoverableThisYear = inputs.cumulative_unrecovered_cost + inputs.capex + inputs.opex;
  const costOilCap = revenueAfterRoyalty * costOilCapPct;
  const costRecovery = Math.min(recoverableThisYear, costOilCap);
  const carryForward = recoverableThisYear - costRecovery;
  const profitOil = revenueAfterRoyalty - costRecovery;
  const contractorProfitOil = profitOil * contractorProfitShare;
  const tax = Math.max(0, contractorProfitOil * taxRate);
  const net = costRecovery + contractorProfitOil - tax - inputs.capex - inputs.opex;
  return { royalty, taxable_income: contractorProfitOil, tax, net_cash_flow: net, cumulative_unrecovered_cost_after: carryForward };
}

// ============================================================================
// PIA RATE DERIVATION
// ============================================================================

// B2.5: extended for NTA-era deep offshore interpretation
export function deriveHctRate(
  terrain: string,
  licenseType: string,
  marginalPre2021: boolean,
  override: number | null,
  framework: FiscalFramework = 'pia_only',
  deepOffshoreInterpretation: DeepOffshoreInterpretation = 'conservative_zero',
  deepOffshoreCustomRatePct: number | null = null,
): number {
  if (override !== null && override !== undefined) return override / 100;

  // Frontier basin: HCT exempt under both PIA and NTA
  if (terrain === 'frontier') return 0;

  // Deep offshore: PIA exempt; NTA ambiguous
  if (terrain === 'deep_offshore') {
    if (framework === 'pia_only') return 0;
    // NTA-era: legal ambiguity per Olaniwun Ajayi (Oct 2025), Fortrose (Jan 2026)
    switch (deepOffshoreInterpretation) {
      case 'conservative_zero': return 0;
      case 'aggressive_pml_30': return 0.30;
      case 'custom':
        return (deepOffshoreCustomRatePct ?? 0) / 100;
      default:
        return 0;
    }
  }

  // Onshore + shallow water + marginal — unchanged between PIA and NTA
  if (marginalPre2021) return 0.15;
  if (licenseType === 'PPL') return 0.15;
  if (licenseType === 'PML') {
    if (terrain === 'onshore' || terrain === 'shallow_water' || terrain === 'marginal_field') return 0.30;
  }
  return 0.30;
}

export function deriveOilRoyaltyRate(terrain: string, oilBopd: number): number {
  switch (terrain) {
    case 'onshore':       return 0.150;
    case 'shallow_water': return 0.125;
    case 'deep_offshore': return oilBopd > 50000 ? 0.075 : 0.050;
    case 'frontier':      return 0.075;
    case 'marginal_field': {
      if (oilBopd <= 5000) return 0.050;
      if (oilBopd <= 10000) return (5000 * 0.050 + (oilBopd - 5000) * 0.075) / oilBopd;
      const blendedFirst10k = (5000 * 0.050 + 5000 * 0.075) / 10000;
      return (10000 * blendedFirst10k + (oilBopd - 10000) * 0.150) / oilBopd;
    }
    default: return 0.150;
  }
}

export function deriveGasRoyaltyRate(terrain: string): number {
  if (terrain === 'deep_offshore' || terrain === 'frontier') return 0.05;
  return 0.07;
}

export function derivePriceRoyaltyRate(fiscalPrice: number, year: number, terrain: string): number {
  if (terrain === 'frontier') return 0;
  const yearsFrom2021 = year - 2021;
  const escFactor = Math.pow(1.02, yearsFrom2021);
  const lowAnchor = 50 * escFactor;
  const midAnchor = 100 * escFactor;
  const highAnchor = 150 * escFactor;
  if (fiscalPrice <= lowAnchor) return 0;
  if (fiscalPrice >= highAnchor) return 0.10;
  if (fiscalPrice <= midAnchor) {
    const fraction = (fiscalPrice - lowAnchor) / (midAnchor - lowAnchor);
    return 0 + fraction * 0.05;
  }
  const fraction = (fiscalPrice - midAnchor) / (highAnchor - midAnchor);
  return 0.05 + fraction * 0.05;
}

// B2.5: extended for volume cap (PIA Sixth Schedule, NEW leases only)
//
// Per Q3(a) — mid-year split: if production crosses the cap mid-year, allowance
// is computed on the eligible bbl only (up to cap), zero on the rest.
//
// Returns: { allowance, eligible_bbl, cap_applied }
export function computeProductionAllowance(
  cfg: PIAConfig,
  oilAndCondBbl: number,
  fiscalPrice: number,
  priorCumulativeOil: number = 0,
): { allowance: number; eligible_bbl: number; cap_applied: boolean } {
  if (oilAndCondBbl <= 0) return { allowance: 0, eligible_bbl: 0, cap_applied: false };

  const pctCap = (cfg.pia_production_allowance_pct_of_price / 100) * fiscalPrice;
  const fixed = cfg.pia_lease_status === 'new'
    ? cfg.pia_production_allowance_per_bbl_new
    : cfg.pia_production_allowance_per_bbl_converted;
  const perBbl = Math.min(pctCap, fixed);

  // CONVERTED leases: no volume cap (Sixth Schedule applies only to new leases)
  if (cfg.pia_lease_status !== 'new') {
    return { allowance: perBbl * oilAndCondBbl, eligible_bbl: oilAndCondBbl, cap_applied: false };
  }

  // NEW lease: apply terrain-specific volume cap
  let terrainCap = 50_000_000;  // default to onshore
  switch (cfg.pia_terrain) {
    case 'onshore':
      terrainCap = cfg.pia_new_lease_prod_alw_cap_onshore_bbl ?? 50_000_000;
      break;
    case 'shallow_water':
    case 'marginal_field':
      terrainCap = cfg.pia_new_lease_prod_alw_cap_shallow_bbl ?? 100_000_000;
      break;
    case 'deep_offshore':
    case 'frontier':
      terrainCap = cfg.pia_new_lease_prod_alw_cap_deep_bbl ?? 500_000_000;
      break;
  }

  const remainingCapacity = Math.max(0, terrainCap - priorCumulativeOil);
  if (remainingCapacity === 0) {
    return { allowance: 0, eligible_bbl: 0, cap_applied: true };
  }
  if (oilAndCondBbl <= remainingCapacity) {
    // Entire year's production is below cap
    return { allowance: perBbl * oilAndCondBbl, eligible_bbl: oilAndCondBbl, cap_applied: false };
  }
  // Mid-year crossing: split
  return {
    allowance: perBbl * remainingCapacity,
    eligible_bbl: remainingCapacity,
    cap_applied: true,
  };
}

// ============================================================================
// PIA REGIME (B2.5 framework-aware)
// ============================================================================

export function applyPIA(
  inputs: PIAInputs,
  cfg: PIAConfig,
  state: PIAState,
  framework: FiscalFramework = 'pia_only',
): { output: PIAOutputs; newState: PIAState } {
  const oilBopd = inputs.oil_bbl / 365;
  const grossRev = inputs.gross_revenue;

  const oilCondRevenue = inputs.oil_and_cond_revenue;
  const gasRevenue = grossRev - oilCondRevenue;

  // Royalties (unchanged between PIA and NTA — NTA preserved PIA Seventh Schedule)
  const oilProdRoyaltyRate = deriveOilRoyaltyRate(cfg.pia_terrain, oilBopd);
  const gasProdRoyaltyRate = deriveGasRoyaltyRate(cfg.pia_terrain);
  const productionRoyalty = oilCondRevenue * oilProdRoyaltyRate + gasRevenue * gasProdRoyaltyRate;

  const priceRoyaltyRate = derivePriceRoyaltyRate(inputs.fiscal_oil_price_usd_bbl, inputs.year, cfg.pia_terrain);
  const priceRoyalty = oilCondRevenue * priceRoyaltyRate;

  const totalRoyalties = productionRoyalty + priceRoyalty;

  // HCDT (3% of prior year opex) and NDDC (fixed or percentage)
  const hcdt = state.prior_year_opex_usd > 0 ? 0.03 * state.prior_year_opex_usd : 0;
  const nddc = inputs.nddc_levy;

  // CPR (Cost Price Ratio) — cap costs at limit % of gross revenue
  const cprCap = grossRev * (cfg.pia_cpr_limit_pct / 100);
  const recoverableThisYear = state.cpr_carryforward + inputs.opex_inflated + inputs.capital_allowance_this_year;
  const cprClaimed = Math.min(recoverableThisYear, cprCap);
  const cprDeferred = recoverableThisYear - cprClaimed;
  const opexClaimed = Math.min(inputs.opex_inflated + state.cpr_carryforward, cprClaimed);
  const capAllowClaimed = cprClaimed - opexClaimed;

  // HCT computation
  const hctAssessableProfit = grossRev - totalRoyalties - opexClaimed - hcdt;

  // B2.5: Production allowance now cap-aware (Item C)
  const prodAlwResult = computeProductionAllowance(
    cfg,
    inputs.oil_bbl + inputs.condensate_bbl,
    inputs.fiscal_oil_price_usd_bbl,
    state.cumulative_oil_bbl_lifetime,
  );
  const productionAllowance = prodAlwResult.allowance;

  const hctChargeableProfit = hctAssessableProfit - capAllowClaimed - productionAllowance;

  // B2.5: HCT rate now framework-aware (deep offshore interpretation matters)
  const hctRate = deriveHctRate(
    cfg.pia_terrain,
    cfg.pia_license_type,
    cfg.pia_marginal_field_pre_2021,
    cfg.pia_hct_rate_override_pct,
    framework,
    cfg.pia_deep_offshore_hct_interpretation ?? 'conservative_zero',
    cfg.pia_deep_offshore_hct_custom_rate_pct ?? null,
  );
  const hctTax = Math.max(0, hctChargeableProfit * hctRate);

  // CIT computation
  const citAssessableProfit = grossRev - totalRoyalties - opexClaimed - hcdt - nddc;
  const citCapAllowCap = Math.max(0, citAssessableProfit * 2 / 3);
  const citCapAllowClaimed = Math.min(capAllowClaimed, citCapAllowCap);
  const citChargeableProfit = citAssessableProfit - citCapAllowClaimed;
  const citTax = Math.max(0, citChargeableProfit * (cfg.pia_cit_rate_pct / 100));

  // B2.5: TET vs Development Levy — framework-dependent (Items A2, B)
  // Same assessable-profit base (cit_assessable_profit), only rate differs
  let tetTax = 0;
  let devLevyTax = 0;
  if (framework === 'pia_only') {
    tetTax = Math.max(0, citAssessableProfit * (cfg.pia_tet_rate_pct / 100));
  } else {
    // NTA: Development Levy 4% per Section 59
    const devLevyRate = (cfg.pia_development_levy_rate_pct ?? 4.0) / 100;
    devLevyTax = Math.max(0, citAssessableProfit * devLevyRate);
  }

  const totalTax = hctTax + citTax + tetTax + devLevyTax;

  const netCashFlow =
    grossRev - totalRoyalties - inputs.opex_inflated - hcdt - nddc
    - hctTax - citTax - tetTax - devLevyTax
    - inputs.capex_inflated;

  return {
    output: {
      production_royalty: productionRoyalty,
      price_royalty: priceRoyalty,
      total_royalties: totalRoyalties,
      hcdt,
      nddc,
      hct_assessable_profit: hctAssessableProfit,
      production_allowance: productionAllowance,
      hct_chargeable_profit: hctChargeableProfit,
      hct_tax: hctTax,
      cit_assessable_profit: citAssessableProfit,
      cit_chargeable_profit: citChargeableProfit,
      cit_tax: citTax,
      tet_tax: tetTax,
      dev_levy_tax: devLevyTax,
      total_tax: totalTax,
      cpr_cap: cprCap,
      cpr_costs_claimed: cprClaimed,
      cpr_deferred_to_next: cprDeferred,
      net_cash_flow: netCashFlow,
      fiscal_framework: framework,
      prod_alw_cap_applied: prodAlwResult.cap_applied,
      prod_alw_eligible_bbl: prodAlwResult.eligible_bbl,
    },
    newState: {
      cpr_carryforward: cprDeferred,
      prior_year_opex_usd: inputs.opex_inflated,
      // B2.5: accumulate oil for volume-cap tracking
      cumulative_oil_bbl_lifetime: state.cumulative_oil_bbl_lifetime + inputs.oil_bbl + inputs.condensate_bbl,
    },
  };
}

// ============================================================================
// FINANCIAL METRICS (unchanged)
// ============================================================================

export function npv(cashFlows: number[], discountRate: number, baseYear: number, firstYear: number): number {
  let total = 0;
  for (let i = 0; i < cashFlows.length; i++) {
    const yearOffset = (firstYear + i) - baseYear;
    total += cashFlows[i] / Math.pow(1 + discountRate, yearOffset);
  }
  return total;
}

export function irr(cashFlows: number[]): number | null {
  const hasNeg = cashFlows.some(cf => cf < 0);
  const hasPos = cashFlows.some(cf => cf > 0);
  if (!hasNeg || !hasPos) return null;
  let r = 0.10;
  for (let iter = 0; iter < 100; iter++) {
    let f = 0, df = 0;
    for (let i = 0; i < cashFlows.length; i++) {
      const factor = Math.pow(1 + r, i);
      f += cashFlows[i] / factor;
      df -= i * cashFlows[i] / (factor * (1 + r));
    }
    if (Math.abs(df) < 1e-12) break;
    const r_new = r - f / df;
    if (Math.abs(r_new - r) < 1e-7) return r_new;
    r = r_new;
    if (r < -0.99) r = -0.99;
    if (r > 10) r = 10;
  }
  return r;
}

export function paybackPeriod(cashFlows: number[]): string {
  let cumulative = 0;
  for (let i = 0; i < cashFlows.length; i++) {
    const prev = cumulative;
    cumulative += cashFlows[i];
    if (prev < 0 && cumulative >= 0) {
      const fraction = -prev / cashFlows[i];
      return (i + fraction).toFixed(2) + ' years';
    }
  }
  return cumulative >= 0 ? 'Year 0' : 'Beyond project life';
}

// ============================================================================
// MAIN COMPUTE FUNCTION (B2.5 framework-aware)
// ============================================================================

export function computeCashFlow(input: ComputeInput): ComputeOutput {
  const { cfg, prodRows, capexRows, opexRows } = input;

  if (!prodRows || prodRows.length === 0) {
    throw new Error('No production data found. Upload and process a CSV first.');
  }

  // B2.5: determine fiscal framework once per run
  const framework = determineFiscalFramework(cfg);

  const baseYear = cfg.base_year || 2027;
  const inflationRate = Number(cfg.inflation_rate_pct ?? 0) / 100;
  const oilEscalator  = Number(cfg.oil_price_escalator_pct       ?? cfg.inflation_rate_pct ?? 0) / 100;
  const gasEscalator  = Number(cfg.gas_price_escalator_pct       ?? cfg.inflation_rate_pct ?? 0) / 100;
  const condEscalator = Number(cfg.condensate_price_escalator_pct ?? cfg.inflation_rate_pct ?? 0) / 100;
  const opexEscalator = Number(cfg.opex_escalator_pct            ?? cfg.inflation_rate_pct ?? 0) / 100;
  const capexEscalator = Number(cfg.capex_escalator_pct          ?? 0) / 100;

  const pvBasis = (cfg.present_value_basis || 'real') as 'real' | 'nominal';
  const nominalDiscountRate = Number(cfg.discount_rate_pct) / 100;
  const realDiscountRate = (1 + nominalDiscountRate) / (1 + inflationRate) - 1;
  const discountForNPV = pvBasis === 'real' ? realDiscountRate : nominalDiscountRate;

  const annualVols = extractAnnualVolumes(prodRows, baseYear);
  const annualCapex = extractAnnualCapex(capexRows, baseYear);
  const annualOpex = extractAnnualOpex(opexRows, baseYear);

  const yearSet = new Set<number>([
    ...annualVols.map(v => v.year),
    ...annualCapex.keys(),
    ...annualOpex.keys()
  ]);
  const years = Array.from(yearSet).sort((a, b) => a - b);

  const isPIA = cfg.fiscal_regime === 'PIA';
  const DEPR_LIFE = isPIA ? (cfg.pia_capex_recovery_years || 5) : 10;

  const annualDepr = new Map<number, number>();
  const annualCapexInflated = new Map<number, number>();
  for (const [capexYear, capexAmount] of annualCapex.entries()) {
    const t = capexYear - baseYear;
    const inflatedCapex = capexAmount * Math.pow(1 + capexEscalator, t);
    annualCapexInflated.set(capexYear, inflatedCapex);
    const annualPortion = inflatedCapex / DEPR_LIFE;
    for (let y = capexYear; y < capexYear + DEPR_LIFE; y++) {
      annualDepr.set(y, (annualDepr.get(y) || 0) + annualPortion);
    }
  }

  const cashFlowData: any[] = [];
  let cumCF_nominal = 0;
  let cumCF_real = 0;
  let pscCarryforward = 0;

  // B2.5: initialize PIA state with prior cumulative oil if specified
  let piaState: PIAState = {
    cpr_carryforward: 0,
    prior_year_opex_usd: Number(cfg.pia_prior_year_opex_usd ?? 0),
    cumulative_oil_bbl_lifetime: Number(cfg.pia_prior_cumulative_oil_bbl ?? 0),
  };

  for (const year of years) {
    const t = year - baseYear;
    const v = annualVols.find(vv => vv.year === year) || { oil_bbl: 0, gas_mscf: 0, condensate_bbl: 0, water_bbl: 0 };
    const capexNominal = annualCapexInflated.get(year) || 0;
    const opexInflated = (annualOpex.get(year) || 0) * Math.pow(1 + opexEscalator, t);
    const depr = annualDepr.get(year) || 0;

    const oilPrice = Number(cfg.oil_price_usd_bbl) * Math.pow(1 + oilEscalator, t);
    const gasPrice = Number(cfg.gas_price_usd_mscf) * Math.pow(1 + gasEscalator, t);
    const condPrice = Number(cfg.condensate_price_usd_bbl) * Math.pow(1 + condEscalator, t);

    const oilRev = v.oil_bbl * oilPrice;
    const gasRev = v.gas_mscf * gasPrice;
    const condRev = v.condensate_bbl * condPrice;
    const grossRev = oilRev + gasRev + condRev;
    const oilAndCondRev = oilRev + condRev;

    let regOut: RegimeOutputs;
    const baseRow: any = {
      year,
      gross_revenue: grossRev,
      revenue: grossRev,
      opex: opexInflated,
      capex: capexNominal,
      depreciation: depr,
      oil_bbl: v.oil_bbl,
      gas_mscf: v.gas_mscf,
      condensate_bbl: v.condensate_bbl,
      applied_oil_price: oilPrice,
      applied_gas_price: gasPrice,
      applied_cond_price: condPrice,
    };

    if (cfg.fiscal_regime === 'PIA') {
      const nddcLevy = cfg.pia_nddc_levy_fixed_usd != null
        ? Number(cfg.pia_nddc_levy_fixed_usd)
        : opexInflated * (Number(cfg.pia_nddc_levy_pct_of_opex ?? 3) / 100);

      const capAllowThisYear = annualDepr.get(year) || 0;

      const piaInputs: PIAInputs = {
        year,
        oil_bbl: v.oil_bbl,
        gas_mscf: v.gas_mscf,
        condensate_bbl: v.condensate_bbl,
        fiscal_oil_price_usd_bbl: oilPrice,
        gross_revenue: grossRev,
        oil_and_cond_revenue: oilAndCondRev,
        capex_inflated: capexNominal,
        opex_inflated: opexInflated,
        capital_allowance_this_year: capAllowThisYear,
        nddc_levy: nddcLevy,
      };

      // B2.5: pass framework to applyPIA
      const { output: pia, newState } = applyPIA(piaInputs, cfg as unknown as PIAConfig, piaState, framework);
      piaState = newState;

      regOut = {
        royalty: pia.total_royalties,
        taxable_income: pia.hct_chargeable_profit + pia.cit_chargeable_profit,
        tax: pia.total_tax,
        net_cash_flow: pia.net_cash_flow,
        cumulative_unrecovered_cost_after: pia.cpr_deferred_to_next,
      };

      Object.assign(baseRow, {
        production_royalty: pia.production_royalty,
        price_royalty: pia.price_royalty,
        royalty: pia.total_royalties,
        hcdt: pia.hcdt,
        nddc: pia.nddc,
        hct_assessable_profit: pia.hct_assessable_profit,
        production_allowance: pia.production_allowance,
        hct_chargeable_profit: pia.hct_chargeable_profit,
        hct_tax: pia.hct_tax,
        cit_assessable_profit: pia.cit_assessable_profit,
        cit_chargeable_profit: pia.cit_chargeable_profit,
        cit_tax: pia.cit_tax,
        tet_tax: pia.tet_tax,
        dev_levy_tax: pia.dev_levy_tax,   // B2.5: NEW field
        tax: pia.total_tax,
        taxable_income: pia.hct_chargeable_profit + pia.cit_chargeable_profit,
        cpr_cap: pia.cpr_cap,
        cpr_costs_claimed: pia.cpr_costs_claimed,
        cpr_deferred_to_next: pia.cpr_deferred_to_next,
        net_cash_flow: pia.net_cash_flow,
        netCashFlow: pia.net_cash_flow,
        // B2.5 diagnostics
        fiscal_framework: pia.fiscal_framework,
        prod_alw_cap_applied: pia.prod_alw_cap_applied,
        prod_alw_eligible_bbl: pia.prod_alw_eligible_bbl,
        cumulative_oil_bbl_lifetime: piaState.cumulative_oil_bbl_lifetime,
      });

    } else if (cfg.fiscal_regime === 'PSC') {
      regOut = applyPSC(
        { gross_revenue: grossRev, capex: capexNominal, opex: opexInflated, depreciation: depr, cumulative_unrecovered_cost: pscCarryforward },
        Number(cfg.psc_royalty_pct) / 100,
        Number(cfg.psc_cost_oil_cap_pct) / 100,
        Number(cfg.psc_contractor_profit_share_pct) / 100,
        Number(cfg.psc_tax_rate_pct) / 100
      );
      pscCarryforward = regOut.cumulative_unrecovered_cost_after;
      Object.assign(baseRow, {
        royalty: regOut.royalty,
        taxable_income: regOut.taxable_income,
        tax: regOut.tax,
        net_cash_flow: regOut.net_cash_flow,
        netCashFlow: regOut.net_cash_flow,
      });
    } else {
      regOut = applyJV(
        { gross_revenue: grossRev, capex: capexNominal, opex: opexInflated, depreciation: depr, cumulative_unrecovered_cost: 0 },
        Number(cfg.jv_working_interest_pct) / 100,
        Number(cfg.jv_royalty_pct) / 100,
        Number(cfg.jv_tax_rate_pct) / 100
      );
      Object.assign(baseRow, {
        royalty: regOut.royalty,
        taxable_income: regOut.taxable_income,
        tax: regOut.tax,
        net_cash_flow: regOut.net_cash_flow,
        netCashFlow: regOut.net_cash_flow,
      });
    }

    const deflator = Math.pow(1 + inflationRate, t);
    const realCF = regOut.net_cash_flow / deflator;
    cumCF_nominal += regOut.net_cash_flow;
    cumCF_real += realCF;

    Object.assign(baseRow, {
      real_net_cash_flow: realCF,
      discounted_cash_flow: (pvBasis === 'real' ? realCF : regOut.net_cash_flow) / Math.pow(1 + discountForNPV, t),
      cumulative_cash_flow: pvBasis === 'real' ? cumCF_real : cumCF_nominal,
      cumulative_nominal: cumCF_nominal,
      cumulative_real: cumCF_real,
    });

    cashFlowData.push(baseRow);
  }

  // B2.5: CPR cessation forfeiture diagnostic (Item D)
  let cprForfeited = 0;
  if (cfg.fiscal_regime === 'PIA' && piaState.cpr_carryforward > 0 && cashFlowData.length > 0) {
    cprForfeited = piaState.cpr_carryforward;
    const lastRow = cashFlowData[cashFlowData.length - 1];
    lastRow.cpr_forfeited_at_cessation = cprForfeited;
  }

  const cfForNPV = cashFlowData.map(d => pvBasis === 'real' ? d.real_net_cash_flow : d.net_cash_flow);
  const cfForIRR = cashFlowData.map(d => d.net_cash_flow);
  const cfForPayback = cashFlowData.map(d => d.net_cash_flow);
  const firstYear = years[0];
  const npvVal = npv(cfForNPV, discountForNPV, baseYear, firstYear);
  const irrVal = irr(cfForIRR);
  const paybackVal = paybackPeriod(cfForPayback);

  const kpis: any = {
    npv: npvVal,
    irr: irrVal !== null ? irrVal * 100 : null,
    payback: paybackVal,
    pv_basis: pvBasis,
    discount_rate_applied_pct: discountForNPV * 100,
    fiscal_regime: cfg.fiscal_regime,
    fiscal_framework: framework,  // B2.5: surface to KPIs for UI
    total_revenue: cashFlowData.reduce((s, d) => s + d.gross_revenue, 0),
    total_capex: cashFlowData.reduce((s, d) => s + d.capex, 0),
    total_opex: cashFlowData.reduce((s, d) => s + d.opex, 0),
    total_tax: cashFlowData.reduce((s, d) => s + (d.tax || 0), 0),
    total_net_cash_flow_nominal: cashFlowData.reduce((s, d) => s + d.net_cash_flow, 0),
    total_net_cash_flow_real: cashFlowData.reduce((s, d) => s + d.real_net_cash_flow, 0),
    total_net_cash_flow: cashFlowData.reduce((s, d) => s + (pvBasis === 'real' ? d.real_net_cash_flow : d.net_cash_flow), 0),
  };

  if (cfg.fiscal_regime === 'PIA') {
    kpis.total_royalties = cashFlowData.reduce((s, d) => s + (d.royalty || 0), 0);
    kpis.total_hct = cashFlowData.reduce((s, d) => s + (d.hct_tax || 0), 0);
    kpis.total_cit = cashFlowData.reduce((s, d) => s + (d.cit_tax || 0), 0);
    kpis.total_tet = cashFlowData.reduce((s, d) => s + (d.tet_tax || 0), 0);
    kpis.total_dev_levy = cashFlowData.reduce((s, d) => s + (d.dev_levy_tax || 0), 0);  // B2.5: NEW
    kpis.total_hcdt = cashFlowData.reduce((s, d) => s + (d.hcdt || 0), 0);
    kpis.total_nddc = cashFlowData.reduce((s, d) => s + (d.nddc || 0), 0);
    kpis.total_production_allowance = cashFlowData.reduce((s, d) => s + (d.production_allowance || 0), 0);
    if (cprForfeited > 0) {
      kpis.cpr_forfeited_at_cessation = cprForfeited;  // B2.5: diagnostic
    }
  }

  return { cashFlowData, kpis };
}
