// Reading the relative permeability and capillary pressure of a saved SCAL
// Studio project by id (SCAL-U1, RL11; the kr-1 contract,
// src/lib/inputProvenance/krContract.js). The block is stored with the
// saved project (payload key `kr`), so a consumer opened with
// `?scalProject=<id>` can read it again after a page refresh or on a fresh
// visit, when the router state of the handoff is gone. RLS and the record
// sharing rules (saved_scal_projects is under them since migration
// 20261002130000) decide who can read the row. Mirrors src/lib/pvtSource.js.
//
// Consumers: Waterflood Design Studio (oil-water set, this round). The four
// apps that read a SCAL project for its saturation-height function
// (Petrophysics, Earth Modeling, Rock Physics, ReservoirCalc Pro) read the
// same row through shmFromScalProject and take the source words from the
// block when it is there.
import { supabase } from '@/lib/customSupabaseClient';
import { krContractOf, validateKrContract, KR_PROJECT_PARAM } from '@/lib/inputProvenance/krContract';

export const SCAL_PROJECTS_TABLE = 'saved_scal_projects';
export { KR_PROJECT_PARAM };

/**
 * @param {string} projectId
 * @returns {Promise<{ok: boolean, contract: ?object, projectName: ?string, updatedAt: ?string, reason: ?string}>}
 */
export async function readScalProjectKr(projectId) {
  const none = (reason, extra = {}) => ({ ok: false, contract: null, projectName: null, updatedAt: null, reason, ...extra });
  if (!projectId) return none('No SCAL Studio project was named.');
  let data;
  try {
    const res = await supabase.from(SCAL_PROJECTS_TABLE).select('*').eq('id', projectId).maybeSingle();
    if (res.error) return none(`The SCAL Studio project could not be read: ${res.error.message}`);
    data = res.data;
  } catch (e) {
    return none(`The SCAL Studio project could not be read: ${e?.message || e}`);
  }
  if (!data) return none('The SCAL Studio project was not found, or it is not yours to read.');
  const projectName = data.project_name || data.inputs_data?.name || null;
  const contract = krContractOf(data.inputs_data);
  if (!contract) {
    return none('This SCAL Studio project was saved before it carried its kr-1 block. Open it in SCAL Studio and save it once.', { projectName, updatedAt: data.updated_at || null });
  }
  const check = validateKrContract(contract);
  if (!check.ok) return none(`The kr-1 block of the project is incomplete: ${check.errors.join(' ')}`, { projectName, updatedAt: data.updated_at || null });
  return { ok: true, contract, projectName, updatedAt: data.updated_at || null, reason: null };
}
