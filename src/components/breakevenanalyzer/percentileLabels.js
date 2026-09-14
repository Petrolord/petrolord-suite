// Percentile wording for the Probabilistic Breakeven Analyzer (EC3-0, owner
// decision 2026-09-14).
//
// The Suite reserves P-labels for outcomes where more is better
// (src/lib/percentileConventions.js). A breakeven price is a quantity where
// more is worse, and capex, opex and efficiency are parameters, so every one of
// them is described by its percentiles. The engine keys p10, p50 and p90 are
// unchanged and mean the 10th, 50th and 90th percentiles.
import { parameterPercentileLabel } from '@/lib/percentileConventions';

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** "10th percentile of breakeven price" for q10, q50 or q90. */
export const breakevenPercentileLabel = (key) => capitalise(parameterPercentileLabel('breakeven price', key));

/** Input labels for a variable's three stated percentiles, keyed by its engine key. */
export const VARIABLE_PERCENTILE_LABELS = Object.freeze({
  p10: capitalise(parameterPercentileLabel(null, 'q10')),
  p50: capitalise(parameterPercentileLabel(null, 'q50')),
  p90: capitalise(parameterPercentileLabel(null, 'q90')),
});
