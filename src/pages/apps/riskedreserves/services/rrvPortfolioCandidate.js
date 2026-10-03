// Risked Reserves Valuation as a sender: the `rrv-portfolio-candidate-1`
// contract (upgrade U2-009, 2026-10-03). A saved valuation is read by its id
// (rrv_valuations) and published as a candidate project for Capital
// Portfolio Studio, with the provenance a portfolio reviewer needs.
//
// NOTHING IS A SECOND VALUATION. Every number is the valuation engine's
// (valueProspect through valueOrProblem), on the valuation exactly as it was
// saved (fromRow, so a valuation saved by an earlier build opens as the
// workstation opens it).
//
// Owner decisions, 2026-10-03 ("go with your defaults"):
//   1. Capital Portfolio's optimizer reads `npv_p50`. The sender supplies the
//      SUCCESS-CASE MEAN value of the valuation for that slot, and the
//      intake labels it as a mean of the success case everywhere it shows it.
//   2. The budget line is the WELL COST; the development cost is information.
//   3. No risk score is sent (the 1 to 10 score has no meaning here).
//
// The success case is a discovery (geological success, chance Pg). Its mean
// value, after the exploration well:
//   successMeanValueMM = E[value of the outcome | discovery]
//                      = Pc/Pg x NPV if commercial - W   (a sub-commercial
//                        discovery is not developed and is worth -W)
//                      = Pg-weighted part of the EMV:  (EMV + W) / Pg - W
// so Capital Portfolio's EMV, pos x npv - (1 - pos) x fail_cost, with pos Pg
// and fail_cost W, is this valuation's EMV exactly (test).
//
// The contract (money $MM, volumes MMboe at 6 Mscf per boe):
//   schema, app, table                     'rrv-portfolio-candidate-1', 'Risked Reserves Valuation', 'rrv_valuations'
//   valuationId, prospectKey, prospectName the saved row and its prospect
//   valuationCreatedAt, valuationSavedAt   when the row was created and last saved
//   ownerId, sharedFromColleague           whose valuation; a colleague's is read-only provenance
//   ident                                  company, licence, play, analyst
//   pg, pc, pCommercialGivenSuccess        geological chance, commercial chance, P(V >= MEFS | discovery)
//   successMeanValueMM                     the value for the NPV slot (above)
//   valueIfDiscoveryMM                     the same before the well
//   p90SizeMMboe, p10SizeMMboe             the success-case P90 and P10 sizes (engine)
//   p90SizeValueMM, p10SizeValueMM         the value of each size after the well on the
//                                          valuation's own value line (rrvMath.valueOfSize):
//                                          u V - D - W at or above the MEFS, -W below it.
//                                          Values of two sizes; percentiles of value differ.
//   npvIfCommercialMM, meanIfCommercialMMboe   the commercial case at its mean size
//   emvMM                                  EMV after the well
//   wellCostMM, devCostMM, mefsMMboe, unitValuePerBoe   the economic inputs
//   successMeanMMboe, riskedMeanMMboe      volumes
//   units, basis                           words for each value
//   economics                              { valueBasis, valueBasisWord, mefsBasis, model, epe }
//                                          (the Petroleum Economics Studio run, if one fed it)
//   volumes                                where Pg and the volumes came from
//   sentBuild                              the Suite build that sent it
//   fingerprint                            changes when anything the valuation says changes;
//                                          never with the sender, the reader or a re-save
// A valuation that is not saved, or cannot be valued, is refused with a reason.

import { fromRow, inputProblem, engineInput, valueBasisWord, BOE_BASIS, PERCENTILE_CONVENTION } from './rrvStore';
import { valueOrProblem, valueOfSize } from './rrvMath';

export const RRV_PORTFOLIO_SCHEMA = 'rrv-portfolio-candidate-1';
export const RRV_APP = 'Risked Reserves Valuation';

export const SIZE_VALUE_BASIS = 'the value, after the exploration well, of a discovery of the success-case P90 (low) or P10 (high) size on the valuation\'s own value line: value per barrel x size - development cost - well cost, or minus the well cost for a size below the MEFS (not developed). These are the values of two sizes; percentiles of value would differ';

export const SUCCESS_MEAN_BASIS = 'the mean of the success case (a discovery, chance Pg), which is neither a median nor a P50: the expected value of the well\'s outcome given a discovery, the exploration well cost included (a discovery below the MEFS is not developed and is worth minus the well cost)';

const stable = (v) => {
  if (v === undefined || v === null) return 'null';
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (typeof v === 'object') return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
};

/** Keys that say who sent, who reads or when it was saved: never part of the fingerprint. */
const NOT_FINGERPRINTED = ['fingerprint', 'sentBuild', 'sharedFromColleague', 'valuationSavedAt', 'valuationCreatedAt'];

