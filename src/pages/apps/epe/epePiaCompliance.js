/**
 * EPE: the PIA 2021 / NTA 2025 compliance surface of the Run Console,
 * Results Viewer and Case Detail (engines 3.12.0, EC7, engines PR #262).
 *
 * The engine (packages/engines/engines/economics/cashflow.ts) computes the
 * PIA regime from the gazetted texts by default and refuses inputs the texts
 * do not support; cfg.pia_legacy_pre_audit === true runs the pre-audit engine
 * (3.11.0) exactly. Every PIA config saved before 26 September 2026 is stamped
 * legacy by migration 20260926150000, so a saved run reproduces its stored
 * result. Nothing here computes money: these helpers label, pre-check and
 * explain, and the engine's own refusal message is always shown verbatim.
 *
 * Copy rule: no em dashes, no contrastive "X, not Y" phrasing.
 */

/** The toggle label on a legacy-stamped run. */
export const LEGACY_TOGGLE_LABEL = 'Legacy (pre-2026-09-26 engine)';

/** The one-line notice on the results of a legacy run. */
export const LEGACY_NOTICE =
  'PIA figures were corrected on 26 September 2026 to follow the Act and the Royalty Regulations. This run uses the earlier engine.';

/** Defaults of the compliance inputs for a NEW run (mirror the migration's column defaults). */
export const PIA_2021_INPUT_DEFAULTS = Object.freeze({
  pia_legacy_pre_audit: false,
  pia_new_pml_hct_rate_pct: null,
  pia_gas_in_country_share_pct: 0,
  pia_price_royalty_base: 'regulations_2021',
  pia_nddc_levy_base: 'total_budget',
  pia_nddc_levy_pct: 3,
  pia_production_allowance_per_bbl_new_after_cap: 4.0,
  pia_cit_company_gas_operations: false,
  pia_decom_escrow_condition_met: null,
});

/** Help text with the provision each input rests on. */
export const PIA_INPUT_HELP = Object.freeze({
  pia_new_pml_hct_rate_pct:
    'Required for a new-acreage petroleum mining lease onshore or in shallow water. PIA s.267 (NTA s.72) gives 30% to leases selected under s.93(6)(b) and (7)(b) and 15% to onshore and shallow water acreage, and does not say which applies to a lease granted out of new acreage. State the rate your lease carries.',
  pia_deep_offshore_hct_interpretation:
    'Required for a deep offshore field in any year from 2026. NTA s.65(1) brings deep offshore operations into hydrocarbon tax, and s.72 states rates only for onshore and shallow water, so the rate is your stated reading.',
  pia_decom_escrow_condition_met:
    'Required when a sinking-fund contribution falls in a year from 2026. NTA s.86 allows the deduction only when at least 30% of the fund is deposited in an escrow account with a Nigerian bank accredited under the Central Bank of Nigeria\'s criteria.',
  pia_gas_in_country_share_pct:
    'Royalty on gas and NGL is 5%, and 2.5% on gas produced and utilised in Nigeria (PIA Seventh Schedule para 10(6); Royalty Regulations 2022 r.16). Enter the in-country share of gas revenue.',
  pia_price_royalty_base:
    'Royalty by price: the Royalty Regulations 2022 Schedule sets 50, 100 and 150 USD/bbl for 2021 and raises each by 2% a year from 2022. PIA Seventh Schedule para 11(1) applies the same levels to 2020, one year earlier.',
  pia_nddc_levy_base:
    'NDDC levy: 3% of the company\'s total annual budget (NDDC Act s.14(2)(b), as amended in 2017), read as the year\'s opex plus capex. It is deductible in the hydrocarbon tax base (PIA s.263(1); NTA s.68(1)). Choose opex to keep the earlier base.',
  pia_production_allowance_per_bbl_new_after_cap:
    'New leases: the lower of 4 USD/bbl and 20% of the fiscal oil price on every barrel after the cumulative cap (PIA Sixth Schedule para 1(2)). Under the NTA there is no allowance for deep offshore or frontier.',
  pia_cit_company_gas_operations:
    'Before 2026 the CIT capital allowance is limited to two thirds of assessable profit, with the excess carried forward (Finance Act 2023 s.9(b)). Companies in upstream or midstream gas operations are exempt.',
  pia_tet_rate_pct:
    'Leave blank to apply the statute: 3% from 2023 (TETFund Act s.1(2) as amended by Finance Act 2023 s.26) and 2.5% before. From 2026 the NTA replaces it with the 4% development levy.',
  pia_capex_recovery_years:
    'Fixed at five years: 20, 20, 20, 20 and 19% under the PIA (Fifth Schedule para 17(1)) and 20% a year under the NTA (First Schedule Part II para 14(1)).',
  pia_terrain:
    'Royalty tranches by daily crude plus condensate (Royalty Regulations 2022 r.13): onshore and shallow water 5% to 5,000 bopd, 7.5% to 10,000 and 15% (onshore) or 12.5% (shallow water) above; deep offshore 5% to 50,000 bopd and 7.5% above; frontier 7.5% flat. A marginal field is onshore or in shallow water.',
});

