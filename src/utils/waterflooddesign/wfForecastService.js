// Reads Waterflood Design Studio projects and publishes each pattern forecast
// as the `wf-forecast-1` contract (./wfForecastContract.js). The receivers
// (Forecast Scenario Hub, Petroleum Economics Studio) call these with their
// Supabase client; the reads are plain selects on the rows the signed-in user
// may read (their own, and those shared with them under the record sharing
// rules), so no policy changes.
import { buildDisplacementSpec, buildPatternInputs, buildSurveillanceConfig } from '@/contexts/WaterfloodDesignContext';
import { buildWfForecastContract, WF_TABLE } from './wfForecastContract';

export const WF_BUILDERS = Object.freeze({ buildDisplacementSpec, buildPatternInputs, buildSurveillanceConfig });

const contractOf = (row, build) => buildWfForecastContract({
  projectId: row.id, projectName: row.project_name ?? row.inputs_data?.name ?? null, projectSavedAt: row.updated_at ?? null, payload: row.inputs_data, build,
}, WF_BUILDERS);

/** Every project the user may read, newest first, each a contract or a refusal with its reason. */
export async function listWfForecasts(supabase, { limit = 50, build = null } = {}) {
  const { data, error } = await supabase.from(WF_TABLE).select('id, project_name, inputs_data, updated_at').order('updated_at', { ascending: false }).limit(limit);
  if (error) throw new Error(`Could not read your Waterflood Design Studio projects: ${error.message}`);
  return (data || []).map((row) => ({ projectId: row.id, projectName: row.project_name ?? null, ...contractOf(row, build) }));
}

/** One project's forecast by id: the contract or a refusal, or null when the project is gone (or no longer readable). */
export async function getWfForecast(supabase, { projectId }, { build = null } = {}) {
  const { data, error } = await supabase.from(WF_TABLE).select('id, project_name, inputs_data, updated_at').eq('id', projectId).limit(1);
  if (error) throw new Error(`Could not read the Waterflood Design Studio project: ${error.message}`);
  if (!data || !data.length) return null;
  return contractOf(data[0], build);
}
