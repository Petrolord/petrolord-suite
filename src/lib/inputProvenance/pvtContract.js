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
 * Since the Reservoir round (2026-10-02) the backbone also carries the full
 * `pvt-1` block under `contract` (second half of this file): the method of
 * EVERY property, the units of every column, the standard and separator
 * conditions, the liberation basis, how the bubble point was obtained, the
 * lab tuning, the range flags, the table, and the saved project it came
 * from. The same block is stored with the saved Fluid Systems project, so a
 * consumer can read it by project id after a page refresh. The version-1
 * keys above stay where they were: a consumer written against them works.
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
  const intake = { fields, text, inputFields, inputText };
  // pvt-1: the handoff says which method produced EACH property, from which
  // saved project and when; the receiver stores that with its own project
  const contract = pvtContractOf(fluid);
  if (contract) {
    const fieldText = {};
    const values = {};
    for (const f of fieldMap || []) {
      const def = PVT_PROPERTIES[f.property];
      if (!def || !Number.isFinite(fluid[f.property])) continue;
      values[f.key] = patch[f.storeKey || f.key];
      const own = fluid.provenance?.[f.property];
      if (isRecord(own) && (own.source || own.note)) continue;
      fieldText[f.key] = def.role === 'result'
        ? pvtContractSourceText(contract, PVT1_AT_PB_METHOD[f.property])
        : `${inputText}${pvtContractOrigin(contract)}`;
      sources[f.key] = fieldText[f.key];
    }
    intake.fieldText = fieldText;
    intake.values = values;
    intake.from = {
      app: contract.source_app, recordId: contract.project_id ?? null, recordName: contract.project_name ?? null,
      at: contract.generated_at ?? null, build: contract.app_build ?? null, schema: contract.schema,
    };
  }
  return { patch, applied, intake, sources };
}

/** The Source column words for one input key of a saved intake, or null when the intake does not cover it. */
export function intakeSourceText(intake, key) {
  if (intake?.fieldText?.[key]) return intake.fieldText[key];
  if (intake?.fields?.includes(key)) return intake.text;
  if (intake?.inputFields?.includes(key)) return intake.inputText;
  return null;
}

// ---------------------------------------------------------------------------
// pvt-1: the full PVT provenance contract (Reservoir round, plan Step 0c)
// ---------------------------------------------------------------------------

export const PVT1_SCHEMA = 'pvt-1';
/** The query parameter a consumer route reads the saved Fluid Systems project id from. */
export const PVT_PROJECT_PARAM = 'fluidProject';
/** The key the block is stored under in a saved Fluid Systems project payload. */
export const PVT_CONTRACT_PAYLOAD_KEY = 'pvt';

/**
 * Every property of the contract. Each one MUST name its method in
 * `methods`: a block that leaves one out is refused by validatePvtContract.
 * `column` is the key of the property in a table row, when it has one.
 */
export const PVT1_PROPERTIES = Object.freeze({
  pb: { label: 'Bubble point pressure', column: null },
  rs: { label: 'Solution GOR Rs', column: 'Rs' },
  bo: { label: 'Oil formation volume factor Bo', column: 'Bo' },
  co: { label: 'Oil compressibility co (undersaturated)', column: 'co' },
  mu_od: { label: 'Dead oil viscosity', column: null },
  mu_o: { label: 'Live (saturated) oil viscosity', column: 'mu_o' },
  mu_o_undersaturated: { label: 'Undersaturated oil viscosity', column: 'mu_o' },
  z: { label: 'Gas deviation factor Z', column: 'Z' },
  mu_g: { label: 'Gas viscosity', column: 'mu_g' },
  bg: { label: 'Gas formation volume factor Bg', column: 'Bg' },
  bw: { label: 'Water formation volume factor Bw', column: 'Bw' },
  mu_w: { label: 'Water viscosity', column: 'mu_w' },
});

/** The units of the table columns and scalars, as the engine holds them. */
export const PVT1_UNITS = Object.freeze({
  pressure: 'psia', temperature: 'degF', Rs: 'scf/STB', Bo: 'RB/STB', Bg: 'RB/scf', Z: 'dimensionless',
  mu_o: 'cP', mu_g: 'cP', co: '1/psi', Bw: 'RB/STB', mu_w: 'cP',
  oil_gravity: 'degAPI', gas_gravity: 'air = 1', salinity: 'ppm',
});

export const PVT1_PB_SOURCES = Object.freeze({
  solved: 'solved from the solution GOR',
  entered: 'entered by the user',
  'standing-explicit': 'Standing explicit bubble point (fallback)',
  'no-solution-gas': 'no solution gas',
  eos: 'saturation pressure of the equation of state',
  lab: 'measured (lab)',
});
export const PVT1_TUNING_STATES = Object.freeze(['none', 'tuned', 'tuned-unrecorded', 'stale']);

