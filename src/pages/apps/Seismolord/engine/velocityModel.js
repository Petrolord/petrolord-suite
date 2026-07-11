// Velocity model + time-depth conversion (pure, worker-safe, jest-tested).
//
// Model: V(z) = v0 + k·z — instantaneous velocity linear in depth, the
// standard single-function model (k = 0 is plain constant velocity).
// One-way time t (s) to depth (m, positive down):
//   z(t) = (v0 / k) · (e^{k·t} − 1)      (k ≠ 0)
//   z(t) = v0 · t                        (k = 0)
// Inputs are TWT in ms (the app's vertical unit); t = twt / 2000.
//
// Display uses positive-down metres/feet; the EXPORT convention stays
// NEGATIVE Z in feet (playbook — matches ReservoirCalc Pro test data)
// via sampleToExportZ.

import { NULL_VALUE } from './manifest';

const NULL_F32 = Math.fround(NULL_VALUE);

export const M_PER_FT = 0.3048;

/**
 * Validate a velocity model shape. Accepts {v0, k} (v0 m/s at datum,
 * k 1/s); returns a clean {v0, k} or null when unusable.
 */
export function normalizeVelocity(model) {
  if (!model) return null;
  const v0 = Number(model.v0);
  const k = Number(model.k ?? 0);
  if (!Number.isFinite(v0) || v0 <= 0 || !Number.isFinite(k)) return null;
  return { v0, k };
}

/** TWT ms -> depth in metres, positive down. */
export function twtMsToDepthM(twtMs, { v0, k }) {
  const t = twtMs / 2000;                 // one-way time, seconds
  if (Math.abs(k) < 1e-9) return v0 * t;
  return (v0 / k) * Math.expm1(k * t);
}

/**
 * Convert a pick grid (sample indices) to a depth grid, null-aware.
 * @param {Float32Array} picks
 * @param {number} dtUs sample interval, µs
 * @param {{v0: number, k: number}} model
 * @param {{unit?: 'm'|'ft'}} [opts]
 * @returns {Float32Array} depth, positive down
 */
export function depthGridFromPicks(picks, dtUs, model, { unit = 'm' } = {}) {
  const dtMs = dtUs / 1000;
  const scale = unit === 'ft' ? 1 / M_PER_FT : 1;
  const out = new Float32Array(picks.length);
  for (let c = 0; c < picks.length; c++) {
    out[c] = picks[c] === NULL_F32
      ? NULL_F32
      : twtMsToDepthM(picks[c] * dtMs, model) * scale;
  }
  return out;
}

/**
 * Export-convention converter: sample index -> NEGATIVE depth in feet.
 * @returns {(sample: number) => number}
 */
export function sampleToExportZ(model, dtUs) {
  const dtMs = dtUs / 1000;
  return (s) => -(twtMsToDepthM(s * dtMs, model) / M_PER_FT);
}

/** Human label, e.g. "V(z) = 2000 + 0.30·z m/s" or "V = 2000 m/s". */
export function describeVelocity(model) {
  const m = normalizeVelocity(model);
  if (!m) return 'not set';
  return Math.abs(m.k) < 1e-9
    ? `V = ${m.v0} m/s`
    : `V(z) = ${m.v0} + ${m.k}·z m/s`;
}
