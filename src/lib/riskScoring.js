// RISKSCORING RE-EXPORT SHIM (Assurance extraction AS12, 2026-09-18).
// The rules written at AS2 now live in the vendored @petrolord/engines
// package (packages/engines/engines/assurance/riskScoring.js, from
// Petrolord/petrolord-engines) with committed goldens and an independent
// stdlib oracle. This path keeps every existing import working. The colour
// tokens below are presentation, so they stay in the Suite and are the only
// code in this file. Never edit the vendored copy from the Suite; change it
// in the engines repo and vendor it.
export * from '../../packages/engines/engines/assurance/riskScoring.js';
import {
  NO_BAND,
  RISK_BANDS,
  calculateRiskScore,
  getRiskBand,
} from '../../packages/engines/engines/assurance/riskScoring.js';

export const getRiskBandColor = (band) => {
  const hit = RISK_BANDS.find((b) => b.band === band);
  return hit ? `hsl(var(${hit.cssVar}))` : 'hsl(var(--muted))';
};

// Band colours are status, on the design-system status roles (the Risk
// Register, their only user, sits in a ThemedApp scope). Four ordered
// bands on four fills: the two upper bands solid, the two lower tinted, so
// the order reads in light and dark; the band word or score always sits
// beside the colour.
const BAND_CLASSES = Object.freeze({
  Critical: 'bg-pl-danger text-pl-danger-fg border-pl-danger',
  High: 'bg-pl-warning text-pl-warning-fg border-pl-warning',
  Medium: 'bg-pl-warning-bg text-pl-warning-text border-pl-warning/50',
  Low: 'bg-pl-success-bg text-pl-success-text border-pl-success/50',
  [NO_BAND]: 'bg-pl-sunken text-pl-muted border-pl-border',
});

export const getRiskBandClasses = (score) => BAND_CLASSES[getRiskBand(score)];

const CELL_CLASSES = Object.freeze({
  Critical: 'bg-pl-danger text-pl-danger-fg hover:bg-pl-danger/90',
  High: 'bg-pl-warning text-pl-warning-fg hover:bg-pl-warning/90',
  Medium: 'bg-pl-warning-bg text-pl-warning-text border border-pl-warning/50 hover:bg-pl-warning/25',
  Low: 'bg-pl-success-bg text-pl-success-text border border-pl-success/50 hover:bg-pl-success/25',
  [NO_BAND]: 'bg-pl-sunken text-pl-muted',
});

/** Heatmap cell fill for a band name, for a legend swatch (ASC-0). */
export const getBandCellClasses = (band) => CELL_CLASSES[band] || CELL_CLASSES[NO_BAND];

/** Heatmap cell fill for a likelihood/impact pair. */
export const getHeatmapCellClasses = (likelihood, impact) =>
  CELL_CLASSES[getRiskBand(calculateRiskScore(likelihood, impact))];
