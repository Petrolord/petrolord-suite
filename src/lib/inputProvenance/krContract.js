/**
 * kr-1: the relative permeability and capillary pressure provenance
 * contract (Reservoir round, plan Step 0c; SCAL-U1, RL11). Written by SCAL
 * Studio, saved with the project (payload key `kr`), sent with every
 * handoff, read by id through src/lib/krSource.js. It mirrors pvt-1
 * (pvtContract.js): the block says where the curves came from, what model
 * and parameters made them, whether each set was fitted to lab data or
 * typed, the pedigree of the core samples behind them, the units, and the
 * tables themselves.
 *
 *   schema, source_app, project_id, project_name, generated_at, app_build
 *   units            every quantity of the block, as the engine holds them
 *   oil_water        { model, params, origin, normalisation, table } or null
 *   gas_oil          the same for the gas-oil set (at connate water)
 *   capillary        { j, reservoir, leverett_c, height, table } or null
 *   samples          the pedigree of each core sample, with its point counts
 *   scope            what the model does not cover (thin-real lock)
 *   identification   the project header
 *
 * Pure.
 */

export const KR1_SCHEMA = 'kr-1';
export const KR_PRODUCER = 'SCAL Studio';
/** The query parameter a consumer route reads the saved SCAL project id from. */
export const KR_PROJECT_PARAM = 'scalProject';
/** The key the block is stored under in a saved SCAL project payload. */
export const KR_CONTRACT_PAYLOAD_KEY = 'kr';
/** The router state key of the handoff (unchanged since SC5). */
export const KR_HANDOFF_STATE_KEY = 'scalKr';

/** Units of the block, as the engine holds them, whatever the display units. */
export const KR1_UNITS = Object.freeze({
  saturation: 'fraction', kr: 'fraction', pc: 'psi', ift: 'dyn/cm', permeability: 'md', porosity: 'fraction',
  angle: 'deg', length: 'ft', temperature: 'degF', gravity: 'specific gravity, water = 1', J: 'dimensionless',
});

export const KR1_ORIGINS = Object.freeze({
  entered: 'entered by the user',
  fitted: 'fitted to a lab kr table',
  'edited-after-fit': 'fitted to a lab kr table, then edited by the user',
  samples: 'fitted to the averaged lab J of the included samples',
});

export const KR1_SCOPE_TEXT = 'Two-phase Corey curves (oil-water at the given Swc, gas-oil at connate water) and one drainage-type Leverett J curve. No hysteresis between drainage and imbibition, no three-phase model, no end-point scaling with depth or permeability.';

const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Build the kr-1 block. Everything is handed in by the producer; nothing is
 * named here.
 * @param {{sourceApp?: string, projectId?: ?string, projectName?: ?string, generatedAt?: Date|string,
 *   appBuild?: ?string, oilWater?: ?object, gasOil?: ?object, capillary?: ?object,
 *   samples?: object[], identification?: object}} a
 */
export function buildKrContract(a) {
  const at = a.generatedAt instanceof Date ? a.generatedAt.toISOString() : (a.generatedAt || new Date().toISOString());
  return {
    schema: KR1_SCHEMA,
    source_app: a.sourceApp || KR_PRODUCER,
    project_id: a.projectId ?? null,
    project_name: a.projectName ?? null,
    generated_at: at,
    app_build: a.appBuild ?? null,
    units: { ...KR1_UNITS },
    oil_water: a.oilWater || null,
    gas_oil: a.gasOil || null,
    capillary: a.capillary || null,
    samples: (a.samples || []).map((s) => ({ ...s })),
    scope: { three_phase: false, hysteresis: false, text: KR1_SCOPE_TEXT },
    ...(a.identification ? { identification: a.identification } : {}),
  };
}

/** The kr-1 block a handoff or a saved project payload carries, or null. */
export function krContractOf(carrier) {
  if (!isRecord(carrier)) return null;
  const block = carrier.schema === KR1_SCHEMA ? carrier : (carrier.contract || carrier[KR_CONTRACT_PAYLOAD_KEY]);
  return isRecord(block) && block.schema === KR1_SCHEMA ? block : null;
}