// which method row speaks for each version-1 scalar at the bubble point
const PVT1_AT_PB_METHOD = Object.freeze({ pb: 'pb', bo_at_pb: 'bo', mu_o_at_pb: 'mu_o' });

/**
 * Build the pvt-1 block. Everything is handed in by the producer from what
 * its engine call reported; nothing is named here.
 * @param {{sourceApp?: string, projectId?: ?string, projectName?: ?string, generatedAt?: Date|string,
 *   appBuild?: ?string, model: 'black-oil-correlations'|'eos'|'lab', modelDetail?: object,
 *   methods: Array<{key: string, method: string, reference?: string, kind?: string, note?: string}>,
 *   basis: {kind: string, text: string}, pbSource: string, tuning?: object, rangeFlags?: Array,
 *   standardConditions: {pressure_psia: number, temperature_degF: number},
 *   separatorConditions?: Array<{pressure_psia: number, temperature_degF: number}>,
 *   inputs?: object, atSaturation?: object, table: object[], identification?: object}} a
 */
export function buildPvtContract(a) {
  const methods = {};
  for (const m of a.methods || []) {
    if (!PVT1_PROPERTIES[m.key]) continue;
    methods[m.key] = {
      method: m.method,
      reference: m.reference || '',
      kind: m.kind || 'correlation',
      ...(m.note ? { note: m.note } : {}),
    };
  }
  const at = a.generatedAt instanceof Date ? a.generatedAt.toISOString() : (a.generatedAt || new Date().toISOString());
  const columns = a.table?.length ? Object.keys(a.table[0]).filter((k) => k !== 'phase') : [];
  const units = { ...PVT1_UNITS };
  return {
    schema: PVT1_SCHEMA,
    source_app: a.sourceApp || PVT_PRODUCER,
    project_id: a.projectId ?? null,
    project_name: a.projectName ?? null,
    generated_at: at,
    app_build: a.appBuild ?? null,
    model: a.model,
    ...(a.modelDetail ? { model_detail: a.modelDetail } : {}),
    units,
    columns,
    standard_conditions: a.standardConditions,
    separator_conditions: a.separatorConditions || [],
    methods,
    basis: a.basis,
    pb_source: a.pbSource,
    tuning: a.tuning || { status: 'none' },
    range_flags: (a.rangeFlags || []).map((f) => ({
      method: f.method, variable: f.variable, scope: f.scope, value: f.value ?? null, low: f.low, high: f.high, unit: f.unit, properties: f.properties || [], text: f.text,
    })),
    inputs: a.inputs || {},
    at_saturation: a.atSaturation || {},
    ...(a.identification ? { identification: a.identification } : {}),
    table: a.table || [],
  };
}

/** The pvt-1 block a handoff or a saved project payload carries, or null. */
export function pvtContractOf(carrier) {
  const block = carrier?.schema === PVT1_SCHEMA ? carrier : (carrier?.contract || carrier?.[PVT_CONTRACT_PAYLOAD_KEY]);
  return isRecord(block) && block.schema === PVT1_SCHEMA ? block : null;
}

/**
 * Check a pvt-1 block. The gate of the contract: every property names its
 * method, every table column has a unit, and the block says where it came
 * from, on which basis, how the bubble point was obtained and whether the
 * model was tuned.
 * @returns {{ok: boolean, errors: string[], warnings: string[]}}
 */
export function validatePvtContract(block) {
  const errors = [];
  const warnings = [];
  if (!isRecord(block)) return { ok: false, errors: ['The block is not an object.'], warnings };
  if (block.schema !== PVT1_SCHEMA) errors.push(`schema is "${block.schema}", expected "${PVT1_SCHEMA}".`);
  for (const k of ['source_app', 'generated_at', 'model']) if (!block[k]) errors.push(`${k} is missing.`);
  if (block.generated_at && Number.isNaN(Date.parse(block.generated_at))) errors.push('generated_at is not a date.');
  if (!block.project_id) warnings.push('project_id is missing: the receiver cannot re-open the source project.');
  if (!block.app_build) warnings.push('app_build is missing.');
  for (const [key, def] of Object.entries(PVT1_PROPERTIES)) {
    const m = block.methods?.[key];
    if (!isRecord(m) || typeof m.method !== 'string' || !m.method.trim()) errors.push(`${key} (${def.label}) names no method.`);
  }
  if (!isRecord(block.units)) errors.push('units is missing.');
  else {
    for (const col of block.columns || []) if (!block.units[col]) errors.push(`column ${col} has no unit.`);
  }
  const sc = block.standard_conditions;
  if (!isRecord(sc) || !Number.isFinite(sc.pressure_psia) || !Number.isFinite(sc.temperature_degF)) errors.push('standard_conditions is missing.');
  if (!Array.isArray(block.separator_conditions)) errors.push('separator_conditions is missing.');
  if (!isRecord(block.basis) || !block.basis.text) errors.push('basis is missing.');
  if (!PVT1_PB_SOURCES[block.pb_source]) errors.push(`pb_source "${block.pb_source}" is not one of ${Object.keys(PVT1_PB_SOURCES).join(', ')}.`);
  if (!isRecord(block.tuning) || !PVT1_TUNING_STATES.includes(block.tuning.status)) errors.push('tuning.status is missing.');
  if (!Array.isArray(block.range_flags)) errors.push('range_flags is missing.');
  if (!Array.isArray(block.table) || !block.table.length) errors.push('table is empty.');
  return { ok: errors.length === 0, errors, warnings };
}

