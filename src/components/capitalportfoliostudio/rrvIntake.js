// Capital Portfolio Studio's intake of a Risked Reserves valuation (Risked
// Reserves Valuation U2-009, 2026-10-03). The sender is
// riskedreserves/services/rrvPortfolioCandidate.js (`rrv-portfolio-candidate-1`,
// read by the valuation's id). Pure; no schema change.
//
// Owner decisions, 2026-10-03 ("go with your defaults"):
//   1. npv_p50, the slot the optimizer reads, takes the SUCCESS-CASE MEAN
//      value of the valuation (after the exploration well). It is a mean,
//      never a P50, and every place the page shows it says so.
//   2. capex, the budget line, is the WELL COST (the spend the drilling
//      decision commits). The development cost is carried as information.
//   3. risk_score is left BLANK: the 1 to 10 score has no meaning for a
//      risked valuation, and no mapping from Pg is invented. The optimizer
//      never reads risk_score (src/utils/portfolioOptimizer.js), so a blank
//      changes nothing in any result; only the typed-project form asks for it.
//
// The slots, so the portfolio EMV is the valuation's EMV exactly:
//   capex      = well cost W
//   npv_p50    = success-case mean value after the well
//   pos        = Pg (the chance of success the success case is the mean of)
//   fail_cost  = W (a dry hole loses the well)
//   npv_p90, npv_p10, npv_stddev  = null: the valuation sends no spread of
//                the success case's value, so the portfolio risk summary
//                treats the success case at its mean (stated on the page)
//   risk_score = null
//   source_type 'rrv', source_ref = the valuation id
//   source_label = the received contract, as JSON: {rrv: 1, label,
//                contract, receivedAt, receivedBuild}. There is no other
//                column for it without a migration; readRrvLink reads it
//                back and the page shows `label`.

import { EMPTY_VALUE } from '@/lib/emptyValue';

export const RRV_SOURCE_TYPE = 'rrv';
export const RRV_SCHEMA = 'rrv-portfolio-candidate-1';

/** The words the page uses for the NPV slot of a Risked Reserves project. */
export const RRV_NPV_LABEL = 'Success-case mean value';
export const RRV_NPV_NOTE = 'a mean of the success case (a discovery), after the exploration well; it is neither a median nor a P50';
export const RRV_RISK_SCORE_TEXT = 'not provided by Risked Reserves Valuation';

/** The slots the intake fills, and the contract value each takes. */
export const RRV_SLOTS = Object.freeze([
  { field: 'capex', key: 'wellCostMM', label: 'CAPEX (well cost)' },
  { field: 'npv_p50', key: 'successMeanValueMM', label: RRV_NPV_LABEL },
  { field: 'pos', key: 'pg', label: 'Chance of success Pg' },
  { field: 'fail_cost', key: 'wellCostMM', label: 'Loss if it fails (the well)' },
]);

const WATCHED = [
  ['prospectName', 'prospect name'], ['successMeanValueMM', 'success-case mean value'], ['pg', 'Pg'], ['pc', 'Pc'],
  ['wellCostMM', 'well cost'], ['devCostMM', 'development cost'], ['emvMM', 'EMV'], ['riskedMeanMMboe', 'risked volume'],
  ['mefsMMboe', 'MEFS'], ['unitValuePerBoe', 'value per barrel'],
];

export const isRrvProject = (p) => p?.source_type === RRV_SOURCE_TYPE;

const labelOf = (c) => `${c.prospectName}, Risked Reserves Valuation`;

const encode = (c, { now, build }) => JSON.stringify({ rrv: 1, label: labelOf(c), contract: c, receivedAt: now.toISOString(), receivedBuild: build ?? null });

/**
 * What a Risked Reserves project received, read back from its row.
 * @returns {?{label: string, contract: object, receivedAt: ?string, receivedBuild: ?string}}
 */
export function readRrvLink(project) {
  if (!isRrvProject(project) || typeof project.source_label !== 'string') return null;
  try {
    const x = JSON.parse(project.source_label);
    if (!x || x.rrv !== 1 || !x.contract || x.contract.schema !== RRV_SCHEMA) return null;
    return { label: x.label || labelOf(x.contract), contract: x.contract, receivedAt: x.receivedAt ?? null, receivedBuild: x.receivedBuild ?? null };
  } catch { return null; }
}

/** The label to show for a project's source (plain text for every source). */
export function sourceLabelText(project) {
  if (isRrvProject(project)) return readRrvLink(project)?.label || 'Risked Reserves valuation';
  return project?.source_label || null;
}

/**
 * The project fields for a candidate.
 * @param {object} c an `rrv-portfolio-candidate-1` contract
 * @param {{now?: Date, build?: ?string}} [o]
 */
export function rrvIntakeProject(c, { now = new Date(), build = null } = {}) {
  return {
    name: c.prospectName,
    capex: c.wellCostMM,
    npv_p50: c.successMeanValueMM,
    npv_p90: null,
    npv_p10: null,
    npv_stddev: null,
    risk_score: null,
    pos: c.pg,
    fail_cost: c.wellCostMM,
    source_type: RRV_SOURCE_TYPE,
    source_ref: c.valuationId,
    source_label: encode(c, { now, build }),
  };
}

const differs = (a, b) => !(Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a) - Number(b)) <= 1e-9 * Math.max(1, Math.abs(Number(b))));

/** The slots typed over in the portfolio since the valuation was received: [{field, label, received, now}]. */
export function rrvEditedFields(project) {
  const link = readRrvLink(project);
  if (!link) return [];
  return RRV_SLOTS
    .filter((s) => differs(project[s.field], link.contract[s.key]))
    .map((s) => ({ field: s.field, label: s.label, received: link.contract[s.key], now: project[s.field] }));
}

