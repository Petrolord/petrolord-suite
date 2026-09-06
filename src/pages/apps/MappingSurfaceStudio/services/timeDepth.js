// Time-to-depth of a TWT surface (Mapping MS3, 2026-09-05) through a
// Seismolord volume's velocity model: v1 is the single function
// V(z) = v0 + k·z (Seismolord's persisted {v0, k}); a layer cake needs
// its boundary picks on the seismic lattice, which a registry grid does
// not carry, so it is refused with a message naming Seismolord. Output
// is elevation (negative below datum) in the chosen unit, default feet
// (owner decision). Pure.

import { normalizeVelocity, twtMsToDepthM, describeVelocity } from '@/pages/apps/Seismolord/engine/velocityModel';

const isNull = (v) => !Number.isFinite(v) || Math.abs(v) >= 1e29;
const M_PER_FT = 0.3048;

/** The model a picker row carries, or a message why it cannot be used. */
export function usableModel(entry) {
  const m = normalizeVelocity(entry?.velocity || entry);
  if (!m) return { model: null, reason: 'This volume has no usable velocity model.' };
  if (m.kind !== 'linear') {
    return { model: null, reason: 'This is a layer-cake model: its layer boundaries are horizon picks on the seismic lattice, which a registry grid does not carry. Convert the horizon to depth in Seismolord and publish it from there.' };
  }
  return { model: m, reason: null };
}

/**
 * @param {Float32Array} twtMs positive two-way time, nulls 1e30
 * @param {{v0:number, k:number}} model
 * @param {{unit?:'m'|'ft'}} [opts]
 * @returns {Float32Array} elevation in `unit`, nulls kept
 */
export function twtGridToElevation(twtMs, model, { unit = 'ft' } = {}) {
  const { model: m, reason } = usableModel(model);
  if (!m) throw new Error(reason);
  const f = unit === 'ft' ? 1 / M_PER_FT : 1;
  const out = new Float32Array(twtMs.length);
  for (let i = 0; i < twtMs.length; i++) {
    const t = twtMs[i];
    out[i] = isNull(t) ? 1e30 : -twtMsToDepthM(t, m) * f;
  }
  return out;
}

export { describeVelocity };
