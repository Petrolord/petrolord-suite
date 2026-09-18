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

const BAND_CLASSES = Object.freeze({
  Critical: 'bg-red-500/10 text-red-500 border-red-500/20',
  High: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  Medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  Low: 'bg-green-500/10 text-green-500 border-green-500/20',
  [NO_BAND]: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
});

export const getRiskBandClasses = (score) => BAND_CLASSES[getRiskBand(score)];

const CELL_CLASSES = Object.freeze({
  Critical: 'bg-red-500/90 hover:bg-red-500',
  High: 'bg-orange-500/90 hover:bg-orange-500',
  Medium: 'bg-yellow-500/90 hover:bg-yellow-500',
  Low: 'bg-green-500/90 hover:bg-green-500',
  [NO_BAND]: 'bg-slate-500/90',
});

/** Heatmap cell fill for a likelihood/impact pair. */
export const getHeatmapCellClasses = (likelihood, impact) =>
  CELL_CLASSES[getRiskBand(calculateRiskScore(likelihood, impact))];
