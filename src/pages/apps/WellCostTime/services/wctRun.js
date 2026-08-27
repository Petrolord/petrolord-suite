// Well Cost & Time pure run service (D11/WC2): assembles engine inputs
// from a saved case doc, returns the deterministic estimate and runs the
// Monte Carlo risk model through the CANONICAL suite sampler
// (src/lib/monteCarlo.js — the CLAUDE.md single-implementation rule; the
// vendored engine stays deterministic). NO React, NO supabase, NO '@/'
// aliases — imported by jest and the Playwright e2e spec to recompute UI
// expectations.
//
// Units: m, hours (days derived), USD. Percentile convention for cost
// and duration is the AFE one — P10 is the LOW (10th percentile)
// outcome, P90 the HIGH — the opposite labeling of the volumes
// exceedance convention. The Monte Carlo total is the BASE cost (no
// contingency line): the risk model replaces the deterministic
// provision, adding both would double-count.

import {
  ACTIVITY_KINDS, COST_BASES, COST_CATEGORIES,
  activityDuration, evaluateProgram, afeCosts, costTimeCurve,
  costPerMeter, programFromSections,
} from '../engine/wellCost';
import {
  REGION_BENCHMARKS, WELL_TYPE_MODIFIERS, benchmarkSuggestion,
} from '../engine/costBenchmarks';
import {
  createCorrelatedSampler, basicStats, rankCorrelationSensitivity,
  representativeValue,
} from '../../../../lib/monteCarlo';

export const ENGINE_VERSION = 'drilling-wct11';
export {
  ACTIVITY_KINDS, COST_BASES, COST_CATEGORIES,
  activityDuration, evaluateProgram, afeCosts, costTimeCurve,
  costPerMeter, programFromSections,
  REGION_BENCHMARKS, WELL_TYPE_MODIFIERS, benchmarkSuggestion,
};

// Deterministic small PRNG for reproducible risk runs (seed in the case
// doc; the sampling math itself is the canonical module's).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- case doc --------------------------------------------------------------

let seq = 0;
const nid = (p) => { seq += 1; return `${p}-${seq}`; };

// Map the module geometry spine (wp_wellbore_geometry.hole_sections
// rows: from_md_m/to_md_m/description) to programFromSections input.
export function sectionsFromGeometry(holeSections) {
  const rows = (holeSections || [])
    .filter((h) => Number.isFinite(h.to_md_m) && h.to_md_m > 0)
    .sort((a, b) => a.to_md_m - b.to_md_m);
  const out = [];
  for (const h of rows) {
    if (out.length && h.to_md_m <= out[out.length - 1].endMdM) continue;
    out.push({ name: h.description || `${h.to_md_m} m section`, endMdM: h.to_md_m });
  }
  return out;
}

export function defaultCaseDoc({ tdMdM = 3000, sections = null } = {}) {
  const secs = sections?.length
    ? sections
    : [
      { name: 'surface', endMdM: Math.min(500, tdMdM * 0.2) },
      { name: 'intermediate', endMdM: Math.max(tdMdM * 0.65, Math.min(500, tdMdM * 0.2) + 100) },
      { name: 'production', endMdM: tdMdM },
    ];
  const activities = programFromSections(secs, { moveHr: 24, completionHr: 48 })
    .map((a) => ({ ...a, id: nid('act') }));
  return {
    name: 'Estimate 1',
    program: { activities, nptFrac: 0.15 },
    costs: {
      items: [
        { id: nid('cost'), label: 'Rig dayrate', category: 'intangible', basis: 'per-day', rate: 100000 },
        { id: nid('cost'), label: 'Integrated services spread', category: 'intangible', basis: 'per-day', rate: 60000 },
        { id: nid('cost'), label: 'Mud and consumables', category: 'intangible', basis: 'per-meter', rate: 150 },
        { id: nid('cost'), label: 'Casing and accessories', category: 'tangible', basis: 'lump', value: 800000 },
        { id: nid('cost'), label: 'Wellhead', category: 'tangible', basis: 'lump', value: 250000 },
        { id: nid('cost'), label: 'Cementing services', category: 'intangible', basis: 'lump', value: 300000 },
        { id: nid('cost'), label: 'Evaluation and logging', category: 'intangible', basis: 'lump', value: 200000 },
        { id: nid('cost'), label: 'Completion services', category: 'intangible', basis: 'lump', value: 500000 },
      ],
      contingencyFrac: 0.10,
    },
    risk: { iterations: 2000, seed: 1, uncertainties: [] },
    params: {},
    notes: '',
  };
}

// Build the oracle-golden case doc from wellcost_cases.json — pure so
// the in-memory backend (JSON import) and the Playwright spec (fs read)
// share one construction.
export function buildGoldenCaseDoc(golden) {
  return JSON.parse(JSON.stringify(golden.caseDoc));
}

// ---- deterministic run -----------------------------------------------------

