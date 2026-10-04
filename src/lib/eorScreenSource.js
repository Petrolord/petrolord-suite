// What an EOR Screening project says about its reservoir, for the apps that
// read it (EOR-U2-003, contract `eor-screen-1`).
//
// The sender out of EOR Screening. The first reader is to be Recovery Factor
// Estimator (an EOR increment band by method), built in its own Step 2; no
// reader exists yet. A reader opened with `?eorProject=<id>` reads the saved
// project BY ID from saved_eor_screening_projects and builds this record
// from the saved inputs with the screening engine, the one model of the
// screen and the report (the payload stores inputs only; results are always
// recomputed). Nothing is typed across and nothing rides in router state.
// Row level security and the record sharing rules decide who can read the row.
//
// Contract eor-screen-1, every field (oilfield units throughout, as the
// criteria are published: degAPI, cp, % PV, ft, md, md-ft/cp, degF, psia, STB):
//   contract       'eor-screen-1'
//   app            'EOR Screening'
//   project        { id, name, saved_at, company, field, licence, reservoir, wells, data_date, analyst }
//   criteria       { key ('taber-1997'), short, part1, part2 } the edition every verdict comes from
//   units          'oilfield'
//   depth_reference words (the criteria are true vertical depths; no correction applied)
//   inputs         { gravityApi, viscosityCp, oilSatPct, formation, netThicknessFt, permeabilityMd,
//                    depthFt, temperatureF, reservoirPressurePsia, saturationPressurePsia, ooipStb }
//                  each { label, value (number, or the formation key, or null when not given),
//                  unit, screened (true: a Taber criterion reads it; false: context), source (words:
//                  the intake with its project and method, the user's statement, or the sample) }
//   sample         true when any built-in sample value is still in the inputs
//   methods        ranked, each { id, name, group, rank, outcome ('qualified' | 'marginal' |
//                  'screened out' | 'not screened'), passes, marginals, fails, not_screened,
//                  share_passing (0..1 of the screened criteria), criteria: [{ key, criterion,
//                  status ('pass' | 'marginal' | 'fail' | 'na'), required: { min, max } | words,
//                  actual, side ('below' | 'above' | null), source (table and page), reason }] }
//   ranking_basis  words
//   mmp            the CO2 miscibility check (EOR-U2-001, src/utils/eor/mmp.js): { gas: 'CO2',
//                  correlation ('zhu-2025'), correlation_short, inputs: { temperature_degF,
//                  volatiles_mol_pct, intermediates_mol_pct, reservoir_pressure_psia }, status ('made' |
//                  'mmp only' | 'not made'), mmp_psia, mmp_mpa, temperature_degC, verdict ('miscible' |
//                  'immiscible' | null), margin_psi (pressure minus MMP), within_error (the margin is
//                  inside the correlation's largest deviation, 2.05 MPa), outside (inputs outside the
//                  paper's data), reason (words) }. It never changes a Taber verdict.
//   fingerprint    FNV-1a over what the screening says (inputs, verdicts, MMP), never over who
//                  read it or when: a reader compares it to say "source changed since"
//   read_at        ISO time the record was built
//
// Pure apart from `readEorScreenProject`, which takes the Supabase client.
import { fingerprint } from '@/utils/declineCurve/dcaModel';
import { CRITERIA_EDITION, RANKING_BASIS, screenAllMethods, engineInputOf } from '@/utils/eorScreeningCalculations';
import { INPUT_DEFS, inputSource, depthReferenceText, IDENTIFICATION } from '@/utils/eor/reportModel';
import { eorMmpCheck } from '@/utils/eor/mmp';

export const EOR_SCREEN_CONTRACT = 'eor-screen-1';
export const EOR_SCREEN_APP = 'EOR Screening';
export const EOR_SCREEN_PARAM = 'eorProject';
export const EOR_SCREEN_TABLE = 'saved_eor_screening_projects';

const UNIT = Object.freeze({
  api: 'degAPI', viscosity: 'cp', saturation: '% PV', thickness: 'ft', permeability: 'md', depth: 'ft', temperature: 'degF', pressure: 'psia', ooip: 'STB', transmissibility: 'md-ft/cp',
});
const num = (v) => {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
};
const text = (v) => (v != null && String(v).trim() ? String(v).trim() : null);

/** FNV-1a over what the screening says (never over who read it or when). */
export function eorScreenFingerprint(c) {
  return fingerprint({
    criteria: c.criteria?.key ?? null,
    inputs: Object.fromEntries(Object.entries(c.inputs || {}).map(([k, v]) => [k, v.value])),
    methods: (c.methods || []).map((m) => [m.id, m.outcome, (m.criteria || []).map((v) => [v.key, v.status])]),
    mmp: c.mmp ? { mmp_psia: c.mmp.mmp_psia ?? null, verdict: c.mmp.verdict ?? null } : null,
  });
}

/**
 * The eor-screen-1 record of a project's inputs.
 * @param {{inputs: object, projectId?: ?string, projectName?: ?string, savedAt?: ?string, now?: string, mmpOf?: ?function}} a
 *   inputs: the EorScreeningContext inputs (oilfield strings, as saved)
 *   mmpOf: (inputs) => the MMP check (EOR-U2-001), or null
 */