const isNum = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const blank = (v) => v === null || v === undefined || v === '';

/** True when the config or result runs the pre-audit engine. */
export const isLegacyPia = (cfgOrKpis) => cfgOrKpis?.pia_legacy_pre_audit === true;

/**
 * Framework label for kpis.fiscal_framework, including the per-year
 * 'pia_only_then_nta_2025' of the default path (with kpis.nta_first_year).
 */
export function frameworkLabel(kpis) {
  const fw = kpis?.fiscal_framework;
  if (fw === 'nta_2025') return 'NTA 2025';
  if (fw === 'pia_only') return 'PIA 2021';
  if (fw === 'pia_only_then_nta_2025') {
    return kpis?.nta_first_year ? `PIA 2021 to ${kpis.nta_first_year - 1}, NTA 2025 from ${kpis.nta_first_year}` : 'PIA 2021, then NTA 2025';
  }
  return null;
}

/** The badge sentence under the run title. */
export function frameworkBadge(kpis) {
  const fw = kpis?.fiscal_framework;
  if (fw === 'nta_2025') return 'Computed under NTA 2025';
  if (fw === 'pia_only') return 'Computed under PIA 2021 (pre-NTA)';
  if (fw === 'pia_only_then_nta_2025') {
    return kpis?.nta_first_year
      ? `Computed under PIA 2021 to ${kpis.nta_first_year - 1} and NTA 2025 from ${kpis.nta_first_year}`
      : 'Computed under PIA 2021, then NTA 2025';
  }
  return null;
}

/**
 * Does the run certainly reach an NTA year? Only the config is known here
 * (production years live in the case files), so this is true when the
 * framework is forced to the NTA or the base year is 2026 or later under
 * 'auto'. False means "not certain": the engine still decides per year.
 */
export function certainlyHasNtaYear(cfg) {
  const ovr = cfg?.pia_under_nta_2025_override ?? 'auto';
  if (ovr === 'force_nta') return true;
  if (ovr === 'force_pia') return false;
  return Number(cfg?.base_year) >= 2026;
}

/** May the run reach an NTA year? (Anything except a forced PIA framework.) */
export const mayHaveNtaYear = (cfg) => (cfg?.pia_under_nta_2025_override ?? 'auto') !== 'force_pia';