/** FNV-1a over what the valuation says. */
export function rrvCandidateFingerprint(c) {
  const what = { ...c };
  for (const k of NOT_FINGERPRINTED) delete what[k];
  const text = stable(what);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

const epeBlock = (epe) => (epe ? {
  runId: epe.runId ?? null, runName: epe.runName ?? null, caseName: epe.caseName ?? null, priceDeckName: epe.priceDeckName ?? null,
  discountRatePct: epe.discountRatePct ?? null, pvBasis: epe.pvBasis ?? null, resultsAt: epe.resultsAt ?? null,
  engineVersion: epe.engineVersion ?? null, fingerprint: epe.fingerprint ?? null, receivedAt: epe.receivedAt ?? null,
} : null);

/**
 * Build the contract from a saved rrv_valuations row.
 * @param {{row: ?object, userId?: ?string, build?: ?string}} a `userId` the reader (to tell a colleague's valuation)
 * @returns {{ok: true, contract: object}|{ok: false, reason: string}}
 */
export function buildRrvPortfolioCandidate({ row, userId = null, build = null }) {
  if (!row || !row.id) return { ok: false, reason: 'This valuation is not saved to an account, so Capital Portfolio Studio has no id to read it by. Save it first.' };
  const p = fromRow(row);
  const problem = inputProblem(p);
  if (problem) return { ok: false, reason: `${p.name} cannot be valued yet: ${problem}` };
  const { v, problem: refused } = valueOrProblem(engineInput(p));
  if (!v) return { ok: false, reason: `${p.name} cannot be valued: ${refused}` };
  const W = Number(p.wellCost);
  const valueIfDiscovery = v.pCommercialGivenSuccess > 0 && v.npvIfCommercial !== null ? v.pCommercialGivenSuccess * v.npvIfCommercial : 0;
  const econ = p.econ || {};
  const e = engineInput(p);
  const contract = {
    schema: RRV_PORTFOLIO_SCHEMA,
    app: RRV_APP,
    table: 'rrv_valuations',
    valuationId: row.id,
    prospectKey: row.prospect_key ?? p.id ?? null,
    prospectName: p.name,
    valuationCreatedAt: row.created_at ?? null,
    valuationSavedAt: row.updated_at ?? null,
    ownerId: row.user_id ?? null,
    sharedFromColleague: !!(userId && row.user_id && row.user_id !== userId),
    ident: { company: p.ident?.company || null, licence: p.ident?.licence || null, play: p.ident?.play || null, analyst: p.ident?.analyst || null },
    pg: v.pg,
    pc: v.pc,
    pCommercialGivenSuccess: v.pCommercialGivenSuccess,
    successMeanValueMM: valueIfDiscovery - W,
    valueIfDiscoveryMM: valueIfDiscovery,
    p90SizeMMboe: v.successCase.p90,
    p10SizeMMboe: v.successCase.p10,
    p90SizeValueMM: valueOfSize(e, v.successCase.p90),
    p10SizeValueMM: valueOfSize(e, v.successCase.p10),
    npvIfCommercialMM: v.npvIfCommercial,
    meanIfCommercialMMboe: v.meanIfCommercial,
    emvMM: v.emv,
    wellCostMM: W,
    devCostMM: Number(p.devCost),
    mefsMMboe: Number(p.mefs),
    unitValuePerBoe: Number(p.unitValue),
    successMeanMMboe: v.successCase.mean,
    riskedMeanMMboe: v.riskedMean,
    units: { money: '$MM', volume: 'MMboe', unitValue: '$/boe', boe: BOE_BASIS },
    basis: {
      successMeanValue: SUCCESS_MEAN_BASIS,
      sizeValues: SIZE_VALUE_BASIS,
      emv: 'expected monetary value after the exploration well: Pg x success-case mean value minus (1 - Pg) x well cost',
      wellCost: 'the exploration well, spent in every outcome: the capital the drilling decision commits',
      devCost: 'the development cost of a commercial discovery, spent only after one: carried as information and left out of the budget line',
      volumes: PERCENTILE_CONVENTION,
    },
    economics: {
      valueBasis: econ.value || 'entered',
      valueBasisWord: valueBasisWord(p),
      mefsBasis: econ.mefs || 'typed',
      model: econ.value === 'model' && econ.model ? { ...econ.model } : null,
      epe: econ.value === 'epe' ? epeBlock(econ.epe) : null,
    },
    volumes: p.source === 'rcp'
      ? { from: 'ReservoirCalc Pro', recordId: p.handoff?.recordId ?? p.rcpId ?? null, recordName: p.handoff?.recordName ?? null, recordUpdatedAt: p.handoff?.recordUpdatedAt ?? null, basis: p.basis ?? null }
      : { from: 'typed in Risked Reserves Valuation', recordId: null, recordName: null, recordUpdatedAt: null, basis: null },
    sentBuild: build,
  };
  contract.fingerprint = rrvCandidateFingerprint(contract);
  return { ok: true, contract };
}
