// Probabilistic Studio service (Petrophysics Studio PT10d, 2026-09-09):
// the user-facing uncertainty spec and its translation into the engine's
// distribution spec, the "Low, best, high cases" layout, the zone CSV,
// the publish payloads, and the worker protocol. All numbers come from
// engines/petrophysics/probabilistic (runProbabilistic); every label comes
// from src/lib/percentileConventions (owner decision 1): parameters read
// "10th percentile of Sw", cases read "Low case Sw (high value)", outcomes
// alone carry P90 / P50 / P10.

import { PIPELINE_VERSION } from '../engine/pipeline';
import {
  UNCERTAIN_PARAMS, QUANTILE_CURVES, distFromPercentiles, quantileSuffix, runProbabilistic,
} from '../engine/probabilistic';
import { defaultScenarios } from './scenarios';
import { newId } from '../layout/layoutSchema';
import {
  EXCEEDANCE_DEFINITION, OUTCOME_LABELS, OUTCOME_ORDER, PARAMETER_ORDER, CASES,
  parameterPercentileLabel, casePercentile, caseLabel,
} from '@/lib/percentileConventions';

export const DIST_TYPES = ['triangular', 'uniform', 'normal', 'lognormal'];
export const DRAW_CHOICES = [100, 200, 500, 1000];
/** Field labels per distribution type, in the grid's three value columns. */
export const DIST_FIELDS = {
  triangular: [['q10', '10th percentile'], ['q50', '50th percentile'], ['q90', '90th percentile']],
  uniform: [['min', 'Minimum'], ['max', 'Maximum']],
  normal: [['mean', 'Mean'], ['stdDev', 'Standard deviation']],
  lognormal: [['mean', 'Mean'], ['stdDev', 'Standard deviation']],
};

const round = (v, d = 6) => Number(Number(v).toFixed(d));

/**
 * The starting uncertainty: every parameter the PT9g low and high cases
 * move gets a triangular whose 10th and 90th percentiles ARE those two
 * values (so the two features agree by construction) and whose median is
 * the current value; everything else is present but not varied.
 * @returns {Object<string, {vary: boolean, type: string, q10?, q50?, q90?, min?, max?, mean?, stdDev?}>}
 */
export function defaultUncertainty(params) {
  const sc = defaultScenarios(params);
  const out = {};
  for (const key of UNCERTAIN_PARAMS) {
    const cur = Number(params[key]);
    const lo = sc.low[key];
    const hi = sc.high[key];
    if (Number.isFinite(lo) && Number.isFinite(hi) && lo !== hi) {
      out[key] = { vary: true, type: 'triangular', q10: round(Math.min(lo, hi)), q50: round(cur), q90: round(Math.max(lo, hi)) };
    } else if (Number.isFinite(cur)) {
      const spread = Math.abs(cur) > 0 ? Math.abs(cur) * 0.1 : 0.01;
      out[key] = { vary: false, type: 'triangular', q10: round(cur - spread), q50: round(cur), q90: round(cur + spread) };
    }
  }
  return out;
}

/** Is a user entry a usable distribution? Returns null when fine, else the reason. */
export function entryProblem(entry) {
  if (!entry || !entry.vary) return null;
  const f = DIST_FIELDS[entry.type];
  if (!f) return 'unknown distribution';
  for (const [k] of f) if (!Number.isFinite(Number(entry[k]))) return `${k} is not a number`;
  if (entry.type === 'triangular' && !(Number(entry.q10) < Number(entry.q50) && Number(entry.q50) < Number(entry.q90))) return '10th < 50th < 90th percentile required';
  if (entry.type === 'uniform' && !(Number(entry.min) < Number(entry.max))) return 'min < max required';
  if ((entry.type === 'normal' || entry.type === 'lognormal') && !(Number(entry.stdDev) > 0)) return 'standard deviation must be positive';
  if (entry.type === 'lognormal' && !(Number(entry.mean) > 0)) return 'lognormal mean must be positive';
  return null;
}

