// PVT intake from Fluid Systems Studio through the `pvt-1` contract
// (MBAL-U1, reviewer lens RL11; plan Step 0c).
//
// Material Balance took PVT from the Fluid Systems engine by calling it
// itself with the correlations of its own tab ("Prefill from correlations").
// That is a recalculation, with no record of a fluid study behind it. This
// module is the intake of a study: it reads the pvt-1 block a saved Fluid
// Systems Studio project carries (payload key `pvt`), turns its table into
// the PVT table of the case, and keeps what the block says about itself:
// the project, the time, the build, the fluid model, the method of every
// property, the liberation basis, how the bubble point was obtained, the lab
// tuning and the range flags. The report prints that as the source.
//
// The block is read by its documented shape (docs/scope/
// ReportKit-DESIGN-AND-STATUS.md section 4; plan Step 0c; the writer is
// src/utils/fluidstudio/pvtHandoff.js of the Fluid Systems round, PR #859).
// This file names no correlation and computes nothing: it converts units
// with the Suite registry and copies names. When the Fluid Systems round is
// on main, `blockOf` and `checkPvtBlock` give way to its `pvtContractOf` and
// `validatePvtContract` (src/lib/inputProvenance/pvtContract.js) and the
// read by id to src/lib/pvtSource.js `readFluidProjectPvt`.
//
// Pure, except `listFluidProjects` and `readFluidProjectBlock`, which read
// saved_fluid_studio_projects through the Supabase client they are handed.
import { convert, isKnownUnit } from '@/lib/units/registry';
import { UNIT_ALIASES } from '@/lib/units/vocabulary';

export const PVT_SCHEMA = 'pvt-1';
export const PVT_PAYLOAD_KEY = 'pvt';
export const FLUID_PROJECTS_TABLE = 'saved_fluid_studio_projects';
export const PVT_ORIGIN_KIND = 'pvt_contract';
/** The query parameter a sender puts on the Material Balance address to name its project. */
export const FLUID_PROJECT_PARAM = 'fluidProject';

const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** The pvt-1 block of a saved project payload, a handoff or the block itself; null when there is none. */
export function blockOf(carrier) {
  const block = carrier?.schema === PVT_SCHEMA ? carrier : (carrier?.contract || carrier?.[PVT_PAYLOAD_KEY]);
  return isRecord(block) && block.schema === PVT_SCHEMA ? block : null;
}

// block column, the lab-table column it fills, its registry family and the unit the table holds
const COLUMN_MAP = Object.freeze([
  { from: 'Bo', to: 'bo_rb_stb', family: 'fvfOil', unit: 'RB/STB', show: 'oil', method: 'bo' },
  { from: 'Rs', to: 'rs_scf_stb', family: 'gor', unit: 'scf/STB', show: 'oil', method: 'rs' },
  { from: 'mu_o', to: 'oil_viscosity_cp', family: 'viscosity', unit: 'cP', show: 'oil', method: 'mu_o' },
  { from: 'Z', to: 'z_factor', family: null, unit: null, show: 'gas', method: 'z' },
  { from: 'Bg', to: 'bg_rb_mscf', family: 'fvfGas', unit: 'RB/Mscf', show: 'gas', method: 'bg' },
  { from: 'mu_g', to: 'gas_viscosity_cp', family: 'viscosity', unit: 'cP', show: 'gas', method: 'mu_g' },
  { from: 'Bw', to: 'bw_rb_stb', family: 'fvfOil', unit: 'RB/STB', show: 'always', method: 'bw' },
]);

const registryUnit = (family, unit) => {
  if (!family || !unit) return null;
  const alias = UNIT_ALIASES[family]?.[unit] || unit;
  if (isKnownUnit(family, alias)) return alias;
  // a ratio of volumes written with its bases (sm3/sm3, rm3/sm3) is the registry's m3/m3
  if (/^[sr]?m3\/s?m3$/.test(unit) && isKnownUnit(family, 'm3/m3')) return 'm3/m3';
  return null;
};

