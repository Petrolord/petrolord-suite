// Capital portfolio optimizer (D4, docs/scope/Economics-ROADMAP.md).
// Extracted from CapitalPortfolioStudio's inline knapsack and upgraded:
// risked EMV objective, step-scaled DP (bounded memory whatever the units),
// efficient frontier, and a normal-approximation portfolio risk summary.
//
// Conventions:
// - All money in $MM.
// - Risked EMV per project follows the ProspectRiskEngine convention of
//   keeping risked and success-case values separate:
//     EMV = pos * npv_p50 - (1 - pos) * fail_cost
//   where pos is the chance of success (0..1, default 1) and fail_cost is
//   the expected loss if the project fails (>= 0, default 0).
// - Portfolio risk metrics treat projects as INDEPENDENT (the same explicit
//   assumption ProspectRiskEngine's roll-up makes) and approximate the
//   portfolio NPV distribution as normal (sum of many independent project
//   outcomes). P(portfolio NPV < 0) = Phi(-mean/sd). Screening-grade by
//   design; the UI states the assumption.

import { normalCDF } from '@/lib/monteCarlo';

export const projectEmv = (p) => {
  const pos = clamp01(p.pos ?? 1);
  const failCost = Math.max(0, Number(p.fail_cost) || 0);
  return pos * (Number(p.npv_p50) || 0) - (1 - pos) * failCost;
};

const clamp01 = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0, n));
};

// Success-case NPV spread of one project, as a standard deviation in $MM.
// Preference order: explicit npv_stddev (a linked Monte Carlo run), else
// the (P10 - P90) / 2.5631 normal-equivalent from the entered percentiles
// (2.5631 = 2 * z_0.90), else 0.
export const successStdDev = (p) => {
  const sd = Number(p.npv_stddev);
  if (Number.isFinite(sd) && sd > 0) return sd;
  const p10 = Number(p.npv_p10);
  const p90 = Number(p.npv_p90);
  if (Number.isFinite(p10) && Number.isFinite(p90) && p10 > p90) {
    return (p10 - p90) / 2.5631;
  }
  return 0;
};

// Mean and variance of one project's NPV as a success/failure mixture:
// success (prob pos): normal(npv_p50-ish mean, successStdDev); failure:
// point mass at -fail_cost. Mixture moments are exact; only the summed
// portfolio shape is approximated as normal.
export const projectMoments = (p) => {
  const pos = clamp01(p.pos ?? 1);
  const failCost = Math.max(0, Number(p.fail_cost) || 0);
  const muS = Number(p.npv_p50) || 0;
  const sdS = successStdDev(p);
  const mean = pos * muS - (1 - pos) * failCost;
  const secondMoment = pos * (sdS * sdS + muS * muS) + (1 - pos) * failCost * failCost;
  const variance = Math.max(0, secondMoment - mean * mean);
  return { mean, variance };
};

/**
 * Normal-approximation risk summary for a set of (independent) projects.
 */
export const portfolioRiskMetrics = (selected) => {
  let mean = 0;
  let variance = 0;
  for (const p of selected) {
    const m = projectMoments(p);
    mean += m.mean;
    variance += m.variance;
  }
  const sd = Math.sqrt(variance);
  const probLoss = sd > 0 ? normalCDF(-mean / sd) : (mean < 0 ? 1 : 0);
  return {
    emv: mean,
    stdDev: sd,
    probLoss,
    p90: mean - 1.2816 * sd,
    p10: mean + 1.2816 * sd,
  };
};

/**
 * 0/1 knapsack over the CAPEX limit maximizing summed risked EMV.
 *
 * The DP is step-scaled: weights are quantized so the table never exceeds
 * ~2000 cells regardless of the units the user typed the limit in (the old
 * inline version allocated one cell per raw currency unit). `resolution`
 * (in $MM per cell) is reported so callers can state the quantization.
 * Projects with EMV <= 0 are never forced in: leaving capital unspent is
 * always allowed.
 */
export const optimizePortfolio = ({ projects, capexLimit }) => {
  const limit = Math.max(0, Number(capexLimit) || 0);
  const candidates = projects.filter((p) => Number(p.capex) > 0 || projectEmv(p) > 0);

  // Exact 1-$MM DP when inputs are integer $MM and the table stays small;
  // otherwise quantize to ~2000 cells (round-to-nearest, so an exact-fit
  // portfolio stays feasible; overshoot is bounded by half a cell per
  // project, screening-grade and reported via `resolution`).
  const allInteger = Number.isInteger(limit) && candidates.every((p) => Number.isInteger(Number(p.capex)));
  const resolution = allInteger && limit <= 5000 ? 1 : Math.max(1e-9, limit / 2000);
  const cells = Math.round(limit / resolution);

  const dp = new Array(cells + 1).fill(0);
  const pick = new Array(cells + 1).fill(null).map(() => []);

  for (const p of candidates) {
    const value = projectEmv(p);
    if (value <= 0) continue; // never worth forcing in under a max objective
    const weight = Math.max(1, Math.round((Number(p.capex) || 0) / resolution));
    if (weight > cells) continue;
    for (let w = cells; w >= weight; w--) {
      if (dp[w - weight] + value > dp[w]) {
        dp[w] = dp[w - weight] + value;
        pick[w] = [...pick[w - weight], p];
      }
    }
  }

  const optimalProjects = pick[cells];
  const totalCapex = optimalProjects.reduce((s, p) => s + (Number(p.capex) || 0), 0);
  const totalEmv = optimalProjects.reduce((s, p) => s + projectEmv(p), 0);
  const totalNpvSuccess = optimalProjects.reduce((s, p) => s + (Number(p.npv_p50) || 0), 0);

  // Efficient frontier: best achievable EMV at each spending level where it
  // improves. Reported at the ACTUAL capex of the picked set, not the cell.
  const frontierData = [];
  let last = -Infinity;
  for (let w = 0; w <= cells; w++) {
    if (dp[w] > last) {
      const capex = pick[w].reduce((s, p) => s + (Number(p.capex) || 0), 0);
      frontierData.push({ capex, emv: dp[w] });
      last = dp[w];
    }
  }

  return {
    optimalProjects,
    totalCapex,
    totalEmv,
    totalNpvSuccess,
    frontierData,
    resolution,
    risk: portfolioRiskMetrics(optimalProjects),
  };
};
