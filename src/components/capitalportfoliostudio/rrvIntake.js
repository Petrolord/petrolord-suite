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
//   npv_p90, npv_p10 = the value, after the well, of the success-case P90
//                (low) and P10 (high) SIZES on the valuation's own value
//                line (the sender's rrvMath.valueOfSize): values of two
//                sizes, labelled so; percentiles of value would differ. Both
//                columns are NOT NULL in the live schema. The optimizer reads
//                its spread from them (the (P10 - P90) / 2.5631 normal
//                equivalent) as for any typed project.
//   npv_stddev = null
//   risk_score = null
//   source_type 'rrv', source_ref = the valuation id (a uuid column)
//   source_label = a short human label the page shows as the link:
//                "Risked Reserves: <prospect>, saved <date> (version <fp>)",
//                the version being the contract's fingerprint. Nothing else
//                is stored: the contract itself is read again by id
//                (getRrvPortfolioCandidate) wherever it is shown. With the
//                fingerprint, "source changed since" needs no stored copy;
//                "edited after intake" compares the slots with the contract
//                when it still has the received version, and is unknown
//                once the valuation has changed (the page says so).

import { EMPTY_VALUE } from '@/lib/emptyValue';

export const RRV_SOURCE_TYPE = 'rrv';
export const RRV_SCHEMA = 'rrv-portfolio-candidate-1';

/** The words the page uses for the NPV slot of a Risked Reserves project. */
export const RRV_NPV_LABEL = 'Success-case mean value';
export const RRV_NPV_NOTE = 'a mean of the success case (a discovery), after the exploration well; it is neither a median nor a P50';
export const RRV_RISK_SCORE_TEXT = 'not provided by Risked Reserves Valuation';
export const RRV_P90_LABEL = 'Value of the success-case P90 size';
export const RRV_P10_LABEL = 'Value of the success-case P10 size';
export const RRV_SIZE_NOTE = 'the value after the well of a discovery of that size on the valuation\'s value line (a size below the MEFS is not developed and loses the well); values of two sizes, so percentiles of value would differ';

/** The slots the intake fills, and the contract value each takes. */
export const RRV_SLOTS = Object.freeze([
  { field: 'capex', key: 'wellCostMM', label: 'CAPEX (well cost)' },
  { field: 'npv_p50', key: 'successMeanValueMM', label: RRV_NPV_LABEL },
  { field: 'npv_p90', key: 'p90SizeValueMM', label: RRV_P90_LABEL },
  { field: 'npv_p10', key: 'p10SizeValueMM', label: RRV_P10_LABEL },
  { field: 'pos', key: 'pg', label: 'Chance of success Pg' },
  { field: 'fail_cost', key: 'wellCostMM', label: 'Loss if it fails (the well)' },
]);

export const isRrvProject = (p) => p?.source_type === RRV_SOURCE_TYPE;

const day = (iso) => (iso ? String(iso).slice(0, 16).replace('T', ' ') : EMPTY_VALUE);

/** The link label: plain words and the version, never the contract. */
export const rrvLabel = (c) => `Risked Reserves: ${c.prospectName}, saved ${day(c.valuationSavedAt)} UTC (version ${c.fingerprint})`;

/**
 * What a Risked Reserves project holds of its source: the valuation id and
 * the version (fingerprint) it was received at.
 * @returns {?{valuationId: string, fingerprint: ?string, label: string}}
 */
export function readRrvLink(project) {
  if (!isRrvProject(project) || !project.source_ref) return null;
  const label = typeof project.source_label === 'string' ? project.source_label : '';
  const m = /\(version ([0-9a-f]{8})\)\s*$/.exec(label);
  return { valuationId: project.source_ref, fingerprint: m ? m[1] : null, label: label || 'Risked Reserves valuation' };
}

/**
 * The project fields for a candidate.
 * @param {object} c an `rrv-portfolio-candidate-1` contract
 */
export function rrvIntakeProject(c) {
  return {
    name: c.prospectName,
    capex: c.wellCostMM,
    npv_p50: c.successMeanValueMM,
    npv_p90: c.p90SizeValueMM,
    npv_p10: c.p10SizeValueMM,
    npv_stddev: null,
    risk_score: null,
    pos: c.pg,
    fail_cost: c.wellCostMM,
    source_type: RRV_SOURCE_TYPE,
    source_ref: c.valuationId,
    source_label: rrvLabel(c),
  };
}

const differs = (a, b) => !(Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a) - Number(b)) <= 1e-9 * Math.max(1, Math.abs(Number(b))));

/**
 * The slots typed over since intake: [{field, label, received, now}], or
 * null when it cannot be told (no contract, or the valuation has changed
 * since, so the received values are no longer readable).
 * @param {object} project a portfolio_projects row (or the form's values)
 * @param {?object} contract the valuation as read now by id
 */
export function rrvEditedFields(project, contract) {
  const link = readRrvLink(project);
  if (!link || !contract || !link.fingerprint || contract.fingerprint !== link.fingerprint) return null;
  return RRV_SLOTS
    .filter((sl) => differs(project[sl.field], contract[sl.key]))
    .map((sl) => ({ field: sl.field, label: sl.label, received: contract[sl.key], now: project[sl.field] }));
}