// ---------------------------------------------------------------------------
// The five refusals of saved pre-audit configs (FINDINGS-pia2021.md section 6)
// and the deep offshore reading (decision D5). Each has the engine's matcher,
// a plain title, and the fixes the Console can apply with one click.
// ---------------------------------------------------------------------------
export const PIA_REFUSALS = Object.freeze([
  {
    code: 'marginal_terrain',
    match: /pia_terrain "marginal_field" is not a terrain/,
    title: 'Marginal field is no longer a terrain',
    explain: 'Under the PIA a marginal field is onshore or in shallow water (Seventh Schedule para 10(4); Royalty Regulations 2022 r.13(2)). Choose its terrain and mark it as a marginal field converted under PIA s.94(1).',
    fixes: [
      { label: 'Onshore marginal field', patch: { pia_terrain: 'onshore', pia_marginal_field_pre_2021: true } },
      { label: 'Shallow water marginal field', patch: { pia_terrain: 'shallow_water', pia_marginal_field_pre_2021: true } },
    ],
  },
  {
    code: 'new_pml_hct_rate',
    match: /needs pia_new_pml_hct_rate_pct set to 15 or 30/,
    title: 'State the hydrocarbon tax rate of the new lease',
    explain: PIA_INPUT_HELP.pia_new_pml_hct_rate_pct,
    fixes: [
      { label: 'HCT 15%', patch: { pia_new_pml_hct_rate_pct: 15 } },
      { label: 'HCT 30%', patch: { pia_new_pml_hct_rate_pct: 30 } },
    ],
  },
  {
    code: 'recovery_life',
    match: /pia_capex_recovery_years is .*, but the PIA Fifth Schedule/,
    title: 'Capital allowance life is five years',
    explain: PIA_INPUT_HELP.pia_capex_recovery_years,
    fixes: [{ label: 'Set recovery to 5 years', patch: { pia_capex_recovery_years: 5 } }],
  },
  {
    code: 'decom_escrow',
    match: /pia_decom_escrow_condition_met must be true or false/,
    title: 'State the decommissioning escrow condition',
    explain: PIA_INPUT_HELP.pia_decom_escrow_condition_met,
    fixes: [
      { label: 'Escrow condition met', patch: { pia_decom_escrow_condition_met: true } },
      { label: 'Escrow condition not met', patch: { pia_decom_escrow_condition_met: false } },
    ],
  },
  {
    code: 'licence_type',
    match: /pia_license_type must be "PML" or "PPL"/,
    title: 'Choose the licence type',
    explain: 'The hydrocarbon tax rate depends on the licence: a petroleum mining lease (PML) or a petroleum prospecting licence (PPL, 15%; PIA s.267).',
    fixes: [
      { label: 'PML', patch: { pia_license_type: 'PML' } },
      { label: 'PPL', patch: { pia_license_type: 'PPL' } },
    ],
  },
  {
    code: 'deep_offshore_hct',
    match: /needs pia_deep_offshore_hct_interpretation set to/,
    title: 'State the deep offshore hydrocarbon tax reading',
    explain: PIA_INPUT_HELP.pia_deep_offshore_hct_interpretation,
    fixes: [
      { label: 'Conservative: 0%', patch: { pia_deep_offshore_hct_interpretation: 'conservative_zero' } },
      { label: 'Aggressive: 30%', patch: { pia_deep_offshore_hct_interpretation: 'aggressive_pml_30' } },
    ],
  },
]);

/** Classify an engine error message. Null when it is not a PIA refusal. */
export function piaRefusal(message) {
  if (!message) return null;
  const text = String(message);
  const r = PIA_REFUSALS.find((x) => x.match.test(text));
  return r ? { ...r, message: text } : null;
}

/**
 * The refusals a config will certainly meet on the default path, checked
 * from the config alone in the engine's own order (deriveHctRate: an HCT
 * override, frontier and deep offshore come before the licence checks).
 * Legacy configs and non-PIA configs return []. `possible` lists the inputs
 * that are required only if a year falls under the NTA and that cannot be
 * decided here; the Console marks them required.
 */
export function piaPreflight(cfg) {
  if (!cfg || cfg.fiscal_regime !== 'PIA' || isLegacyPia(cfg)) return { certain: [], possible: [] };
  const certain = [];
  const possible = [];
  const byCode = (c) => PIA_REFUSALS.find((r) => r.code === c);
  const terrain = cfg.pia_terrain;
  if (terrain === 'marginal_field') certain.push(byCode('marginal_terrain'));
  if (isNum(cfg.pia_capex_recovery_years) && Number(cfg.pia_capex_recovery_years) !== 5) certain.push(byCode('recovery_life'));
  const override = isNum(cfg.pia_hct_rate_override_pct);
  const shelf = terrain === 'onshore' || terrain === 'shallow_water';
  if (!override && shelf && cfg.pia_marginal_field_pre_2021 !== true) {
    const lic = cfg.pia_license_type;
    if (lic !== 'PML' && lic !== 'PPL') certain.push(byCode('licence_type'));
    else if (lic === 'PML' && cfg.pia_lease_status === 'new'
      && !(Number(cfg.pia_new_pml_hct_rate_pct) === 15 || Number(cfg.pia_new_pml_hct_rate_pct) === 30)) {
      certain.push(byCode('new_pml_hct_rate'));
    }
  }
  if (!override && terrain === 'deep_offshore' && blank(cfg.pia_deep_offshore_hct_interpretation)) {
    (certainlyHasNtaYear(cfg) ? certain : mayHaveNtaYear(cfg) ? possible : []).push(byCode('deep_offshore_hct'));
  }
  const fund = cfg.abandonment_funding_mode === 'sinking_fund' && Number(cfg.abandonment_cost_usd) > 0;
  if (fund && typeof cfg.pia_decom_escrow_condition_met !== 'boolean') {
    (certainlyHasNtaYear(cfg) ? certain : mayHaveNtaYear(cfg) ? possible : []).push(byCode('decom_escrow'));
  }
  return { certain, possible };
}

