// Property prediction from an inverted impedance volume (QI programme Q9a,
// 2026-10-07; SOW section 10). One module for the seismic worker (the
// property_prediction job) and the tests. The wells' impedance and their
// property logs (porosity, or facies codes from Rock Physics Studio's
// multi-well crossplot) are upscaled to seismic scale in time, the
// transform or the facies model is fitted to them (engines
// qi/propertyPrediction.js), and the calibration is checked by leaving each
// well out and predicting from the inverted impedance at that well. Then
// every trace of the impedance volume is predicted.
//
// Products: porosity at Q10, Q50 and Q90 (the 80 percent prediction
// interval), labelled calibrated_prediction; for facies, one probability
// volume per facies and the most likely facies code. A facies whose name
// speaks of a fluid (the words gas, oil, hydrocarbon, brine, fluid or water) is labelled
// fluid_hypothesis, the rest calibrated_prediction (SOW section 10).
//
// The calibration maths (upscaling, the fit, the left-out check and the
// widened porosity band of #987, the posterior tables) lives in the engines
// (engines/qi/propertyCalibration.js, QI course gate E2, 2026-10-11; goldens
// and an independent oracle there). This file keeps the job checks, the
// fluid labels and the issue register, and re-exports the rest.

export {
  PROPERTY_DEFAULTS, modeFilter, upscaleWells, fitProperty, predictTrace, posteriorTable, posteriorTable2D, calibrateProperty,
} from '../engine/propertyCalibration';

export const PROPERTY_KINDS = {
  porosity: { label: 'Porosity from impedance' },
  facies: { label: 'Facies probability (Bayesian)' },
};
export const MAX_FACIES = 5;
const fin = Number.isFinite;
// whole words only ("soil" is no fluid); underscores and digits separate words here
const FLUID = /(^|[^a-z])(gas|oil|hydrocarbons?|brine|fluids?|water)(?![a-z])/i;

export const faciesClass = (name) => (FLUID.test(String(name)) ? 'fluid_hypothesis' : 'calibrated_prediction');

/** Why a job's params cannot run, or null. */
export function validatePropertyParams(p) {
  if (!p || typeof p !== 'object') return 'Missing property settings.';
  if (p.mode !== 'calibrate' && p.mode !== 'volume') return 'The mode must be calibrate or volume.';
  const pr = p.property;
  if (!pr || !PROPERTY_KINDS[pr.kind]) return `Unknown property "${pr?.kind}".`;
  const wells = pr.wells;
  if (!Array.isArray(wells) || wells.length < 2) return 'Property prediction needs at least two wells (each is left out in turn).';
  for (const w of wells) {
    if (!w?.name || !Number.isInteger(w.il) || !Number.isInteger(w.xl)) return 'Each well needs a name and its inline and crossline index.';
    if (!Array.isArray(w.ln_ai) || !Array.isArray(w.target) || w.ln_ai.length !== w.target.length) return `Well ${w.name} needs its impedance and its ${pr.kind} on one time axis.`;
  }
  if (pr.window_ms != null && !(Array.isArray(pr.window_ms) && pr.window_ms.length === 2 && pr.window_ms[1] > pr.window_ms[0])) return 'The time window must be a start and a later end.';
  if (pr.attributes != null && !['ai', 'ai_vpvs'].includes(pr.attributes)) return 'The attributes must be AI, or AI and Vp/Vs.';
  if (pr.attributes === 'ai_vpvs') {
    if (pr.kind !== 'facies') return 'Classify in AI and Vp/Vs for facies; porosity uses AI.';
    for (const w of wells) if (!Array.isArray(w.vpvs) || w.vpvs.length !== w.ln_ai.length) return `Well ${w.name} needs Vp/Vs on the same time axis.`;
  }
  if (pr.kind === 'facies') {
    if (!pr.names || typeof pr.names !== 'object') return 'Name the facies codes.';
    if (Object.keys(pr.names).length > MAX_FACIES) return `At most ${MAX_FACIES} facies.`;
    if (pr.density && !['gaussian', 'kde'].includes(pr.density)) return 'The density must be gaussian or kde.';
    if (pr.priors && !['wells', 'equal'].includes(pr.priors)) return 'The priors must be the wells\' proportions or equal.';
  }
  return null;
}

/**
 * Issues for the register from a calibration check. Porosity: a left-out
 * correlation under 0.5 is high; an 80 percent interval that covers under
 * 60 or over 95 percent of the well is medium (the interval is too narrow
 * or too wide). Facies: a left-out accuracy under 0.6 is high.
 */
export function propertyIssues(result, volumeName = 'the impedance volume') {
  const out = [];
  const kind = result?.settings?.kind;
  const add = (key, severity, title, detail, remedy) => out.push({ key: `property:${volumeName}:${kind}:${key}`, area: 'Property prediction', severity, title, detail, remedy });
  for (const r of result?.rows || []) {
    if (r.error) { add(`${r.name}:error`, 'medium', `${r.name}: no check`, r.error, 'Give the other wells enough labelled samples in the window.'); continue; }
    if (kind === 'facies') {
      if (Number.isFinite(r.accuracy) && r.accuracy < 0.6) add(`${r.name}:acc`, 'high', `${r.name}: facies predicted poorly when left out`, `Accuracy ${(100 * r.accuracy).toFixed(0)} percent from ${volumeName}.`, 'Check that impedance separates these facies (Rock Physics Studio feasibility), merge facies it cannot separate, or add an attribute.');
    } else {
      if (Number.isFinite(r.corr) && r.corr < 0.5) add(`${r.name}:corr`, 'high', `${r.name}: porosity follows the well poorly when left out`, `Correlation ${r.corr.toFixed(2)} from ${volumeName}.`, 'Check the inversion at this well (blind-well table) and the transform window.');
      if (Number.isFinite(r.bias) && Number.isFinite(r.rms) && r.rms > 0 && Math.abs(r.bias) > 0.7 * r.rms) add(`${r.name}:bias`, 'medium', `${r.name}: porosity is ${r.bias > 0 ? 'over' : 'under'}-predicted when left out`, `Mean error ${r.bias.toFixed(3)} against an RMS error of ${r.rms.toFixed(3)}: most of the error is a shift.`, 'Check the inversion\'s low-frequency model and the wavelet scale at this well.');
      if (Number.isFinite(r.coverage) && (r.coverage < 0.6 || r.coverage > 0.95)) add(`${r.name}:cov`, 'medium', `${r.name}: the 80 percent interval covers ${(100 * r.coverage).toFixed(0)} percent of the well`, r.coverage < 0.6 ? 'The interval is too narrow for the error of the inversion at this well.' : 'The interval is wider than the error at this well needs.', 'Read Q10 and Q90 with care here; recalibrate with more wells or a narrower window.');
    }
  }
  return out;
}