/**
 * How a Risked Reserves project stands against its valuation as it is NOW
 * (read again by id after a page load, so the answer survives a refresh).
 *   none      not a Risked Reserves project
 *   unknown   the valuation could not be read (`current` undefined)
 *   current   it is still the version received
 *   changed   it was saved since with different values: `changes` lists
 *             each slot whose value there now differs from the project's
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
  if (link.fingerprint && current.contract.fingerprint === link.fingerprint) return { state: 'current', contract: current.contract };
  const seen = new Set();
  const changes = RRV_SLOTS
    .filter((sl) => !seen.has(sl.key) && seen.add(sl.key))
    .filter((sl) => differs(project[sl.field], current.contract[sl.key]))
    .map((sl) => ({ key: sl.key, label: sl.label, here: project[sl.field] ?? null, there: current.contract[sl.key] ?? null }));
  return { state: 'changed', contract: current.contract, changes, from: link.fingerprint, to: current.contract.fingerprint };
}

/** Take the valuation as it is now: every slot and the label. @returns {object} the fields to update */
export function refreshRrvProject(project, c) {
  const out = rrvIntakeProject(c);
  // the name is the portfolio's own
  if (project.name) out.name = project.name;
  return out;
}

const num = (v, d = 1) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v).toFixed(d) : EMPTY_VALUE);
const pct = (v) => (Number.isFinite(Number(v)) && v !== null ? `${(Number(v) * 100).toFixed(1)}%` : EMPTY_VALUE);

/** One sentence for a link state (null when there is nothing to say). */
export function rrvStateSentence(s) {
  if (!s || s.state === 'none' || s.state === 'current') return null;
  if (s.state === 'unknown') return 'The valuation could not be read just now.';
  if (s.state === 'missing') return 'The valuation is gone from Risked Reserves Valuation, or is no longer shared with you. The values here are kept.';
  if (s.state === 'refused') return `The valuation can no longer be valued: ${s.reason}`;
  const what = s.changes.length ? `: ${s.changes.map((x) => `${x.label} there ${num(x.there, 3)} (here ${num(x.here, 3)})`).join(', ')}` : '';
  return `Source changed since (version ${s.from || EMPTY_VALUE} to ${s.to})${what}. Refresh takes every value from the valuation, replacing any typed here.`;
}

/** The provenance rows a reviewer reads: [label, value]. */
export function rrvProvenanceRows(c) {
  const e = c.economics || {};
  const econ = e.valueBasis === 'epe' && e.epe
    ? `Petroleum Economics Studio run "${e.epe.runName}"${e.epe.caseName ? ` of case "${e.epe.caseName}"` : ''}${e.epe.priceDeckName ? `, price deck "${e.epe.priceDeckName}"` : ''}${e.epe.discountRatePct != null ? `, ${num(e.epe.discountRatePct, 1)}%${e.epe.pvBasis ? ` ${e.epe.pvBasis}` : ''}` : ''}, results ${day(e.epe.resultsAt)}`
    : e.valueBasis === 'model' ? 'the economic model of the valuation (canonical screening NPV)' : (e.valueBasisWord || 'entered in the valuation');
  return [
    ['Valuation', `"${c.prospectName}" (id ${c.valuationId})${c.sharedFromColleague ? ', a colleague\'s valuation shared with you: read-only provenance' : ''}`],
    [RRV_NPV_LABEL, `${num(c.successMeanValueMM, 2)} $MM: ${RRV_NPV_NOTE}`],
    [RRV_P90_LABEL, `${num(c.p90SizeValueMM, 2)} $MM at ${num(c.p90SizeMMboe, 2)} MMboe`],
    [RRV_P10_LABEL, `${num(c.p10SizeValueMM, 2)} $MM at ${num(c.p10SizeMMboe, 2)} MMboe: ${RRV_SIZE_NOTE}`],
    ['Chance of success Pg', pct(c.pg)],
    ['Commercial chance Pc', `${pct(c.pc)} (Pg x chance of at least the MEFS, ${num(c.mefsMMboe, 1)} MMboe)`],
    ['EMV after the well', `${num(c.emvMM, 2)} $MM`],
    ['Risked volume', `${num(c.riskedMeanMMboe, 2)} MMboe (Pg x success-case mean ${num(c.successMeanMMboe, 2)} MMboe; gas at 6 Mscf per boe)`],
    ['Well cost (budget line)', `${num(c.wellCostMM, 2)} $MM`],
    ['Development cost (information)', `${num(c.devCostMM, 2)} $MM, spent only after a commercial discovery; left out of the budget line`],
    ['Value of a discovery from', `${econ}; MEFS ${e.mefsBasis === 'derived' ? 'derived' : 'typed'}`],
    ['Volumes and Pg from', c.volumes?.from === 'ReservoirCalc Pro' ? `ReservoirCalc Pro "${c.volumes.recordName}", saved ${day(c.volumes.recordUpdatedAt)}` : 'typed in Risked Reserves Valuation'],
    ['Valuation saved', day(c.valuationSavedAt)],
    ['Read', `by id from Risked Reserves Valuation; sent by ${c.sentBuild || 'a build not stated'}`],
    ['Fingerprint', c.fingerprint],
  ];
}
