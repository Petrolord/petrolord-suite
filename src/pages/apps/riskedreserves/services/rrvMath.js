// What the Risked Reserves Valuation report shows beyond the engine's
// headline numbers (upgrade U1, 2026-10-02): the parts of the expected
// monetary value, the outcome table, the risked percentiles and the two
// expectation curves. Nothing here is a second valuation: every figure is
// built from the engine's own exports (the lognormal fitted to P90 and P10,
// its exceedance and its partial expectation), and the tests hold the parts
// against the engine's totals (valueProspect) to numerical precision.

import {
  valueProspect, lognormalFromP90P10, exceedance, partialMeanAbove,
} from '@/utils/prospectValuation';

/**
 * The expected monetary value in its parts (reviewer lens RL2, RL3):
 *   EMV = Pg x u x E(V; V >= MEFS)  -  Pg x D x P(V >= MEFS)  -  W
 * `revenue` is the chance-weighted value of the barrels of a commercial
 * discovery, `development` the chance-weighted development cost, `well`
 * the exploration well, spent in every outcome. The three close on `emv`.
 * @param {{pg, p90, p10, mefs, unitValue, devCost, wellCost}} e engine input
 */
export function emvParts(e) {
  const ln = lognormalFromP90P10(e.p90, e.p10);
  const mefs = e.mefs || 0;
  const pComm = exceedance(ln, mefs);
  const partial = partialMeanAbove(ln, mefs);
  const revenue = e.pg * (e.unitValue || 0) * partial;
  const development = e.pg * (e.devCost || 0) * pComm;
  const well = e.wellCost || 0;
  return { revenue, development, well, emv: revenue - development - well, pCommercialGivenSuccess: pComm, partialMean: partial };
}

/**
 * The three outcomes of the exploration well, with their chance and value.
 * The chances sum to one and the chance-weighted values to the EMV.
 *   dry hole                       1 - Pg                       -W
 *   discovery below the MEFS       Pg x (1 - P(V >= MEFS))      -W   (not developed)
 *   commercial discovery           Pg x P(V >= MEFS)            u x mean(V | V >= MEFS) - D - W
 * @param {object} e engine input
 * @param {object} v valueProspect(e)
 */
export function outcomes(e, v) {
  const W = e.wellCost || 0;
  const sub = v.pg * (1 - v.pCommercialGivenSuccess);
  const rows = [
    { key: 'dry', label: 'Dry hole', chance: 1 - v.pg, volume: 0, value: -W },
    { key: 'sub', label: 'Discovery below the MEFS (not developed)', chance: sub, volume: null, value: -W },
    { key: 'commercial', label: 'Commercial discovery (mean case)', chance: v.pc, volume: v.meanIfCommercial, value: v.npvIfCommercial != null ? v.npvIfCommercial - W : null },
  ];
  const chance = rows.reduce((s, r) => s + r.chance, 0);
  const expected = rows.reduce((s, r) => s + (r.chance > 0 && r.value != null ? r.chance * r.value : 0), 0);
  return { rows, chance, expected };
}

/**
 * A percentile of the RISKED volume: the volume exceeded with probability
 * `exceed` over all outcomes, the dry hole included. With Pg at or below
 * `exceed` the answer is zero (the well is more likely dry than that).
 */
export function riskedPercentile(e, exceed) {
  if (!(e.pg > exceed)) return 0;
  return lognormalFromP90P10(e.p90, e.p10).percentile(exceed / e.pg);
}

/** Success-case and risked volume percentiles and means, in the engine's unit. */
export function volumeTable(e, v) {
  const ln = lognormalFromP90P10(e.p90, e.p10);
  return ['p90', 'p50', 'p10'].map((k) => {
    const x = { p90: 0.9, p50: 0.5, p10: 0.1 }[k];
    return { key: k, exceed: x, entered: k === 'p50' ? (e.p50 ?? null) : e[k], fitted: ln.percentile(x), risked: riskedPercentile(e, x) };
  }).concat([{ key: 'mean', exceed: null, entered: null, fitted: v.successCase.mean, risked: v.riskedMean }]);
}

