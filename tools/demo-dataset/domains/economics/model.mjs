// Economics domain (Wave D8): the one model the generator and the gate share.
//
// Everything here is DERIVED from the production history (the kit's own
// monthly file, itself repackaged from packages/engines/test-data/
// ekene-dynamic/) and from ../../d8spine.mjs (Ekene-11), with a short list of
// DESIGN values (prices, costs, fiscal choice) stated in one place below. The
// money is computed by the canonical engines only:
//   EPE full fiscal       computeCashFlow   packages/engines/engines/economics/cashflow.ts
//   screening NPV         calculateEconomics / expandQuickInputs  (screening.js)
//   probabilistic breakeven generateBreakevenData  (breakeven.js)
//   decision tree         rollback / evpi   (decisionTree.js)
// Nothing in this folder discounts a cash flow itself.

import Papa from 'papaparse';

import { computeCashFlow, irrResult } from '../../../../packages/engines/engines/economics/cashflow.ts';
import { EKENE11 } from '../../d8spine.mjs';

// ---------------------------------------------------------------------------
// DESIGN values (not taught by any Academy course; chosen here, stated in the
// kit's input sheet and README)
// ---------------------------------------------------------------------------
export const DESIGN = {
  // Realised oil price, flat, in US dollars of the day with no escalation.
  oil_price_usd_bbl: 75,
  // Associated gas is burned as platform fuel and flared under permit: no
  // sales line, so it carries no price. Its volumes still go in the file.
  gas_price_usd_mscf: 0,
  discount_rate_pct: 10,
  base_year: 2026,           // valuation date: 1 January 2026, the day after history
  // Operating cost, USD per year / per barrel, flat (no escalation).
  field_fixed_opex_usd: 600_000,      // Ekene Alpha share, export line, injection plant
  ekene11_fixed_opex_usd: 100_000,      // Ekene-11 while it produces
  variable_opex_usd_per_bbl_liquid: 4,  // lifting and treating, per barrel of oil plus water
  // Capital (USD, in the year spent)
  ekene11_tie_in_usd: 600_000,          // flowline, manifold slot and hook-up on Ekene Alpha, 2027
  // Decommissioning, typed into the case (post-tax lump sum in the last economic year)
  field_abandonment_usd: 6_000_000,     // the four producers, two injectors and the field's share of Ekene Alpha
  ekene11_abandonment_usd: 800_000,     // plugging Ekene-11
  // PIA regime choice (EPE Run Console): shallow water, PML, converted lease
  pia: { terrain: 'shallow_water', license: 'PML', lease: 'converted', water_depth_m: 35 },
};

// Forecast rules.
export const ECON_LIMIT_BOPD = 10;          // the fixture's own econ_limit_bopd, per well
export const FORECAST_END = '2048-12-01';    // last month considered; every well stops before it
export const HISTORY_START_YEAR = 2020;
export const HISTORY_END = '2025-12-01';

