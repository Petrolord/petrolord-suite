// The volumetric estimate of a case, taken from a saved ReservoirCalc Pro
// project by id (MBAL-U2-007 of the backlog, Batch B: "the volumetric
// estimate on the case comes from a saved RCP project by id with its source
// printed, not typed").
//
// ReservoirCalc Pro saves a project in `saved_quickvol_projects` (project
// name, `inputs_data` with every reservoir of the project and its last
// deterministic results, `results_data` with the active reservoir's). The
// intake reads that row by id, offers each reservoir that has a result, and
// writes the chosen in-place volume to the case with a source sentence and a
// handoff record (study.handoffs.volumetric), so an edit after the handoff is
// said in the report.
//
// Units: ReservoirCalc Pro holds STB and scf on a field project and sm3 on a
// metric one; the case holds STB and scf.
import { STB_TO_M3, SCF_TO_M3 } from '@/lib/mbalCaseSource';

export const RCP_APP = 'ReservoirCalc Pro';
export const RCP_TABLE = 'saved_quickvol_projects';
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

const METHOD_WORDS = {
  simple: 'simple method (area x thickness)',
  hybrid: 'hybrid method (top surface and thickness)',
  surfaces: 'surfaces method (top and base)',
  areadepth: 'area/depth table',
};

/**
 * The reservoirs of a saved project that carry a deterministic result, with
 * the in-place volumes in STB and scf.
 * @param {object} row a saved_quickvol_projects row
 * @returns {Array<{key: string, reservoir: string, fluid: string, unitSystem: string,
 *   stooip_stb: ?number, giip_scf: ?number, method: string}>}
 */
export function volumetricOptions(row) {
  if (!row) return [];
  const blob = row.inputs_data ?? {};
  const out = [];
  const add = (key, name, results, unitSystem, inputMethod) => {
    if (!results) return;
    const us = results.unitSystem || unitSystem || 'field';
    const metric = us === 'metric';
    const oil = finite(results.stooip) && results.stooip > 0 ? (metric ? results.stooip / STB_TO_M3 : results.stooip) : null;
    const gas = finite(results.giip) && results.giip > 0 ? (metric ? results.giip / SCF_TO_M3 : results.giip) : null;
    if (oil == null && gas == null) return;
    out.push({
      key, reservoir: name || 'Reservoir', fluid: results.fluidType || 'oil', unitSystem: us,
      stooip_stb: oil, giip_scf: gas,
      method: `deterministic, ${METHOD_WORDS[inputMethod] || inputMethod || 'method not recorded'}`,
    });
  };
  if (Array.isArray(blob.reservoirs) && blob.reservoirs.length) {
    for (const r of blob.reservoirs) {
      // the active reservoir's latest result is the row's results_data
      const results = r.results || (r.id === blob.activeReservoirId ? row.results_data : null);
      add(r.id, r.name, results, r.unitSystem, r.inputMethod);
    }
  } else {
    add('main', blob.reservoirName, row.results_data, blob.unitSystem, blob.inputMethod);
  }
  return out;
}

/**
 * What the case is written with when the analyst takes one option.
 * @returns {{patch: object, handoff: object}|{error: string}}
 */
export function intakeVolumetric(row, option, { isGas, now = new Date().toISOString() }) {
  const value = isGas ? option?.giip_scf : option?.stooip_stb;
  if (!finite(value) || value <= 0) {
    return { error: `The reservoir "${option?.reservoir ?? '?'}" of this project has no ${isGas ? 'gas' : 'oil'} in place to take.` };
  }
  const saved = String(row.updated_at || row.created_at || '').slice(0, 10) || 'date not recorded';
  const text = `${RCP_APP} project "${row.project_name}", reservoir "${option.reservoir}", ${option.method}, project saved ${saved}${option.unitSystem === 'metric' ? ', converted from sm3' : ''}`;
  return {
    patch: {
      volumetric_ooip_stb: isGas ? null : value,
      volumetric_ogip_scf: isGas ? value : null,
      volumetric_estimate_source: text,
    },
    handoff: { app: RCP_APP, record: `${row.project_name} (${row.id}), ${option.reservoir}`, value, at: now, text: `Taken from ${text}` },
  };
}

/**
 * The basis the report prints for the volumetric row: the source, and whether
 * the value on the case is still the one handed over.
 */
export function volumetricBasis(caseData, study) {
  const isGas = caseData?.fluid_system === 'gas';
  const value = Number(isGas ? caseData?.volumetric_ogip_scf : caseData?.volumetric_ooip_stb);
  const h = study?.handoffs?.volumetric;
  if (h?.app) {
    const same = finite(h.value) && Number.isFinite(value) && Math.abs(h.value - value) <= 1e-6 * Math.max(1, Math.abs(h.value));
    return same
      ? `${h.text} (${String(h.at).slice(0, 10)})`
      : `Edited in this app after the handoff. The handoff said: ${h.text} (${String(h.at).slice(0, 10)})`;
  }
  return caseData?.volumetric_estimate_source ? `Entered on the case: ${caseData.volumetric_estimate_source}` : 'Entered on the case, source not stated';
}

/** The saved projects the user can read (own and shared), newest first. */
export async function listRcpProjects(supabase) {
  const { data, error } = await supabase.from(RCP_TABLE).select('*').order('updated_at', { ascending: false });
  return { data: data ?? [], error };
}

/** One saved project by id. */
export async function readRcpProject(supabase, id) {
  const { data, error } = await supabase.from(RCP_TABLE).select('*').eq('id', id).maybeSingle();
  return { data: data ?? null, error };
}