export function runDeterministic({ caseDoc }) {
  const warnings = [];
  const program = evaluateProgram(caseDoc.program);
  const costs = afeCosts({
    items: caseDoc.costs.items,
    totalDays: program.totals.totalDays,
    drilledM: program.totals.drilledM,
    contingencyFrac: caseDoc.costs.contingencyFrac ?? 0,
  });
  const costCurve = costTimeCurve({ program, items: caseDoc.costs.items });

  if (!(caseDoc.program.nptFrac > 0)) {
    warnings.push('No NPT allowance: the schedule assumes a perfect well.');
  }
  if (!(caseDoc.costs.contingencyFrac > 0)) {
    warnings.push('No contingency line on the AFE.');
  }
  const kpis = {
    totalDays: program.totals.totalDays,
    drilledM: program.totals.drilledM,
    tdMdM: program.totals.tdMdM,
    baseUsd: costs.baseUsd,
    totalUsd: costs.totalUsd,
    tangibleUsd: costs.tangibleUsd,
    intangibleUsd: costs.intangibleUsd,
    usdPerMeter: program.totals.drilledM > 0 ? costs.baseUsd / program.totals.drilledM : null,
    status: warnings.length ? 'WARN' : 'PASS',
  };
  return { program, costs, costCurve, warnings, kpis };
}

// ---- Monte Carlo risk model ------------------------------------------------

const uKey = (u) => `${u.target}:${u.id}:${u.field}`;

// Overlay one realization's sampled values onto a clone of the case doc.
export function applyUncertainties(caseDoc, uncertainties, values) {
  const doc = JSON.parse(JSON.stringify(caseDoc));
  for (const u of uncertainties) {
    const v = values[uKey(u)];
    if (!Number.isFinite(v)) continue;
    const list = u.target === 'activity' ? doc.program.activities : doc.costs.items;
    const row = list.find((r) => r.id === u.id);
    if (row) row[u.field] = v;
  }
  return doc;
}

function percentiles(sorted) {
  const at = (p) => sorted[Math.min(Math.floor(p * sorted.length), sorted.length - 1)];
  // AFE convention: P10 low, P90 high.
  return { p10: at(0.1), p50: at(0.5), p90: at(0.9) };
}

export function histogram(values, nBins = 30) {
  if (!values.length) return [];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const w = (hi - lo) / nBins || 1;
  const bins = Array.from({ length: nBins }, (_, i) => ({
    x0: lo + i * w, x1: lo + (i + 1) * w, count: 0,
  }));
  for (const v of values) {
    const i = Math.min(Math.floor((v - lo) / w), nBins - 1);
    bins[i].count += 1;
  }
  return bins;
}

export function runMonteCarlo({ caseDoc, rng = null }) {
  const risk = caseDoc.risk || {};
  const uncertainties = (risk.uncertainties || []).filter((u) => u.dist);
  if (!uncertainties.length) return null;
  const iterations = Math.max(100, Math.floor(risk.iterations || 2000));
  const rand = rng || (Number.isFinite(risk.seed) ? mulberry32(risk.seed) : Math.random);

  const inputs = {};
  for (const u of uncertainties) inputs[uKey(u)] = u.dist;
  const paramOrder = uncertainties.map(uKey);
  const { varKeys, sample } = createCorrelatedSampler({ inputs, paramOrder, rng: rand });

  const costOut = [];
  const daysOut = [];
  const inputSeries = Object.fromEntries(varKeys.map((k) => [k, []]));
  let failed = 0;
  for (let i = 0; i < iterations; i++) {
    const { values } = sample();
    try {
      const doc = applyUncertainties(caseDoc, uncertainties, values);
      const program = evaluateProgram(doc.program);
      const costs = afeCosts({
        items: doc.costs.items,
        totalDays: program.totals.totalDays,
        drilledM: program.totals.drilledM,
        contingencyFrac: 0, // the risk model replaces the provision
      });
      costOut.push(costs.baseUsd);
      daysOut.push(program.totals.totalDays);
      varKeys.forEach((k) => inputSeries[k].push(values[k]));
    } catch {
      failed += 1; // an invalid realization (e.g. non-positive rate) is skipped
    }
  }
  if (!costOut.length) return null;

  const summarize = (arr) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const stats = basicStats(sorted);
    return {
      ...percentiles(sorted),
      mean: stats.mean, stdDev: stats.stdDev,
      min: stats.min, max: stats.max, cdf: stats.cdf,
    };
  };

  return {
    iterations,
    valid: costOut.length,
    failed,
    varKeys,
    cost: { ...summarize(costOut), histogram: histogram(costOut) },
    days: { ...summarize(daysOut), histogram: histogram(daysOut) },
    tornado: rankCorrelationSensitivity(inputSeries, costOut),
  };
}

// Labels for uncertainty keys (tornado / risk table display).
export function uncertaintyLabel(caseDoc, key) {
  const [target, id, field] = key.split(':');
  const list = target === 'activity' ? caseDoc.program.activities : caseDoc.costs.items;
  const row = list.find((r) => r.id === id);
  return row ? `${row.label} (${field})` : key;
}

// Representative (deterministic) value of an uncertainty's dist — for
// showing the base value next to the spread in the risk editor.
export function distRepresentative(dist) {
  return representativeValue(dist);
}

// ---- the full run ----------------------------------------------------------

export function runAll({ caseDoc }) {
  const det = runDeterministic({ caseDoc });
  return { ...det, mc: null };
}
