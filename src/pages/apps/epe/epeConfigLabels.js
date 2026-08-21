// Petroleum Economics Studio: human-readable labels for epe_run_configs
// fields (Wave D, audit 4.9). Single source for the PDF assumptions block,
// the XLSX Assumptions sheet, and the run-comparison config rows, so
// exports never show raw column names like pia_cpr_limit_pct.
//
// Sections render in this order; fields not listed here fall back to a
// prettified key so new engine fields degrade readably instead of breaking
// exports.

export const CONFIG_SECTIONS = [
  {
    title: 'Pricing',
    fields: [
      ['oil_price_usd_bbl', 'Oil price', 'USD/bbl'],
      ['gas_price_usd_mscf', 'Gas price', 'USD/mscf'],
      ['condensate_price_usd_bbl', 'Condensate price', 'USD/bbl'],
      ['oil_price_differential_usd_bbl', 'Oil differential', 'USD/bbl'],
      ['gas_price_differential_usd_mscf', 'Gas differential', 'USD/mscf'],
      ['condensate_price_differential_usd_bbl', 'Condensate differential', 'USD/bbl'],
      ['price_deck', 'Yearly price deck', 'table'],
      ['oil_price_escalator_pct', 'Oil price escalation', '%/yr'],
      ['gas_price_escalator_pct', 'Gas price escalation', '%/yr'],
      ['condensate_price_escalator_pct', 'Condensate price escalation', '%/yr'],
    ],
  },
  {
    title: 'Economics',
    fields: [
      ['discount_rate_pct', 'Discount rate', '%'],
      ['inflation_rate_pct', 'Inflation rate', '%'],
      ['base_year', 'Base year', 'year'],
      ['present_value_basis', 'Present value basis', ''],
      ['discounting_convention', 'Discounting convention', ''],
      ['valuation_year', 'Valuation year', 'year'],
      ['treat_prior_as_sunk', 'Prior years treated as sunk', ''],
      ['opex_escalator_pct', 'OPEX escalation', '%/yr'],
      ['capex_escalator_pct', 'CAPEX escalation', '%/yr'],
      ['schedule_shift_years', 'First oil delay', 'years'],
      ['apply_economic_limit', 'Economic limit test', ''],
      ['abandonment_cost_usd', 'Abandonment cost', 'USD'],
      ['abandonment_year', 'Abandonment year', 'year'],
      ['apply_loss_carryforward', 'Tax-loss carryforward', ''],
    ],
  },
  {
    title: 'Fiscal regime',
    fields: [['fiscal_regime', 'Fiscal regime', '']],
  },
  {
    title: 'JV terms',
    regime: 'JV',
    fields: [
      ['jv_working_interest_pct', 'Working interest', '%'],
      ['jv_royalty_pct', 'Royalty', '%'],
      ['jv_tax_rate_pct', 'Tax rate', '%'],
    ],
  },
  {
    title: 'PSC terms',
    regime: 'PSC',
    fields: [
      ['psc_working_interest_pct', 'Working interest', '% of contractor group'],
      ['psc_royalty_pct', 'Royalty', '%'],
      ['psc_cost_oil_cap_pct', 'Cost oil cap', '% of revenue after royalty'],
      ['psc_contractor_profit_share_pct', 'Contractor profit share', '%'],
      ['psc_tax_rate_pct', 'Tax rate', '%'],
    ],
  },
  {
    title: 'PIA 2021 terms',
    regime: 'PIA',
    fields: [
      ['pia_working_interest_pct', 'Working interest', '% of lessee'],
      ['pia_terrain', 'Terrain', ''],
      ['pia_license_type', 'License type', ''],
      ['pia_lease_status', 'Lease status', ''],
      ['pia_water_depth_m', 'Water depth', 'm'],
      ['pia_marginal_field_pre_2021', 'Pre-2021 marginal field', ''],
      ['pia_hct_rate_override_pct', 'HCT rate override', '%'],
      ['pia_cit_rate_pct', 'CIT rate', '%'],
      ['pia_tet_rate_pct', 'TET rate', '%'],
      ['pia_development_levy_rate_pct', 'Development levy rate', '%'],
      ['pia_under_nta_2025_override', 'NTA 2025 framework', ''],
      ['pia_deep_offshore_hct_interpretation', 'Deep offshore HCT reading', ''],
      ['pia_deep_offshore_hct_custom_rate_pct', 'Deep offshore HCT custom rate', '%'],
      ['pia_nddc_levy_pct_of_opex', 'NDDC levy', '% of OPEX'],
      ['pia_nddc_levy_fixed_usd', 'NDDC levy (fixed)', 'USD'],
      ['pia_prior_year_opex_usd', 'Prior year OPEX (HCDT base)', 'USD'],
      ['pia_capex_recovery_years', 'Capex recovery period', 'years'],
      ['pia_cpr_limit_pct', 'Cost price ratio cap', '% of revenue'],
      ['pia_production_allowance_per_bbl_converted', 'Production allowance (converted lease)', 'USD/bbl'],
      ['pia_production_allowance_per_bbl_new', 'Production allowance (new lease)', 'USD/bbl'],
      ['pia_production_allowance_pct_of_price', 'Production allowance price cap', '% of price'],
      ['pia_new_lease_prod_alw_cap_onshore_bbl', 'Allowance volume cap (onshore)', 'bbl'],
      ['pia_new_lease_prod_alw_cap_shallow_bbl', 'Allowance volume cap (shallow water)', 'bbl'],
      ['pia_new_lease_prod_alw_cap_deep_bbl', 'Allowance volume cap (deep or frontier)', 'bbl'],
      ['pia_prior_cumulative_oil_bbl', 'Prior cumulative oil', 'bbl'],
      ['pia_hct_include_gas_revenue', 'Legacy HCT gas-revenue base', ''],
    ],
  },
];