/**
 * The PIA part of the run payload. The compliance inputs are sent as set;
 * a legacy run with no TET rate gets the pre-audit 2.5 (the legacy engine
 * reads a blank TET as zero), and the NDDC percent lands on the field each
 * engine path reads (pia_nddc_levy_pct on the default path,
 * pia_nddc_levy_pct_of_opex on the legacy path).
 */
export function piaCompliancePayload(cfg) {
  const legacy = isLegacyPia(cfg);
  const num = (v, dflt = null) => (isNum(v) ? Number(v) : dflt);
  return {
    pia_legacy_pre_audit: legacy,
    pia_tet_rate_pct: legacy ? num(cfg.pia_tet_rate_pct, 2.5) : num(cfg.pia_tet_rate_pct),
    pia_new_pml_hct_rate_pct: num(cfg.pia_new_pml_hct_rate_pct),
    pia_gas_in_country_share_pct: num(cfg.pia_gas_in_country_share_pct, 0),
    pia_price_royalty_base: cfg.pia_price_royalty_base || 'regulations_2021',
    pia_nddc_levy_base: cfg.pia_nddc_levy_base || 'total_budget',
    pia_nddc_levy_pct: legacy ? null : num(cfg.pia_nddc_levy_pct, 3),
    pia_nddc_levy_pct_of_opex: num(cfg.pia_nddc_levy_pct_of_opex, 3),
    pia_production_allowance_per_bbl_new_after_cap: num(cfg.pia_production_allowance_per_bbl_new_after_cap, 4),
    pia_cit_company_gas_operations: cfg.pia_cit_company_gas_operations === true,
    pia_decom_escrow_condition_met: typeof cfg.pia_decom_escrow_condition_met === 'boolean' ? cfg.pia_decom_escrow_condition_met : null,
    pia_deep_offshore_hct_interpretation: blank(cfg.pia_deep_offshore_hct_interpretation) ? null : cfg.pia_deep_offshore_hct_interpretation,
  };
}

/** Result-row columns the default path adds (shown when any row carries them). */
export const PIA_2021_ROW_COLUMNS = Object.freeze([
  { key: 'liquids_production_royalty', label: 'Production Royalty, Crude and Condensate (USD)', kind: 'money' },
  { key: 'gas_royalty', label: 'Gas and NGL Royalty (USD)', kind: 'money' },
  { key: 'price_royalty', label: 'Royalty by Price (USD)', kind: 'money' },
  { key: 'royalty_liquids_bopd', label: 'Royalty Daily Rate (bopd)', kind: 'volume' },
  { key: 'royalty_rate_liquids', label: 'Production Royalty Rate (%)', kind: 'fraction' },
  { key: 'royalty_rate_gas', label: 'Gas Royalty Rate (%)', kind: 'fraction' },
  { key: 'price_royalty_rate_oil', label: 'Price Royalty Rate, Oil (%)', kind: 'fraction' },
  { key: 'price_royalty_rate_condensate', label: 'Price Royalty Rate, Condensate (%)', kind: 'fraction' },
  { key: 'hct_rate', label: 'HCT Rate (%)', kind: 'fraction' },
  { key: 'tet_rate_pct', label: 'TET Rate (%)', kind: 'pct' },
  { key: 'fiscal_framework', label: 'Framework', kind: 'text' },
  { key: 'prod_alw_below_cap_bbl', label: 'Allowance Barrels Below Cap', kind: 'volume' },
  { key: 'prod_alw_after_cap_bbl', label: 'Allowance Barrels After Cap', kind: 'volume' },
  { key: 'cit_allowance_restricted', label: 'CIT Allowance Restricted', kind: 'bool' },
  { key: 'decom_fund_deduction', label: 'Decom Fund Deduction (USD)', kind: 'money' },
]);

/** Which of PIA_2021_ROW_COLUMNS a result carries (default-path runs only). */
export function piaRowColumnsPresent(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.some((r) => r && r.liquids_production_royalty !== undefined)) return [];
  return PIA_2021_ROW_COLUMNS.filter((c) => list.some((r) => r && r[c.key] !== undefined && r[c.key] !== null));
}

/** Display value of a PIA_2021_ROW_COLUMNS cell (fractions shown as percent). */
export function piaCellValue(col, v) {
  if (v === undefined || v === null) return '';
  if (col.kind === 'fraction') return Math.round(Number(v) * 100 * 10000) / 10000;
  if (col.kind === 'bool') return v ? 'yes' : 'no';
  return v;
}
