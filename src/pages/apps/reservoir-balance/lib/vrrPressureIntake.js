// Average reservoir pressures of the data table taken from a saved Voidage
// Replacement Monitor project by id (Batch B of the Material Balance Step 2
// build: "pressure rows from VRR Monitor or Well Test where a saved source
// exists, by id, provenance printed, edits marked").
//
// The saved source: `saved_vrr_projects.inputs_data.inputs.pressureSurveys`,
// a list of { date: 'YYYY-MM-DD' | 'YYYY-MM', p_psia } typed on the VRR
// Pressure tab (labelled psia there). A survey is matched to the data row of
// the same date, or of the same month when the survey gives a month only.
// Rows that no survey matches keep their pressure; surveys that match no
// row are listed. The pressures taken are recorded in the study record
// (study.handoffs.pressure_rows) so the report cites the project and says
// which taken pressure was edited after.
//
// VRR-U2-001: the read goes through the `vrr-1` contract of VRR Monitor
// (src/utils/vrr/vrrLedgerContract.js, `pressureRows`), the one contract VRR
// sends for its ledger and its pressure rows; the cleaning and the order are
// the ones this module applied before, so the numbers are identical. The
// handoff records the schema, version and fingerprint it read.
//
// Well Test Analysis Studio writes its results (wta-1) with every save since
// WTA-U1-012; its average pressure is taken as a pressure point by
// lib/wellTestPressureIntake.js (WTA-U2-005).
import { vrrContractOfRow, vrrPressureRows, VRR_APP, VRR_TABLE } from '@/utils/vrr/vrrLedgerContract';

export { VRR_APP, VRR_TABLE };
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** The `vrr-1` contract of a saved VRR project row, or null. */
const contractOf = (row) => {
  const res = row?.inputs_data ? vrrContractOfRow(row) : null;
  return res?.ok ? res.contract : null;
};

/** The surveys of a saved VRR project, cleaned: { date, p_psia }, by date (the contract's pressure rows). */
export function vrrSurveys(row) {
  const c = contractOf(row);
  return c ? vrrPressureRows(c) : [];
}

/**
 * Which data row each survey lands on.
 * @param {Array<object>} rows production_data of the case
 * @param {Array<{date: string, p_psia: number}>} surveys
 * @returns {{matches: Array<{timestep_index: number, date: string, from: number, to: number, survey_date: string}>,
 *   unmatched: Array<{date: string, p_psia: number}>, ambiguous: string[]}}
 */
export function matchSurveys(rows, surveys) {
  const matches = [];
  const unmatched = [];
  const ambiguous = [];
  for (const s of surveys) {
    const day = s.date.length === 10;
    const hits = (rows ?? []).filter((r) => {
      const d = String(r.observation_date ?? '').slice(0, 10);
      return d && (day ? d === s.date : d.slice(0, 7) === s.date);
    });
    if (hits.length === 0) { unmatched.push(s); continue; }
    if (hits.length > 1) { ambiguous.push(s.date); continue; }
    const r = hits[0];
    matches.push({ timestep_index: r.timestep_index, date: String(r.observation_date).slice(0, 10), from: Number(r.pressure_psia), to: s.p_psia, survey_date: s.date });
  }
  return { matches, unmatched, ambiguous };
}

/**
 * The new data rows and the handoff record when the analyst takes the matches.
 * The initial row is never changed here: it must equal the initial pressure
 * of the case, which is a case input of its own.
 */
export function takeSurveys(row, rows, { now = new Date().toISOString() } = {}) {
  const surveys = vrrSurveys(row);
  if (!surveys.length) return { error: `The project "${row?.project_name ?? '?'}" has no dated pressure survey saved.` };
  const { matches, unmatched, ambiguous } = matchSurveys(rows, surveys);
  const usable = matches.filter((m) => m.timestep_index !== 0);
  if (!usable.length) return { error: `No survey of "${row.project_name}" falls on a dated row of this case after the initial state.` };
  const by = new Map(usable.map((m) => [m.timestep_index, m]));
  const nextRows = rows.map((r) => (by.has(r.timestep_index) ? { ...r, pressure_psia: by.get(r.timestep_index).to } : r));
  const handoff = {
    app: VRR_APP,
    record: `${row.project_name} (${row.id})`,
    at: now,
    text: `Taken from ${VRR_APP} project "${row.project_name}", pressure surveys of its Pressure tab (psia as typed there)`,
    rows: Object.fromEntries(usable.map((m) => [String(m.timestep_index), m.to])),
  };
  const c = contractOf(row);
  if (c) handoff.contract = { schema: c.schema, version: c.version, fingerprint: c.fingerprint };
  return { rows: nextRows, handoff, matches: usable, unmatched, ambiguous };
}

/**
 * What the report says about pressures taken from a VRR project: the source,
 * the timesteps, and those edited after the handoff. Null when none was taken.
 */
export function pressureProvenance(study, rows) {
  const h = study?.handoffs?.pressure_rows;
  if (!h?.app || !h.rows) return null;
  const steps = Object.keys(h.rows).map(Number).sort((a, b) => a - b);
  const byStep = new Map((rows ?? []).map((r) => [r.timestep_index, r]));
  const edited = steps.filter((t) => {
    const r = byStep.get(t);
    const p = Number(r?.pressure ?? r?.pressure_psia);
    return !r || !finite(p) || Math.abs(p - h.rows[String(t)]) > 1e-6 * Math.max(1, h.rows[String(t)]);
  });
  return {
    steps, edited,
    text: `Pressures of timesteps ${steps.join(', ')}: ${h.text}, record ${h.record}, taken ${String(h.at).slice(0, 10)}.`
      + (edited.length ? ` Edited in this app after the handoff: timestep${edited.length === 1 ? '' : 's'} ${edited.join(', ')}.` : ''),
  };
}

/** The saved VRR projects the user can read, newest first. */
export async function listVrrProjects(supabase) {
  const { data, error } = await supabase.from(VRR_TABLE).select('*').order('updated_at', { ascending: false });
  return { data: data ?? [], error };
}
