// Voidage Replacement Monitor as a sender: the `vrr-1` contract (VRR-U2-001,
// RL11), one read-by-id contract of a saved VRR project for the ledger AND
// the pressure rows. It converges the two reads that existed before:
//   - Waterflood Design Studio's `vrr-ledger-1` (WF-U2-004): the per-well
//     ledger by month for its Surveillance tab, with the pressure surveys for
//     FVF by period (WF-U2-008);
//   - Material Balance Studio's direct read of
//     `inputs_data.inputs.pressureSurveys` (MBAL U2 Batch B,
//     src/pages/apps/reservoir-balance/lib/vrrPressureIntake.js), which now
//     reads `pressureRows` of this contract (numbers identical).
// One builder, one fingerprint, a schema and a version. `vrr-ledger-1` is the
// same shape without `version`; readers accept both (VRR_SCHEMAS), and the
// fingerprint keeps the vrr-ledger-1 composition, so an intake taken before
// U2-001 does not read as changed.
//
// The saved source: `saved_vrr_projects.inputs_data.inputs` (schema 1,
// oilfield storage whatever the display units): mode 'imported' with wellRows
// { date: 'YYYY-MM-DD' | 'YYYY-MM', well, oil_stb, water_stb, gas_mscf, winj_stb, ginj_mscf },
// volumes per row, aggregated by calendar month as VRR does (vrrLedger.js
// buildFieldPeriods); pressureSurveys [{date, p_psia}] typed or imported on the
// Pressure tab, absolute psia; datum {depth (ft), reference}, stated only.
//
// The contract:
//   schema, version             'vrr-1', 1 (a reader also accepts 'vrr-ledger-1')
//   app, table                  'Voidage Replacement Monitor', 'saved_vrr_projects'
//   projectId, projectName, projectSavedAt
//   units                       volume, period and pressure basis in words
//   hasLedger, ledgerRefusal    false with the reason for a period-grid project (it has no wells)
//   wells                       { injectors: [], producers: [] } as VRR classifies them
//   months                      ['YYYY-MM', ...] in order
//   volumes                     [{ month, well, oil_stb, water_stb, gas_mscf, winj_stb, ginj_mscf }] per well per month
//   totals                      field sums of the five volumes
//   fvf                         the FVF set of the VRR project (Bo, Bw, Bg, Rs) as stored, for comparison
//   pressureSurveys             the dated surveys, cleaned, in saved order [{date, p_psia}]
//   pressureRows                the same sorted by date: what Material Balance takes onto its dated rows
//   datum                       { depth_ft, reference, corrected: false } (stated, never applied)
//   fingerprint                 FNV-1a over projectId, wells, months, volumes, fvf, pressureSurveys
import { fingerprint } from '@/utils/declineCurve/dcaModel';
import { monthKeyOf, classifyLedgerWells } from '@/utils/vrrCalculations';

export const VRR_SCHEMA = 'vrr-1';
export const VRR_CONTRACT_VERSION = 1;
/** The schemas a reader accepts: this one and the Waterflood-era name of the same shape. */
export const VRR_SCHEMAS = Object.freeze(['vrr-1', 'vrr-ledger-1']);
/** Kept for readers written against WF-U2-004. */
export const VRR_LEDGER_SCHEMA = 'vrr-ledger-1';
export const VRR_APP = 'Voidage Replacement Monitor';
export const VRR_TABLE = 'saved_vrr_projects';
export const GRID_REFUSAL = 'The project holds a field period grid, not a per-well ledger: Waterflood surveillance needs wells and dates. Import the ledger CSV in VRR Monitor first.';

const KEYS = ['oil_stb', 'water_stb', 'gas_mscf', 'winj_stb', 'ginj_mscf'];
const n = (v) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
};

/** A contract any reader of VRR may read (either schema name). */
export const isVrrContract = (c) => Boolean(c && VRR_SCHEMAS.includes(c.schema));

/** FNV-1a over what the ledger says (never over who sent it or when). */
export function vrrLedgerFingerprint(c) {
  return fingerprint({ projectId: c.projectId, wells: c.wells, months: c.months, volumes: c.volumes, fvf: c.fvf, pressureSurveys: c.pressureSurveys });
}

/** The dated pressure surveys of saved inputs, cleaned (absolute psia), in saved order. */
function cleanSurveys(inputs) {
  return (Array.isArray(inputs.pressureSurveys) ? inputs.pressureSurveys : [])
    .map((s) => ({ date: String(s?.date ?? '').trim(), p_psia: Number(s?.p_psia) }))
    .filter((s) => /^\d{4}-\d{2}(-\d{2})?$/.test(s.date) && Number.isFinite(s.p_psia) && s.p_psia > 0);
}

