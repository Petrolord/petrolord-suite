// Reads Well Spacing Optimizer projects and publishes each one's chosen case
// as the `ws-case-1` contract (./wsCaseContract.js; WS-U2-004). The
// receivers (Forecast Scenario Hub, Petroleum Economics Studio) call these
// with their Supabase client; the reads are plain selects on the rows the
// signed-in user may read (their own, and those shared with them under the
// record sharing rules), so no policy changes.
//
// Until the saved_well_spacing_projects migration is applied, the table does
// not exist: the list says so in words and holds no row.
import { buildWsCaseContract, WS_TABLE } from './wsCaseContract';

export const WS_NOT_SWITCHED_ON = 'Saving is not switched on yet for the Well Spacing Optimizer on this database, so there is no saved case to read.';
const missing = (error) => error?.code === '42P01' || error?.code === 'PGRST205'
  || /relation[^\n]*saved_well_spacing_projects[^\n]*does not exist|Could not find the table[^\n]*saved_well_spacing_projects/i.test(error?.message || '');

const contractOf = (row, build) => buildWsCaseContract({
  projectId: row.id, projectName: row.project_name ?? row.inputs_data?.name ?? null, projectSavedAt: row.updated_at ?? null, payload: row.inputs_data, build,
});

/** Every project the user may read, newest first, each a contract or a refusal with its reason. */
export async function listWsCases(supabase, { limit = 50, build = null } = {}) {
  const { data, error } = await supabase.from(WS_TABLE).select('id, project_name, inputs_data, updated_at').order('updated_at', { ascending: false }).limit(limit);
  if (error) throw new Error(missing(error) ? WS_NOT_SWITCHED_ON : `Could not read your Well Spacing Optimizer projects: ${error.message}`);
  return (data || []).map((row) => ({ projectId: row.id, projectName: row.project_name ?? null, ...contractOf(row, build) }));
}

/** One project's case by id: the contract or a refusal, or null when the project is gone (or no longer readable). */
export async function getWsCase(supabase, { projectId }, { build = null } = {}) {
  const { data, error } = await supabase.from(WS_TABLE).select('id, project_name, inputs_data, updated_at').eq('id', projectId).limit(1);
  if (error) throw new Error(missing(error) ? WS_NOT_SWITCHED_ON : `Could not read the Well Spacing Optimizer project: ${error.message}`);
  if (!data || !data.length) return null;
  return contractOf(data[0], build);
}
