// What a reviewer signs against (ReservoirCalc Pro upgrade U1, PL7,
// RCP-U1-019 and RCP-U1-023, 2026-09-30). Both PDF reports used to carry
// the project and reservoir names only: no field, analyst, build, unit
// system, method, gridding or contact datum, and the contacts printed as
// a bare "-8000" with no unit. The gridding (interpolation and cell
// count) is a per-browser setting, so a project reopened elsewhere could
// give another volume with nothing on the page to say why. Pure; every
// line is Latin-1 so jsPDF's standard fonts print it.

import { buildLabel } from '@/lib/platformBuild';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import { provenanceLines } from './emProvenance';

/** Replace anything jsPDF's standard fonts cannot print. */
export const latin1 = (t) => String(t ?? '')
  .replace(/[‒-―−]/g, '-')
  .replace(/[•·]/g, '|')
  .replace(/φ/g, 'phi')
  .replace(/≥/g, '>=')
  .replace(/≤/g, '<=')
  .replace(/[^\n\x20-\x7e\xa0-\xff]/g, '?');

const METHOD_LABEL = {
  simple: 'Simple (area x gross thickness, no structure; contacts not used)',
  hybrid: 'Hybrid (top surface + constant gross thickness, cut by the contacts)',
  surfaces: 'Surfaces (top and base surfaces, cut by the contacts)',
  areadepth: 'Area/depth table (top and base area against depth, cut by the contacts)',
};
const INTERP_LABEL = { kriging: 'ordinary kriging', idw: 'inverse distance', lattice: 'the registry grid\'s own nodes (no re-gridding)' };

const round = (v, d = 1) => (Number.isFinite(v) ? Number(v.toFixed(d)).toLocaleString('en-US') : EMPTY_VALUE);

/** One line on how a structural result's surface was gridded, or null. */
export function describeGridding(results) {
  const g = results?.gridding;
  if (!g) return null;
  const unit = g.xyUnit || 'map units';
  if (g.interpolation === 'lattice') return `Integrated on ${g.nx} x ${g.ny} nodes of ${round(g.dx)} x ${round(g.dy)} ${unit}: ${INTERP_LABEL.lattice}, the midpoint rule Mapping & Surface Studio uses.`;
  return `Gridded on ${g.nx} x ${g.ny} cells of ${round(g.dx)} x ${round(g.dy)} ${unit} by ${INTERP_LABEL[g.interpolation] || g.interpolation || 'inverse distance'} (Tools > Settings); a different grid or method can change the volume slightly.`;
}

/** The contacts as used, with their unit and datum. */
export function describeContacts({ inputMethod, fluidType, inputs = {}, unitSystem }) {
  if (inputMethod === 'simple') return 'Contacts: not used by the Simple method (no structure)';
  const u = unitSystem === 'metric' ? 'm' : 'ft';
  const v = (x) => (x === null || x === undefined || x === '' || !Number.isFinite(Number(x)) ? 'not set' : `${Number(x).toLocaleString('en-US')} ${u}`);
  const parts = [];
  if (fluidType === 'gas') parts.push(`GWC ${v(inputs.goc ?? inputs.owc)}`);
  else {
    if (fluidType === 'oil_gas') parts.push(`GOC ${v(inputs.goc)}`);
    parts.push(`OWC ${v(inputs.owc)}`);
  }
  return `Contacts (TVDSS elevation, negative below datum): ${parts.join(', ')}`;
}

/**
 * The reviewer block printed under the report banner.
 * @param {{report?: {field?, analyst?}, unitSystem: string, inputMethod?: string, fluidType?: string,
 *          inputs?: Object, results?: Object, probResults?: Object, now?: Date, build?: string}} p
 * @returns {string[]}
 */
export function reviewerLines(p) {
  const { report = {}, unitSystem = 'field', inputMethod = 'simple', fluidType = 'oil', inputs = {}, results = null, probResults = null, now = new Date(), build = buildLabel() } = p;
  const field = String(report.field || '').trim() || 'not given';
  const analyst = String(report.analyst || '').trim() || 'not given';
  const lines = [
    `Field: ${field} | Analyst: ${analyst} | Date: ${now.toISOString().slice(0, 10)} | ${build}`,
    `Units: ${unitSystem === 'metric' ? 'Metric (km2, m, sm3; FVF rm3/sm3)' : 'Field (acres, ft, STB, scf; Bo rb/stb, Bg rcf/scf)'} | Fluid: ${fluidType === 'oil_gas' ? 'oil with a gas cap' : fluidType}`,
    `Method: ${METHOD_LABEL[inputMethod] || inputMethod}`,
    describeContacts({ inputMethod, fluidType, inputs, unitSystem }),
  ];
  const grid = describeGridding(results);
  if (grid) lines.push(grid);
  // U2-004: inputs handed over from an Earth Modeling model zone
  lines.push(...provenanceLines(inputs));
  if (results?.openEdge?.open) lines.push(`OPEN CLOSURE: the hydrocarbon column reaches the edge of the mapped surface at ${results.openEdge.cells} cells; the volume is a minimum, not a trap volume.`);
  if (probResults?.stats) {
    const m = probResults.meta || {};
    lines.push(`Monte Carlo: ${(m.iterations || probResults.stats.iterations || 0).toLocaleString('en-US')} realizations, ${m.grvMode === 'structural' ? 'GRV from the surface against sampled contacts' : 'area x thickness'}${m.ranAt ? `, run ${m.ranAt.slice(0, 16).replace('T', ' ')} UTC` : ''}${Number.isFinite(m.seed) ? `, seed ${m.seed}` : ''}. P90 (low), P50 (best) and P10 (high) are the volumes exceeded with 90, 50 and 10 percent probability.`);
    if (Array.isArray(m.correlations)) lines.push(m.correlations.length ? `Correlations (Gaussian copula): ${m.correlations.map((c) => `${c.a} with ${c.b} ${c.rho}`).join('; ')}` : 'Correlations: none (inputs sampled independently)');
  }
  return lines.map(latin1);
}
