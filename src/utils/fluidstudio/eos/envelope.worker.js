/**
 * PT phase-envelope web worker — FS5.
 *
 * The envelope trace runs hundreds of stability bisections (seconds of
 * CPU), so it lives off the main thread. The worker receives plain data
 * (component keys, mole fractions, optional C7+ description, temperature
 * window) and rebuilds the mixture with the same validated FS4 modules
 * the sync path uses.
 *
 * Message contract (module worker, Seismolord pattern):
 *   in : { id, payload: { keys, z, plus, tuning, tMinF, tMaxF, nT, resTempF } }
 *        { id, payload: { kind: 'tune', fluid, targets, opts } }   (ET3)
 *   out: { id, ok: true, payload: { bubble, dew, points, satAtRes } | tune result }
 *        { id, ok: false, error }
 * Pressures psia, temperatures reported back in °F for the chart.
 * Cancellation/progress arrive in FS8; FS5 keeps one trace in flight per
 * card and drops stale responses by id.
 */

import { mixtureFromKeys } from './pr78.js';
import { tunedMixtureWithPlusFraction } from './tuning.js';
import { tracePhaseEnvelope, saturationPressure } from './envelope.js';
import { degFtoR, degRtoF } from './units.js';
import { tuneToLab } from './labTune.js';

/** ET3: the lab-tune regression is seconds of LM iterations, so it shares
 * this worker. Plain-data in, plain-data out (tuneToLab result). */
export const runLabTuneJob = ({ fluid, targets, opts }) => tuneToLab(fluid, targets, opts);

export const runEnvelopeTrace = ({ keys, z, plus, tuning, tMinF, tMaxF, nT, resTempF }) => {
  const mix = plus ? tunedMixtureWithPlusFraction(keys.slice(0, -1), plus, tuning) : mixtureFromKeys(keys);
  const boundaryOpts = { nScan: 30 };
  const trace = tracePhaseEnvelope(mix, z, {
    tMinR: degFtoR(tMinF),
    tMaxR: degFtoR(tMaxF),
    nT,
    ...boundaryOpts,
  });
  const sat = Number.isFinite(resTempF)
    ? saturationPressure(mix, z, degFtoR(resTempF), boundaryOpts)
    : null;
  const toF = (pt) => ({ tF: degRtoF(pt.tR), pPsia: pt.pPsia });
  return {
    bubble: trace.bubble.map(toF),
    dew: trace.dew.map(toF),
    points: trace.points.map((p) => ({ tF: degRtoF(p.tR), boundaries: p.boundaries })),
    satAtRes: sat ? { pPsia: sat.pPsia, kind: sat.kind } : null,
  };
};

// jsdom has no worker global; guard so the module is also importable for
// the synchronous fallback and unit tests.
if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof window === 'undefined') {
  self.onmessage = (e) => {
    const { id, payload } = e.data || {};
    try {
      const result = payload?.kind === 'tune' ? runLabTuneJob(payload) : runEnvelopeTrace(payload);
      self.postMessage({ id, ok: true, payload: result });
    } catch (err) {
      self.postMessage({ id, ok: false, error: err?.message || String(err) });
    }
  };
}