/** The pressure rows of a contract, by date (what Material Balance takes). */
export function vrrPressureRows(contract) {
  if (!isVrrContract(contract)) return [];
  if (Array.isArray(contract.pressureRows)) return contract.pressureRows.map((s) => ({ ...s }));
  return [...(contract.pressureSurveys || [])].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The `vrr-1` contract of a saved VRR project: the ledger when it has one,
 * the pressure rows always.
 * @returns {{ok: true, contract: object}|{ok: false, reason: string}}
 */
export function buildVrrContract({ projectId, projectName = null, projectSavedAt = null, payload }) {
  const inputs = payload?.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  if (!inputs || typeof inputs !== 'object') return { ok: false, reason: 'The project has no saved inputs.' };
  let ledgerRefusal = null;
  let volumes = [];
  if (inputs.mode !== 'imported' || !Array.isArray(inputs.wellRows) || !inputs.wellRows.length) {
    ledgerRefusal = GRID_REFUSAL;
  } else {
    const by = new Map();
    for (const r of inputs.wellRows) {
      const month = monthKeyOf(r.date);
      const well = String(r.well ?? '').trim();
      if (!month || !well) continue;
      const k = `${month}|${well}`;
      if (!by.has(k)) by.set(k, { month, well, oil_stb: 0, water_stb: 0, gas_mscf: 0, winj_stb: 0, ginj_mscf: 0 });
      const v = by.get(k);
      for (const key of KEYS) v[key] += n(r[key]);
    }
    volumes = [...by.values()].sort((a, b) => (a.month === b.month ? a.well.localeCompare(b.well) : a.month < b.month ? -1 : 1));
    if (!volumes.length) ledgerRefusal = 'The ledger has no row with a date and a well.';
  }
  const hasLedger = !ledgerRefusal;
  const { injectors, producers } = hasLedger ? classifyLedgerWells(inputs.wellRows) : { injectors: [], producers: [] };
  const totals = Object.fromEntries(KEYS.map((k) => [k, volumes.reduce((s, v) => s + v[k], 0)]));
  const pressureSurveys = cleanSurveys(inputs);
  const depth = parseFloat(inputs.datum?.depth);
  const contract = {
    schema: VRR_SCHEMA,
    version: VRR_CONTRACT_VERSION,
    app: VRR_APP,
    table: VRR_TABLE,
    projectId,
    projectName,
    projectSavedAt,
    units: {
      volume: 'STB (oil, water produced), bbl (water injected), Mscf (gas)',
      period: 'calendar month',
      pressure: 'psia (absolute), as saved; not corrected to the datum',
      note: 'Volumes as stored by VRR Monitor (oilfield), summed by calendar month per well as VRR Monitor does.',
    },
    hasLedger,
    ledgerRefusal,
    wells: { injectors: [...injectors].sort(), producers: [...producers].sort() },
    months: [...new Set(volumes.map((v) => v.month))],
    volumes,
    totals,
    fvf: { ...(inputs.fvf || {}) },
    pressureSurveys,
    pressureRows: [...pressureSurveys].sort((a, b) => a.date.localeCompare(b.date)),
    datum: { depth_ft: Number.isFinite(depth) ? depth : null, reference: String(inputs.datum?.reference ?? '').trim() || null, corrected: false },
  };
  contract.fingerprint = vrrLedgerFingerprint(contract);
  return { ok: true, contract };
}

/**
 * The ledger reader's view (Waterflood): the same contract, refused when the
 * project has no per-well ledger.
 * @returns {{ok: true, contract: object}|{ok: false, reason: string}}
 */
export function buildVrrLedgerContract(args) {
  const res = buildVrrContract(args);
  if (!res.ok) return res;
  if (!res.contract.hasLedger) return { ok: false, reason: res.contract.ledgerRefusal };
  return res;
}

const rowArgs = (row) => ({ projectId: row.id, projectName: row.project_name ?? null, projectSavedAt: row.updated_at ?? null, payload: row.inputs_data });
const contractOf = (row) => buildVrrLedgerContract({ projectId: row.id, projectName: row.project_name ?? null, projectSavedAt: row.updated_at ?? null, payload: row.inputs_data });

/** Every VRR project the user may read, newest first, each a contract or a refusal. */
export async function listVrrLedgers(supabase, { limit = 50 } = {}) {
  const { data, error } = await supabase.from(VRR_TABLE).select('id, project_name, inputs_data, updated_at').order('updated_at', { ascending: false }).limit(limit);
  if (error) throw new Error(`Could not read your Voidage Replacement Monitor projects: ${error.message}`);
  return (data || []).map((row) => ({ projectId: row.id, projectName: row.project_name ?? null, ...contractOf(row) }));
}

/** One project's ledger by id; null when the project is gone (or no longer readable). */
export async function getVrrLedger(supabase, { projectId }) {
  const { data, error } = await supabase.from(VRR_TABLE).select('id, project_name, inputs_data, updated_at').eq('id', projectId).limit(1);
  if (error) throw new Error(`Could not read the Voidage Replacement Monitor project: ${error.message}`);
  if (!data || !data.length) return null;
  return contractOf(data[0]);
}

/** Compare a received ledger with the one its source would send now. */
export function compareVrrWithSource(receivedFingerprint, now) {
  if (!now) return { state: 'missing', text: 'The VRR Monitor project is no longer there (deleted, or no longer shared with you).' };
  if (!now.ok) return { state: 'refused', text: `The VRR Monitor project cannot send its ledger now: ${now.reason}` };
  if (now.contract.fingerprint === receivedFingerprint) return { state: 'unchanged', text: 'Unchanged since it was taken.' };
  return { state: 'changed', text: 'The VRR Monitor ledger changed since it was taken. Take it again to use the new history.', now: now.contract };
}

/** One project's `vrr-1` contract by id (ledger or not); null when the project is gone (or no longer readable). */
export async function getVrrContract(supabase, { projectId }) {
  const { data, error } = await supabase.from(VRR_TABLE).select('id, project_name, inputs_data, updated_at').eq('id', projectId).limit(1);
  if (error) throw new Error(`Could not read the Voidage Replacement Monitor project: ${error.message}`);
  if (!data || !data.length) return null;
  return buildVrrContract(rowArgs(data[0]));
}

/** The `vrr-1` contract of a row already read (Material Balance lists the rows itself). */
export const vrrContractOfRow = (row) => buildVrrContract(rowArgs(row || {}));