export function buildEorScreenRecord({ inputs, projectId = null, projectName = null, savedAt = null, now = new Date().toISOString(), mmpOf = eorMmpCheck }) {
  if (!inputs || typeof inputs !== 'object' || !inputs.form) return null;
  const ranked = screenAllMethods(engineInputOf(inputs.form));
  const id = inputs.identification || {};
  const project = { id: projectId, name: text(projectName), saved_at: savedAt };
  for (const [key] of IDENTIFICATION) {
    const out = { dataDate: 'data_date' }[key] || key;
    project[out] = text(id[key]);
  }
  delete project.notes;
  const values = {};
  for (const d of INPUT_DEFS) {
    const raw = inputs[d.group]?.[d.key];
    values[d.key] = {
      label: d.label.replace(' (context, not screened)', ''),
      value: d.key === 'formation' ? (text(raw)) : num(raw),
      unit: d.kind ? UNIT[d.kind] : null,
      screened: d.group === 'form',
      source: inputSource(inputs, d.key),
    };
  }
  const methods = ranked.map((r, i) => ({
    id: r.id,
    name: r.name,
    group: r.group,
    rank: i + 1,
    outcome: r.outcome,
    passes: r.passes,
    marginals: r.marginals,
    fails: r.fails,
    not_screened: r.unscored,
    share_passing: r.applicable ? r.score : null,
    criteria: r.verdicts.map((v) => ({
      key: v.key,
      criterion: v.criterion,
      status: v.status,
      required: v.spec ? { min: v.spec.min ?? null, max: v.spec.max ?? null } : (v.required || null),
      actual: v.actual ?? null,
      side: v.side ?? null,
      source: v.source || null,
      reason: v.reason || null,
    })),
  }));
  const record = {
    contract: EOR_SCREEN_CONTRACT,
    app: EOR_SCREEN_APP,
    project,
    criteria: { ...CRITERIA_EDITION },
    units: 'oilfield',
    depth_reference: depthReferenceText(inputs.depthReference),
    inputs: values,
    sample: Boolean(inputs.sampleNote),
    methods,
    ranking_basis: RANKING_BASIS,
    mmp: typeof mmpOf === 'function' ? (mmpOf(inputs) || null) : null,
    read_at: now,
  };
  record.fingerprint = eorScreenFingerprint(record);
  return record;
}

/** What a reader may rely on: { ok, errors }. */
export function validateEorScreenRecord(r) {
  const errors = [];
  if (!r || r.contract !== EOR_SCREEN_CONTRACT) return { ok: false, errors: ['Not an eor-screen-1 record.'] };
  if (!r.criteria?.key) errors.push('No criteria edition.');
  if (!Array.isArray(r.methods) || !r.methods.length) errors.push('No methods.');
  for (const m of r.methods || []) {
    const counted = (m.criteria || []).filter((v) => v.status !== 'na').length;
    if (m.passes + m.marginals + m.fails !== counted) errors.push(`${m.name}: the counts do not close on the screened criteria.`);
  }
  if (!r.inputs || typeof r.inputs !== 'object') errors.push('No inputs.');
  if (typeof r.fingerprint !== 'string' || r.fingerprint !== eorScreenFingerprint(r)) errors.push('The fingerprint does not match the content.');
  return { ok: errors.length === 0, errors };
}

/**
 * Read a saved EOR Screening project by id and build its eor-screen-1 record.
 * @param {object} supabase the client
 * @param {string} projectId
 * @param {{mmpOf?: ?function, now?: string}} [o]
 * @returns {Promise<{ok: boolean, record: ?object, projectName: ?string, updatedAt: ?string, reason: ?string}>}
 */
export async function readEorScreenProject(supabase, projectId, { mmpOf = eorMmpCheck, now } = {}) {
  const none = (reason, extra = {}) => ({ ok: false, record: null, projectName: null, updatedAt: null, reason, ...extra });
  if (!projectId) return none('No EOR Screening project was named.');
  let data;
  try {
    const res = await supabase.from(EOR_SCREEN_TABLE).select('*').eq('id', projectId).maybeSingle();
    if (res.error) {
      const missing = res.error.code === '42P01' || res.error.code === 'PGRST205' || /does not exist|Could not find the table/i.test(res.error.message || '');
      return none(missing ? 'EOR Screening projects are not switched on yet on this database (the table is waiting to be applied).' : `The EOR Screening project could not be read: ${res.error.message}`);
    }
    data = res.data;
  } catch (e) {
    return none(`The EOR Screening project could not be read: ${e?.message || e}`);
  }
  if (!data) return none('The EOR Screening project was not found, or it is not yours to read.');
  const payload = data.inputs_data || {};
  const inputs = payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : null;
  const projectName = data.project_name || payload.name || null;
  if (!inputs?.form) return none('The EOR Screening project holds no screening inputs.', { projectName, updatedAt: data.updated_at || null });
  const record = buildEorScreenRecord({ inputs, projectId, projectName, savedAt: data.updated_at || payload.modified || null, mmpOf, ...(now ? { now } : {}) });
  return { ok: true, record, projectName, updatedAt: data.updated_at || null, reason: null };
}
