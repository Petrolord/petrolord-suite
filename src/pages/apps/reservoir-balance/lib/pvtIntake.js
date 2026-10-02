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
// The block is read with the contract's own readers and gate
// (src/lib/inputProvenance/pvtContract.js: `pvtContractOf`,
// `validatePvtContract`) and the project by id through src/lib/pvtSource.js
// (`readFluidProjectPvt`, the `?fluidProject=<id>` parameter). This file names
// no correlation and computes nothing: it converts units with the Suite
// registry and copies the names the fluid study gave.
//
// Pure, except `listFluidProjects`, which reads saved_fluid_studio_projects
// through the Supabase client it is handed.
import { convert, isKnownUnit } from '@/lib/units/registry';
import { UNIT_ALIASES } from '@/lib/units/vocabulary';
import {
  pvtContractOf, validatePvtContract, PVT1_SCHEMA, PVT1_PB_SOURCES, PVT_PROJECT_PARAM, pvtContractTuningText,
} from '@/lib/inputProvenance/pvtContract';

export const PVT_SCHEMA = PVT1_SCHEMA;
export const FLUID_PROJECTS_TABLE = 'saved_fluid_studio_projects';
export const PVT_ORIGIN_KIND = 'pvt_contract';
/** The query parameter a sender puts on the Material Balance address to name its project. */
export const FLUID_PROJECT_PARAM = PVT_PROJECT_PARAM;

const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** The pvt-1 block of a saved project payload, a handoff or the block itself; null when there is none. */
export const blockOf = pvtContractOf;

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
  // the gate of the contract first: every property names its method, every column its unit
  const gate = validatePvtContract(block);
  if (!gate.ok) errors.push(`The PVT block is incomplete: ${gate.errors.join(' ')}`);
  if (!Array.isArray(block.table) || block.table.length < 2) errors.push('The PVT block holds no table of at least two pressures.');
  if (isRecord(block.units)) {
    if (registryUnit('pressure', block.units.pressure === 'psia' ? 'psi' : block.units.pressure) == null) errors.push(`The PVT block states its pressures in "${block.units.pressure}", a unit this app does not know.`);
    for (const col of COLUMN_MAP) {
      if (!col.family) continue;
      const stated = block.units[col.from];
      const has = (block.table || []).some((r) => finite(r?.[col.from]));
      if (has && registryUnit(col.family, stated) == null) errors.push(`The PVT block states ${col.from} in "${stated}", a unit this app does not know.`);
    }
  }
  if (!block.project_name) warnings.push('The PVT block does not name the project it came from.');
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * The PVT table of a case, from a pvt-1 block.
 * @param {object} block
 * @param {{fluidSystem?: string, temperatureF?: number, casePressures?: number[]}} [o] the case the table is for:
 *   its fluid system, its temperature and the pressures it holds (initial and surveyed), psia
 * @returns {{ok: boolean, error?: string, rows?: object[], origin?: object, warnings?: string[]}}
 */
export function tableFromPvtBlock(block, { fluidSystem = 'oil', temperatureF = null, casePressures = [] } = {}) {
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
  // The engine interpolates inside the table only; outside it, it falls back on the correlations of the PVT tab.
  const tableMin = rows[0].pressure_psia;
  const tableMax = rows[rows.length - 1].pressure_psia;
  const held = (casePressures || []).filter((p) => finite(p) && p > 0);
  const above = held.filter((p) => p > tableMax + 1e-6);
  const below = held.filter((p) => p < tableMin - 1e-6);
  if (above.length || below.length) {
    const side = [above.length ? `${above.length} above it (up to ${Math.round(Math.max(...above)).toLocaleString('en-US')} psia)` : null, below.length ? `${below.length} below it` : null].filter(Boolean).join(' and ');
    warnings.push(`The table of the project runs from ${Math.round(tableMin).toLocaleString('en-US')} to ${Math.round(tableMax).toLocaleString('en-US')} psia and the case holds ${side}. Outside the table the engine uses the correlations chosen on this tab, so those pressures do not carry the PVT of the fluid study. Widen the pressure range in Fluid Systems Studio, or add the missing rows by hand.`);
  }
  const methods = {};
  for (const key of ['pb', 'rs', 'bo', 'co', 'mu_o', 'z', 'bg', 'mu_g', 'bw']) {
    const m = block.methods?.[key];
    if (isRecord(m) && typeof m.method === 'string' && m.method.trim()) methods[key] = { method: m.method.trim(), kind: m.kind || 'correlation', ...(m.reference ? { reference: m.reference } : {}) };
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
    pressure_range_psia: [tableMin, tableMax],
    case_pressures_outside: above.length + below.length,
    taken_at: new Date().toISOString(),
    edited: false,
  };
  return { ok: true, rows, origin, warnings };
}