/**
 * Can this block be taken? `errors` stop the intake; `warnings` are printed.
 * @returns {{ok: boolean, errors: string[], warnings: string[]}}
 */
export function checkPvtBlock(block) {
  const errors = [];
  const warnings = [];
  if (!isRecord(block) || block.schema !== PVT_SCHEMA) return { ok: false, errors: ['The project carries no PVT block of the pvt-1 contract.'], warnings };
  if (!Array.isArray(block.table) || block.table.length < 2) errors.push('The PVT block holds no table of at least two pressures.');
  if (!isRecord(block.units)) errors.push('The PVT block does not state its units.');
  else {
    if (registryUnit('pressure', block.units.pressure === 'psia' ? 'psi' : block.units.pressure) == null) errors.push(`The PVT block states its pressures in "${block.units.pressure}", a unit this app does not know.`);
    for (const col of COLUMN_MAP) {
      if (!col.family) continue;
      const stated = block.units[col.from];
      const has = (block.table || []).some((r) => finite(r?.[col.from]));
      if (has && registryUnit(col.family, stated) == null) errors.push(`The PVT block states ${col.from} in "${stated}", a unit this app does not know.`);
    }
  }
  if (!isRecord(block.methods)) warnings.push('The PVT block names no method for its properties.');
  if (!block.project_name) warnings.push('The PVT block does not name the project it came from.');
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * The PVT table of a case, from a pvt-1 block.
 * @param {object} block
 * @param {{fluidSystem?: string, temperatureF?: number}} [o] the case the table is for
 * @returns {{ok: boolean, error?: string, rows?: object[], origin?: object, warnings?: string[]}}
 */
export function tableFromPvtBlock(block, { fluidSystem = 'oil', temperatureF = null } = {}) {
  const check = checkPvtBlock(block);
  if (!check.ok) return { ok: false, error: check.errors.join(' ') };
  const isGas = fluidSystem === 'gas';
  const showOil = !isGas;
  const showGas = true; // an oil table carries its gas columns too: the engine reads Bg below the bubble point and for a gas cap
  const pUnit = block.units.pressure === 'psia' ? 'psi' : registryUnit('pressure', block.units.pressure);
  const byPressure = new Map();
  for (const r of block.table) {
    const p = finite(r?.pressure) ? convert('pressure', r.pressure, pUnit, 'psi') : null;
    if (!(p > 0)) continue;
    const row = { pressure_psia: Number(p.toPrecision(10)) };
    for (const col of COLUMN_MAP) {
      if (col.show === 'oil' && !showOil) continue;
      if (col.show === 'gas' && !showGas) continue;
      const v = r[col.from];
      if (!finite(v)) continue;
      // an undersaturated row of a black-oil table carries no free-gas properties worth interpolating: Bg of 0 is "none"
      if ((col.from === 'Bg' || col.from === 'mu_g') && v <= 0) continue;
      row[col.to] = col.family
        ? Number(convert(col.family, v, registryUnit(col.family, block.units[col.from]), col.unit).toPrecision(10))
        : v;
    }
    byPressure.set(row.pressure_psia, row);
  }
  const rows = [...byPressure.values()].sort((a, b) => a.pressure_psia - b.pressure_psia);
  if (rows.length < 2) return { ok: false, error: 'The PVT block holds fewer than two usable pressures.' };

  const warnings = [...check.warnings];
  const blockT = block.inputs?.temperature;
  if (finite(blockT) && finite(temperatureF) && Math.abs(blockT - temperatureF) > 1) {
    warnings.push(`The PVT of the project was computed at ${blockT.toFixed(1)} degF and the case is at ${temperatureF.toFixed(1)} degF. The table is taken as it is.`);
  }
  const methods = {};
  for (const key of ['pb', 'rs', 'bo', 'co', 'mu_o', 'z', 'bg', 'mu_g', 'bw']) {
    const m = block.methods?.[key];
    if (isRecord(m) && typeof m.method === 'string' && m.method.trim()) methods[key] = { method: m.method.trim(), kind: m.kind || 'correlation' };
  }
  const origin = {
    kind: PVT_ORIGIN_KIND,
    schema: block.schema,
    source_app: block.source_app || 'Fluid Systems Studio',
    project_id: block.project_id ?? null,
    project_name: block.project_name ?? null,
    generated_at: block.generated_at ?? null,
    app_build: block.app_build ?? null,
    model: block.model ?? null,
    basis: block.basis?.text ?? null,
    pb_source: block.pb_source ?? null,
    tuning: block.tuning?.status ?? 'none',
    methods,
    range_flags: (block.range_flags || []).map((f) => f?.text).filter(Boolean).slice(0, 12),
    temperature_f: finite(blockT) ? blockT : null,
    rows: rows.length,
    taken_at: new Date().toISOString(),
    edited: false,
  };
  return { ok: true, rows, origin, warnings };
}

const MODEL_WORDS = Object.freeze({ 'black-oil-correlations': 'black-oil correlations', eos: 'equation of state', lab: 'laboratory table' });
const PB_WORDS = Object.freeze({
  solved: 'bubble point solved from the solution GOR', entered: 'bubble point entered by the user',
  'standing-explicit': 'bubble point by the Standing explicit form', 'no-solution-gas': 'no solution gas',
  eos: 'saturation pressure of the equation of state', lab: 'bubble point measured in the laboratory',
});
const TUNING_WORDS = Object.freeze({
  tuned: 'C7+ tuned to lab data', stale: 'tuning parameters applied, with inputs changed after the fit',
  'tuned-unrecorded': 'tuning parameters applied, with no record of the match',
});
const METHOD_LABELS = Object.freeze([
  ['pb', 'Pb'], ['rs', 'Rs'], ['bo', 'Bo'], ['mu_o', 'oil viscosity'], ['z', 'Z'], ['bg', 'Bg'], ['mu_g', 'gas viscosity'], ['bw', 'Bw'],
]);

const when = (iso) => (iso && !Number.isNaN(Date.parse(iso)) ? `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')} UTC` : null);

/** The methods of an intake origin as "Standing (Pb, Rs, Bo); Beggs-Robinson (oil viscosity)". */
export function originMethodsText(origin, { isGas = false } = {}) {
  const groups = new Map();
  for (const [key, label] of METHOD_LABELS) {
    if (isGas && ['pb', 'rs', 'bo', 'mu_o'].includes(key)) continue;
    const m = origin?.methods?.[key];
    if (!m?.method) continue;
    if (!groups.has(m.method)) groups.set(m.method, []);
    groups.get(m.method).push(label);
  }
  return [...groups.entries()].map(([method, labels]) => `${method} (${labels.join(', ')})`).join('; ');
}

/** One sentence for the report: where the table came from, and by which methods. */
export function describePvtOrigin(origin, { isGas = false } = {}) {
  if (origin?.kind !== PVT_ORIGIN_KIND) return null;
  const parts = [`Table from ${origin.source_app}${origin.project_name ? `, project "${origin.project_name}"` : ''}${when(origin.generated_at) ? ` (${when(origin.generated_at)})` : ''}`];
  const model = MODEL_WORDS[origin.model] ?? origin.model;
  const methods = originMethodsText(origin, { isGas });
  if (model || methods) parts.push([model, methods].filter(Boolean).join(': '));
  if (origin.basis) parts.push(origin.basis);
  if (PB_WORDS[origin.pb_source] && !isGas) parts.push(PB_WORDS[origin.pb_source]);
  if (TUNING_WORDS[origin.tuning]) parts.push(TUNING_WORDS[origin.tuning]);
  if (origin.range_flags?.length) parts.push(`${origin.range_flags.length} input(s) outside a published range in the fluid study`);
  if (origin.edited) parts.push('rows were edited in this app after the table was taken');
  return `${parts.join('. ')}.`;
}

/** The provenance of an intake as label and value rows, for the report. */
export function pvtOriginRows(origin, { isGas = false } = {}) {
  if (origin?.kind !== PVT_ORIGIN_KIND) return [];
  const rows = [
    ['PVT contract', origin.schema],
    ['Source', `${origin.source_app}${origin.project_name ? `, project "${origin.project_name}"` : ''}`],
    ['Computed', when(origin.generated_at)],
    ['Build of the source', origin.app_build],
    ['Fluid model', MODEL_WORDS[origin.model] ?? origin.model],
    ['Liberation basis', origin.basis],
    ['Lab tuning', TUNING_WORDS[origin.tuning] ?? 'none'],
    ['Temperature of the fluid study', finite(origin.temperature_f) ? `${origin.temperature_f.toFixed(1)} degF` : null],
    ['Taken into this case', when(origin.taken_at)],
    ['Edited after it was taken', origin.edited ? 'Yes: rows were changed on the PVT tab' : 'No'],
  ];
  if (!isGas) rows.splice(6, 0, ['Bubble point', PB_WORDS[origin.pb_source] ?? origin.pb_source]);
  for (const [key, label] of METHOD_LABELS) {
    if (isGas && ['pb', 'rs', 'bo', 'mu_o'].includes(key)) continue;
    const m = origin.methods?.[key];
    rows.push([`Method, ${label}`, m?.method ?? 'not stated by the source']);
  }
  rows.push(['Range flags of the fluid study', origin.range_flags?.length ? origin.range_flags.join(' ') : 'none']);
  return rows;
}

// ---- reading saved Fluid Systems Studio projects ------------------------------

/** The caller's saved Fluid Systems Studio projects, most recent first. */
export async function listFluidProjects(supabase) {
  try {
    const { data, error } = await supabase.from(FLUID_PROJECTS_TABLE).select('id, project_name, updated_at').order('updated_at', { ascending: false });
    if (error) return { data: [], error };
    return { data: (data ?? []).map((r) => ({ id: r.id, name: r.project_name, updatedAt: r.updated_at })), error: null };
  } catch (e) {
    return { data: [], error: { message: e?.message ?? String(e) } };
  }
}

/**
 * The pvt-1 block of one saved project.
 * @returns {Promise<{ok: boolean, block: ?object, projectName: ?string, reason: ?string}>}
 */
export async function readFluidProjectBlock(supabase, projectId) {
  const none = (reason, projectName = null) => ({ ok: false, block: null, projectName, reason });
  if (!projectId) return none('Choose a Fluid Systems Studio project.');
  let row;
  try {
    const res = await supabase.from(FLUID_PROJECTS_TABLE).select('*').eq('id', projectId).maybeSingle();
    if (res.error) return none(`The Fluid Systems Studio project could not be read: ${res.error.message}`);
    row = res.data;
  } catch (e) {
    return none(`The Fluid Systems Studio project could not be read: ${e?.message ?? e}`);
  }
  if (!row) return none('The Fluid Systems Studio project was not found, or it is not yours to read.');
  const projectName = row.project_name || row.inputs_data?.name || null;
  const block = blockOf(row.inputs_data);
  if (!block) return none('This project was saved before Fluid Systems Studio kept a record of how its PVT was computed. Open it in Fluid Systems Studio, run it and save it once, then read it here.', projectName);
  const named = { ...block, project_id: block.project_id ?? row.id, project_name: block.project_name ?? projectName };
  const check = checkPvtBlock(named);
  if (!check.ok) return none(check.errors.join(' '), projectName);
  return { ok: true, block: named, projectName, reason: null };
}
