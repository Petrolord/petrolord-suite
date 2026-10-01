// Success-case economics through the canonical screening NPV (ReservoirCalc
// Pro upgrade U2-012, 2026-10-01). No NPV arithmetic here: the cash flow,
// fiscal terms and discounting are `calculateEconomics` in
// src/utils/npvCalculations.js (ReservoirEngineering-Module section 5).
// This module only builds its inputs from a prospect's success-case
// recoverable volume and reads its NPV back.
//
// Risked Reserves Valuation values a discovery as
//   value per barrel x volume - development cost
// so the hand-over gives it both from the same engine:
//   unitValue = NPV without the development capex / volume ($ per boe)
//   devCost   = that NPV minus the NPV with the capex ($MM, the discounted,
//               after-tax cost of development as the engine sees it)
// and unitValue x volume - devCost is the engine's success-case NPV.

import { calculateEconomics } from '@/utils/npvCalculations';
import { VOLUME_UNITS } from './prospectVolumes';

export const ECONOMICS_DEFAULTS = Object.freeze({
  price: 70, // $ per boe
  life: 15, // producing years
  decline: 12, // percent per year, exponential
  capex: 400, // $MM, spent in the year before first production
  opexPerBoe: 12, // $ per boe
  opexFixed: 10, // $MM per producing year
  royalty: 10, // percent
  tax: 30, // percent
  discount: 10, // percent
  startYear: 2027,
});

/** Annual volumes (boe) of an exponential decline that recover `totalBoe`. */
export function declineProfile(totalBoe, life, declinePct) {
  const n = Math.max(1, Math.round(life));
  const f = 1 - Math.min(99, Math.max(0, declinePct)) / 100;
  const w = Array.from({ length: n }, (_, t) => f ** t);
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((x) => (totalBoe * x) / s);
}

/** The engine's input case: year 0 is development, years 1..life produce. */
export function economicsCase(meanMMboe, a = ECONOMICS_DEFAULTS, { withCapex = true } = {}) {
  const prod = [0, ...declineProfile(meanMMboe * 1e6, a.life, a.decline)];
  const n = prod.length;
  return {
    startYear: a.startYear,
    projectLife: n,
    discountRate: a.discount,
    fiscalType: 'TaxRoyalty',
    production: { oil: prod, gas: new Array(n).fill(0) },
    price: { oil: new Array(n).fill(a.price), gas: new Array(n).fill(0) },
    capex: withCapex ? [a.capex, ...new Array(n - 1).fill(0)] : new Array(n).fill(0),
    opexFixed: [0, ...new Array(n - 1).fill(a.opexFixed)],
    opexVariable: prod.map((q) => (q * a.opexPerBoe) / 1e6),
    abandonment: new Array(n).fill(0),
    royaltyRate: a.royalty,
    taxRate: a.tax,
  };
}

/**
 * Success-case economics of a prospect.
 * @param {number} mean success-case mean recoverable volume in `unit`
 * @param {string} unit a VOLUME_UNITS key
 * @param {Object} assumptions ECONOMICS_DEFAULTS shape
 * @returns {{ok: boolean, reason?: string, meanMMboe?: number, npvMM?: number, npvBeforeDevMM?: number, unitValue?: number, devCost?: number, assumptions?: Object, engine?: string}}
 */
export function prospectEconomics(mean, unit, assumptions = ECONOMICS_DEFAULTS) {
  const k = VOLUME_UNITS[unit]?.toMMboe;
  if (!Number.isFinite(k)) return { ok: false, reason: 'The volume has no stated unit, so it cannot be valued.' };
  if (!(Number(mean) > 0)) return { ok: false, reason: 'Enter a success-case mean volume first.' };
  const a = { ...ECONOMICS_DEFAULTS, ...assumptions };
  for (const key of ['price', 'life', 'capex', 'opexPerBoe', 'opexFixed', 'discount']) {
    if (!(Number(a[key]) >= 0)) return { ok: false, reason: `The ${key} must be zero or more.` };
  }
  if (!(a.life >= 1)) return { ok: false, reason: 'The producing life must be at least one year.' };
  const meanMMboe = Number(mean) * k;
  const full = calculateEconomics(economicsCase(meanMMboe, a, { withCapex: true }), { skipIrr: true });
  const noDev = calculateEconomics(economicsCase(meanMMboe, a, { withCapex: false }), { skipIrr: true });
  const npvMM = full.metrics.npv;
  const npvBeforeDevMM = noDev.metrics.npv;
  return {
    ok: true,
    meanMMboe,
    npvMM,
    npvBeforeDevMM,
    unitValue: npvBeforeDevMM / meanMMboe, // $MM per MMboe = $ per boe
    devCost: npvBeforeDevMM - npvMM,
    assumptions: a,
    engine: 'calculateEconomics (screening; src/utils/npvCalculations.js), mid-year discounting',
  };
}