const FLAT_LABELS = new Map();
for (const section of CONFIG_SECTIONS) {
  for (const [key, label, unit] of section.fields) FLAT_LABELS.set(key, { label, unit });
}

export const labelForConfigKey = (key) =>
  FLAT_LABELS.get(key)?.label ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const unitForConfigKey = (key) => FLAT_LABELS.get(key)?.unit ?? '';

// Render one config value for reports. Booleans and enum-ish strings read as
// words; the price deck renders as "2027: oil 82 | 2028: oil 78" style text.
export const formatConfigValue = (key, value) => {
  if (value === null || value === undefined || value === '') return null;
  if (key === 'price_deck') {
    if (!Array.isArray(value) || value.length === 0) return null;
    return value
      .map((r) => {
        const parts = ['oil', 'gas', 'condensate']
          .filter((k) => r[k] !== undefined && r[k] !== null)
          .map((k) => `${k} ${r[k]}`);
        return `${r.year}: ${parts.join(', ')}`;
      })
      .join(' | ');
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') {
    const words = {
      end_year: 'End of year', mid_year: 'Mid-year',
      real: 'Real', nominal: 'Nominal',
      conservative_zero: 'Conservative (0%)', aggressive_pml_30: 'Aggressive (PML 30%)', custom: 'Custom',
      auto: 'Automatic (by base year)', force_pia: 'Force PIA-only', force_nta: 'Force NTA 2025',
      onshore: 'Onshore', shallow_water: 'Shallow water', deep_offshore: 'Deep offshore',
      frontier: 'Frontier', marginal_field: 'Marginal field',
      converted: 'Converted', new: 'New',
    };
    return words[value] ?? value;
  }
  if (typeof value === 'number') {
    return Math.abs(value) >= 1000
      ? value.toLocaleString('en-US', { maximumFractionDigits: 2 })
      : String(value);
  }
  return String(value);
};

// Sections applicable to a config row: regime-tagged sections only for the
// row's regime; a field row is included only when the config has a value.
export const configSectionsForReport = (cfg) => {
  if (!cfg) return [];
  return CONFIG_SECTIONS
    .filter((s) => !s.regime || s.regime === cfg.fiscal_regime)
    .map((s) => ({
      title: s.title,
      rows: s.fields
        .map(([key, label, unit]) => {
          const formatted = formatConfigValue(key, cfg[key]);
          return formatted === null ? null : { key, label, unit, value: formatted };
        })
        .filter(Boolean),
    }))
    .filter((s) => s.rows.length > 0);
};
