// The economics behind a valuation (upgrade U2-002, 2026-10-02): the minimum
// economic field size and the value of a discovery follow from ONE small
// stated economic model, where Step 1 had three unrelated typed numbers
// (finding RRV-U1-016: at the old defaults a 10 MMboe discovery lost 20 $MM
// while 10 MMboe was the MEFS).
//
// NO NPV ARITHMETIC LIVES HERE. Every net present value is the canonical
// screening engine's (`calculateEconomics`, src/utils/npvCalculations.js,
// ReservoirEngineering-Module section 5), on the cash-flow case that
// ReservoirCalc Pro already builds for its success-case economics
// (`economicsCase`), so the two ends of the prospect chain cannot drift.
// This module asks that engine for the NPV of a development of a given size
// and does three things with the answers:
//
//   1. the derived MEFS: the smallest size whose NPV is at or above zero
//      (bisection on the engine's NPV);
//   2. the value line the valuation engine reads, value(V) = u V - D: the
//      straight line through the engine NPV at the MEFS and at the mean
//      commercial size, so a discovery of exactly the MEFS is worth what the
//      engine says (zero) and EMV = Pc x NPV(mean commercial size) - W;
//   3. a cross-check of that line: the EMV with the value-by-size curve
//      integrated segment by segment, built from the valuation engine's own
//      lognormal exports (no Monte Carlo).
//
// Money is $MM, volumes MMboe, value per barrel $/boe.

import { calculateEconomics } from '@/utils/npvCalculations';
import { economicsCase, ECONOMICS_DEFAULTS } from '@/pages/apps/ReservoirCalcPro/services/prospectEconomics';
import { lognormalFromP90P10, exceedance, partialMeanAbove } from '@/utils/prospectValuation';

/** The starting model: ReservoirCalc Pro's screening defaults, plus a capex that grows with size. */
export const ECON_MODEL_DEFAULTS = Object.freeze({ ...ECONOMICS_DEFAULTS, capexPerBoe: 0 });

export const ECON_ENGINE = 'calculateEconomics (screening; src/utils/npvCalculations.js), tax and royalty, mid-year discounting';

/**
 * The assumptions a person states, in the order the screen and the report
 * list them: [key, label, unit, kind]. `perVolume` rows follow the display
 * volume unit ($/boe or $/m3 oe); the rest are the same in both systems.
 */
export const ECON_MODEL_FIELDS = Object.freeze([
  ['price', 'Price', '$/boe', 'perVolume'],
  ['opexPerBoe', 'Variable operating cost', '$/boe', 'perVolume'],
  ['opexFixed', 'Fixed operating cost', '$MM/yr', 'plain'],
  ['capex', 'Development capex, fixed', '$MM', 'plain'],
  ['capexPerBoe', 'Development capex per barrel', '$/boe', 'perVolume'],
  ['life', 'Producing life', 'years', 'plain'],
  ['decline', 'Production decline', '%/yr', 'plain'],
  ['royalty', 'Royalty', '%', 'plain'],
  ['tax', 'Tax', '%', 'plain'],
  ['discount', 'Discount rate', '%', 'plain'],
]);
export const ECON_MODEL_KEYS = Object.freeze(ECON_MODEL_FIELDS.map(([k]) => k));

const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

// The page asks for the same model's answers on every render and keystroke;
// the answers are pure, so the last few are kept (a small bounded cache).
const memo = (limit = 64) => {
  const m = new Map();
  return (key, make) => {
    if (m.has(key)) return m.get(key);
    const v = make();
    m.set(key, v);
    if (m.size > limit) m.delete(m.keys().next().value);
    return v;
  };
};
const mefsMemo = memo();
const curveMemo = memo();
const keyOf = (a) => JSON.stringify(ECON_MODEL_KEYS.map((k) => a[k]).concat(a.startYear));

/** The model with every assumption as a number (a blank stays NaN and is named by modelProblem). */
export function modelOf(assumptions) {
  const a = { ...ECON_MODEL_DEFAULTS, ...(assumptions || {}) };
  const out = { startYear: Number(a.startYear) || ECON_MODEL_DEFAULTS.startYear };
  for (const k of ECON_MODEL_KEYS) out[k] = num(a[k]);
  return out;
}

