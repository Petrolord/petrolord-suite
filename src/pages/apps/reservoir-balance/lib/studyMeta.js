// What a Material Balance study records beside its engine inputs (MBAL-U1):
// who and what the report identifies, the pressure datum, and where each
// input came from. None of it changes a number, so none of it may make a
// stored run stale (reviewer lens RL8: editing a report-only field does not
// withdraw a claim).
//
// Where it is kept. The rb_* tables have no jsonb column for it and a new
// column is a migration the owner applies. So the record travels in the
// pvt_correlations jsonb of the case default config (rb_run_configs), under
// the key `study`, as the origin of a generated PVT table already does
// (lib/pvtSource.js, Reservoir Step 0e). The engine is handed only its five
// named correlation choices (supabase/functions/_shared/mbal-run-mapping.ts
// pickCorrelations), so nothing here reaches it. A case saved before this
// has no record and opens with every field blank.
//
// Pure: no React, no I/O.
import { serializeProvenance, deserializeProvenance } from '@/lib/inputProvenance';

/** Keys of pvt_correlations that are records of the study, never engine input. */
export const STUDY_KEY = 'study';
export const RUN_SNAPSHOT_KEY = 'run_snapshot';
export const REPORT_ONLY_KEYS = Object.freeze([STUDY_KEY, RUN_SNAPSHOT_KEY]);

export const STUDY_VERSION = 1;

/** The correlation choices of a new case (the column default of rb_run_configs.pvt_correlations). */
export const DEFAULT_CORRELATIONS = Object.freeze({
  pb_rs_bo: 'standing',
  oil_viscosity: 'beggs_robinson',
  z_factor: 'hall_yarborough',
  gas_viscosity: 'lee_gonzalez_eakin',
  water: 'mccain',
});

/** Identification the user types. Field, reservoir and case name live on the case row. */
export const IDENTIFICATION_FIELDS = Object.freeze([
  ['company', 'Company', 'Defaults to your organisation'],
  ['licence', 'Licence or block', 'e.g. OML 143'],
  ['zone', 'Zone or sand', 'e.g. E-2000 sand'],
  ['analyst', 'Analyst', 'Name of the engineer'],
]);

/** What a depth is measured from, for the pressure datum and the gauge depth. */
export const DEPTH_REFERENCES = Object.freeze({
  TVDSS: 'TVDSS (below mean sea level)',
  TVD: 'TVD (below the drilling reference)',
  MD: 'MD (along hole)',
});

/** How the pressures on the Data tab relate to the datum. The app applies no correction either way. */
export const PRESSURE_BASES = Object.freeze({
  '': 'Not stated',
  gauge_depth: 'As measured at gauge depth',
  datum: 'Corrected to the datum before entry',
  average: 'Field average, already at datum',
});

/** The fields of the contact geometry, as the study record keeps them. */
export const CONTACT_FIELDS = Object.freeze(['initial_owc_ft', 'initial_goc_ft', 'area_owc_acres', 'area_goc_acres', 'porosity', 'sor_water', 'sor_gas']);

const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v) => (v == null ? '' : String(v).trim());
const num = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** An empty study record. */
export const emptyStudy = () => ({
  v: STUDY_VERSION,
  identification: { company: '', licence: '', zone: '', analyst: '' },
  datum: { datum_depth_ft: null, gauge_depth_ft: null, reference: 'TVDSS', basis: '', note: '' },
  inputMeta: {},
  // the contact geometry of the Contacts tab (depths in ft, areas in acres, fractions)
  contacts: { initial_owc_ft: null, initial_goc_ft: null, area_owc_acres: null, area_goc_acres: null, porosity: null, sor_water: null, sor_gas: null },
  // values that arrived from another app: { <input key>: { app, record, value, at, text } }
  handoffs: {},
  // MBAL-U2-003: why each excluded timestep is out of the fit: { <timestep>: reason }
  exclusions: {},
});

/**
 * The study record of a config row, every field present. A row without one
 * (a case from before the record existed) reads as the empty record.
 * @param {?object} cfg an rb_run_configs row
 */