/**
 * The volume expectation curves on a log volume axis: the success case
 * P(V >= x given a discovery) and the risked curve Pg x that, as [x, %].
 */
export function volumeCurves(e, { points = 60 } = {}) {
  const ln = lognormalFromP90P10(e.p90, e.p10);
  const lo = ln.percentile(0.99);
  const hi = ln.percentile(0.01);
  const success = []; const risked = [];
  for (let k = 0; k < points; k += 1) {
    const x = lo * Math.exp((k / (points - 1)) * Math.log(hi / lo));
    const ex = exceedance(ln, x);
    success.push([x, ex * 100]);
    risked.push([x, e.pg * ex * 100]);
  }
  return { success, risked, lo, hi };
}

/**
 * The value of the well's outcome, Y ($MM): -W for a dry hole or a
 * discovery below the MEFS; u V - D - W for a commercial one.
 * P(Y >= y) = [ -W >= y ] x (1 - Pg P(V >= MEFS))  +  Pg x P(V >= max(MEFS, (y + D + W) / u)).
 * `given: 'success'` conditions on a discovery (Pg = 1).
 */
export function valueExceedance(e, y, { given = 'all' } = {}) {
  const ln = lognormalFromP90P10(e.p90, e.p10);
  const pg = given === 'success' ? 1 : e.pg;
  const W = e.wellCost || 0; const D = e.devCost || 0; const u = e.unitValue || 0; const mefs = e.mefs || 0;
  const pComm = exceedance(ln, mefs);
  const stay = -W >= y ? 1 - pg * pComm : 0;
  if (!(u > 0)) return stay + (-D - W >= y ? pg * pComm : 0);
  return stay + pg * exceedance(ln, Math.max(mefs, (y + D + W) / u));
}

/**
 * The value expectation curves as [value $MM, %], from the worst outcome to
 * the value of the 1 percent volume. Null when there is no value per barrel
 * (every commercial outcome is then worth the same).
 */
export function valueCurves(e, { points = 80 } = {}) {
  const u = e.unitValue || 0;
  if (!(u > 0)) return null;
  const ln = lognormalFromP90P10(e.p90, e.p10);
  const W = e.wellCost || 0; const D = e.devCost || 0;
  const at = (vol) => u * vol - D - W;
  const worst = Math.min(-W, at(Math.max(e.mefs || 0, ln.percentile(0.999))));
  const best = at(ln.percentile(0.01));
  if (!(best > worst)) return null;
  const lo = worst - (best - worst) * 0.03;
  const risked = []; const success = [];
  const xs = new Set();
  for (let k = 0; k < points; k += 1) xs.add(lo + (k / (points - 1)) * (best - lo));
  // the step at -W, drawn on both sides of it
  xs.add(-W); xs.add(-W + (best - lo) * 1e-6);
  for (const y of [...xs].sort((a, b) => a - b)) {
    risked.push([y, valueExceedance(e, y) * 100]);
    success.push([y, valueExceedance(e, y, { given: 'success' }) * 100]);
  }
  return { risked, success, lo, hi: best };
}

/** The engine result for a valuation's engine input, or the reason it cannot be valued. */
export function valueOrProblem(e) {
  try { return { v: valueProspect(e), problem: null }; } catch (err) { return { v: null, problem: err.message }; }
}

// ---- sensitivity of the EMV (upgrade U2-003) -----------------------------------

/** The stated ranges: a swing in percent for the inputs, a step in absolute chance for a chance factor. */
export const SENS_DEFAULTS = Object.freeze({ swing: 25, factorSwing: 0.1 });
const FACTOR_ORDER = ['trap', 'reservoir', 'charge', 'seal', 'other'];
const FACTOR_WORD = { trap: 'Trap', reservoir: 'Reservoir', charge: 'Charge', seal: 'Seal', other: 'Other' };
const clamp01 = (x) => Math.min(1, Math.max(0, x));

