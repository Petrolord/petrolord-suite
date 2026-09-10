// Mineral model (Petrophysics Studio PT11d, 2026-09-10): the Studio side
// of the deterministic multi-mineral solver. The model (three mineral
// picks, the endpoint table in play, the fluid) persists with the
// interpretation under facies._mineral; the result is transient and
// re-run on open. Nothing here is a default: the model exists only when
// the user builds one, and porosity comes from it only when the user
// picks phiSource 'mineral'. The same words describe what the solver is
// not suited to here, in the dialog and in the help guide.

import {
  MINERAL_ENDPOINTS, FLUID_DEFAULT, withU, solveMineralCurves, MINERAL_FLAGS,
} from '../engine/mineral';
import { PIPELINE_VERSION } from '../engine/pipeline';

export const MINERAL_TEMPLATE_ID = 'mineral-model';
export const DEFAULT_MINERALS = ['quartz', 'calcite', 'dolomite'];
export const ENDPOINT_FIELDS = [
  { key: 'rho', label: 'ρ (g/cc)' },
  { key: 'nphi', label: 'φN (v/v, limestone units)' },
  { key: 'pe', label: 'Pe (b/e)' },
];
export const MINERAL_COLORS = {
  quartz: '#f5d76e', calcite: '#60a5fa', dolomite: '#c084fc', anhydrite: '#a78bfa', halite: '#f9a8d4', clay: '#8b7355',
};
const FALLBACK_COLORS = ['#f59e0b', '#34d399', '#fb7185'];

/** What the solver is not suited to; the dialog and the help guide print these words. */
export const MINERAL_UNSUITED = [
  'Clay-rich and shaly rocks: clay endpoints vary by clay type and the model has no bound water; use the Vsh methods and a shale-corrected PHIE.',
  'Gas-bearing intervals: the fluid is fixed, so gas moves density and neutron in opposite directions and the sample lands outside the triangle.',
  'Heavy-mineral or pyrite-bearing rocks and barite mud: Pe is dominated by them.',
  'Coal.',
  'Washed-out hole without conditioning.',
  'Any rock with more than three minerals present at once.',
];

/** A fresh model: the published table copied so the user can edit it. */
export function defaultMineralModel() {
  const endpoints = {};
  for (const [key, row] of Object.entries(MINERAL_ENDPOINTS)) endpoints[key] = { label: row.label, rho: row.rho, nphi: row.nphi, pe: row.pe };
  return { minerals: [...DEFAULT_MINERALS], endpoints, fluid: { ...FLUID_DEFAULT } };
}

/** The published endpoints for one row (Reset to published). */
export const publishedEndpoint = (key) => (MINERAL_ENDPOINTS[key] ? { label: MINERAL_ENDPOINTS[key].label, rho: MINERAL_ENDPOINTS[key].rho, nphi: MINERAL_ENDPOINTS[key].nphi, pe: MINERAL_ENDPOINTS[key].pe } : null);

/** Why the model cannot run, as a sentence, or null. */
export function modelProblem(model, wellData = null) {
  if (!model) return 'No mineral model yet.';
  const picks = model.minerals || [];
  if (picks.length !== 3) return 'Pick three minerals.';
  if (new Set(picks).size !== 3) return 'The three minerals must be different.';
  for (const k of picks) {
    const e = model.endpoints?.[k];
    if (!e) return `No endpoints for ${k}.`;
    for (const f of ENDPOINT_FIELDS) if (!Number.isFinite(Number(e[f.key]))) return `${e.label || k}: ${f.label} is not a number.`;
    if (!(Number(e.rho) > 0)) return `${e.label || k}: density must be positive.`;
  }
  const fl = model.fluid || {};
  if (![fl.rho, fl.nphi, fl.u].every((v) => Number.isFinite(Number(v)))) return 'Fluid density, neutron and U must be numbers.';
  if (wellData) {
    for (const k of ['RHOB', 'NPHI', 'PEF']) if (!wellData.curves?.[k]) return `${k} is not mapped on this well; the solver needs RHOB, NPHI and PEF.`;
  }
  return null;
}

