/**
 * The PVT provenance contract: the shape in which Fluid Systems Studio
 * hands fluid properties to another app TOGETHER WITH how each one was
 * obtained, so the receiving report can print the source beside the value.
 *
 * The handoff object is the "fluid backbone" that Fluid Systems Studio
 * already builds (utils/fluidStudioCalculations buildBackbone for the
 * black-oil correlations, utils/fluidstudio/eosAnalysis runEosPvtTable for
 * the equation of state) and passes through router state as
 * `location.state.fluidStudioData`. Well Test Analysis Studio and the
 * Pipeline Sizer read it today. This module writes the contract down; it
 * changes nothing in what is sent.
 *
 * Contract, version 1 (oilfield units always):
 *
 *   {
 *     // how the PVT below was computed
 *     source: 'black-oil-correlations' | 'eos' | 'lab',
 *     // with 'black-oil-correlations': the display names of the correlations
 *     correlations: { pb_rs_bo: 'Vasquez-Beggs' | null, viscosity: 'Beggs-Robinson' | null },
 *     // optional, any source: a source for one property that differs from
 *     // the method above, as an input provenance record
 *     provenance: { mu_o_at_pb: { source: 'lab', note: 'PVT report 2024-11, sample 2' } },
 *
 *     // results of the PVT model, at the bubble point
 *     pb: psia, bo_at_pb: RB/STB, mu_o_at_pb: cp,
 *     // inputs of the PVT model
 *     oil_gravity: degAPI, gas_gravity: air = 1, rsb: scf/STB, inlet_temperature: degF,
 *     // carried for other consumers
 *     gor: scf/STB (separator total), wat: degF | null, pvt_table: rows
 *   }
 *
 * Rules for a consumer:
 *  - a RESULT is reported with the method that produced it: the named
 *    correlation of its group, the equation of state, a laboratory
 *    measurement, or "method not stated by the handoff" when the backbone
 *    does not say (never a guess);
 *  - an INPUT of the fluid model is reported as exactly that;
 *  - a per-property `provenance` record wins over the method;
 *  - a source the user then chooses in the receiving app wins over the handoff.
 *
 * Pure: no React, no I/O.
 */
import { sourceText } from './wording.js';

export const PVT_CONTRACT_VERSION = 1;
export const PVT_HANDOFF_STATE_KEY = 'fluidStudioData';
export const PVT_PRODUCER = 'Fluid Systems Studio';
export const PVT_SOURCES = Object.freeze(['black-oil-correlations', 'eos', 'lab']);

/**
 * The properties of the handoff. `role` says whether the fluid model
 * computed it or took it as an input; `group` is the key of `correlations`
 * that names the correlation behind a result.
 */
export const PVT_PROPERTIES = Object.freeze({
  pb: { label: 'Bubble point pressure', unit: 'psia', role: 'result', group: 'pb_rs_bo' },
  bo_at_pb: { label: 'Oil formation volume factor at the bubble point', unit: 'RB/STB', role: 'result', group: 'pb_rs_bo' },
  mu_o_at_pb: { label: 'Oil viscosity at the bubble point', unit: 'cp', role: 'result', group: 'viscosity' },
  oil_gravity: { label: 'API gravity', unit: 'degAPI', role: 'input' },
  gas_gravity: { label: 'Gas gravity', unit: 'air = 1', role: 'input' },
  rsb: { label: 'Solution GOR at the bubble point', unit: 'scf/STB', role: 'input' },
  inlet_temperature: { label: 'Temperature', unit: 'degF', role: 'input' },
});

const CORRELATION_SCOPE = Object.freeze({ pb_rs_bo: 'Rs, Bo', viscosity: 'viscosity' });
const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * How the handoff says its PVT was computed, as words. A backbone that does
 * not say is reported as exactly that.
 * @returns {{kind: 'eos'|'correlation'|'lab'|'unstated', text: string}}
 */
export function pvtMethod(fluid) {
  const c = fluid?.correlations || {};
  if (fluid?.source === 'eos') return { kind: 'eos', text: 'Equation of state (compositional model)' };
  if (fluid?.source === 'lab') return { kind: 'lab', text: 'Measured (lab)' };
  if (c.pb_rs_bo || c.viscosity) {
    const parts = Object.keys(CORRELATION_SCOPE).filter((k) => c[k]).map((k) => `${c[k]} (${CORRELATION_SCOPE[k]})`);
    return { kind: 'correlation', text: `Correlation: ${parts.join(', ')}` };
  }
  return { kind: 'unstated', text: 'PVT model, method not stated by the handoff' };
}

/**
 * The input provenance record of one property of the handoff: a record the
 * producer attached, or the one that follows from the method.
 * @returns {?{source: string, correlation?: string, note?: string}} null for an unknown property
 */
