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

import { unpackLog } from './logPacking';

export const PROPERTY_KINDS = {
  porosity: { label: 'Porosity from impedance' },
  facies: { label: 'Facies probability (Bayesian)' },
  // QI upgrade P1.3: beside porosity, each written only when its blind check passes the gate
  ntg: { label: 'Net-to-gross from impedance', gated: true, name: 'net-to-gross', short: 'NTG', fraction: true },
  sw: { label: 'Water saturation from impedance', gated: true, name: 'water saturation', short: 'Sw', fraction: true },
};

/** The property's name in a sentence, and its short label. */
export const propertyName = (kind) => PROPERTY_KINDS[kind]?.name || (kind === 'facies' ? 'facies' : 'porosity');
export const propertyShort = (kind) => PROPERTY_KINDS[kind]?.short || (kind === 'facies' ? 'Facies' : 'Porosity');

/** Product labels: water saturation from the seismic is a fluid hypothesis (SOW section 10); NTG and porosity are calibrated predictions. */
export const propertyClass = (kind) => (kind === 'sw' ? 'fluid_hypothesis' : 'calibrated_prediction');

/**
 * The blind-check gate of NTG and Sw (QI upgrade P1.3, 2026-10-15): the
 * volume is written only when the check is fully blind, at least two wells
 * were checked, and at every well the left-out correlation reaches min_corr
 * and the share of the well inside Q10 to Q90 lies within the coverage band.
 * Defaults: correlation 0.5, coverage 60 to 95 percent (the porosity issue
 * thresholds).
 */
export const PROPERTY_GATE_DEFAULTS = Object.freeze({ min_corr: 0.5, coverage: [0.6, 0.95] });

/** @returns {{pass: boolean, reasons: string[], thresholds}} */
export function propertyGate(result, gate = {}) {
  const t = { ...PROPERTY_GATE_DEFAULTS, ...Object.fromEntries(Object.entries(gate || {}).filter(([, v]) => v != null)) };
  const reasons = [];
  const rows = result?.rows || [];
  const checked = rows.filter((r) => !r.error);
  const name = propertyName(result?.settings?.kind);
  if (!result?.blind_protocol?.fully_blind) reasons.push('the check is not fully blind (rerun the inversion so it records each well held back)');
  if (checked.length < 2) reasons.push(`it needs a check at two wells or more (${checked.length} checked)`);
  for (const r of rows) {
    if (r.error) { reasons.push(`${r.name} could not be checked: ${r.error}`); continue; }
    if (!(Number.isFinite(r.corr) && r.corr >= t.min_corr)) reasons.push(`${r.name}: left-out correlation ${Number.isFinite(r.corr) ? r.corr.toFixed(2) : 'not defined'}, under ${t.min_corr}`);
    if (!(Number.isFinite(r.coverage) && r.coverage >= t.coverage[0] && r.coverage <= t.coverage[1])) reasons.push(`${r.name}: ${Number.isFinite(r.coverage) ? (100 * r.coverage).toFixed(0) : 'no'} percent inside Q10 to Q90, outside ${(100 * t.coverage[0]).toFixed(0)} to ${(100 * t.coverage[1]).toFixed(0)}`);
  }
  return { pass: !reasons.length, reasons, thresholds: t, text: reasons.length ? `The ${name} volume is withheld: ${reasons.join('; ')}.` : `The ${name} check passes: every well left out correlates at ${t.min_corr} or more and holds ${(100 * t.coverage[0]).toFixed(0)} to ${(100 * t.coverage[1]).toFixed(0)} percent inside Q10 to Q90.` };
}

/** Why a gate's thresholds cannot be used, or null. */
export function gateProblem(g) {
  if (g == null) return null;
  if (typeof g !== 'object') return 'The gate must be an object.';
  if (g.min_corr != null && !(g.min_corr >= -1 && g.min_corr <= 1)) return 'The gate correlation must be -1 to 1.';
  if (g.coverage != null && !(Array.isArray(g.coverage) && g.coverage.length === 2 && g.coverage[0] >= 0 && g.coverage[1] <= 1 && g.coverage[0] < g.coverage[1])) return 'The gate coverage must be a band within 0 to 1.';
  return null;
}