/** Engine spec (lib/stats distribution shapes) from the user entries: varied keys only. */
export function specForEngine(uspec) {
  const spec = {};
  for (const [key, e] of Object.entries(uspec || {})) {
    if (!e?.vary || entryProblem(e)) continue;
    if (e.type === 'triangular') {
      const d = distFromPercentiles(Number(e.q10), Number(e.q50), Number(e.q90));
      spec[key] = { type: 'triangular', min: d.min, mode: d.mode, max: d.max };
    } else if (e.type === 'uniform') spec[key] = { type: 'uniform', min: Number(e.min), max: Number(e.max) };
    else spec[key] = { type: e.type, mean: Number(e.mean), stdDev: Number(e.stdDev) };
  }
  return spec;
}

// ---- tracks ----------------------------------------------------------------
export const PROBABILISTIC_TEMPLATE_ID = 'low-best-high-cases';
/** Which quantities help the hydrocarbon outcome when larger (the Sw rule). */
export const MORE_IS_BETTER = { PHIE: true, PHIT: true, KPERM: true, VSH: false, SW: false, BVW: false };
const QTY_NAME = { PHIE: 'φe', PHIT: 'φt', VSH: 'Vsh', SW: 'Sw', BVW: 'BVW', KPERM: 'k' };

/** The curve address a case takes for a quantity: Low case Sw is SW_Q90. */
export function caseSource(key, caseKey) {
  const pct = casePercentile(caseKey, !!MORE_IS_BETTER[key]);
  return `output:${key}_${quantileSuffix(Number(pct.slice(1)) / 100)}`;
}

/**
 * A user template drawing the band between the low and high case around
 * the best case for porosity, Sw and k, plus a pay probability track;
 * created once, then kept as the user left it.
 */
export function ensureProbabilisticTemplate(layouts) {
  const existing = layouts.templates.find((t) => t.id === PROBABILISTIC_TEMPLATE_ID);
  if (existing) return layouts.activeTemplateId === PROBABILISTIC_TEMPLATE_ID ? layouts : { ...layouts, activeTemplateId: PROBABILISTIC_TEMPLATE_ID };
  const band = (key, min, max, scale, color, unit) => ({
    id: newId('trk'), title: `${QTY_NAME[key]} cases (${unit})`, type: 'curves', width: 1, scale, min, max,
    curves: [
      { source: caseSource(key, 'low'), label: caseLabel('low', QTY_NAME[key], MORE_IS_BETTER[key]), color: '#dc2626', style: 'dash', lineWidth: 0.8 },
      { source: caseSource(key, 'best'), label: caseLabel('best', QTY_NAME[key], MORE_IS_BETTER[key]), color },
      { source: caseSource(key, 'high'), label: caseLabel('high', QTY_NAME[key], MORE_IS_BETTER[key]), color: '#059669', style: 'dash', lineWidth: 0.8 },
    ],
    fills: [{ mode: 'crossover', a: caseSource(key, 'high'), b: caseSource(key, 'low'), positiveColor: color, negativeColor: color, opacity: 0.18 }],
  });
  const template = {
    id: PROBABILISTIC_TEMPLATE_ID, name: 'Low, best, high cases', builtin: false,
    tracks: [
      { id: newId('trk'), title: 'GR (API)', type: 'curves', width: 1, scale: 'linear', min: 0, max: 150, curves: [{ source: 'input:GR', label: 'GR', color: '#059669' }], fills: [] },
      band('PHIE', 0, 0.5, 'linear', '#0891b2', 'v/v'),
      band('SW', 0, 1, 'linear', '#2563eb', 'v/v'),
      band('KPERM', 0.01, 10000, 'log', '#db2777', 'mD'),
      {
        id: newId('trk'), title: 'Pay probability', type: 'curves', width: 0.8, scale: 'linear', min: 0, max: 1,
        curves: [{ source: 'output:PAY_PROB', label: 'pay probability', color: '#16a34a' }],
        fills: [{ mode: 'ramp', a: 'output:PAY_PROB', fillTo: 'left', stops: [{ value: 0, color: '#f1f5f9' }, { value: 0.5, color: '#fde047' }, { value: 1, color: '#16a34a' }], opacity: 0.85 }],
      },
    ],
  };
  return { ...layouts, activeTemplateId: PROBABILISTIC_TEMPLATE_ID, templates: [...layouts.templates, template] };
}