const OW_PARAMS = ['Swc', 'Sor', 'krwMax', 'kroMax', 'nw', 'no'];
const GO_PARAMS = ['Swc', 'Sgc', 'Sorg', 'krgMax', 'krogMax', 'ng', 'nog'];

function checkSet(set, name, keys, errors) {
  if (!isRecord(set)) return;
  if (set.model !== 'corey') errors.push(`${name}.model is "${set.model}", expected "corey".`);
  for (const k of keys) if (!fin(set.params?.[k])) errors.push(`${name}.params.${k} is missing.`);
  if (!isRecord(set.origin) || !KR1_ORIGINS[set.origin.kind]) errors.push(`${name}.origin.kind is not one of ${Object.keys(KR1_ORIGINS).join(', ')}.`);
  if (set.origin?.kind === 'fitted' && !set.origin.sample_name) errors.push(`${name}.origin names no sample.`);
  if (!set.normalisation) errors.push(`${name}.normalisation is missing.`);
  if (!Array.isArray(set.table) || set.table.length < 2) errors.push(`${name}.table is empty.`);
}

/**
 * Check a kr-1 block. The gate of the contract: it says where it came from,
 * every set names its model, parameters and origin (fitted or entered), the
 * capillary block names its J source and the rock it was scaled to, and
 * every quantity has a unit.
 * @returns {{ok: boolean, errors: string[], warnings: string[]}}
 */
export function validateKrContract(block) {
  const errors = [];
  const warnings = [];
  if (!isRecord(block)) return { ok: false, errors: ['The block is not an object.'], warnings };
  if (block.schema !== KR1_SCHEMA) errors.push(`schema is "${block.schema}", expected "${KR1_SCHEMA}".`);
  for (const k of ['source_app', 'generated_at']) if (!block[k]) errors.push(`${k} is missing.`);
  if (block.generated_at && Number.isNaN(Date.parse(block.generated_at))) errors.push('generated_at is not a date.');
  if (!block.project_id) warnings.push('project_id is missing: the receiver cannot re-open the source project.');
  if (!block.app_build) warnings.push('app_build is missing.');
  if (!isRecord(block.units)) errors.push('units is missing.');
  else for (const k of Object.keys(KR1_UNITS)) if (!block.units[k]) errors.push(`units.${k} is missing.`);
  if (!block.oil_water && !block.gas_oil && !block.capillary) errors.push('The block holds no curve set and no capillary pressure.');
  checkSet(block.oil_water, 'oil_water', OW_PARAMS, errors);
  checkSet(block.gas_oil, 'gas_oil', GO_PARAMS, errors);
  const c = block.capillary;
  if (isRecord(c)) {
    if (!isRecord(c.j) || c.j.type !== 'power' || !fin(c.j.a) || !fin(c.j.b) || !fin(c.j.Swirr)) errors.push('capillary.j is not a complete power law.');
    if (c.j && !KR1_ORIGINS[c.j.origin]) errors.push('capillary.j.origin is missing.');
    for (const k of ['k_md', 'phi', 'sigma_dyncm', 'thetaDeg']) if (!fin(c.reservoir?.[k])) errors.push(`capillary.reservoir.${k} is missing.`);
    if (!fin(c.leverett_c)) errors.push('capillary.leverett_c is missing.');
    if (!Array.isArray(c.table) || c.table.length < 2) errors.push('capillary.table is empty.');
  }
  if (!Array.isArray(block.samples)) errors.push('samples is missing.');
  if (!isRecord(block.scope) || block.scope.hysteresis !== false || block.scope.three_phase !== false) errors.push('scope is missing.');
  for (const s of block.samples || []) {
    if (!s.process_kr && (s.kr_points || 0) > 0) warnings.push(`Sample "${s.name}": drainage or imbibition of the kr test is not stated.`);
    if (!s.origin) warnings.push(`Sample "${s.name}": lab or analog is not stated.`);
  }
  return { ok: errors.length === 0, errors, warnings };
}

const dateWords = (iso) => (iso && !Number.isNaN(Date.parse(iso)) ? `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')} UTC` : null);