const MODEL_WORDS = Object.freeze({ 'black-oil-correlations': 'black-oil correlations', eos: 'equation of state', lab: 'laboratory table' });
const PB_WORDS = Object.freeze(Object.fromEntries(Object.entries(PVT1_PB_SOURCES).map(([k, v]) => [k, k === 'no-solution-gas' ? v : `bubble point ${v}`])));
const tuningWords = (status) => pvtContractTuningText({ tuning: { status } });
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
  if (origin.basis) parts.push(String(origin.basis).replace(/\.$/, ''));
  if (PB_WORDS[origin.pb_source] && !isGas && !origin.methods?.pb) parts.push(PB_WORDS[origin.pb_source]);
  if (tuningWords(origin.tuning)) parts.push(tuningWords(origin.tuning));
  if (origin.range_flags?.length) parts.push(`${origin.range_flags.length} range flag(s) raised by the fluid study`);
  if (origin.case_pressures_outside > 0) parts.push(`${origin.case_pressures_outside} pressure(s) of the case lay outside the table when it was taken`);
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
    ['Lab tuning', tuningWords(origin.tuning) || 'none'],
    ['Temperature of the fluid study', finite(origin.temperature_f) ? `${origin.temperature_f.toFixed(1)} degF` : null],
    ['Pressure range of the table', Array.isArray(origin.pressure_range_psia) ? `${Math.round(origin.pressure_range_psia[0]).toLocaleString('en-US')} to ${Math.round(origin.pressure_range_psia[1]).toLocaleString('en-US')} psia, ${origin.rows} rows${origin.case_pressures_outside > 0 ? `; ${origin.case_pressures_outside} pressure(s) of the case lay outside it, where the engine uses the correlations of the PVT tab` : ''}` : null],
    ['Taken into this case', when(origin.taken_at)],
    ['Edited after it was taken', origin.edited ? 'Yes: rows were changed on the PVT tab' : 'No'],
  ];
  if (!isGas) rows.splice(6, 0, ['Bubble point', PB_WORDS[origin.pb_source] ?? origin.pb_source]);
  for (const [key, label] of METHOD_LABELS) {
    if (isGas && ['pb', 'rs', 'bo', 'mu_o'].includes(key)) continue;
    const m = origin.methods?.[key];
    rows.push([`Method, ${label}`, m?.method ? `${m.method}${m.reference ? ` (${m.reference})` : ''}` : 'not stated by the source']);
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
 * The pvt-1 block of one saved project, read through the shared reader.
 * @param {(id: string) => Promise<object>} read src/lib/pvtSource.js readFluidProjectPvt
 * @returns {Promise<{ok: boolean, block: ?object, projectName: ?string, reason: ?string}>}
 */
export async function readFluidProjectBlock(read, projectId) {
  if (!projectId) return { ok: false, block: null, projectName: null, reason: 'Choose a Fluid Systems Studio project.' };
  const r = await read(projectId);
  if (!r.ok) return { ok: false, block: null, projectName: r.projectName ?? null, reason: r.reason };
  const block = { ...r.contract, project_id: r.contract.project_id ?? projectId, project_name: r.contract.project_name ?? r.projectName };
  return { ok: true, block, projectName: r.projectName ?? block.project_name ?? null, reason: null };
}
