// Reading the PVT of a saved Fluid Systems Studio project by id (Reservoir
// round, plan Step 0c; FLUID-U1). The pvt-1 block is stored with the saved
// project (payload key `pvt`), so a consumer that was opened with
// `?fluidProject=<id>` can read it again after a page refresh, when the
// router state of the handoff is gone. Owner-scoped RLS decides who can
// read the row; record sharing extends that when the Reservoir sharing
// migration is applied.
//
// Consumers today: Well Test Analysis Studio. Material Balance, Simulation,
// VRR Monitor, Waterflood Design, Nodal Analysis and Line Sizing adopt it in
// their own rounds (docs/upgrade/FluidSystemsStudio-UPGRADE.md, "The pvt-1
// contract").
import { supabase } from '@/lib/customSupabaseClient';
import { pvtContractOf, validatePvtContract, PVT_PROJECT_PARAM } from '@/lib/inputProvenance/pvtContract';

export const FLUID_PROJECTS_TABLE = 'saved_fluid_studio_projects';
export { PVT_PROJECT_PARAM };

/**
 * @param {string} projectId
 * @returns {Promise<{ok: boolean, contract: ?object, projectName: ?string, updatedAt: ?string, reason: ?string}>}
 */
export async function readFluidProjectPvt(projectId) {
  const none = (reason, extra = {}) => ({ ok: false, contract: null, projectName: null, updatedAt: null, reason, ...extra });
  if (!projectId) return none('No Fluid Systems Studio project was named.');
  let data;
  try {
    const res = await supabase.from(FLUID_PROJECTS_TABLE).select('*').eq('id', projectId).maybeSingle();
    if (res.error) return none(`The Fluid Systems Studio project could not be read: ${res.error.message}`);
    data = res.data;
  } catch (e) {
    return none(`The Fluid Systems Studio project could not be read: ${e?.message || e}`);
  }
  if (!data) return none('The Fluid Systems Studio project was not found, or it is not yours to read.');
  const projectName = data.project_name || data.inputs_data?.name || null;
  const contract = pvtContractOf(data.inputs_data);
  if (!contract) {
    return none('This Fluid Systems Studio project was saved before it carried its PVT block. Open it in Fluid Systems Studio and save it once.', { projectName, updatedAt: data.updated_at || null });
  }
  const check = validatePvtContract(contract);
  if (!check.ok) return none(`The PVT block of the project is incomplete: ${check.errors.join(' ')}`, { projectName, updatedAt: data.updated_at || null });
  return { ok: true, contract, projectName, updatedAt: data.updated_at || null, reason: null };
}

/**
 * A saved block as the handoff a consumer already knows how to read: the
 * version-1 backbone keys rebuilt from the block, with the block beside
 * them. Lets a consumer use one intake for router state and for a read by id.
 */
export function handoffFromContract(contract) {
  const b = pvtContractOf(contract);
  if (!b) return null;
  const corr = (key) => (b.methods?.[key]?.kind === 'correlation' ? b.methods[key].method : null);
  return {
    source: b.model,
    correlations: b.model === 'black-oil-correlations' ? { pb_rs_bo: corr('bo'), viscosity: corr('mu_o') } : undefined,
    oil_gravity: b.inputs?.oil_gravity ?? null,
    gas_gravity: b.inputs?.gas_gravity ?? null,
    gor: b.inputs?.rsb ?? null,
    inlet_temperature: b.inputs?.temperature ?? null,
    wat: null,
    pb: b.at_saturation?.pressure ?? null,
    rsb: b.inputs?.rsb ?? null,
    bo_at_pb: b.at_saturation?.Bo ?? null,
    mu_o_at_pb: b.at_saturation?.mu_o ?? null,
    pvt_table: b.table,
    contract: b,
  };
}
