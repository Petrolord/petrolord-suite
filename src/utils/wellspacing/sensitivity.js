/**
 * Well Spacing Optimizer: the sensitivity of each case's NPV (WS-U2-007).
 *
 * No NPV maths here: each case's own calculateEconomics inputs (the arrays
 * the case table ran on, spacingEconomicsInputs) go to the canonical sweep
 * runSensitivityAnalysis of the screening engine, which moves oil price,
 * capex, fixed opex and the oil volume 30 percent down and up, one at a
 * time, and runs calculateEconomics on each. This file only orders the bars.
 *
 * What the canonical sweep moves, stated because it decides the reading:
 * "Production" scales the oil volume (and any variable opex), not the
 * solution gas; "OPEX" scales the fixed opex.
 *
 * Pure.
 */
import { runSensitivityAnalysis } from '@/utils/npvCalculations';
import { spacingEconomicsInputs } from '@/utils/wellSpacingCalculations';

export const SENSITIVITY_RANGE_PCT = 30;
const NAMES = { 'Oil Price': 'Oil price', CAPEX: 'Capex', OPEX: 'Opex', Production: 'Oil volume' };

/** The sweep of one case: bars ordered by swing, largest first. */
export function caseSensitivity(spacing, parameters) {
  const rows = runSensitivityAnalysis(spacingEconomicsInputs(spacing, parameters));
  const base = rows[0]?.baseNPV;
  const bars = rows.map((r) => ({
    name: NAMES[r.name] || r.name,
    low: r.lowParamNPV, // NPV with the input 30 percent down
    high: r.highParamNPV, // NPV with the input 30 percent up
    swing: Math.abs(r.highParamNPV - r.lowParamNPV),
  })).sort((a, b) => b.swing - a.swing);
  return { spacing, base, bars };
}

/** Every case of a study. */
export function spacingSensitivities(results) {
  if (!results?.spacingResults?.length) return [];
  return results.spacingResults.map((r) => caseSensitivity(r.spacing, results.parameters));
}

/** The case the tornado figure draws: the one chosen to send, else the middle of the range. */
export function tornadoCaseOf(results, senderSpacing) {
  const rows = results?.spacingResults || [];
  if (!rows.length) return null;
  const s = Number(senderSpacing);
  const hit = rows.find((r) => Math.abs(r.spacing - s) < 1e-9);
  if (hit) return { spacing: hit.spacing, why: 'the case chosen to send' };
  return { spacing: rows[Math.floor((rows.length - 1) / 2)].spacing, why: 'the middle case of the range (no case is chosen to send)' };
}
