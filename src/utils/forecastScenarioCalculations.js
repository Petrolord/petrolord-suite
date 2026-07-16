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

export const DAYS_PER_YEAR = 365;

/** Nominal annual decline (%/yr) to the DCA engine's per-day rate. */
export const dailyDecline = (declineAnnualPct) => (declineAnnualPct / 100) / DAYS_PER_YEAR;

const modelTypeFor = (b) => {
  if (b === 0) return 'Exponential';
  if (b === 1) return 'Harmonic';
  return 'Hyperbolic';
};

/**
 * Run one forecast case through the DCA engine.
 * @param {{id,name,qi,declineAnnualPct,b,years,economicLimit}} caseDef
 *   qi in bbl/d, declineAnnualPct nominal %/yr, horizon in years,
 *   economicLimit in bbl/d (0 disables the cutoff).
 * @param {string} startDateIso forecast start (defaults 2026-01-01)
 */
export function runCase(caseDef, startDateIso = '2026-01-01T00:00:00Z') {
  const { qi, declineAnnualPct, b, years, economicLimit } = caseDef;
  if (!(qi > 0) || !(declineAnnualPct > 0) || !(years > 0) || b < 0) {
    return { ...caseDef, error: 'qi, decline and horizon must be positive (b >= 0).' };
  }
  const Di = dailyDecline(declineAnnualPct);
  const result = generateForecast(
    { qi, Di, b, modelType: modelTypeFor(b) },
    {
      durationDays: Math.round(years * DAYS_PER_YEAR),
      economicLimit: economicLimit > 0 ? economicLimit : null,
      stopAtLimit: economicLimit > 0,
    },
    startDateIso,
  );
  return {
    ...caseDef,
    rates: result.rates,             // daily {date, rate, cumulative}
    eur: result.eur,                 // bbl over the produced window
    timeToLimitDays: result.timeToLimit,
    timeToLimitYears: result.timeToLimit / DAYS_PER_YEAR,
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
      model: modelTypeFor(c.b),
      eurMMbbl: c.eur / 1e6,
      timeToLimitYears: c.timeToLimitYears,
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
