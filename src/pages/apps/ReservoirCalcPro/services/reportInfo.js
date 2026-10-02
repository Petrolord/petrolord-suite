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
 * The correlations a Monte Carlo run applied, as one sentence (H9). Read
 * from `meta.correlations`, which the engine writes with what it actually
 * applied. The audit report used to print a fixed "-0.8 is applied" line
 * whatever the correlation editor held.
 * @param {object} [meta] probResults.meta
 */
export function correlationSentence(meta) {
  const list = meta?.correlations;
  if (!Array.isArray(list)) {
    return 'Correlations: not recorded on this run (a run made before the correlation editor applied the porosity and water saturation default when both varied)';
  }
  return list.length
    ? `Correlations (Gaussian copula): ${list.map((c) => `${c.a} with ${c.b} ${c.rho}`).join('; ')}`
    : 'Correlations: none (inputs sampled independently)';
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
  const given = (v) => String(v || '').trim() || 'not given';
  const lines = [
    `Field: ${field} | Analyst: ${analyst} | Date: ${now.toISOString().slice(0, 10)} | ${build}`,
    // RL re-check (RL4): who the estimate is for, the licence and the well control
    `Company: ${given(report.company)} | Licence or block: ${given(report.licence)} | Well control: ${given(report.well)}`,
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
    if (Array.isArray(m.correlations)) lines.push(correlationSentence(m));
  }
  return lines.map(latin1);
}

// ---- RL re-check, 2026-10-02 (reviewer lens RL1, RL7, RL9) --------------------

/** The groups an input source is stated for in Report details, and the inputs each covers. */
export const SOURCE_GROUPS = Object.freeze({
  structure: { label: 'Structure and contacts', keys: ['area', 'thickness', 'owc', 'goc', 'grvFactor', 'gasCapFraction'] },
  petrophysics: { label: 'Net-to-gross, porosity, water saturation', keys: ['ntg', 'porosity', 'sw'] },
  fluids: { label: 'Formation volume factors', keys: ['fvf', 'bg'] },
  recovery: { label: 'Recovery factors', keys: ['recovery', 'recoveryGas'] },
});
const GROUP_OF = Object.fromEntries(Object.entries(SOURCE_GROUPS).flatMap(([g, v]) => v.keys.map((k) => [k, g])));

const INPUT_LABEL = {
  area: 'Area', thickness: 'Gross thickness', ntg: 'Net-to-gross', porosity: 'Porosity', sw: 'Water saturation',
  fvf: 'Oil FVF (Bo)', bg: 'Gas FVF (Bg)', owc: 'Oil-water contact (OWC), TVDSS', goc: 'Gas-oil contact (GOC), TVDSS',
  grvFactor: 'GRV factor (structural uncertainty)', gasCapFraction: 'Gas cap fraction of GRV',
  recovery: 'Oil recovery factor', recoveryGas: 'Gas recovery factor',
};

/** The unit each input is held in, for a unit system. */
export function inputUnit(key, unitSystem = 'field') {
  const metric = unitSystem === 'metric';
  switch (key) {
    case 'area': return metric ? 'km2' : 'acres';
    case 'thickness': case 'owc': case 'goc': return metric ? 'm' : 'ft';
    case 'fvf': return metric ? 'rm3/sm3' : 'rb/stb';
    case 'bg': return metric ? 'rm3/sm3' : 'rcf/scf';
    case 'recovery': case 'recoveryGas': return '%';
    case 'grvFactor': return 'multiplier';
    default: return 'fraction';
  }
}

/** Where an input came from: what Report details states for its group, else that nothing was stated. */
export function inputSource(key, report = {}, fallback = 'Entered, source not stated') {
  const stated = String(report?.sources?.[GROUP_OF[key]] || '').trim();
  return stated || fallback;
}

const p = (v) => (Number.isFinite(v) ? String(parseFloat(Number(v).toPrecision(5))) : EMPTY_VALUE);
const TYPE_LABEL = { triangular: 'Triangular', uniform: 'Uniform', normal: 'Normal', lognormal: 'Lognormal', constant: 'Constant' };

/**
 * The input distributions of a Monte Carlo run as table rows: input, type,
 * parameters, unit, source (RL1). Read from `meta.inputs`, which the engine
 * records with what it sampled. A run made before that record exists gives
 * null, and the report says so.
 * @returns {?Array<[string, string, string, string, string]>}
 */
export function distributionRows(meta, report = {}) {
  const rec = meta?.inputs;
  if (!rec || typeof rec !== 'object' || !Object.keys(rec).length) return null;
  const unitSystem = meta.unitSystem || 'field';
  const rows = [];
  for (const [key, d] of Object.entries(rec)) {
    let type = TYPE_LABEL[d.type] || d.type || 'Constant';
    let params;
    if (!d.variable) {
      const v = d.type === 'triangular' ? d.mode : d.type === 'uniform' ? (d.min + d.max) / 2 : d.type === 'normal' || d.type === 'lognormal' ? d.mean : d.value;
      type = 'Constant (no spread)';
      params = p(v);
    } else if (d.type === 'triangular') params = `min ${p(d.min)}, most likely ${p(d.mode)}, max ${p(d.max)}`;
    else if (d.type === 'uniform') params = `min ${p(d.min)}, max ${p(d.max)}`;
    else params = `mean ${p(d.mean)}, standard deviation ${p(d.stdDev)}${Number.isFinite(d.min) && Number.isFinite(d.max) ? `, truncated to ${p(d.min)} to ${p(d.max)}` : ''}`;
    rows.push([INPUT_LABEL[key] || key, type, params, inputUnit(key, unitSystem), inputSource(key, report, 'Entered in the Probabilistic panel, source not stated')]);
  }
  return rows.map((r) => r.map(latin1));
}