export function pvtPropertyProvenance(fluid, property) {
  const def = PVT_PROPERTIES[property];
  if (!def) return null;
  const own = fluid?.provenance?.[property];
  if (isRecord(own) && (own.source || own.note)) return { ...own };
  if (def.role === 'input') return { source: '', note: `Input of the ${PVT_PRODUCER} fluid model` };
  const method = pvtMethod(fluid);
  const where = `At the bubble point, from ${PVT_PRODUCER}`;
  if (method.kind === 'correlation' && fluid.correlations?.[def.group]) return { source: 'correlation', correlation: fluid.correlations[def.group], note: where };
  if (method.kind === 'lab') return { source: 'lab', note: where };
  return { source: '', note: `${method.text}, at the bubble point, from ${PVT_PRODUCER}` };
}

/**
 * The handoff read as the contract: the method, and every property it
 * carries with its value, unit, role and provenance record.
 */
export function describePvtHandoff(fluid) {
  if (!isRecord(fluid)) return null;
  const properties = {};
  for (const [key, def] of Object.entries(PVT_PROPERTIES)) {
    if (!Number.isFinite(fluid[key])) continue;
    properties[key] = { ...def, value: fluid[key], provenance: pvtPropertyProvenance(fluid, key) };
  }
  return { version: PVT_CONTRACT_VERSION, producer: PVT_PRODUCER, method: pvtMethod(fluid), properties };
}

/**
 * Check a handoff against the contract. `ok` is false only for a handoff a
 * consumer cannot use at all; `warnings` list what a report would have to
 * print as not stated.
 * @returns {{ok: boolean, errors: string[], warnings: string[]}}
 */
export function validatePvtHandoff(fluid) {
  const errors = [];
  const warnings = [];
  if (!isRecord(fluid)) return { ok: false, errors: ['The handoff is not an object.'], warnings };
  if (!Object.keys(PVT_PROPERTIES).some((k) => Number.isFinite(fluid[k]))) errors.push('The handoff carries no fluid property.');
  if (fluid.source == null) warnings.push('source is missing: results will be reported as "method not stated by the handoff".');
  else if (!PVT_SOURCES.includes(fluid.source)) warnings.push(`source "${fluid.source}" is not one of ${PVT_SOURCES.join(', ')}.`);
  if (fluid.source === 'black-oil-correlations') {
    for (const [key, def] of Object.entries(PVT_PROPERTIES)) {
      if (def.role === 'result' && Number.isFinite(fluid[key]) && !fluid.correlations?.[def.group] && !fluid.provenance?.[key]) {
        warnings.push(`${key} has no named correlation (correlations.${def.group}).`);
      }
    }
  }
  if (fluid.provenance != null && !isRecord(fluid.provenance)) errors.push('provenance must be an object of input provenance records keyed by property.');
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Apply a handoff to a consuming app's inputs.
 * @param {object} fluid the backbone
 * @param {Array<{property: string, key: string, storeKey?: string, label: string}>} fieldMap
 *   which properties the app takes: `key` is the input's key in the app's
 *   provenance map and inputs table, `storeKey` the field of the app's
 *   input state when it differs, `label` the word for the notification
 * @returns {?{patch: Object<string, string>, applied: string[],
 *   intake: {fields: string[], text: string, inputFields: string[], inputText: string},
 *   sources: Object<string, string>}}
 *   `patch` goes into the app's input state; `intake` is saved with the
 *   project (results in `fields` print `text`, inputs of the fluid model in
 *   `inputFields` print `inputText`); `sources` gives the Source column
 *   words per input key, honouring per-property provenance. null when the
 *   handoff carries none of the mapped properties.
 */
export function pvtIntake(fluid, fieldMap) {
  if (!isRecord(fluid)) return null;
  const patch = {};
  const fields = [];
  const inputFields = [];
  const applied = [];
  const sources = {};
  const text = `${pvtMethod(fluid).text}, at the bubble point, from ${PVT_PRODUCER}`;
  const inputText = `Input of the ${PVT_PRODUCER} fluid model`;
  for (const f of fieldMap || []) {
    const def = PVT_PROPERTIES[f.property];
    const value = fluid[f.property];
    if (!def || !Number.isFinite(value)) continue;
    patch[f.storeKey || f.key] = String(value);
    (def.role === 'result' ? fields : inputFields).push(f.key);
    applied.push(f.label);
    const own = fluid.provenance?.[f.property];
    sources[f.key] = isRecord(own) && (own.source || own.note)
      ? `${sourceText(own)}, from ${PVT_PRODUCER}`
      : (def.role === 'result' ? text : inputText);
  }
  if (!applied.length) return null;
  return { patch, applied, intake: { fields, text, inputFields, inputText }, sources };
}

/** The Source column words for one input key of a saved intake, or null when the intake does not cover it. */
export function intakeSourceText(intake, key) {
  if (intake?.fields?.includes(key)) return intake.text;
  if (intake?.inputFields?.includes(key)) return intake.inputText;
  return null;
}
