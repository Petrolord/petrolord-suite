// Scenario comparison (AppUpgrade BF-U2-008, BF-U1-030). The Scenario
// Manager said "Create, manage, and compare" and had no comparison. This
// puts two to four saved scenarios side by side: the inputs that differ,
// and what each scenario's own result says (present-day Ro and
// temperature by layer, the source rock's transformation, the critical
// moment, the maximum burial). A scenario whose stored result was not
// computed from its own inputs (saved before results carried their inputs,
// or edited after the run) says so in its column. Pure.

import { EMPTY_VALUE } from '@/lib/emptyValue';
import { engineInputsKey } from './honesty';
import { finalDepthProfile, eventsChartRows, withLayerRoles, calibrationProfile } from './resultsView';
import { presentDayHeatFlow } from './history';
import { depthToDisplay, tempToDisplay } from './units';

export const MAX_COMPARE = 4;

const inputsOf = (s) => ({ stratigraphy: s.stratigraphy || [], heatFlow: s.heatFlow || {}, erosionEvents: s.erosionEvents || [], settings: s.settings || {} });

/** What a scenario's stored result can be trusted for. */
export function scenarioResultState(s) {
  if (!s?.results?.data) return { ok: false, text: 'No result saved with this scenario: load it and run.' };
  if (!s.results.runOf?.key) return { ok: true, unverified: true, text: 'Saved before results carried their inputs: not checked against them.' };
  if (s.results.runOf.key !== engineInputsKey(inputsOf(s))) return { ok: false, text: 'The saved result was computed from other inputs: load it and run again.' };
  return { ok: true, text: 'Result computed from these inputs.' };
}

const fmt = (v, d) => (Number.isFinite(v) ? Number(v.toFixed(d)).toLocaleString('en-US') : EMPTY_VALUE);

/**
 * @param {Array} scenarios the chosen scenarios (2 to 4)
 * @param {{depth: string, temp: string}} units display units
 * @returns {{ columns: Array<{id, name, state}>, rows: Array<{key, label, values: string[], differs: boolean, group: string}> }}
 */
export function compareScenarios(scenarios, units = { depth: 'm', temp: 'C' }) {
  const list = (scenarios || []).slice(0, MAX_COMPARE);
  const zU = units.depth; const tU = units.temp;
  const columns = list.map((s) => ({ id: s.id, name: s.name, state: scenarioResultState(s) }));
  const rows = [];
  const push = (group, key, label, values) => rows.push({ group, key, label, values, differs: new Set(values).size > 1 });

  // inputs
  push('Inputs', 'hf', 'Basal heat flow, present (mW/m2)', list.map((s) => {
    const hf = s.heatFlow || {};
    return hf.type === 'variable' ? `${fmt(presentDayHeatFlow(hf), 1)} (history)` : fmt(Number(hf.value), 1);
  }));
  push('Inputs', 'ts', `Surface temperature (${tU})`, list.map((s) => fmt(tempToDisplay(Number(s.settings?.surfaceTemp ?? 20), tU), 1)));
  push('Inputs', 'ero', `Erosion (${zU} removed)`, list.map((s) => {
    const e = (s.erosionEvents || []).filter((x) => Number(x.amount) > 0);
    return e.length ? e.map((x) => `${fmt(depthToDisplay(Number(x.amount), zU), 0)} at ${x.age} Ma`).join('; ') : 'none';
  }));
  push('Inputs', 'layers', 'Layers', list.map((s) => String((s.stratigraphy || []).length)));
  push('Inputs', 'comp', 'Compaction', list.map((s) => (s.settings?.compaction === 'irreversible' ? 'maximum burial' : 'elastic')));
  const sources = (s) => (s.stratigraphy || []).filter((l) => l.sourceRock?.isSource).map((l) => `${l.name} TOC ${l.sourceRock.toc} HI ${l.sourceRock.hi}`).join('; ') || 'none';
  push('Inputs', 'src', 'Source rock', list.map(sources));

  // results, layer by layer (union of layer ids, oldest first as the engine reports)
  const resultOf = (s) => (scenarioResultState(s).ok ? withLayerRoles(s.results, s.stratigraphy || []) : null);
  const results = list.map(resultOf);
  const layerOrder = [];
  results.forEach((r) => (r?.meta?.layers || []).forEach((l) => { if (!layerOrder.some((x) => x.id === l.id)) layerOrder.push({ id: l.id, name: l.name }); }));
  const present = results.map((r) => (r ? new Map(finalDepthProfile(r).map((p) => [p.id, p])) : null));
  for (const l of layerOrder) {
    push('Present-day Ro (%)', `ro-${l.id}`, l.name, present.map((m) => (m?.get(l.id) ? m.get(l.id).ro.toFixed(2) : EMPTY_VALUE)));
  }
  for (const l of layerOrder) {
    push(`Present-day temperature (${tU})`, `t-${l.id}`, l.name, present.map((m) => (m?.get(l.id) ? fmt(tempToDisplay(m.get(l.id).temp, tU), 1) : EMPTY_VALUE)));
  }
  push('Charge', 'tr', 'Source transformation, present', results.map((r) => {
    if (!r) return EMPTY_VALUE;
    const vals = r.meta.layers.map((l, li) => (l.sourceRock?.isSource ? r.data.transformation[li]?.slice(-1)[0]?.value : null)).filter(Number.isFinite);
    return vals.length ? vals.map((v) => `${(100 * v).toFixed(1)} %`).join(', ') : 'no source';
  }));
  push('Charge', 'cm', 'Critical moment (Ma)', results.map((r) => {
    if (!r) return EMPTY_VALUE;
    const { criticalMoment } = eventsChartRows(r);
    return criticalMoment != null ? String(criticalMoment) : 'none modelled';
  }));
  push('Charge', 'exp', 'Expelled, present (kg/m2)', results.map((r) => {
    if (!r) return EMPTY_VALUE;
    const tot = r.data.expulsion.reduce((a, s) => a + (s?.length ? s[s.length - 1].value : 0), 0);
    return fmt(tot, 1);
  }));
  push('Burial', 'maxT', `Maximum temperature (${tU})`, results.map((r) => (r ? fmt(tempToDisplay(Math.max(...r.data.temperature.flat().map((e) => e.value)), tU), 1) : EMPTY_VALUE)));
  push('Burial', 'maxZ', `Deepest burial (${zU})`, results.map((r) => (r ? fmt(depthToDisplay(r.meta.maxDepth, zU), 0) : EMPTY_VALUE)));
  return { columns, rows };
}

/** Ro against depth (display units) of each compared scenario, for the overlay plot. */
export function compareProfiles(scenarios, units = { depth: 'm' }) {
  return (scenarios || []).slice(0, MAX_COMPARE).map((s) => ({
    id: s.id,
    name: s.name,
    points: scenarioResultState(s).ok ? calibrationProfile(s.results).map((p) => ({ depth: depthToDisplay(p.depth, units.depth), ro: p.ro })) : [],
  }));
}
