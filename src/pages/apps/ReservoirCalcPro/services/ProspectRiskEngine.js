// Prospect risking (Integration & Risking G5.0): geologic chance of
// success (Pg) and risked volumes on top of RCP's existing unrisked
// volumetrics + Monte Carlo. Pure functions, exact arithmetic —
// validated by analytic jest cases, not an oracle (the correlation /
// wellPath precedent: there is no numerical method to cross-check).
//
// Risked volumes are BIMODAL — 0 on geologic failure, the unrisked
// distribution on success — so this engine never collapses them into a
// single misleading "risked P50". It reports, separately:
//   - risked mean = Pg * mean(unrisked)   (the expected monetary value
//     basis, averaging the failure case in), and
//   - the SUCCESS-CASE p90/p50/p10 (the volumes GIVEN a discovery),
//     which are just the unrisked percentiles, unscaled.
// The UI must present both; blending them hides the dry-hole risk.

/** The canonical independent risk factors; `other` is an optional
 *  catch-all multiplier (data/timing/etc.), default 1. */
export const RISK_FACTORS = ['trap', 'reservoir', 'charge', 'seal'];

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * Geologic chance of success = product of independent factors, each
 * clamped to [0, 1]. Missing factors default to 1 (no risk). `other`
 * folds in when present.
 * @param {{trap?,reservoir?,charge?,seal?,other?}} factors
 * @returns {number} Pg in [0, 1]
 */
export function chanceOfSuccess(factors = {}) {
  let pg = 1;
  for (const k of RISK_FACTORS) {
    if (factors[k] !== undefined && factors[k] !== null) pg *= clamp01(Number(factors[k]));
  }
  if (factors.other !== undefined && factors.other !== null) pg *= clamp01(Number(factors.other));
  return pg;
}

/**
 * Risk one prospect. `unrisked` is the RCP MonteCarloEngine result
 * shape ({p90, p50, p10, mean, ...}); a deterministic case can pass
 * {mean, p50: mean}.
 * @param {{name?: string, factors: Object, unrisked: {p90?,p50?,p10?,mean:number}}} prospect
 * @returns {{name, pg, riskedMean, successCase: {p90,p50,p10,mean}, pFailure}}
 */
export function riskProspect(prospect) {
  const pg = chanceOfSuccess(prospect.factors);
  const u = prospect.unrisked || {};
  const mean = Number.isFinite(u.mean) ? u.mean : 0;
  return {
    name: prospect.name || null,
    pg,
    pFailure: 1 - pg,
    riskedMean: pg * mean,          // expected value across success + dry hole
    successCase: {                  // volumes GIVEN discovery (unscaled)
      p90: u.p90 ?? null,
      p50: u.p50 ?? null,
      p10: u.p10 ?? null,
      mean,
    },
  };
}

/**
 * Portfolio roll-up over independent prospects (v1: no shared-risk
 * correlation — the UI flags this). EMV-style aggregates.
 * @param {Array<ReturnType<typeof riskProspect>>} risked
 */
export function portfolioRollup(risked) {
  const n = risked.length;
  const expectedRiskedVolume = risked.reduce((s, r) => s + r.riskedMean, 0);
  const expectedDiscoveries = risked.reduce((s, r) => s + r.pg, 0);
  const successCaseMeanTotal = risked.reduce((s, r) => s + r.successCase.mean, 0);
  // probability that AT LEAST ONE prospect succeeds (independence)
  const pAtLeastOne = 1 - risked.reduce((s, r) => s * (1 - r.pg), 1);
  return {
    count: n,
    expectedRiskedVolume,       // Σ Pg·mean — the risked portfolio value
    expectedDiscoveries,        // Σ Pg — expected number of successes
    successCaseMeanTotal,       // Σ mean — the all-succeed upside
    pAtLeastOneDiscovery: n ? pAtLeastOne : 0,
    meanPg: n ? expectedDiscoveries / n : 0,
  };
}
