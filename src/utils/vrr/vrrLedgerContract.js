// Voidage Replacement Monitor as a sender: the `vrr-ledger-1` contract
// (WF-U2-004, RL11). The per-well ledger of a saved VRR project, read by id
// by the receiver (Waterflood Design Studio's Surveillance tab), nothing
// typed again, with a fingerprint for "source changed since". The pattern
// is `dca-forecast-1` and Material Balance's read of VRR pressure surveys
// (src/pages/apps/reservoir-balance/lib/vrrPressureIntake.js).
//
// Before this, the same injection and production history was typed or
// imported twice: once into VRR Monitor's ledger, once into Waterflood's
// surveillance door.
//
// The saved source: `saved_vrr_projects.inputs_data.inputs` (schema 1,
// oilfield storage): mode 'imported' with wellRows
// { date: 'YYYY-MM-DD' | 'YYYY-MM', well, oil_stb, water_stb, gas_mscf, winj_stb, ginj_mscf },
// volumes per row. VRR aggregates them by calendar month (vrrLedger.js
// buildFieldPeriods); the contract carries the same months per well.
//
//   schema, app, table          'vrr-ledger-1', 'Voidage Replacement Monitor', 'saved_vrr_projects'
//   projectId, projectName, projectSavedAt
//   units                       { volume: 'STB (oil, water), bbl (water injected), Mscf (gas)', period: 'calendar month' }
//   wells                       { injectors: [], producers: [] } as VRR classifies them
//   months                      ['YYYY-MM', ...] in order
//   volumes                     [{ month, well, oil_stb, water_stb, gas_mscf, winj_stb, ginj_mscf }] per well per month
//   totals                      field sums of the five volumes
//   fvf                         the FVF set of the VRR project (Bo, Bw, Bg, Rs) as stored, for comparison
//   pressureSurveys             count of dated surveys (Material Balance reads them; not carried here)
//   fingerprint
import { fingerprint } from '@/utils/declineCurve/dcaModel';
import { monthKeyOf, classifyLedgerWells } from '@/utils/vrrCalculations';

export const VRR_LEDGER_SCHEMA = 'vrr-ledger-1';
export const VRR_APP = 'Voidage Replacement Monitor';
export const VRR_TABLE = 'saved_vrr_projects';

const KEYS = ['oil_stb', 'water_stb', 'gas_mscf', 'winj_stb', 'ginj_mscf'];
const n = (v) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
};

/** FNV-1a over what the ledger says (never over who sent it or when). */
export function vrrLedgerFingerprint(c) {
  return fingerprint({ projectId: c.projectId, wells: c.wells, months: c.months, volumes: c.volumes, fvf: c.fvf });
}

/**
 * The contract of a saved VRR project's ledger.
 * @returns {{ok: true, contract: object}|{ok: false, reason: string}}
 */
export function buildVrrLedgerContract({ projectId, projectName = null, projectSavedAt = null, payload }) {
  const inputs = payload?.inputs && typeof payload.inputs === 'object' ? payload.inputs : payload;
  if (!inputs || typeof inputs !== 'object') return { ok: false, reason: 'The project has no saved inputs.' };
  if (inputs.mode !== 'imported' || !Array.isArray(inputs.wellRows) || !inputs.wellRows.length) {
    return { ok: false, reason: 'The project holds a field period grid, not a per-well ledger: Waterflood surveillance needs wells and dates. Import the ledger CSV in VRR Monitor first.' };
  }
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
  const volumes = [...by.values()].sort((a, b) => (a.month === b.month ? a.well.localeCompare(b.well) : a.month < b.month ? -1 : 1));
  if (!volumes.length) return { ok: false, reason: 'The ledger has no row with a date and a well.' };
  const { injectors, producers } = classifyLedgerWells(inputs.wellRows);
  const totals = Object.fromEntries(KEYS.map((k) => [k, volumes.reduce((s, v) => s + v[k], 0)]));
  const contract = {
    schema: VRR_LEDGER_SCHEMA,
    app: VRR_APP,
    table: VRR_TABLE,
    projectId,
    projectName,
    projectSavedAt,
    units: { volume: 'STB (oil, water produced), bbl (water injected), Mscf (gas)', period: 'calendar month', note: 'Volumes as stored by VRR Monitor (oilfield), summed by calendar month per well as VRR Monitor does.' },
    wells: { injectors: [...injectors].sort(), producers: [...producers].sort() },
    months: [...new Set(volumes.map((v) => v.month))],
    volumes,
    totals,
    fvf: { ...(inputs.fvf || {}) },
    pressureSurveys: Array.isArray(inputs.pressureSurveys) ? inputs.pressureSurveys.length : 0,
  };
  contract.fingerprint = vrrLedgerFingerprint(contract);
  return { ok: true, contract };
}

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