/** ", from SCAL Studio project "X" (2026-10-03 12:00 UTC)". */
export function krContractOrigin(block) {
  const name = block?.project_name ? ` project "${block.project_name}"` : '';
  const when = dateWords(block?.generated_at);
  return `, from ${block?.source_app || KR_PRODUCER}${name}${when ? ` (${when})` : ''}`;
}

const sampleOf = (block, id) => (block?.samples || []).find((s) => s.id === id) || null;

/** The words for where one curve set came from, without the origin clause. */
export function krSetText(block, setKey = 'oil_water') {
  const set = block?.[setKey];
  if (!set) return null;
  const o = set.origin || {};
  if (o.kind === 'fitted' || o.kind === 'edited-after-fit') {
    const s = sampleOf(block, o.sample_id);
    const bits = [];
    if (s?.origin) bits.push(s.origin === 'analog' ? 'analog' : 'lab');
    if (s?.process_kr) bits.push(s.process_kr);
    if (s?.kr_method) bits.push(s.kr_method);
    const r2 = fin(o.fit?.r2Log) ? `, r2 ${o.fit.r2Log.toFixed(3)} (log kr)` : '';
    const lead = o.kind === 'fitted' ? 'Corey fitted' : 'Corey fitted, then edited by the user';
    return `${lead} to sample "${o.sample_name}"${bits.length ? ` (${bits.join(', ')})` : ''}${r2}`;
  }
  return 'Corey, parameters entered by the user';
}

/** The Source column words of a value a consumer took from a kr-1 block. */
export function krContractSourceText(block, setKey = 'oil_water') {
  const t = krSetText(block, setKey);
  if (!t) return `Not in the handoff${krContractOrigin(block)}`;
  return `${t}${krContractOrigin(block)}`;
}

/** The capillary block as words: J source, rock, height basis. */
export function krCapillaryText(block) {
  const c = block?.capillary;
  if (!c) return null;
  const j = c.j || {};
  const src = j.origin === 'samples'
    ? `Leverett J averaged from ${j.samples?.length || 0} sample${j.samples?.length === 1 ? '' : 's'} (${(j.samples || []).join(', ')})${fin(j.fit?.r2Log) ? `, refit r2 ${j.fit.r2Log.toFixed(3)}` : ''}`
    : 'Leverett J typed as a power law';
  return `${src}, scaled to k ${c.reservoir?.k_md} md and porosity ${c.reservoir?.phi}${krContractOrigin(block)}`;
}

/** The kr-1 block as label and value lines, for a report that cites it. */
export function describeKrContract(block) {
  const b = krContractOf(block);
  if (!b) return [];
  const rows = [
    ['Contract', b.schema],
    ['Source', `${b.source_app}${b.project_name ? `, project "${b.project_name}"` : ''}`],
    ['Generated', dateWords(b.generated_at) || ''],
    ['Build', b.app_build || ''],
  ];
  if (b.oil_water) rows.push(['Oil-water set', krSetText(b, 'oil_water')]);
  if (b.gas_oil) rows.push(['Gas-oil set', krSetText(b, 'gas_oil')]);
  if (b.capillary) rows.push(['Capillary pressure', krCapillaryText(b).replace(krContractOrigin(b), '')]);
  rows.push(['Samples', (b.samples || []).length ? b.samples.map((s) => s.name).join(', ') : 'none']);
  rows.push(['Units of the block', `As the engine holds them, whatever the display units: Pc ${b.units?.pc}, IFT ${b.units?.ift}, permeability ${b.units?.permeability}, depth and height ${b.units?.length}, temperature ${b.units?.temperature}, saturations and kr as fractions`]);
  rows.push(['Scope', b.scope?.text || '']);
  return rows;
}

/** Lines that carry the provenance at the top of a CSV file (each starts with `prefix`). */
export function krContractCsvHeader(block, { prefix = '# ', extra = [] } = {}) {
  const b = krContractOf(block);
  if (!b) return [];
  return [...describeKrContract(b).map(([k, v]) => `${k}: ${v}`), ...extra].map((l) => `${prefix}${String(l).replace(/[\r\n]+/g, ' ')}`);
}