// ---------------------------------------------------------------------------
// dates (UTC, month starts)
// ---------------------------------------------------------------------------
const toUtc = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const daysBetween = (a, b) => Math.round((toUtc(b) - toUtc(a)) / 86400000);
export const addMonths = (iso, k) => {
  const y = +iso.slice(0, 4);
  const m = +iso.slice(5, 7) - 1 + k;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, '0')}-01`;
};
export const daysInMonth = (iso) => daysBetween(iso, addMonths(iso, 1));

// ---------------------------------------------------------------------------
// history: annual volumes from the kit's monthly daily-rate file
// ---------------------------------------------------------------------------
/** @returns Map well -> Map year -> {oil, water, gas} (barrels / Mscf). */
export function annualHistoryFromMonthlyCsv(text) {
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
  const out = new Map();
  for (const r of data) {
    const well = r.well;
    const year = +r.date.slice(0, 4);
    const d = daysInMonth(r.date);
    if (!out.has(well)) out.set(well, new Map());
    const w = out.get(well);
    if (!w.has(year)) w.set(year, { oil: 0, water: 0, gas: 0 });
    const a = w.get(year);
    a.oil += Number(r.oil_rate_bopd) * d;
    a.water += Number(r.water_rate_bwpd) * d;
    a.gas += Number(r.gas_rate_mscfd) * d;
  }
  return out;
}

/** Last-month daily rates per well from the same file. */
export function lastMonthRates(text) {
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
  const out = new Map();
  for (const r of data) {
    if (r.date !== HISTORY_END) continue;
    out.set(r.well, { oil: Number(r.oil_rate_bopd), water: Number(r.water_rate_bwpd), gas: Number(r.gas_rate_mscfd) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// forecasts (monthly daily rates on the first of the month, as the kit's history)
// ---------------------------------------------------------------------------
/**
 * Base case: an existing producer continues on the fixture's own flood model
 * past the end of history. After its ramp the gross liquid rate declines
 * exponentially at post_ramp_decline_per_day, and the water cut, which the
 * model grows to wcMax exactly at the end of history and then holds, stays at
 * its December 2025 value. So oil, water and gas all scale by the same factor.
 * The well stops at the fixture's economic limit of 10 bopd.
 */
export function baseForecast(last, declinePerDay, gor) {
  const rows = [];
  for (let d = addMonths(HISTORY_END, 1); d <= FORECAST_END; d = addMonths(d, 1)) {
    const f = Math.exp(-declinePerDay * daysBetween(HISTORY_END, d));
    const oil = last.oil * f;
    if (oil < ECON_LIMIT_BOPD) break;
    rows.push({ date: d, oil, water: last.water * f, gas: oil * gor });
  }
  return rows;
}

/**
 * Ekene-11: the d8spine hyperbolic from first oil, scaled by `qiScale` (1 is
 * the planted forecast; the decision tree's outcomes scale it). Oil only: the
 * well is forecast dry, which is a stated simplification. Stops at 10 bopd.
 */
export function ekene11Forecast(gor, qiScale = 1) {
  const { qi_bopd: qi0, di_per_day: Di, b } = EKENE11.forecast;
  const qi = qi0 * qiScale;
  const rows = [];
  if (qi <= 0) return rows;
  for (let d = EKENE11.first_oil; d <= FORECAST_END; d = addMonths(d, 1)) {
    const t = daysBetween(EKENE11.first_oil, d);
    const oil = qi / Math.pow(1 + b * Di * t, 1 / b);
    if (oil < ECON_LIMIT_BOPD) break;
    rows.push({ date: d, oil, water: 0, gas: oil * gor });
  }
  return rows;
}

/** Sum monthly daily-rate rows into annual volumes: Map year -> {oil, water, gas}. */
export function annualise(rows) {
  const out = new Map();
  for (const r of rows) {
    const y = +r.date.slice(0, 4);
    const k = daysInMonth(r.date);
    if (!out.has(y)) out.set(y, { oil: 0, water: 0, gas: 0 });
    const a = out.get(y);
    a.oil += r.oil * k; a.water += r.water * k; a.gas += r.gas * k;
  }
  return out;
}

// ---------------------------------------------------------------------------
// the EPE case
// ---------------------------------------------------------------------------
export const PRODUCERS = ['Ekene-1', 'Ekene-3', 'Ekene-5', 'Ekene-6'];
export const col = (well, stream) => `${well.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${stream}`;

/**
 * Build the three upload files as row arrays (what the CSVs hold).
 * perWell: Map well -> Map year -> {oil, water, gas}, history and forecast merged.
 * opts.withEk11 false drops Ekene-11 everywhere (columns, capex, opex, abandonment).
 */
export function buildCaseRows(perWell, { withEk11 = true } = {}) {
  const wells = [...PRODUCERS, ...(withEk11 ? ['Ekene-11'] : [])];
  const years = new Set();
  for (const w of wells) for (const y of (perWell.get(w)?.keys() ?? [])) years.add(y);
  const ys = [...years].sort((a, b) => a - b);
  const header = ['year'];
  for (const s of ['oil_bbl', 'gas_mscf', 'water_bbl']) for (const w of wells) header.push(col(w, s));
  const prod = ys.map((y) => {
    const row = [y];
    for (const s of ['oil', 'gas', 'water']) {
      for (const w of wells) row.push(perWell.get(w)?.get(y)?.[s] ?? 0);
    }
    return row;
  });

  const capex = withEk11 ? [
    [2027, 'Drilling', 'Ekene-11 drilling and completion (AFE)', EKENE11.dc_cost_usd],
    [2027, 'Facilities', 'Ekene-11 flowline and hook-up on Ekene Alpha', DESIGN.ekene11_tie_in_usd],
  ] : [];

  const opex = ys.map((y) => {
    let liquids = 0;
    let producing11 = false;
    for (const w of wells) {
      const a = perWell.get(w)?.get(y);
      if (!a) continue;
      liquids += a.oil + a.water;
      if (w === 'Ekene-11' && a.oil > 0) producing11 = true;
    }
    const fixed = DESIGN.field_fixed_opex_usd + (producing11 ? DESIGN.ekene11_fixed_opex_usd : 0);
    const variable = liquids * DESIGN.variable_opex_usd_per_bbl_liquid;
    return [y, fixed, variable, fixed + variable];
  });

  return {
    prodHeader: header, prod,
    capexHeader: ['year', 'category', 'item', 'cost_usd'], capex,
    opexHeader: ['year', 'fixed_opex_usd', 'variable_opex_usd', 'total_opex_usd'], opex,
    abandonment_usd: DESIGN.field_abandonment_usd + (withEk11 ? DESIGN.ekene11_abandonment_usd : 0),
  };
}

/**
 * The Run Console config for this case: the Console's own defaults
 * (EpeRunConsole.jsx DEFAULT_CONFIG) with only the fields listed in
 * CFG_TYPED changed. The gate checks each untouched default against the
 * Console source so the two cannot drift apart silently.
 */
export const CONSOLE_DEFAULTS = {
  oil_price_usd_bbl: 75, gas_price_usd_mscf: 4.5, condensate_price_usd_bbl: 70,
  discount_rate_pct: 10, inflation_rate_pct: 3, base_year: 2027,
  oil_price_escalator_pct: 3, gas_price_escalator_pct: 3, condensate_price_escalator_pct: 3,
  opex_escalator_pct: 3, capex_escalator_pct: 0, present_value_basis: 'real',
  pia_terrain: 'shallow_water', pia_license_type: 'PML', pia_lease_status: 'converted',
  pia_water_depth_m: 100, pia_marginal_field_pre_2021: false, pia_hct_rate_override_pct: null,
  pia_cit_rate_pct: 30, pia_tet_rate_pct: 2.5, pia_nddc_levy_pct_of_opex: 3,
  pia_nddc_levy_fixed_usd: null, pia_prior_year_opex_usd: null, pia_capex_recovery_years: 5,
  pia_cpr_limit_pct: 65, pia_production_allowance_per_bbl_converted: 2.50,
  pia_production_allowance_per_bbl_new: 8.00, pia_production_allowance_pct_of_price: 20,
  pia_under_nta_2025_override: 'auto', pia_deep_offshore_hct_interpretation: 'conservative_zero',
  pia_deep_offshore_hct_custom_rate_pct: null, pia_development_levy_rate_pct: 4.0,
  pia_new_lease_prod_alw_cap_onshore_bbl: 50000000, pia_new_lease_prod_alw_cap_shallow_bbl: 100000000,
  pia_new_lease_prod_alw_cap_deep_bbl: 500000000, pia_prior_cumulative_oil_bbl: 0,
  apply_economic_limit: false, abandonment_cost_usd: null, abandonment_year: null,
  psc_working_interest_pct: 100, pia_working_interest_pct: 100, price_deck: null,
  oil_price_differential_usd_bbl: 0, gas_price_differential_usd_mscf: 0,
  condensate_price_differential_usd_bbl: 0, discounting_convention: 'end_year',
  valuation_year: null, treat_prior_as_sunk: false, production_scenario: null,
  fx_ngn_per_usd: null, depreciation_method: 'straight_line', jv_psc_depr_years: 10,
  psc_profit_split_mode: 'flat', psc_profit_tranches: null, psc_itc_pct: 0,
  psc_prior_cumulative_liquids_bbl: 0, abandonment_funding_mode: 'lump_sum',
  abandonment_fund_start_year: null, pia_apply_minimum_etr: false, pia_minimum_etr_pct: 15,
  fiscal_regime: 'JV', jv_working_interest_pct: 100, jv_royalty_pct: 10, jv_tax_rate_pct: 50,
  psc_royalty_pct: 10, psc_cost_oil_cap_pct: 80, psc_contractor_profit_share_pct: 50, psc_tax_rate_pct: 50,
};

/** [field, value, unit, why] for every Console field the presenter changes. */
export function typedFields(abandonmentUsd) {
  return [
    ['fiscal_regime', 'PIA', '', 'Fiscal regime button: PIA (Petroleum Industry Act 2021)'],
    ['pia_terrain', DESIGN.pia.terrain, '', 'already the default; Ekene is offshore in 35 m of water'],
    ['pia_license_type', DESIGN.pia.license, '', 'already the default'],
    ['pia_lease_status', DESIGN.pia.lease, '', 'already the default'],
    ['pia_water_depth_m', DESIGN.pia.water_depth_m, 'm', 'the field\'s water depth (default 100)'],
    ['oil_price_usd_bbl', DESIGN.oil_price_usd_bbl, 'USD/bbl', 'design price, flat'],
    ['gas_price_usd_mscf', DESIGN.gas_price_usd_mscf, 'USD/Mscf', 'associated gas is fuel and flare, no sales'],
    ['oil_price_escalator_pct', 0, '%', 'flat money: no escalation'],
    ['gas_price_escalator_pct', 0, '%', 'flat money: no escalation'],
    ['condensate_price_escalator_pct', 0, '%', 'flat money: no escalation'],
    ['opex_escalator_pct', 0, '%', 'flat money: no escalation'],
    ['inflation_rate_pct', 0, '%', 'so real and nominal are the same 10 percent'],
    ['discount_rate_pct', DESIGN.discount_rate_pct, '%', 'already the default'],
    ['base_year', DESIGN.base_year, '', 'first forecast year; 2026 or later puts PIA under the NTA 2025 framework automatically'],
    ['valuation_year', DESIGN.base_year, '', 'value at 1 January 2026'],
    ['treat_prior_as_sunk', true, '', 'tick it: 2020 to 2025 are history, shown but not valued'],
    ['production_scenario', '2P', '', 'Reserves scenario: 2P, the tag given to the production upload'],
    ['apply_economic_limit', true, '', 'tick it: the engine stops the field when it no longer pays its opex'],
    ['abandonment_cost_usd', abandonmentUsd, 'USD', 'field plus Ekene-11 decommissioning, post tax'],
    ['abandonment_year', null, '', 'leave blank: the last economic year'],
  ];
}

export function buildCfg(abandonmentUsd) {
  const cfg = { ...CONSOLE_DEFAULTS };
  for (const [k, v] of typedFields(abandonmentUsd)) cfg[k] = v;
  return cfg;
}

// ---------------------------------------------------------------------------
// the uploader path: CSV text -> Papa (as EpeDataUploader.jsx) -> engine
// ---------------------------------------------------------------------------
export const toCsv = (header, rows, fmt) =>
  `${[header.join(','), ...rows.map((r) => r.map((v, i) => fmt(v, i)).join(','))].join('\n')}\n`;

/** Exactly the uploader's full parse (EpeDataUploader.jsx, processing stage). */
export function parseLikeUploader(text) {
  const parsed = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true });
  if (parsed.errors && parsed.errors.length > 0) {
    throw new Error(`CSV parse failed: ${parsed.errors[0].message} (row ${parsed.errors[0].row})`);
  }
  if (!parsed.data.length) throw new Error('CSV had headers but no data rows.');
  return parsed.data;
}

export function runEpe(cfg, prodText, capexText, opexText) {
  return computeCashFlow({
    cfg,
    prodRows: parseLikeUploader(prodText),
    capexRows: capexText ? parseLikeUploader(capexText) : [],
    opexRows: parseLikeUploader(opexText),
  });
}

export { irrResult };

// ---------------------------------------------------------------------------
// per-well annual volumes: history from the kit, forecast derived from it
// ---------------------------------------------------------------------------
/**
 * @param monthlyText the kit's 08-production/ekene-production-monthly.csv
 * @param rates       packages/engines/test-data/ekene-dynamic/rates.json
 * @param qiScale     Ekene-11 initial-rate multiplier (1 = the d8spine forecast)
 * @returns {{perWell, gor, monthly}} perWell: Map well -> Map year -> {oil, water, gas}
 */
export function buildPerWell(monthlyText, rates, gor, qiScale = 1) {
  const hist = annualHistoryFromMonthlyCsv(monthlyText);
  const last = lastMonthRates(monthlyText);
  const perWell = new Map();
  const monthly = new Map();
  for (const w of PRODUCERS) {
    const D = rates.wells.find((x) => x.name === w).flood_response.post_ramp_decline_per_day;
    const fc = baseForecast(last.get(w), D, gor);
    monthly.set(w, fc);
    const m = new Map(hist.get(w));
    for (const [y, v] of annualise(fc)) {
      if (m.has(y)) throw new Error(`forecast year ${y} overlaps history for ${w}`);
      m.set(y, v);
    }
    perWell.set(w, m);
  }
  const ek = ekene11Forecast(gor, qiScale);
  monthly.set('Ekene-11', ek);
  perWell.set('Ekene-11', annualise(ek));
  return { perWell, monthly, hist };
}

// Number formats the CSVs are written with (the gate re-reads the same text).
export const fmtProd = (v, i) => (i === 0 ? String(v) : v.toFixed(3));
export const fmtCapex = (v, i) => (i === 3 ? String(Math.round(v)) : String(v));
export const fmtOpex = (v, i) => (i === 0 ? String(v) : v.toFixed(2));

/** The three upload texts for a case. */
export function caseTexts(perWell, opts) {
  const c = buildCaseRows(perWell, opts);
  return {
    rows: c,
    prod: toCsv(c.prodHeader, c.prod, fmtProd),
    capex: c.capex.length ? toCsv(c.capexHeader, c.capex, fmtCapex) : null,
    opex: toCsv(c.opexHeader, c.opex, fmtOpex),
  };
}

// ---------------------------------------------------------------------------
// Decision tree outcomes: Ekene-11's initial rate at three levels
// ---------------------------------------------------------------------------
// DESIGN: a Swanson-style three-point discretisation of the initial-rate
// uncertainty (30/40/30 on a low, mid and high case). The mid case is the
// d8spine forecast; low and high scale its initial rate by 0.7 and 1.3.
// Ekene-11 targets the crest inside the mapped contact, so a wet or tight
// sand is not carried as a separate outcome.
export const OUTCOMES = [
  { label: 'Low rate (qi 315 bopd)', qiScale: 0.7, probability: 0.3 },
  { label: 'Mid rate (qi 450 bopd)', qiScale: 1.0, probability: 0.4 },
  { label: 'High rate (qi 585 bopd)', qiScale: 1.3, probability: 0.3 },
];

// ---------------------------------------------------------------------------
// Probabilistic Breakeven Analyzer: its CSV aggregation, restated
// ---------------------------------------------------------------------------
/**
 * processProductionData from src/components/breakevenanalyzer/InputPanel.jsx,
 * restated operation for operation because it lives inside the React
 * component and cannot be imported. The gate checks the component source
 * still has the lines this depends on. It treats each row as a DAILY rate
 * held for one average month (x 30.44 days) and buckets by the local-time
 * calendar year of the parsed date.
 */
export function breakevenProcessProductionData(data) {
  const annualProduction = {};
  const dateKey = Object.keys(data[0]).find((k) => k.toLowerCase().includes('date'));
  const oilRateKey = Object.keys(data[0]).find((k) => k.toLowerCase().includes('oil_rate'));
  if (!dateKey || !oilRateKey) throw new Error("CSV must contain 'date' and 'oil_rate_bpd' (or similar) columns.");
  data.forEach((row) => {
    const date = new Date(row[dateKey]);
    const year = date.getFullYear();
    const oilRate = parseFloat(row[oilRateKey]);
    if (!Number.isNaN(year) && !Number.isNaN(oilRate)) {
      if (!annualProduction[year]) annualProduction[year] = 0;
      annualProduction[year] += oilRate * 30.44;
    }
  });
  return Object.entries(annualProduction).map(([year, production]) => ({
    year: parseInt(year, 10),
    oil_production_bbl: production,
  }));
}

/** The analyzer's own Papa options (InputPanel.jsx onDrop). */
export const parseLikeBreakeven = (text) =>
  Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: true }).data;