/**
 * How a Risked Reserves project stands against its valuation as it is NOW
 * (read again by id after a page load, so the answer survives a refresh).
 *   none      not a Risked Reserves project, or its record is unreadable
 *   unknown   the valuation could not be read (`current` undefined)
 *   current   it says what it said when it was received
 *   changed   it says something else: `changes` lists what moved
 *   missing   it is gone, or no longer readable by this user
 *   refused   it is there but can no longer be valued (`reason`)
 * @param {object} project a portfolio_projects row
 * @param {?object|undefined} current what getRrvPortfolioCandidate returned
 */
export function rrvLinkState(project, current) {
  const link = readRrvLink(project);
  if (!link) return { state: 'none' };
  if (current === undefined) return { state: 'unknown' };
  if (current === null) return { state: 'missing' };
  if (!current.ok) return { state: 'refused', reason: current.reason };
  const held = link.contract;
  if (current.contract.fingerprint === held.fingerprint) return { state: 'current', contract: current.contract };
  const changes = WATCHED.filter(([k]) => current.contract[k] !== held[k]).map(([key, label]) => ({ key, label, from: held[key] ?? null, to: current.contract[key] ?? null }));
  return { state: 'changed', contract: current.contract, changes };
}

/**
 * Take the valuation as it is now. A slot typed over in the portfolio keeps
 * the typed value (and stays marked as edited); the rest follow.
 * @returns {object} the fields to update
 */
export function refreshRrvProject(project, c, { now = new Date(), build = null } = {}) {
  const edited = new Set(rrvEditedFields(project).map((e) => e.field));
  const fresh = rrvIntakeProject(c, { now, build });
  const out = { ...fresh };
  for (const f of edited) out[f] = project[f];
  // the name is the portfolio's own once typed
  const held = readRrvLink(project);
  if (project.name && held && project.name !== held.contract.prospectName) out.name = project.name;
  return out;
}

const num = (v, d = 1) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v).toFixed(d) : EMPTY_VALUE);
const pct = (v) => (Number.isFinite(Number(v)) && v !== null ? `${(Number(v) * 100).toFixed(1)}%` : EMPTY_VALUE);
const day = (iso) => (iso ? String(iso).slice(0, 16).replace('T', ' ') : EMPTY_VALUE);

/** One sentence for a link state (null when there is nothing to say). */
export function rrvStateSentence(s) {
  if (!s || s.state === 'none' || s.state === 'current') return null;
  if (s.state === 'unknown') return 'The valuation could not be read just now.';
  if (s.state === 'missing') return 'The valuation is gone from Risked Reserves Valuation, or is no longer shared with you. The values received are kept.';
  if (s.state === 'refused') return `The valuation can no longer be valued: ${s.reason}`;
  return `Source changed since: ${s.changes.length ? s.changes.map((x) => `${x.label} ${typeof x.from === 'number' ? num(x.from, 3) : x.from ?? EMPTY_VALUE} to ${typeof x.to === 'number' ? num(x.to, 3) : x.to ?? EMPTY_VALUE}`).join(', ') : 'its provenance moved'}.`;
}

/** The provenance rows a reviewer reads: [label, value]. */
export function rrvProvenanceRows(c, { receivedAt = null, receivedBuild = null } = {}) {
  const e = c.economics || {};
  const econ = e.valueBasis === 'epe' && e.epe
    ? `Petroleum Economics Studio run "${e.epe.runName}"${e.epe.caseName ? ` of case "${e.epe.caseName}"` : ''}${e.epe.priceDeckName ? `, price deck "${e.epe.priceDeckName}"` : ''}${e.epe.discountRatePct != null ? `, ${num(e.epe.discountRatePct, 1)}%${e.epe.pvBasis ? ` ${e.epe.pvBasis}` : ''}` : ''}, results ${day(e.epe.resultsAt)}`
    : e.valueBasis === 'model' ? 'the economic model of the valuation (canonical screening NPV)' : (e.valueBasisWord || 'entered in the valuation');
  return [
    ['Valuation', `"${c.prospectName}" (id ${c.valuationId})${c.sharedFromColleague ? ', a colleague\'s valuation shared with you: read-only provenance' : ''}`],
    [RRV_NPV_LABEL, `${num(c.successMeanValueMM, 2)} $MM: ${RRV_NPV_NOTE}`],
    ['Chance of success Pg', pct(c.pg)],
    ['Commercial chance Pc', `${pct(c.pc)} (Pg x chance of at least the MEFS, ${num(c.mefsMMboe, 1)} MMboe)`],
    ['EMV after the well', `${num(c.emvMM, 2)} $MM`],
    ['Risked volume', `${num(c.riskedMeanMMboe, 2)} MMboe (Pg x success-case mean ${num(c.successMeanMMboe, 2)} MMboe; gas at 6 Mscf per boe)`],
    ['Well cost (budget line)', `${num(c.wellCostMM, 2)} $MM`],
    ['Development cost (information)', `${num(c.devCostMM, 2)} $MM, spent only after a commercial discovery; left out of the budget line`],
    ['Value of a discovery from', `${econ}; MEFS ${e.mefsBasis === 'derived' ? 'derived' : 'typed'}`],
    ['Volumes and Pg from', c.volumes?.from === 'ReservoirCalc Pro' ? `ReservoirCalc Pro "${c.volumes.recordName}", saved ${day(c.volumes.recordUpdatedAt)}` : 'typed in Risked Reserves Valuation'],
    ['Valuation saved', day(c.valuationSavedAt)],
    ['Received', `${day(receivedAt)}${receivedBuild ? `, ${receivedBuild}` : ''}; sent by ${c.sentBuild || 'a build not stated'}`],
    ['Fingerprint', c.fingerprint],
  ];
}
