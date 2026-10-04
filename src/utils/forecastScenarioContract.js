// Forecast Scenario Hub as a sender: the `fsh-case-1` contract (DCA U2-013,
// HUB-U1-010, RL11). Petroleum Economics Studio imported a hub case by
// recomputing it and kept nothing of where it came from: the production file
// said "FSH - Base.generated" and no more. The case's source, and the Decline
// Curve Analysis forecast behind a received case, stopped at the hub.
//
// The contract is read by id from the saved scenario set (nothing typed
// again), carries the case parameters with their bases, the results the hub
// shows, the annual profile EPE takes, the case's own source (the
// `dca-forecast-1` contract it was made from, if any, with the fields edited
// after that handoff) and a fingerprint for "source changed since".
//
//   schema, app, table          'fsh-case-1', 'Forecast Scenario Hub', 'saved_scenario_hub_projects'
//   projectId, projectName, projectSavedAt, caseId, caseName
//   parameters                  qi (bbl/d), declineAnnualPct and declineBasis as typed, diNominalPctPerYear,
//                               b, years, economicLimit (bbl/d), startDate, terminalDeclinePct and its basis
//   units                       rate bbl/d, volume bbl, a forecast year of 365.25 days
//   results                     eur, eurCapped, cumHorizon, timeToLimitYears, annual [bbl per forecast year]
//   upstream                    null (entered in the hub), or { contract: dca-forecast-1, receivedAt,
//                               editedAfterHandoff: [field names] }
//   sentBuild, fingerprint
import { compareCases, caseDeclineBasis, DAYS_PER_YEAR } from '@/utils/forecastScenarioCalculations';
import { editedAfterHandoff } from '@/utils/forecastScenarioIntake';
import { dcaSourceLine } from '@/utils/declineCurve/dcaForecastContract';
import { fingerprint } from '@/utils/declineCurve/dcaModel';
import { HUB_DEFAULT_START } from '@/utils/forecastScenarioExport';

export const HUB_CASE_SCHEMA = 'fsh-case-1';
export const HUB_APP = 'Forecast Scenario Hub';
export const HUB_TABLE_NAME = 'saved_scenario_hub_projects';

/** FNV-1a over what the case says (never over who sent it or when). */
export function hubCaseFingerprint(c) {
  return fingerprint({
    projectId: c.projectId, caseId: c.caseId, parameters: c.parameters, results: c.results,
    upstream: c.upstream ? { fingerprint: c.upstream.contract?.fingerprint ?? null, edited: c.upstream.editedAfterHandoff } : null,
  });
}

/**
 * The contract for one case of a saved scenario set.
 * @param {{projectId: string, projectName?: string, projectSavedAt?: string, payload: object,
 *   caseId?: string, caseIndex?: number, build?: string}} a
 * @returns {{ok: true, contract: object}|{ok: false, reason: string}}
 */
