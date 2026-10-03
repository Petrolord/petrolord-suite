// Forecast Scenario Hub engine (R5, Reservoir-ROADMAP.md).
//
// Multi-case production forecasting: each case is an Arps forecast
// (exponential / hyperbolic / harmonic via the TESTED DCA engine —
// reused, never forked) defined by qi, nominal annual decline, b,
// horizon and economic limit. The hub compares cases side by side
// (rate profiles, EUR, time to limit, cumulative milestones) and
// derives ANNUAL production profiles for handoff to the Economics
// module's NPV Scenario Builder, which owns real fiscal modeling.
// The per-case economics here are deliberately INDICATIVE only: flat
// price minus flat opex, discounted at a single rate — a screening
// number for ranking cases, clearly labeled as such in the UI.
//
// Scope split (R5 reconciliation, 2026-07-16): Reservoir owns the
// production forecast; Economics owns valuation (NpvScenarioBuilder,
// Risked Reserves Valuation). No duplication of either.

import { generateForecast } from '@/utils/declineCurve/dcaEngine';
import { DAYS_PER_YEAR as REGISTRY_YEAR } from '@/lib/units/registry';

// One year is 365.25 days in Decline Curve Analysis, this hub and Well
// Spacing (DCA-U1-010): the Suite registry's year. It was 365 here.
export const DAYS_PER_YEAR = REGISTRY_YEAR;

/** Nominal annual decline (%/yr) to the DCA engine's per-day rate. */
export const dailyDecline = (declineAnnualPct) => (declineAnnualPct / 100) / DAYS_PER_YEAR;

const modelTypeFor = (b) => {
  if (b === 0) return 'Exponential';
  if (b === 1) return 'Harmonic';
  return 'Hyperbolic';
};

/**
 * Maximum well life for EUR (years): the decline is followed past the
 * horizon to the economic limit, but never beyond this, as reserves
 * software caps forecasts at a maximum life (ARIES and PHDWin default 50).
 */
export const EUR_MAX_YEARS = 50;

/**
 * Run one forecast case through the DCA engine.
 * @param {{id,name,qi,declineAnnualPct,b,years,economicLimit}} caseDef
 *   qi in bbl/d, declineAnnualPct nominal %/yr, horizon in years,
 *   economicLimit in bbl/d (0 disables the cutoff).
 * @param {string} startDateIso forecast start (defaults 2026-01-01)
 *
 * The horizon run gives the profile, the cumulative at the horizon and the
 * annual handoff. EUR is the cumulative to the economic limit (FSH-T1-001),
 * so when the limit is not reached inside the horizon the decline is
 * followed on to the limit or to EUR_MAX_YEARS, whichever comes first.
 * eurCapped marks an EUR stopped by the maximum life (always so without a
 * limit); timeToLimit is then null.
 */
export function runCase(caseDef, startDateIso = '2026-01-01T00:00:00Z') {
  const { qi, declineAnnualPct, b, years, economicLimit } = caseDef;
  if (!(qi > 0) || !(declineAnnualPct > 0) || !(years > 0) || b < 0) {
    return { ...caseDef, error: 'qi, decline and horizon must be positive (b >= 0).' };
  }
  const Di = dailyDecline(declineAnnualPct);
  const params = { qi, Di, b, modelType: modelTypeFor(b) };
  // HUB-U1: a case may carry its own start (a case received from Decline
  // Curve Analysis starts the day after the data cut-off)
  const start = caseDef.startDate ? `${String(caseDef.startDate).slice(0, 10)}T00:00:00Z` : startDateIso;
  const hasLimit = economicLimit > 0;
  const horizonDays = Math.round(years * DAYS_PER_YEAR);
  const run = (days) => generateForecast(
    params,
    { durationDays: days, economicLimit: hasLimit ? economicLimit : null, stopAtLimit: hasLimit },
    // the engine dates day 1 as the day after its start: start one day early
    // so the first day of the case is its start date
    new Date(Date.parse(start) - 86400000).toISOString(),
  );
  const result = run(horizonDays);
  const limitInHorizon = hasLimit && result.rates.length < horizonDays;
  let eur = result.eur;
  let timeToLimitDays = limitInHorizon ? result.timeToLimit : null;
  if (!limitInHorizon) {
    const maxDays = Math.max(horizonDays, Math.round(EUR_MAX_YEARS * DAYS_PER_YEAR));
    const long = maxDays > horizonDays ? run(maxDays) : result;
    eur = long.eur;
    if (hasLimit && long.rates.length < maxDays) timeToLimitDays = long.timeToLimit;
  }
  const last = result.rates[result.rates.length - 1];
  return {
    ...caseDef,
    startDate: start.slice(0, 10),
    rates: result.rates,             // daily {date, rate, cumulative} over the horizon
    cumHorizon: result.eur,          // bbl produced inside the horizon
    eur,                             // bbl to the economic limit or EUR_MAX_YEARS
    eurCapped: timeToLimitDays == null,
    limitInHorizon,
    finalRate: last ? last.rate : 0,
    timeToLimitDays,
    timeToLimitYears: timeToLimitDays == null ? null : timeToLimitDays / DAYS_PER_YEAR,
  };
}