/**
 * The tornado: one input at a time moved to a low and a high case, the
 * others held, and the valuation engine asked again (valueProspect). No
 * arithmetic of its own beyond setting the case.
 *   Pg                 x (1 -/+ swing), kept inside 0 to 1
 *   each chance factor -/+ factorSwing in absolute chance, inside 0 to 1;
 *                      Pg moves in proportion (Pg x f' / f). Only when Pg is
 *                      the product of the factors.
 *   volumes            P90, P50 and P10 together x (1 -/+ swing)
 *   value per barrel, development cost, well cost, MEFS   x (1 -/+ swing)
 * Because the inputs move one at a time, a derived MEFS does not follow the
 * value per barrel or the development cost here: each bar is that input
 * alone.
 * @param {{pg, p90, p50?, p10, mefs, unitValue, devCost, wellCost}} e engine input
 * @param {{pgFactors?: ?object, swing?: number, factorSwing?: number}} [o]
 * @returns {{base: number, swing: number, factorSwing: number, rows: Array<{key: string, label: string,
 *   base: number, low: {input: number, emv: number}, high: {input: number, emv: number}, range: number}>,
 *   leftOut: string[], factorsNote: ?string}} rows ordered by range, largest first
 */
export function emvSensitivity(e, { pgFactors = null, swing = SENS_DEFAULTS.swing, factorSwing = SENS_DEFAULTS.factorSwing } = {}) {
  const s = Number.isFinite(Number(swing)) && Number(swing) > 0 && Number(swing) < 100 ? Number(swing) : SENS_DEFAULTS.swing;
  const fs = Number.isFinite(Number(factorSwing)) && Number(factorSwing) > 0 && Number(factorSwing) < 1 ? Number(factorSwing) : SENS_DEFAULTS.factorSwing;
  const k = s / 100;
  const emvOf = (over) => valueProspect({ ...e, ...over }).emv;
  const base = emvOf({});
  const rows = [];
  const leftOut = [];
  const add = (key, label, baseInput, lowInput, highInput, caseOf) => {
    const low = { input: lowInput, emv: emvOf(caseOf(lowInput)) };
    const high = { input: highInput, emv: emvOf(caseOf(highInput)) };
    rows.push({ key, label, base: baseInput, low, high, range: Math.abs(high.emv - low.emv) });
  };
  add('pg', 'Chance of success Pg', e.pg, clamp01(e.pg * (1 - k)), clamp01(e.pg * (1 + k)), (x) => ({ pg: x }));

  let factorsNote = null;
  const used = pgFactors ? FACTOR_ORDER.filter((f) => Number.isFinite(pgFactors[f])) : [];
  if (!used.length) factorsNote = 'The prospect carries no chance factors, so only the total Pg is moved.';
  else {
    const product = used.reduce((a, f) => a * pgFactors[f], 1);
    if (Math.abs(product - e.pg) > 5e-7) factorsNote = 'The Pg used is not the product of the chance factors, so the factors are not moved one by one; the total Pg is.';
    else {
      for (const f of used) {
        const v = pgFactors[f];
        if (!(v > 0)) continue;
        add(`factor.${f}`, `${FACTOR_WORD[f]} chance`, v, clamp01(v - fs), clamp01(v + fs), (x) => ({ pg: clamp01(e.pg * (x / v)) }));
      }
    }
  }
  const p50 = e.p50 === undefined || e.p50 === null ? undefined : e.p50;
  add('volumes', 'Success-case volumes', 1, 1 - k, 1 + k, (x) => ({ p90: e.p90 * x, p10: e.p10 * x, ...(p50 === undefined ? {} : { p50: p50 * x }) }));
  for (const [key, label, word] of [['unitValue', 'Value per barrel', 'value per barrel'], ['devCost', 'Development cost', 'development cost'], ['wellCost', 'Exploration well cost', 'exploration well cost'], ['mefs', 'MEFS', 'MEFS']]) {
    const v = Number(e[key]) || 0;
    if (!(v > 0)) { leftOut.push(word); continue; }
    add(key, label, v, v * (1 - k), v * (1 + k), (x) => ({ [key]: x }));
  }
  rows.sort((a, b) => b.range - a.range);
  return { base, swing: s, factorSwing: fs, rows, leftOut, factorsNote };
}