/** Fractions (NTG, Sw) are held within 0 and 1 in the volumes. */
export const clampFraction = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : v);
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
  if (PROPERTY_KINDS[pr.kind].gated) { const g = gateProblem(pr.gate); if (g) return g; }
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
  const notBlind = (result?.blind_protocol?.rows || []).filter((r) => r.source === 'volume_not_blind').map((r) => r.name);
  if (notBlind.length) add('not-blind', 'medium', `The ${kind} check is not blind at ${notBlind.join(', ')}`, `The impedance volume used ${notBlind.length === 1 ? 'this well' : 'these wells'} and records no held-back estimate, so the check there leans on the well itself.`, 'Rerun the inversion volume (it now records each well held back), then the property check.');
  for (const r of result?.rows || []) {
    if (r.error) { add(`${r.name}:error`, 'medium', `${r.name}: no check`, r.error, 'Give the other wells enough labelled samples in the window.'); continue; }
    if (kind === 'facies') {
      if (Number.isFinite(r.accuracy) && r.accuracy < 0.6) add(`${r.name}:acc`, 'high', `${r.name}: facies predicted poorly when left out`, `Accuracy ${(100 * r.accuracy).toFixed(0)} percent from ${volumeName}.`, 'Check that impedance separates these facies (Rock Physics Studio feasibility), merge facies it cannot separate, or add an attribute.');
    } else {
      if (Number.isFinite(r.corr) && r.corr < 0.5) add(`${r.name}:corr`, 'high', `${r.name}: ${propertyName(kind)} follows the well poorly when left out`, `Correlation ${r.corr.toFixed(2)} from ${volumeName}.`, 'Check the inversion at this well (blind-well table) and the transform window.');
      if (Number.isFinite(r.bias) && Number.isFinite(r.rms) && r.rms > 0 && Math.abs(r.bias) > 0.7 * r.rms) add(`${r.name}:bias`, 'medium', `${r.name}: ${propertyName(kind)} is ${r.bias > 0 ? 'over' : 'under'}-predicted when left out`, `Mean error ${r.bias.toFixed(3)} against an RMS error of ${r.rms.toFixed(3)}: most of the error is a shift.`, 'Check the inversion\'s low-frequency model and the wavelet scale at this well.');
      if (Number.isFinite(r.coverage) && (r.coverage < 0.6 || r.coverage > 0.95)) add(`${r.name}:cov`, 'medium', `${r.name}: the 80 percent interval covers ${(100 * r.coverage).toFixed(0)} percent of the well`, r.coverage < 0.6 ? 'The interval is too narrow for the error of the inversion at this well.' : 'The interval is wider than the error at this well needs.', 'Read Q10 and Q90 with care here; recalibrate with more wells or a narrower window.');
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Truly blind property check (QI upgrade P1.2, 2026-10-15). A well left out
// of the property model used to be predicted from the impedance volume at
// its trace, and that volume came from an inversion that had the well in its
// low-frequency model and wavelet scale, so the check was not blind. An
// inversion volume now records each well's held-back estimate
// (blind_traces); the check predicts each left-out well from that estimate.

/**
 * The impedance (and Vp/Vs) the check predicts each well from, and the
 * protocol row of each well.
 * @param {Object} p
 * @param {Array<{name, il, xl}>} p.wells the property job's wells
 * @param {Object} p.aiParams the impedance volume's manifest attribute params
 * @param {?Object} [p.vpvsParams] the Vp/Vs volume's manifest attribute params (two attributes)
 * @param {Array<ArrayLike<number>>} p.aiTraces the volume's AI at each well
 * @param {?Array<ArrayLike<number>>} [p.vpvsTraces]
 * @returns {{aiTraces, vpvsTraces, protocol: {version, fully_blind: boolean, rows: Array<{name, source}>}}}
 */
export function blindCheckTraces({ wells, aiParams = {}, vpvsParams = null, aiTraces, vpvsTraces = null }) {
  const used = new Set(aiParams.wells || []);
  const held = (params, key) => new Map((params?.blind_traces || []).filter((x) => x?.[key]).map((x) => [x.name, x]));
  const aiHeld = held(aiParams, 'ln_ai');
  const vpHeld = vpvsParams ? held(vpvsParams, 'vpvs') : null;
  const rows = []; const ai = []; const vp = vpvsTraces ? [] : null;
  wells.forEach((w, k) => {
    const h = aiHeld.get(w.name);
    const sameTrace = h && h.il === w.il && h.xl === w.xl;
    if (sameTrace) {
      const ln = unpackLog(h.ln_ai);
      ai.push(Float64Array.from(ln, (v) => (Number.isFinite(v) ? Math.exp(v) : NaN)));
      if (vp) {
        const hv = vpHeld?.get(w.name);
        vp.push(hv && hv.il === w.il && hv.xl === w.xl ? Float64Array.from(unpackLog(hv.vpvs), (v) => (Number.isFinite(v) ? v : NaN)) : vpvsTraces[k]);
      }
      rows.push({ name: w.name, source: 'held_back' });
    } else {
      ai.push(aiTraces[k]);
      if (vp) vp.push(vpvsTraces[k]);
      rows.push({ name: w.name, source: used.has(w.name) ? 'volume_not_blind' : 'not_in_inversion' });
    }
  });
  return { aiTraces: ai, vpvsTraces: vp, protocol: { version: 'held-back-v2', fully_blind: rows.every((r) => r.source !== 'volume_not_blind'), rows } };
}

export const BLIND_SOURCE_WORDS = {
  held_back: 'the inversion with this well held back',
  not_in_inversion: 'the impedance volume (the inversion did not use this well)',
  volume_not_blind: 'the impedance volume, which used this well (not blind)',
};

/** The property check's protocol in words, for the panel and the report. */
export function propertyProtocolText(result) {
  const p = result?.blind_protocol;
  if (!p) return 'Each well was left out of the property model and predicted from the impedance volume at its trace; that volume used every well, so the check was not fully blind (a result from before 2026-10-15).';
  const notBlind = p.rows.filter((r) => r.source === 'volume_not_blind').map((r) => r.name);
  return `Each well was left out of the property model and predicted from ${p.fully_blind ? 'an impedance estimate that never saw it: the inversion run with that well held back from its low-frequency model and wavelet scale, or an inversion that did not use it' : 'the impedance at its trace'}.${notBlind.length ? ` Not blind: ${notBlind.join(', ')} (the impedance volume used ${notBlind.length === 1 ? 'this well' : 'these wells'} and holds no held-back estimate; rerun the inversion to record one).` : ''}`;
}
