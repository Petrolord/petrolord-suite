// Value range display for property volumes (Geoscience video Part B,
// 2026-10-17). Seismic shows symmetric about zero (playbook default);
// impedance, porosity, saturation and facies probability are one-signed,
// so a symmetric clip paints them in one flat band. These helpers find
// the signed low and high of the slice on screen and decide which
// volumes open in that mode. Display only: no stored value changes.

const NULL_ABS = 1.0e29;

/**
 * Signed low and high of a slice at a percentile pair, from a strided
 * sample of its live (finite, non-null) values.
 * @param {ArrayLike<number>} data slice values (1e30 nulls)
 * @param {number} pct upper percentile, e.g. 98 (the lower is 100 - pct)
 * @param {{cap?: number}} [opts] samples kept (strided), default 65536
 * @returns {?{low: number, high: number, min: number, max: number}} null when nothing is live
 */
export function valueRange(data, pct = 98, { cap = 65536 } = {}) {
  if (!data || !data.length) return null;
  const stride = Math.max(1, Math.floor(data.length / cap));
  const vals = [];
  for (let i = 0; i < data.length; i += stride) {
    const v = data[i];
    if (Number.isFinite(v) && Math.abs(v) < NULL_ABS) vals.push(v);
  }
  if (!vals.length) return null;
  const sorted = Float64Array.from(vals).sort();
  const at = (p) => {
    const k = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
    return sorted[k];
  };
  const hiPct = Math.min(100, Math.max(50, pct));
  let low = at(100 - hiPct);
  let high = at(hiPct);
  if (!(high > low)) { low = sorted[0]; high = sorted[sorted.length - 1]; }
  if (!(high > low)) { const pad = Math.abs(low) * 0.01 || 1; low -= pad; high += pad; }
  return { low, high, min: sorted[0], max: sorted[sorted.length - 1] };
}

/**
 * The display centre and clip that map [low, high] onto the colormap's ends
 * (shader: x = 0.5 + 0.5 * (v - centre) * gain / clip).
 */
export function rangeToCentreClip(low, high) {
  return { centre: (low + high) / 2, clip: Math.max((high - low) / 2, 1e-12) };
}

// QI Studio's products and other property volumes, by name: inversion
// outputs (AI, SI, Vp/Vs, density), properties (porosity, net-to-gross,
// water saturation) and facies probability.
const PROPERTY_NAME = /(,\s*(model-based|simultaneous|coloured|colored|sparse-spike)\b)|\bprobability of\b|\bmost likely facies\b|\b(porosity|net-to-gross|water saturation)\b|\b(AI|SI|Vp\/Vs),\s/i;

/** True when a volume's name marks it as a property volume (QI products). */
export function isPropertyVolumeName(name) {
  return typeof name === 'string' && PROPERTY_NAME.test(name);
}

/**
 * Should a volume open in Value range? A property volume by name, or a
 * slice whose live samples are all at or above zero (one-signed data such
 * as impedance). Seismic always has both signs, so it never qualifies.
 * @param {{name?: string, data?: ArrayLike<number>}} p
 */
export function wantsValueRange({ name, data } = {}) {
  if (isPropertyVolumeName(name)) return true;
  const r = data ? valueRange(data, 100) : null;
  return Boolean(r && r.min >= 0 && r.max > 0);
}