const dateWords = (iso) => (iso && !Number.isNaN(Date.parse(iso)) ? `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')} UTC` : null);

/** ", from Fluid Systems Studio project "X" (2026-10-02 12:00 UTC)". */
export function pvtContractOrigin(block) {
  const name = block?.project_name ? ` project "${block.project_name}"` : '';
  const when = dateWords(block?.generated_at);
  return `, from ${block?.source_app || PVT_PRODUCER}${name}${when ? ` (${when})` : ''}`;
}

/** The lab tuning of a block as a clause for a Source column, or ''. */
export function pvtContractTuningText(block) {
  const t = block?.tuning;
  if (!t || t.status === 'none') return '';
  if (t.status === 'tuned') return 'C7+ tuned to lab data';
  if (t.status === 'stale') return 'C7+ tuning parameters applied, but the inputs changed after the fit';
  return 'C7+ tuning parameters applied, with no record of the match';
}

/**
 * The Source column words of one property a consumer took from a pvt-1
 * block: the method the producer named, the liberation basis where it
 * matters, the tuning, the range flags that reach the property, the origin.
 */
export function pvtContractSourceText(block, key, { where = 'at the bubble point' } = {}) {
  const m = block?.methods?.[key];
  const def = PVT1_PROPERTIES[key];
  if (!m || !def) return `Method not stated by the handoff${pvtContractOrigin(block)}`;
  const lead = m.kind === 'correlation' ? `Correlation: ${m.method}` : m.method;
  const parts = [lead];
  if (key === 'pb' && PVT1_PB_SOURCES[block.pb_source]) parts.push(PVT1_PB_SOURCES[block.pb_source]);
  const tuning = pvtContractTuningText(block);
  if (tuning && m.kind === 'eos') parts.push(tuning);
  const flags = (block.range_flags || []).filter((f) => f.scope !== 'table' && (f.properties || []).includes(def.label));
  if (flags.length) parts.push(`outside the published range: ${flags.map((f) => `${f.variable} ${f.value} ${f.unit}`.trim()).join('; ')}`);
  return `${parts.join(', ')}${where ? `, ${where}` : ''}${pvtContractOrigin(block)}`;
}

/** The pvt-1 block as label and value lines, for a report that cites it. */
export function describePvtContract(block) {
  if (!pvtContractOf(block)) return [];
  const b = pvtContractOf(block);
  const sc = b.standard_conditions || {};
  return [
    ['PVT contract', b.schema],
    ['Source', `${b.source_app}${b.project_name ? `, project "${b.project_name}"` : ''}`],
    ['Generated', dateWords(b.generated_at) || ''],
    ['Build', b.app_build || ''],
    ['Fluid model', b.model === 'eos' ? 'Equation of state' : b.model === 'lab' ? 'Laboratory table' : 'Black-oil correlations'],
    ['Liberation basis', b.basis?.text || ''],
    ['Bubble point', PVT1_PB_SOURCES[b.pb_source] || ''],
    ['Standard conditions', `${sc.pressure_psia} psia, ${sc.temperature_degF} degF`],
    ['Lab tuning', pvtContractTuningText(b) || 'none'],
  ];
}

/**
 * Lines that carry the provenance at the top of a CSV file (each starts
 * with `prefix`), so both Fluid Systems exports say the same thing.
 */
export function pvtContractCsvHeader(block, { prefix = '# ', extra = [] } = {}) {
  const b = pvtContractOf(block);
  if (!b) return [];
  const lines = describePvtContract(b).map(([k, v]) => `${k}: ${v}`);
  for (const [key, def] of Object.entries(PVT1_PROPERTIES)) {
    const m = b.methods?.[key];
    lines.push(`Method, ${def.label}: ${m?.method || 'not stated'}${m?.reference ? ` (${m.reference})` : ''}`);
  }
  const sep = (b.separator_conditions || []).map((s) => `${s.pressure_psia} psia / ${s.temperature_degF} degF`).join('; ');
  lines.push(`Separator stages: ${sep || 'none entered'}`);
  const flags = b.range_flags || [];
  lines.push(flags.length ? `Range flags: ${flags.map((f) => f.text).join(' ')}` : 'Range flags: none');
  return [...lines, ...extra].map((l) => `${prefix}${String(l).replace(/[\r\n]+/g, ' ')}`);
}
