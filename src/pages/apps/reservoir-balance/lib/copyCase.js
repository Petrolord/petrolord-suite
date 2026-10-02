// "Save a copy" of a case a colleague shared (record sharing, view access):
// the reader's own case with the same conditions, production data, run
// settings and study record. Runs and results are the owner's and are not
// copied: the copy is run by its new owner, so its report carries their run.
//
// The writes go through lib/api.js (handed in, so the jest test drives it on
// a plain object). Nothing is written to the shared case.
import { SHARING_COLUMNS, copyName } from '@/lib/recordSharing/rules';
import { RUN_SNAPSHOT_KEY } from './studyMeta';

const CASE_SKIP = new Set(['id', 'user_id', 'org_id', 'created_at', 'updated_at', 'archived_at', 'production_data', 'change_note', ...SHARING_COLUMNS]);
const CONFIG_SKIP = new Set(['id', 'case_id', 'user_id', 'created_at', 'updated_at', 'is_scenario', 'name']);

/** The columns of the new case row. */
export function caseCopyInput(caseData, takenNames = []) {
  const out = {};
  for (const [k, v] of Object.entries(caseData || {})) if (!CASE_SKIP.has(k)) out[k] = v;
  out.name = copyName(caseData?.name, takenNames);
  return out;
}

/** The run settings of the new case: the default config without what belonged to a run. */
export function configCopyInput(defaultCfg) {
  if (!defaultCfg) return null;
  const out = {};
  for (const [k, v] of Object.entries(defaultCfg)) if (!CONFIG_SKIP.has(k)) out[k] = v;
  if (out.pvt_correlations && typeof out.pvt_correlations === 'object') {
    const { [RUN_SNAPSHOT_KEY]: _snapshot, ...rest } = out.pvt_correlations;
    out.pvt_correlations = rest;
  }
  return out;
}

/**
 * @param {{createCase: Function, replaceProductionData: Function, upsertCaseDefaultConfig: Function, deleteCase?: Function}} api
 * @param {object} caseData the open case, with production_data
 * @param {?object} defaultCfg its default run config
 * @param {string[]} [takenNames] names of the reader's own cases
 * @returns {Promise<{data: ?object, error: ?{message: string}}>} the new case row
 */
export async function copyCaseAsOwn(api, caseData, defaultCfg, takenNames = []) {
  if (!caseData?.id) return { data: null, error: { message: 'There is no open case to copy.' } };
  const { data: created, error: caseErr } = await api.createCase(caseCopyInput(caseData, takenNames));
  if (caseErr || !created) return { data: null, error: { message: `The copy could not be created: ${caseErr?.message ?? 'no row came back'}` } };
  const rows = (caseData.production_data ?? []).map((r) => ({ ...r }));
  const fail = async (what, err) => {
    // leave no half-made case behind
    if (api.deleteCase) await api.deleteCase(created.id).catch(() => null);
    return { data: null, error: { message: `The copy was not made: ${what} could not be written (${err?.message ?? 'unknown error'}).` } };
  };
  if (rows.length) {
    const { error } = await api.replaceProductionData(created.id, rows);
    if (error) return fail('its production data', error);
  }
  const cfg = configCopyInput(defaultCfg);
  if (cfg) {
    const { error } = await api.upsertCaseDefaultConfig(created.id, cfg);
    if (error) return fail('its run settings', error);
  }
  return { data: created, error: null };
}