export function readStudy(cfg) {
  const raw = cfg?.pvt_correlations?.[STUDY_KEY];
  const out = emptyStudy();
  if (!isRecord(raw)) return out;
  const id = isRecord(raw.identification) ? raw.identification : {};
  for (const [key] of IDENTIFICATION_FIELDS) out.identification[key] = text(id[key]);
  const d = isRecord(raw.datum) ? raw.datum : {};
  out.datum = {
    datum_depth_ft: num(d.datum_depth_ft),
    gauge_depth_ft: num(d.gauge_depth_ft),
    reference: DEPTH_REFERENCES[d.reference] ? d.reference : 'TVDSS',
    basis: PRESSURE_BASES[d.basis] != null ? d.basis : '',
    note: text(d.note),
  };
  out.inputMeta = deserializeProvenance(raw.inputMeta);
  const c = isRecord(raw.contacts) ? raw.contacts : {};
  for (const key of CONTACT_FIELDS) out.contacts[key] = num(c[key]);
  if (isRecord(raw.handoffs)) {
    for (const [key, h] of Object.entries(raw.handoffs)) {
      if (!isRecord(h)) continue;
      out.handoffs[key] = { app: text(h.app), record: text(h.record), value: num(h.value), at: text(h.at), text: text(h.text) };
    }
  }
  if (isRecord(raw.exclusions)) {
    for (const [key, why] of Object.entries(raw.exclusions)) if (/^\d+$/.test(key) && text(why)) out.exclusions[key] = text(why);
  }
  return out;
}

/** The record as it is saved: blanks dropped, provenance through its own serializer. */
export function serializeStudy(study) {
  const s = study || emptyStudy();
  const identification = {};
  for (const [key] of IDENTIFICATION_FIELDS) if (text(s.identification?.[key])) identification[key] = text(s.identification[key]);
  const datum = {};
  if (num(s.datum?.datum_depth_ft) != null) datum.datum_depth_ft = num(s.datum.datum_depth_ft);
  if (num(s.datum?.gauge_depth_ft) != null) datum.gauge_depth_ft = num(s.datum.gauge_depth_ft);
  if (s.datum?.reference && s.datum.reference !== 'TVDSS') datum.reference = s.datum.reference;
  if (s.datum?.basis) datum.basis = s.datum.basis;
  if (text(s.datum?.note)) datum.note = text(s.datum.note);
  const contacts = {};
  for (const key of CONTACT_FIELDS) if (num(s.contacts?.[key]) != null) contacts[key] = num(s.contacts[key]);
  const handoffs = {};
  for (const [key, h] of Object.entries(isRecord(s.handoffs) ? s.handoffs : {})) {
    if (isRecord(h) && text(h.app)) handoffs[key] = { app: text(h.app), record: text(h.record), value: num(h.value), at: text(h.at), text: text(h.text) };
  }
  const exclusions = {};
  for (const [key, why] of Object.entries(isRecord(s.exclusions) ? s.exclusions : {})) if (/^\d+$/.test(key) && text(why)) exclusions[key] = text(why);
  return {
    v: STUDY_VERSION, identification, datum, inputMeta: serializeProvenance(s.inputMeta),
    ...(Object.keys(contacts).length ? { contacts } : {}),
    ...(Object.keys(handoffs).length ? { handoffs } : {}),
    ...(Object.keys(exclusions).length ? { exclusions } : {}),
  };
}

/** pvt_correlations with the study record written into it. */
export function withStudy(correlations, study) {
  const base = isRecord(correlations) ? correlations : { ...DEFAULT_CORRELATIONS };
  return { ...base, [STUDY_KEY]: serializeStudy(study) };
}

/** pvt_correlations without the records of the study: what a run is compared on. */
export function engineSideCorrelations(correlations) {
  if (!isRecord(correlations)) return correlations;
  const out = {};
  for (const [k, v] of Object.entries(correlations)) if (!REPORT_ONLY_KEYS.includes(k)) out[k] = v;
  return out;
}

// ---- the snapshot a run keeps of what it was made on ------------------------

/** The rb_production_data columns the engine is handed. */
export const SNAPSHOT_DATA_COLUMNS = Object.freeze([
  'timestep_index', 'pressure_psia', 'observation_date', 'cum_oil_stb', 'cum_gas_scf', 'cum_water_stb',
  'cum_water_inj_stb', 'cum_gas_inj_scf', 'bo_rb_stb', 'rs_scf_stb', 'bg_rb_mscf', 'bw_rb_stb', 'z_factor', 'observed_we_rb',
]);

const cell = (v) => {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  const n = Number(v);
  return Number.isFinite(n) && String(v).trim() !== '' ? String(n) : String(v);
};

/**
 * A short digest of the data rows the engine reads: FNV-1a over a canonical
 * text of every engine column of every row, in timestep order. Two tables
 * give the same digest when the engine would read the same numbers.
 */
export function dataDigest(productionData) {
  const rows = [...(productionData ?? [])].sort((a, b) => a.timestep_index - b.timestep_index);
  const body = rows.map((r) => SNAPSHOT_DATA_COLUMNS.map((c) => cell(r[c])).join('|')).join('\n');
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ch, 0x85ebca6b) >>> 0;
  }
  return `${rows.length}:${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}