export function buildHubCaseContract({ projectId, projectName = null, projectSavedAt = null, payload, caseId = null, caseIndex = null, build = null }) {
  const cases = payload?.cases || [];
  const idx = caseId != null ? cases.findIndex((c) => c.id === caseId) : caseIndex;
  const c = Number.isInteger(idx) && idx >= 0 ? cases[idx] : null;
  if (!c) return { ok: false, reason: 'The case is no longer in the saved scenario set.' };
  const start = payload?.startDate || HUB_DEFAULT_START;
  const { cases: runs, summaries } = compareCases([c], payload?.econ || null, `${start}T00:00:00Z`);
  const s = summaries[0];
  if (!s || s.error) return { ok: false, reason: s?.error || 'The case could not be run.' };
  const run = runs[0];
  const k = c.source?.contract || null;
  const contract = {
    schema: HUB_CASE_SCHEMA,
    app: HUB_APP,
    table: HUB_TABLE_NAME,
    projectId,
    projectName,
    projectSavedAt,
    caseId: c.id ?? `#${idx}`,
    caseName: c.name || `Case ${idx + 1}`,
    parameters: {
      qi: c.qi,
      declineAnnualPct: c.declineAnnualPct,
      declineBasis: caseDeclineBasis(c),
      diNominalPctPerYear: s.diNominalPctPerYear,
      b: c.b,
      years: c.years,
      economicLimit: c.economicLimit > 0 ? c.economicLimit : null,
      startDate: run.startDate,
      terminalDeclinePct: c.terminalDeclinePct > 0 ? c.terminalDeclinePct : null,
      terminalDeclineBasis: c.terminalDeclinePct > 0 ? (c.terminalDeclineBasis || 'effective-tangent') : null,
    },
    units: { rate: 'bbl/d', volume: 'bbl', time: `forecast year of ${DAYS_PER_YEAR} days from the case start`, note: 'Oil at stock-tank conditions; calendar-day rates.' },
    results: {
      model: s.model,
      eur: run.eur,
      eurCapped: !!run.eurCapped,
      cumHorizon: run.cumHorizon,
      timeToLimitYears: run.timeToLimitYears,
      annual: s.annual.map((v) => v),
    },
    upstream: k ? { contract: k, receivedAt: c.source.receivedAt || null, editedAfterHandoff: editedAfterHandoff(c) } : null,
    sentBuild: build,
  };
  contract.fingerprint = hubCaseFingerprint(contract);
  return { ok: true, contract };
}

/** Read a case of a saved set by id and build its contract; null when the set cannot be read. */
export async function getHubCase(supabase, { projectId, caseId }, { build = null } = {}) {
  const { data: rows, error } = await supabase.from(HUB_TABLE_NAME).select('id, project_name, inputs_data, updated_at').eq('id', projectId).limit(1);
  if (error) throw new Error(error.message);
  const data = rows?.[0];
  if (!data) return null;
  return buildHubCaseContract({ projectId: data.id, projectName: data.project_name, projectSavedAt: data.updated_at, payload: data.inputs_data, caseId, build });
}

/** "Base (Forecast Scenario Hub set "Obodo cases"), from DCA Obodo-7 ...": one line. */
export function hubSourceLine(c) {
  if (!c) return 'none';
  const up = c.upstream?.contract ? `; the case came from ${dcaSourceLine(c.upstream.contract)}${c.upstream.editedAfterHandoff?.length ? `, edited in the hub after that handoff (${c.upstream.editedAfterHandoff.join(', ')})` : ''}` : '; entered in the hub';
  return `case "${c.caseName}" of the scenario set "${c.projectName || 'unnamed'}" (Forecast Scenario Hub)${up}`;
}

/**
 * Compare a received case with the one its source would send now.
 * @returns {{state: 'unchanged'|'changed'|'missing'|'refused', text: string, now?: object}}
 */
export function compareHubWithSource(received, now) {
  if (!now) return { state: 'missing', text: 'The source scenario set is no longer there (deleted, or no longer shared with you).' };
  if (!now.ok) return { state: 'refused', text: `The source cannot send this case now: ${now.reason}` };
  if (now.contract.fingerprint === received.fingerprint) return { state: 'unchanged', text: 'Unchanged since it was received.' };
  const moved = [];
  if (fingerprint(now.contract.parameters) !== fingerprint(received.parameters)) moved.push('the case parameters');
  if (now.contract.results.eur !== received.results.eur || fingerprint(now.contract.results.annual) !== fingerprint(received.results.annual)) moved.push('the volumes');
  if ((now.contract.upstream?.contract?.fingerprint ?? null) !== (received.upstream?.contract?.fingerprint ?? null)) moved.push('the Decline Curve Analysis forecast behind it');
  return { state: 'changed', text: `The source changed since it was received${moved.length ? ` (${moved.join(', ')})` : ''}. Import it again to take the new profile.`, now: now.contract };
}