/** Why the model cannot be run, or null. A blank is never read as zero. */
export function modelProblem(assumptions) {
  const a = modelOf(assumptions);
  for (const [k, label] of ECON_MODEL_FIELDS) {
    if (!Number.isFinite(a[k])) return `Economic model: enter ${label.charAt(0).toLowerCase()}${label.slice(1)} (zero is allowed).`;
    if (a[k] < 0) return `Economic model: ${label.charAt(0).toLowerCase()}${label.slice(1)} must be zero or more.`;
  }
  if (!(a.life >= 1)) return 'Economic model: the producing life must be at least one year.';
  if (a.life > 60) return 'Economic model: the producing life must be 60 years or less.';
  if (a.decline >= 100 || a.royalty > 100 || a.tax > 100) return 'Economic model: decline, royalty and tax are percentages below 100.';
  return null;
}

/**
 * NPV ($MM) of developing a discovery of `sizeMMboe`, from the canonical
 * engine. Year 0 carries the development capex (the fixed part plus the
 * part per barrel); years 1 to `life` produce on an exponential decline.
 */
export function npvOfSize(sizeMMboe, assumptions) {
  const a = modelOf(assumptions);
  const size = Math.max(0, Number(sizeMMboe) || 0);
  const withCapex = { ...a, capex: a.capex + a.capexPerBoe * size };
  return calculateEconomics(economicsCase(size, withCapex, { withCapex: true }), { skipIrr: true }).metrics.npv;
}

const SIZE_CAP = 1e6; // MMboe: beyond any field; a model that does not pay here never pays

/**
 * The minimum economic field size of the model: the smallest size whose
 * engine NPV is at or above zero.
 * @returns {{ok: boolean, mefs?: number, npvAtMefs?: number, reason?: string}}
 */
export function derivedMefs(assumptions) {
  const bad = modelProblem(assumptions);
  if (bad) return { ok: false, reason: bad };
  return mefsMemo(keyOf(modelOf(assumptions)), () => solveMefs(assumptions));
}

function solveMefs(assumptions) {
  const f = (v) => npvOfSize(v, assumptions);
  if (f(0) >= 0) return { ok: true, mefs: 0, npvAtMefs: f(0) };
  let lo = 0;
  let hi = 1;
  while (f(hi) < 0) {
    lo = hi;
    hi *= 2;
    if (hi > SIZE_CAP) return { ok: false, reason: 'Economic model: no field size pays. A barrel is worth nothing after operating cost, royalty, tax and the capex per barrel, so there is no minimum economic field size.' };
  }
  for (let i = 0; i < 200 && hi - lo > 1e-12 * Math.max(1, hi); i += 1) {
    const mid = (lo + hi) / 2;
    if (f(mid) >= 0) hi = mid; else lo = mid;
  }
  return { ok: true, mefs: hi, npvAtMefs: f(hi) };
}

/** Mean of the success case above `m` (the mean commercial size), from the valuation engine's exports. */
function meanAbove(ln, m) {
  const pc = exceedance(ln, m);
  return pc > 0 ? partialMeanAbove(ln, m) / pc : null;
}

/**
 * The value line of the model for one prospect: value(V) = u V - D, the
 * secant of the engine's NPV between the MEFS in use and the mean
 * commercial size of this prospect's success case.
 * @param {object} assumptions the economic model
 * @param {{p90: number, p10: number}} volumes success-case volumes, MMboe
 * @param {?number} [mefsInUse] a typed MEFS; default the derived one
 * @returns {{ok: boolean, reason?: string, mefs?: number, derivedMefs?: number, unitValue?: number,
 *   devCost?: number, meanCommercial?: number, npvAtMeanCommercial?: number, npvAtMefs?: number}}
 */