// ---- zone CSV --------------------------------------------------------------
const num = (v) => (Number.isFinite(v) ? String(Number(v.toPrecision(7))) : '');
export const ZONE_PARAM_FIELDS = [['phi_avg', 'phi_avg'], ['sw_avg', 'sw_avg'], ['vsh_avg', 'vsh_avg'], ['k_gm_md', 'k_gm_md']];

/** Column headers of the probabilistic zone CSV (gated: parameter columns carry no P-label). */
export function probabilisticCsvHeader(depthUnit = 'm') {
  const u = depthUnit === 'ft' ? 'ft' : 'm';
  const cols = ['zone', 'realisations', `top_${u}`, `base_${u}`];
  for (const f of [['net', `net_${u}`], ['ntg', 'ntg']]) {
    for (const k of OUTCOME_ORDER) cols.push(`${f[1]} ${OUTCOME_LABELS[k]}`);
    cols.push(`${f[1]} mean`);
  }
  for (const [, name] of ZONE_PARAM_FIELDS) {
    for (const k of PARAMETER_ORDER) cols.push(parameterPercentileLabel(name, k));
    cols.push(`${name} mean`);
  }
  return cols;
}

/** One row per zone: outcomes as P90/P50/P10, parameters as percentiles. */
export function probabilisticCsv(result, depthUnit = 'm') {
  const F = depthUnit === 'ft' ? 1 / 0.3048 : 1;
  const lines = [probabilisticCsvHeader(depthUnit).map((h) => `"${h}"`).join(',')];
  for (const z of result?.zones || []) {
    const row = [`"${String(z.name).replace(/"/g, '""')}"`, String(z.n), num(z.top_md_m * F), num(z.base_md_m * F)];
    for (const f of ['net_m', 'ntg']) {
      const o = z.outcomes[f];
      const scale = f === 'net_m' ? F : 1;
      for (const k of OUTCOME_ORDER) row.push(num(o[k] * scale));
      row.push(num(o.mean * scale));
    }
    for (const [f] of ZONE_PARAM_FIELDS) {
      const p = z.parameters[f];
      for (const k of PARAMETER_ORDER) row.push(num(p[k]));
      row.push(num(p.mean));
    }
    lines.push(row.join(','));
  }
  lines.push(`"${EXCEEDANCE_DEFINITION}"`);
  return `${lines.join('\n')}\n`;
}

// ---- publish ---------------------------------------------------------------
const UNIT_OF = { PHIE: 'V/V', PHIT: 'V/V', VSH: 'V/V', SW: 'V/V', BVW: 'V/V', KPERM: 'MD' };

/**
 * Registry payloads for the percentile curves and PAY_PROB, with the run
 * spec in provenance; PAY_PROB, an outcome, carries the exceedance sentence.
 */