/** Sum a daily forecast into annual volumes (bbl/yr), year 1 first. */
export function annualProfile(rates, years) {
  const out = new Array(years).fill(0);
  rates.forEach((pt, i) => {
    const y = Math.floor(i / DAYS_PER_YEAR);
    if (y < years) out[y] += pt.rate;
  });
  return out;
}

/** Downsample a daily forecast to ~monthly points for charting. */
export function monthlySeries(rates) {
  const out = [];
  for (let i = 0; i < rates.length; i += 30) {
    out.push({ day: i + 1, monthIndex: out.length + 1, rate: rates[i].rate, cumulative: rates[i].cumulative });
  }
  // keep the final day so the curve reaches the horizon or the limit
  const last = rates.length - 1;
  if (last >= 0 && last % 30 !== 0) {
    out.push({ day: last + 1, monthIndex: out.length + 1, rate: rates[last].rate, cumulative: rates[last].cumulative });
  }
  return out;
}

/** Cumulative production at a year milestone (bbl); null past cutoff. */
export function cumAtYear(rates, year) {
  const idx = Math.min(rates.length, Math.round(year * DAYS_PER_YEAR)) - 1;
  return idx >= 0 ? rates[idx].cumulative : 0;
}

/**
 * INDICATIVE case economics: annual cash flow = annual production x
 * (price - opex), discounted mid-year-free at year end. A ranking
 * number only — real fiscal modeling lives in NPV Scenario Builder.
 * @returns {{npv:number, undiscounted:number}} in $MM
 */
export function indicativeEconomics(annual, { pricePerBbl, opexPerBbl, discountRatePct }) {
  const d = discountRatePct / 100;
  let npv = 0;
  let undiscounted = 0;
  annual.forEach((prod, i) => {
    const cf = prod * (pricePerBbl - opexPerBbl);
    undiscounted += cf;
    npv += cf / Math.pow(1 + d, i + 1);
  });
  return { npv: npv / 1e6, undiscounted: undiscounted / 1e6 };
}

/** Run and summarize every case for the comparison view. */
export function compareCases(caseDefs, econ, startDateIso) {
  const cases = caseDefs.map((c) => runCase(c, startDateIso));
  const summaries = cases.map((c) => {
    if (c.error) return { id: c.id, name: c.name, error: c.error };
    const years = Math.ceil(c.years);
    const annual = annualProfile(c.rates, years);
    const economics = econ ? indicativeEconomics(annual, econ) : null;
    return {
      id: c.id,
      name: c.name,
      startDate: c.startDate,
      model: modelTypeFor(c.b),
      eurMMbbl: c.eur / 1e6,
      eurCapped: c.eurCapped,
      cumHorizonMMbbl: c.cumHorizon / 1e6,
      limitInHorizon: c.limitInHorizon,
      hasLimit: c.economicLimit > 0,
      finalRate: c.finalRate,
      timeToLimitYears: c.timeToLimitYears,
      cum5Years: Math.min(5, c.years),
      cum5MMbbl: cumAtYear(c.rates, Math.min(5, c.years)) / 1e6,
      annual,
      economics,
      monthly: monthlySeries(c.rates),
    };
  });
  return { cases, summaries };
}

export function sampleScenarioCases() {
  return {
    cases: [
      { id: 'base', name: 'Base', qi: 1200, declineAnnualPct: 18, b: 0.5, years: 20, economicLimit: 30 },
      { id: 'high', name: 'High (infill support)', qi: 1500, declineAnnualPct: 14, b: 0.7, years: 20, economicLimit: 30 },
      { id: 'low', name: 'Low (no workovers)', qi: 1000, declineAnnualPct: 24, b: 0.3, years: 20, economicLimit: 30 },
    ],
    econ: { pricePerBbl: 70, opexPerBbl: 18, discountRatePct: 10 },
  };
}