/** The deterministic inputs as rows of input, value, unit and source (RL1). */
export function deterministicInputRows({ inputs = {}, fluidType = 'oil', unitSystem = 'field', inputMethod = 'simple', report = {} }) {
  const showOil = fluidType === 'oil' || fluidType === 'oil_gas';
  const showGas = fluidType === 'gas' || fluidType === 'oil_gas';
  const num = (v, d) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? EMPTY_VALUE : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const row = (key, label, value) => [label, value, value === EMPTY_VALUE ? '' : inputUnit(key, unitSystem), value === EMPTY_VALUE ? 'Not provided' : inputSource(key, report)];
  const rows = [];
  if (inputMethod === 'simple') {
    rows.push(row('area', 'Area', num(inputs.area, 1)));
    rows.push(row('thickness', 'Gross thickness', num(inputs.thickness, 1)));
    if (fluidType === 'oil_gas') rows.push(row('gasCapFraction', 'Gas cap fraction of GRV', num(inputs.gasCapFraction, 3)));
  }
  rows.push(row('ntg', 'Net-to-gross (NTG)', num(inputs.ntg, 3)));
  rows.push(row('porosity', 'Porosity (phi)', num(inputs.porosity, 3)));
  rows.push(row('sw', 'Water saturation (Sw)', num(inputs.sw, 3)));
  if (showOil) {
    rows.push(row('fvf', 'Oil FVF (Bo)', num(inputs.fvf, 3)));
    rows.push(row('owc', 'Oil-water contact (OWC), TVDSS', num(inputs.owc, 1)));
    rows.push(row('recovery', 'Oil recovery factor', num(inputs.recovery, 2)));
  }
  if (showGas) {
    rows.push(row('bg', 'Gas FVF (Bg)', num(inputs.bg, 5)));
    rows.push(row('goc', fluidType === 'gas' ? 'Gas-water contact (GWC), TVDSS' : 'Gas-oil contact (GOC), TVDSS', num(inputs.goc, 1)));
    rows.push(row('recoveryGas', 'Gas recovery factor', num(inputs.recoveryGas, 2)));
  }
  return rows.map((r) => r.map(latin1));
}

/**
 * "Limits of this analysis" (RL9): what the method assumes and does not
 * cover. `probabilistic` adds the lines that belong to the Monte Carlo.
 */
export function limitsLines({ probabilistic = false, inputMethod = 'simple', fluidType = 'oil' } = {}) {
  const lines = [
    'A volumetric estimate: in-place volume is rock volume x net-to-gross x porosity x (1 - Sw) / formation volume factor, and recoverable volume is in-place volume x a recovery factor that is an input. No flow, pressure or drive mechanism is modelled.',
    inputMethod === 'simple'
      ? 'Simple method: area x gross thickness, with no structure. Fluid contacts are not used and the shape of the trap is not honoured.'
      : 'Structural method: the rock volume is integrated from the mapped surface between the top and the contacts. It is only as good as the map, its depth conversion and its gridding, and it stops at the map edge.',
    'One average net-to-gross, porosity and water saturation for each fluid leg: no lateral or vertical property variation, unless a saturation-height function was applied.',
    fluidType === 'gas' ? 'Gas volumes use one gas formation volume factor for the whole column.' : 'Oil volumes use one oil formation volume factor for the whole column; solution gas uses one Rs.',
  ];
  if (probabilistic) {
    lines.push('Monte Carlo: each input is sampled from the distribution listed above; inputs are independent except for the correlations stated. The result depends on those distributions and is not a measurement of uncertainty.');
    lines.push('Percentiles are of the simulated outcomes. With fewer than about 5,000 realizations the P90 and P10 move noticeably from seed to seed.');
  } else {
    lines.push('Deterministic: one value per input, so the result carries no range. Run the probabilistic study for a P90, P50 and P10.');
  }
  lines.push('A screening estimate. It is not a reserves or resources booking; classification (SPE PRMS) needs a development plan, commerciality and a chance of success, which this report does not assess.');
  return lines.map(latin1);
}

/** What the volumes on a report page are, in one line (RL7). */
export function basisLine({ fluidType = 'oil', unitSystem = 'field' } = {}) {
  const metric = unitSystem === 'metric';
  const oil = `STOIIP is stock-tank oil initially in place at surface conditions (${metric ? 'sm3' : 'STB'})`;
  const gas = `GIIP is ${fluidType === 'oil_gas' ? 'free ' : ''}gas initially in place at standard conditions (${metric ? 'sm3' : 'scf'})`;
  const which = fluidType === 'gas' ? gas : fluidType === 'oil_gas' ? `${oil}; ${gas}` : oil;
  return latin1(`Basis: ${which}. These are IN-PLACE volumes; recoverable volumes are listed separately and are in-place volume x the recovery factor.`);
}