export function probabilisticPublishLogs(wellData, result, params, meta) {
  const depth = wellData.curves.DEPT;
  const depthLog = wellData.inventory.find((e) => e.key === 'DEPT')?.log;
  const inputLogIds = wellData.inventory.filter((e) => e.log).map((e) => e.log.id);
  const base = {
    computed: true, engine: 'petrophysics-studio', operation: 'probabilistic',
    spec: result.spec, n: result.draws.n, seed: result.draws.seed, quantiles: result.quantiles, correlations: result.correlations || [],
    pipeline_version: PIPELINE_VERSION, project_id: meta.projectId, interpretation_name: meta.interpretationName ?? null,
    params: { ...params }, zone_params: meta.zoneParams ? { ...meta.zoneParams } : {}, input_log_ids: inputLogIds,
  };
  const logs = [];
  const push = (mnemonic, src, description, unit, extra = {}) => {
    const data = new Float32Array(src.length);
    let nullCount = 0;
    for (let i = 0; i < src.length; i++) { data[i] = src[i]; if (!Number.isFinite(src[i])) nullCount += 1; }
    logs.push({
      mnemonic, description, unit, data, startMdM: depth[0], stopMdM: depth[depth.length - 1], stepM: depthLog?.step_m ?? null,
      nSamples: data.length, nullCount, provenance: { ...base, ...extra },
    });
  };
  for (const key of QUANTILE_CURVES) {
    for (const q of result.quantiles) {
      const mnemonic = `${key}_${quantileSuffix(q)}`;
      if (result.curves[mnemonic]) push(mnemonic, result.curves[mnemonic], parameterPercentileLabel(key, Math.round(q * 100)), UNIT_OF[key], { statistic: 'parameter percentile', percentile: Math.round(q * 100), of: key });
    }
  }
  if (result.curves.PAY_PROB) push('PAY_PROB', result.curves.PAY_PROB, 'Pay probability (fraction of realisations flagging pay)', 'FRAC', { statistic: 'outcome', exceedance_definition: EXCEEDANCE_DEFINITION });
  return logs;
}

// ---- worker protocol -------------------------------------------------------
// main -> worker: {type:'run', id, curves, params, zoneParamList, spec, opts}
// worker -> main: {type:'progress', id, phase, done, total} | {type:'done', id, result} | {type:'error', id, message}
export function handleRunMessage(msg, post) {
  if (!msg || msg.type !== 'run') return;
  const { id, curves, params, zoneParamList, spec, opts } = msg;
  try {
    const result = runProbabilistic(curves, params, zoneParamList || [], spec || {}, {
      ...(opts || {}),
      onProgress: (p) => post({ type: 'progress', id, ...p }),
    });
    const transfer = Object.values(result.curves).map((a) => a.buffer);
    post({ type: 'done', id, result }, transfer);
  } catch (e) {
    post({ type: 'error', id, message: e?.message || String(e) });
  }
}

let nextRunId = 1;
/**
 * Run through a worker when one can be made (createWorker returns null
 * under jest and in browsers without module workers; then the run is
 * inline, still reporting progress). Returns {promise, cancel}.
 */
export function runProbabilisticAsync(payload, { createWorker = null, onProgress = null } = {}) {
  const id = nextRunId++;
  const msg = { type: 'run', id, ...payload };
  const worker = typeof createWorker === 'function' ? createWorker() : null;
  let cancelled = false;
  let rejectFn = null;
  const promise = new Promise((resolve, reject) => {
    rejectFn = reject;
    const onMsg = (m) => {
      if (!m || m.id !== id) return;
      if (m.type === 'progress') onProgress?.(m);
      else if (m.type === 'done') { worker?.terminate(); resolve(m.result); }
      else if (m.type === 'error') { worker?.terminate(); reject(new Error(m.message)); }
    };
    if (worker) {
      worker.onmessage = (e) => onMsg(e.data);
      worker.onerror = (e) => { worker.terminate(); reject(new Error(e?.message || 'Probabilistic worker failed.')); };
      worker.postMessage(msg);
    } else {
      // inline fallback: defer so the caller's state settles first
      setTimeout(() => { if (!cancelled) handleRunMessage(msg, (m) => onMsg(m)); }, 0);
    }
  });
  const cancel = () => { cancelled = true; worker?.terminate(); rejectFn?.(new Error('cancelled')); };
  return { promise, cancel };
}

/** The dialog's one-sentence explanation of the best case. */
export const BEST_CASE_NOTE = 'Best case is the median of the realisations, not the deterministic mid curve.';
export { CASES };
