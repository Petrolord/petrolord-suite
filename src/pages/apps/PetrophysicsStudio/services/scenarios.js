// Low, mid, high scenarios (Petrophysics Studio PT9g, 2026-09-07): three
// deterministic parameter cases run through the SAME zoned pipeline, so
// every curve and every zone number has a pessimistic, a base and an
// optimistic value that is explainable line by line. Mid is the current
// parameter set; low and high are patches over it, and a patch overrides
// the parameter it names in every zone (a sensitivity is deliberate).
// No sampling anywhere: the Suite's Monte Carlo lives in ReservoirCalc
// Pro and is not duplicated here.

import { computeWellZoned, zoneSummary } from '../engine/pipeline';
import { newId } from '../layout/layoutSchema';

export const CASES = ['low', 'mid', 'high'];
export const CASE_LABEL = { low: 'Low', mid: 'Mid', high: 'High' };

/** The curves that get a _LOW / _HIGH twin, in track order. */
export const SCENARIO_CURVES = ['PHIT', 'PHIE', 'SW', 'BVW', 'KPERM', 'PAY'];

const round = (v, d = 4) => Number(v.toFixed(d));

/**
 * Sensible starting patches around a mid set: the low case is the
 * hydrocarbon-pessimistic one (denser matrix so less porosity, saltier
 * water and higher m/n so more water, a fatter shale point, a higher
 * clean line so more Vsh); high mirrors it. Every value is shown and
 * editable in the dialog; nothing here is hidden.
 */
export function defaultScenarios(params) {
  return {
    low: {
      rhoMa: round(params.rhoMa - 0.02), rw: round(params.rw * 1.25, 6), m: round(params.m + 0.1),
      n: round(params.n + 0.1), phiShale: round(params.phiShale + 0.02), grClean: round(params.grClean + 5),
    },
    high: {
      rhoMa: round(params.rhoMa + 0.02), rw: round(params.rw * 0.8, 6), m: round(params.m - 0.1),
      n: round(params.n - 0.1), phiShale: round(Math.max(0, params.phiShale - 0.02)), grClean: round(Math.max(0, params.grClean - 5)),
    },
  };
}

/** Merged parameter set for a case (mid = params). */
export const caseParams = (params, scenarios, c) => (c === 'mid' ? params : { ...params, ...(scenarios?.[c] || {}) });

/** The zone window list for a case: the scenario patch wins in every zone. */
export const caseZoneList = (zoneParamList, scenarios, c) => (c === 'mid'
  ? zoneParamList
  : zoneParamList.map((z) => ({ ...z, params: { ...z.params, ...(scenarios?.[c] || {}) } })));

/**
 * Run the three cases.
 * @returns {{low: {outputs, missing}, mid: {outputs, missing}, high: {outputs, missing}}}
 */
export function runScenarios(curves, params, zoneParamList, scenarios) {
  const out = {};
  for (const c of CASES) out[c] = computeWellZoned(curves, caseParams(params, scenarios, c), caseZoneList(zoneParamList, scenarios, c));
  return out;
}

/** The _LOW / _HIGH curves (mid is the ordinary output set). */
export function scenarioOutputs(results) {
  const out = {};
  for (const c of ['low', 'high']) {
    for (const key of SCENARIO_CURVES) {
      const arr = results?.[c]?.outputs?.[key];
      if (arr) out[`${key}_${c.toUpperCase()}`] = arr;
    }
  }
  return out;
}

/** Zone summaries per case: {zoneId: {low, mid, high}}. */
export function scenarioSummaries(curves, results, params, zones, zoneParams, scenarios) {
  const out = {};
  for (const z of zones) {
    out[z.id] = {};
    for (const c of CASES) {
      const merged = { ...caseParams(params, scenarios, c), ...(zoneParams?.[z.id] || {}), ...(c === 'mid' ? {} : (scenarios?.[c] || {})) };
      out[z.id][c] = results?.[c] ? zoneSummary(curves, results[c].outputs, merged, z) : null;
    }
  }
  return out;
}