export function valueLine(assumptions, volumes, mefsInUse = null) {
  const d = derivedMefs(assumptions);
  if (!d.ok) return d;
  const m = mefsInUse === null || mefsInUse === undefined || mefsInUse === '' ? d.mefs : Number(mefsInUse);
  if (!(m >= 0)) return { ok: false, reason: 'The MEFS must be zero or more.' };
  let anchor = null;
  const p90 = Number(volumes?.p90);
  const p10 = Number(volumes?.p10);
  if (p90 > 0 && p10 > p90) anchor = meanAbove(lognormalFromP90P10(p90, p10), m);
  // no usable success case yet (or one wholly below the MEFS): anchor the
  // line at twice the MEFS so the model still shows its slope
  if (!(anchor > m * (1 + 1e-9))) anchor = Math.max(2 * m, m + 1);
  const npvM = npvOfSize(m, assumptions);
  const npvA = npvOfSize(anchor, assumptions);
  const unitValue = (npvA - npvM) / (anchor - m);
  const devCost = unitValue * m - npvM;
  return { ok: true, mefs: m, derivedMefs: d.mefs, unitValue, devCost, meanCommercial: anchor, npvAtMeanCommercial: npvA, npvAtMefs: npvM };
}

/** Engine NPV at each size: [{size, npv, perBoe}] (perBoe null at size zero). */
export function valueBySize(assumptions, sizes) {
  return sizes.map((size) => {
    const npv = npvOfSize(size, assumptions);
    return { size, npv, perBoe: size > 0 ? npv / size : null };
  });
}

/**
 * Cross-check of the value line: the EMV with the value-by-size curve
 * itself. The engine NPV is taken at `nodes` sizes from the MEFS up to the
 * size exceeded once in ten thousand discoveries, joined by straight
 * segments, and each segment's expectation is closed form on the success
 * case lognormal (the valuation engine's exceedance and partial mean):
 *   E[a V + b ; x1 <= V < x2] = a (PM(x1) - PM(x2)) + b (Ex(x1) - Ex(x2)).
 * EMV = Pg x sum - W. No sampling.
 * @param {{pg: number, p90: number, p10: number, mefs: number, wellCost: number}} e engine input
 */
export function emvOnCurve(e, assumptions, { nodes = 48 } = {}) {
  return curveMemo(`${keyOf(modelOf(assumptions))}|${[e.pg, e.p90, e.p10, e.mefs, e.wellCost, nodes].join(',')}`, () => integrateCurve(e, assumptions, nodes));
}

function integrateCurve(e, assumptions, nodes) {
  const ln = lognormalFromP90P10(e.p90, e.p10);
  const m = Math.max(0, e.mefs || 0);
  const top = Math.max(ln.percentile(1e-4), m * 2, m + 1);
  const start = m > 0 ? m : Math.min(ln.percentile(0.9999), top / 1e4);
  const xs = [];
  for (let k = 0; k < nodes; k += 1) xs.push(start * Math.exp((k / (nodes - 1)) * Math.log(top / start)));
  const ys = xs.map((x) => npvOfSize(x, assumptions));
  let sum = 0;
  for (let i = 0; i < nodes - 1; i += 1) {
    const a = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
    const b = ys[i] - a * xs[i];
    const last = i === nodes - 2;
    const pm2 = last ? 0 : partialMeanAbove(ln, xs[i + 1]);
    const ex2 = last ? 0 : exceedance(ln, xs[i + 1]);
    sum += a * (partialMeanAbove(ln, xs[i]) - pm2) + b * (exceedance(ln, xs[i]) - ex2);
  }
  return e.pg * sum - (e.wellCost || 0);
}

/**
 * The value-by-size curve for a plot: engine NPV against size, and the line
 * the valuation uses, as [size MMboe, $MM] points from `lo` to `hi`.
 * @param {?object} assumptions the economic model, or null when the value is a line only
 * @param {{unitValue: number, devCost: number}} line
 */
export function valueSizeCurves(assumptions, line, lo, hi, { points = 40 } = {}) {
  const from = Math.max(0, lo);
  const curve = []; const straight = [];
  for (let k = 0; k < points; k += 1) {
    const x = from + (k / (points - 1)) * (hi - from);
    if (assumptions) curve.push([x, npvOfSize(x, assumptions)]);
    straight.push([x, line.unitValue * x - line.devCost]);
  }
  return { curve: assumptions ? curve : null, line: straight };
}