/** The engine's model shape, U derived. */
export function engineModel(model) {
  return {
    minerals: model.minerals.map((k) => {
      const e = model.endpoints[k];
      return withU({ key: k, label: e.label, rho: Number(e.rho), nphi: Number(e.nphi), pe: Number(e.pe) });
    }),
    fluid: { rho: Number(model.fluid.rho), nphi: Number(model.fluid.nphi), u: Number(model.fluid.u) },
  };
}

export const fractionName = (key) => `V_${String(key).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;

/** Run the solver over the well; throws the problem sentence when it cannot. */
export function runMineralModel(wellData, model) {
  const problem = modelProblem(model, wellData);
  if (problem) throw new Error(problem);
  const em = engineModel(model);
  const { outputs, names, counts, worstExcursion } = solveMineralCurves({
    DEPT: wellData.curves.DEPT, RHOB: wellData.curves.RHOB, NPHI: wellData.curves.NPHI, PEF: wellData.curves.PEF,
  }, em);
  // cumulative fractions for the stacked lithology track: v1, v1+v2, v1+v2+v3
  const n = outputs.PHI_MM.length;
  const cum = names.map(() => new Float64Array(n).fill(NaN));
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let j = 0; j < names.length; j++) {
      const v = outputs[names[j]][i];
      if (!Number.isFinite(v)) { acc = NaN; }
      acc += Number.isFinite(acc) ? v : 0;
      cum[j][i] = acc;
    }
  }
  names.forEach((nm, j) => { outputs[`${nm}_CUM`] = cum[j]; });
  return { outputs, names, counts, worstExcursion, model: JSON.parse(JSON.stringify(model)), pipeline_version: PIPELINE_VERSION };
}

/** The layout addresses the run makes available (fractions only; the fixed ones are in layoutSchema). */
export const mineralSources = (result) => (result ? result.names.map((nm) => `output:${nm}`) : []);

/** One line for the status bar and the dialog. */
export function mineralSummaryLine(result) {
  if (!result) return '';
  const c = result.counts;
  const parts = [`${c.accepted} accepted`];
  if (c.outOfRange) parts.push(`${c.outOfRange} out of range (worst excursion ${result.worstExcursion.toFixed(3)})`);
  if (c.singular) parts.push(`${c.singular} singular`);
  if (c.missing) parts.push(`${c.missing} missing input`);
  return `Mineral model: ${parts.join(', ')}.`;
}

/**
 * The "Mineral model" layout: a solved-lithology track (cumulative
 * fractions with fills between neighbours in the mineral colours; no new
 * renderer, the existing threshold and crossover fills), the solved
 * porosity, and the residual track. Created once, then left as the user
 * keeps it; the track names follow the model's minerals.
 */
export function ensureMineralTemplate(layouts, result) {
  const names = result.names;
  const keys = result.model.minerals;
  const colorOf = (k, i) => MINERAL_COLORS[k] || FALLBACK_COLORS[i % FALLBACK_COLORS.length];
  const idOf = () => `trk-${Math.random().toString(36).slice(2, 8)}`;
  const lithology = {
    id: idOf(), title: `Lithology (${keys.join(', ')})`, type: 'curves', width: 1.4, scale: 'linear', min: 0, max: 1,
    curves: names.map((nm, i) => ({ source: `output:${nm}_CUM`, label: keys[i], color: colorOf(keys[i], i), lineWidth: 0.8 })),
    fills: [
      { mode: 'threshold', a: `output:${names[0]}_CUM`, threshold: { value: 0 }, side: 'above', color: colorOf(keys[0], 0), opacity: 0.7 },
      ...names.slice(1).map((nm, i) => ({ mode: 'crossover', a: `output:${nm}_CUM`, b: `output:${names[i]}_CUM`, positiveColor: colorOf(keys[i + 1], i + 1), negativeColor: colorOf(keys[i + 1], i + 1), opacity: 0.7 })),
    ],
  };
  const template = {
    id: MINERAL_TEMPLATE_ID, name: 'Mineral model', builtin: false,
    tracks: [
      { id: idOf(), title: 'GR (API)', type: 'curves', width: 1, scale: 'linear', min: 0, max: 150, curves: [{ source: 'input:GR', label: 'GR', color: '#059669' }], fills: [] },
      lithology,
      {
        id: idOf(), title: 'Porosity (v/v)', type: 'curves', width: 1, scale: 'linear', min: 0.5, max: 0,
        curves: [{ source: 'output:PHI_MM', label: 'φ mineral model', color: '#0891b2' }, { source: 'output:PHIT', label: 'φt (pipeline)', color: '#94a3b8', style: 'dash', lineWidth: 0.8 }],
        fills: [],
      },
      {
        id: idOf(), title: 'Residual (excursion)', type: 'curves', width: 0.8, scale: 'linear', min: 0, max: 0.5,
        curves: [{ source: 'output:MM_RES', label: 'excursion outside 0..1', color: '#dc2626' }],
        fills: [{ mode: 'threshold', a: 'output:MM_RES', threshold: { value: 0 }, side: 'above', color: '#dc2626', opacity: 0.25 }],
      },
    ],
  };
  const others = layouts.templates.filter((t) => t.id !== MINERAL_TEMPLATE_ID);
  const existing = layouts.templates.find((t) => t.id === MINERAL_TEMPLATE_ID);
  // keep the user's edits to the template unless the mineral set changed
  const sameMinerals = existing && existing.tracks.some((t) => t.title === lithology.title);
  return { ...layouts, activeTemplateId: MINERAL_TEMPLATE_ID, templates: sameMinerals ? layouts.templates : [...others, template] };
}

/**
 * Publish payloads: one registry curve per mineral fraction, the solved
 * porosity, the residual and the flag, each carrying the whole model.
 */
export function mineralPublishLogs(wellData, result, params, { projectId, interpretationName }) {
  const depth = wellData.curves.DEPT;
  const depthLog = wellData.inventory.find((e) => e.key === 'DEPT')?.log;
  const base = {
    computed: true,
    engine: 'petrophysics-studio',
    operation: 'mineral-model',
    pipeline_version: result.pipeline_version,
    project_id: projectId,
    interpretation_name: interpretationName,
    model: result.model,
    tools: ['RHOB', 'NPHI', 'PEF'],
    counts: result.counts,
    residual_definition: 'largest excursion of any fraction outside 0 to 1 (stage one; a determined system has zero fit residual)',
    flags: MINERAL_FLAGS,
    input_log_ids: wellData.inventory.filter((e) => e.log && ['RHOB', 'NPHI', 'PEF'].includes(e.key)).map((e) => e.log.id),
    params: { phiSource: params?.phiSource },
  };
  const push = (mnemonic, src, description, unit) => {
    const data = new Float32Array(src.length);
    let nullCount = 0;
    for (let i = 0; i < src.length; i++) { data[i] = src[i]; if (!Number.isFinite(src[i])) nullCount += 1; }
    return {
      mnemonic, description, unit, data,
      startMdM: depth[0], stopMdM: depth[depth.length - 1], stepM: depthLog?.step_m ?? null,
      nSamples: data.length, nullCount, provenance: { ...base },
    };
  };
  const logs = result.names.map((nm, i) => push(nm, result.outputs[nm], `Mineral fraction ${result.model.minerals[i]} (mineral model)`, 'V/V'));
  logs.push(push('PHI_MM', result.outputs.PHI_MM, 'Porosity solved by the mineral model', 'V/V'));
  logs.push(push('MM_RES', result.outputs.MM_RES, 'Mineral model residual: largest excursion outside 0 to 1 (0 = accepted)', 'V/V'));
  logs.push(push('MM_FLAG', result.outputs.MM_FLAG, 'Mineral model flag: 0 accepted, 1 singular, 2 out of range, 3 missing input', ''));
  return logs;
}
