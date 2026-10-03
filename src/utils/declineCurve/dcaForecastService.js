// Reads Decline Curve Analysis projects and publishes each forecast as the
// `dca-forecast-1` contract (./dcaForecastContract.js). The receivers
// (Forecast Scenario Hub, Petroleum Economics Studio) call these with their
// Supabase client; the reads are plain selects on the rows the signed-in user
// may read (their own, and those shared with their organisation under the
// record sharing rules), so no policy changes.
import { buildDcaForecastContract } from './dcaForecastContract';
import { migrateDcaPayload, analysisOf, STREAMS } from './dcaModel';

const TABLE = 'saved_dca_projects';

function contractsOf(row, build) {
  const payload = migrateDcaPayload(row.inputs_data || {});
  const out = [];
  for (const [wellId, well] of Object.entries(payload.wells || {})) {
    const a = analysisOf(well);
    for (const stream of STREAMS) {
      if (!a.streams[stream].fitResults && !a.streams[stream].forecastResults) continue;
      const sent = buildDcaForecastContract({
        projectId: row.id, projectName: row.project_name ?? payload.name ?? null, projectSavedAt: row.updated_at ?? null,
        payload, wellId, stream, build,
      });
      out.push({ projectId: row.id, projectName: row.project_name ?? null, wellId, wellName: well.name ?? null, stream, ...sent });
    }
  }
  return out;
}

/**
 * Every forecast in every DCA project the user may read, newest project
 * first, each a contract or a refusal with its reason.
 */
export async function listDcaForecasts(supabase, { limit = 50, build = null } = {}) {
  const { data, error } = await supabase.from(TABLE).select('id, project_name, inputs_data, updated_at').order('updated_at', { ascending: false }).limit(limit);
  if (error) throw new Error(`Could not read your Decline Curve Analysis projects: ${error.message}`);
  return (data || []).flatMap((row) => contractsOf(row, build));
}

/**
 * One forecast by project, well and stream: the contract or a refusal, or
 * null when the project is gone (or no longer readable).
 */
export async function getDcaForecast(supabase, { projectId, wellId, stream }, { build = null } = {}) {
  const { data, error } = await supabase.from(TABLE).select('id, project_name, inputs_data, updated_at').eq('id', projectId).limit(1);
  if (error) throw new Error(`Could not read the Decline Curve Analysis project: ${error.message}`);
  if (!data || !data.length) return null;
  const row = data[0];
  const payload = migrateDcaPayload(row.inputs_data || {});
  if (!payload.wells?.[wellId]) return null;
  return buildDcaForecastContract({
    projectId: row.id, projectName: row.project_name ?? payload.name ?? null, projectSavedAt: row.updated_at ?? null, payload, wellId, stream, build,
  });
}
