// Cutoff sensitivity (AppUpgrade PETRO-U2-005, 2026-09-29).
//
// The reviewer's first question about a net pay number is "how much does it
// move if the cutoff moves?". Interactive Petrophysics answers it with its
// Cutoff Sensitivity plot; the method is the one Worthington and Cosentino
// set out (P.F. Worthington and L. Cosentino, "The Role of Cutoffs in
// Integrated Reservoir Studies", SPE Reservoir Evaluation & Engineering
// 8(4), 2005, SPE 84387): hold the interpretation fixed, sweep one cutoff
// across its range with the others at their chosen values, and plot net pay
// and hydrocarbon pore thickness against the swept cutoff. A cutoff that
// sits on a steep part of the curve is one whose choice drives the answer.
//
// Nothing is re-derived here. The cutoffs do not enter VSH, PHIE or SW
// (they only decide which samples count), so every point on a curve is the
// Studio's own zone report (services/zoneAverages.js zoneReport, which calls
// the vendored, oracle-gated netPay and zoneSummary) run on the same curves
// with one cutoff replaced. The point at the current cutoff is therefore the
// zone card's number exactly.

import { zoneReport } from './zoneAverages';

/** The three summation cutoffs, their sweep ranges and what "pass" means. */
export const SENSITIVITY_CUTOFFS = Object.freeze([
  { key: 'cutPhi', label: 'Porosity cutoff (φe ≥)', short: 'phi', min: 0, max: 0.3, step: 0.01, sense: 'min' },
  { key: 'cutVsh', label: 'Vsh cutoff (Vsh ≤)', short: 'Vsh', min: 0, max: 1, step: 0.05, sense: 'max' },
  { key: 'cutSw', label: 'Sw cutoff (Sw ≤)', short: 'Sw', min: 0, max: 1, step: 0.05, sense: 'max' },
]);

/** The quantities each sweep reports (zone report fields). */
export const SENSITIVITY_FIELDS = Object.freeze(['net_m', 'net_res_m', 'hcpv_m', 'ntg', 'phi_avg', 'sw_avg', 'net_tvt_m', 'hcpv_tvt_m']);

const snap = (v) => Number(v.toFixed(6));

/**
 * The swept values for one cutoff: the regular grid over its range plus the
 * current value (so the current point is always on the curve, exactly).
 * @param {{min: number, max: number, step: number}} def
 * @param {number} current
 * @returns {number[]} ascending, unique
 */
export function sweepValues(def, current) {
  const out = new Set();
  const n = Math.round((def.max - def.min) / def.step);
  for (let i = 0; i <= n; i++) out.add(snap(def.min + i * def.step));
  if (Number.isFinite(current)) out.add(snap(current));
  return [...out].sort((a, b) => a - b);
}

/**
 * Sweep each cutoff for one zone.
 * @param {Object} args
 * @param {{DEPT: ArrayLike<number>}} args.curves pipeline input curves
 * @param {Object<string, Float64Array>} args.outputs pipeline outputs
 * @param {Object} args.params the zone's MERGED parameters (base + overrides)
 * @param {{top_md_m: number, base_md_m: number}} args.zone
 * @param {?Float64Array} [args.vth] vertical sample thickness (TVT)
 * @param {Array} [args.cutoffs] default SENSITIVITY_CUTOFFS
 * @returns {?{current: Object, sweeps: Object<string, {def: Object, current: number, points: Array<Object>}>}}
 *   null when the zone has nothing to summarise (no PHIE, VSH or SW)
 */
export function cutoffSensitivity({ curves, outputs, params, zone, vth = null, cutoffs = SENSITIVITY_CUTOFFS }) {
  const current = zoneReport(curves, outputs, params, zone, { vth });
  if (!current) return null;
  const sweeps = {};
  for (const def of cutoffs) {
    const cur = Number(params[def.key]);
    const points = sweepValues(def, cur).map((value) => {
      const r = zoneReport(curves, outputs, { ...params, [def.key]: value }, zone, { vth });
      const pt = { value };
      for (const f of SENSITIVITY_FIELDS) pt[f] = r?.[f] ?? null;
      return pt;
    });
    sweeps[def.key] = { def, current: cur, points };
  }
  return { current, sweeps };
}

/**
 * Sensitivity for every zone on its own merged parameters.
 * @returns {Object<string, ReturnType<typeof cutoffSensitivity>>} zoneId -> result
 */
export function zoneSensitivities({ curves, outputs, params, zones = [], zoneParams = {}, vth = null }) {
  const out = {};
  if (!curves || !outputs) return out;
  for (const z of zones) {
    const merged = { ...params, ...(zoneParams[z.id] || {}) };
    out[z.id] = cutoffSensitivity({ curves, outputs, params: merged, zone: z, vth });
  }
  return out;
}

/**
 * The few points either side of the current cutoff, for tables (the PDF and
 * the dialog's table). Steps are the sweep grid's own.
 * @returns {Array<{value: number, isCurrent: boolean, net_m, hcpv_m}>}
 */
export function pointsAround(sweep, steps = 2) {
  if (!sweep) return [];
  const i = sweep.points.findIndex((p) => p.value === snap(sweep.current));
  if (i < 0) return [];
  return sweep.points.slice(Math.max(0, i - steps), i + steps + 1)
    .map((p) => ({ ...p, isCurrent: p.value === snap(sweep.current) }));
}

/**
 * How steep the curve is at the current cutoff: the change in net pay
 * between the neighbouring grid points either side, as a fraction of the
 * current net pay. A plain number a reviewer can compare across cutoffs.
 * @returns {?number} null when net pay is zero or the cutoff sits at an end
 */
export function relativeSwing(sweep, field = 'net_m') {
  const pts = pointsAround(sweep, 1);
  const i = pts.findIndex((p) => p.isCurrent);
  if (i <= 0 || i >= pts.length - 1) return null;
  const cur = pts[i][field];
  if (!(cur > 0)) return null;
  return Math.abs(pts[i + 1][field] - pts[i - 1][field]) / cur;
}