const num = (v) => (Number.isFinite(v) ? String(Number(v.toPrecision(7))) : '');

/** Scenario summary CSV: one row per zone and case. */
export function scenariosCsv(zones, summariesByZone, depthUnit = 'm') {
  const F = depthUnit === 'ft' ? 1 / 0.3048 : 1;
  const u = depthUnit === 'ft' ? 'ft' : 'm';
  const lines = [`zone,case,top_${u},base_${u},gross_${u},net_${u},ntg,phi_avg,vsh_avg,sw_avg,k_gm_md`];
  for (const z of zones) {
    for (const c of CASES) {
      const s = summariesByZone?.[z.id]?.[c];
      if (!s) continue;
      lines.push([
        `"${String(z.name).replace(/"/g, '""')}"`, c,
        num(z.top_md_m * F), num(z.base_md_m * F), num(s.gross_m * F), num(s.net_m * F),
        num(s.ntg), num(s.phi_avg), num(s.vsh_avg), num(s.sw_avg), num(s.k_gm_md),
      ].join(','));
    }
  }
  return `${lines.join('\n')}\n`;
}

export const SCENARIO_TEMPLATE_ID = 'low-mid-high';

/**
 * A user template drawing the band between the low and high case around
 * the mid curve for porosity, Sw, k and pay; created once, then kept as
 * the user left it. Returns layouts with the template present and active.
 */
export function ensureScenarioTemplate(layouts) {
  const existing = layouts.templates.find((t) => t.id === SCENARIO_TEMPLATE_ID);
  if (existing) return layouts.activeTemplateId === SCENARIO_TEMPLATE_ID ? layouts : { ...layouts, activeTemplateId: SCENARIO_TEMPLATE_ID };
  const band = (key, min, max, scale, color, label) => ({
    id: newId('trk'), title: label, type: 'curves', width: 1, scale, min, max,
    curves: [
      { source: `output:${key}_LOW`, label: 'low', color: '#dc2626', style: 'dash', lineWidth: 0.8 },
      { source: `output:${key}`, label: 'mid', color },
      { source: `output:${key}_HIGH`, label: 'high', color: '#059669', style: 'dash', lineWidth: 0.8 },
    ],
    fills: [{ mode: 'crossover', a: `output:${key}_HIGH`, b: `output:${key}_LOW`, positiveColor: color, negativeColor: color, opacity: 0.18 }],
  });
  const template = {
    id: SCENARIO_TEMPLATE_ID, name: 'Low, mid, high', builtin: false,
    tracks: [
      { id: newId('trk'), title: 'GR (API)', type: 'curves', width: 1, scale: 'linear', min: 0, max: 150, curves: [{ source: 'input:GR', label: 'GR', color: '#059669' }], fills: [] },
      band('PHIE', 0, 0.5, 'linear', '#0891b2', 'φe low/mid/high (v/v)'),
      band('SW', 0, 1, 'linear', '#2563eb', 'Sw low/mid/high (v/v)'),
      band('KPERM', 0.01, 10000, 'log', '#db2777', 'k low/mid/high (mD)'),
      {
        id: newId('trk'), title: 'Pay low/mid/high', type: 'curves', width: 0.8, scale: 'linear', min: 0, max: 1,
        curves: [
          { source: 'output:PAY_LOW', label: 'low', color: '#dc2626', fillTo: 'left' },
          { source: 'output:PAY', label: 'mid', color: '#16a34a', fillTo: 'left' },
          { source: 'output:PAY_HIGH', label: 'high', color: '#059669', style: 'dash' },
        ],
        fills: [],
      },
    ],
  };
  return { ...layouts, activeTemplateId: SCENARIO_TEMPLATE_ID, templates: [...layouts.templates, template] };
}
