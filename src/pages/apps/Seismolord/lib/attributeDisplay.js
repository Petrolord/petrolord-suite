// How the attribute catalogue is shown: the groups in the Compute
// attribute dialog and the colormap an attribute volume opens with.
// Display only; the math lives in the engines (attributes.js,
// discontinuity.js, structureAttributes.js).

const own = (table, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key);

/** Dialog groups, in order; keys not listed fall into Other. */
export const ATTRIBUTE_GROUPS = [
  { label: 'Amplitude and phase', keys: ['envelope', 'inst_phase', 'inst_freq', 'sweetness', 'rms', 'agc', 'rai'] },
  { label: 'Frequency', keys: ['spectral'] },
  { label: 'Structure', keys: ['dip', 'azimuth', 'curvature_pos', 'curvature_neg'] },
  { label: 'Discontinuity and faults', keys: ['variance', 'fault_likelihood', 'edge', 'chaos'] },
];

/**
 * The registry split into the dialog's groups; empty groups are dropped and
 * anything new in the registry still shows, under Other.
 * @param {Object<string, {key: string, label: string}>} defs
 * @returns {Array<{label: string, defs: Array<Object>}>}
 */
export function groupAttributeDefs(defs) {
  const seen = new Set();
  const groups = ATTRIBUTE_GROUPS.map((g) => ({
    label: g.label,
    defs: g.keys.filter((k) => own(defs, k)).map((k) => { seen.add(k); return defs[k]; }),
  }));
  const other = Object.keys(defs).filter((k) => !seen.has(k)).map((k) => defs[k]);
  if (other.length) groups.push({ label: 'Other', defs: other });
  return groups.filter((g) => g.defs.length > 0);
}

const SUGGESTED_COLORMAP = {
  inst_phase: 'hsv_cycle',
  azimuth: 'hsv_cycle',
  curvature_pos: 'cool_warm',
  curvature_neg: 'cool_warm',
  variance: 'gray_wb',
  fault_likelihood: 'gray_wb',
  edge: 'gray_wb',
  chaos: 'gray_wb',
  envelope: 'viridis',
  sweetness: 'viridis',
  rms: 'viridis',
  spectral: 'viridis',
  dip: 'viridis',
  inst_freq: 'jet',
};

/**
 * The colormap an attribute volume opens with (cyclic for angles,
 * diverging for signed curvature, white to black for discontinuity so
 * faults read dark), or null to keep the current one (seismic-like
 * attributes such as AGC and relative acoustic impedance).
 * @param {?string} attributeName attribute_params.name of the volume
 */
export function suggestedColormap(attributeName) {
  return own(SUGGESTED_COLORMAP, attributeName) ? SUGGESTED_COLORMAP[attributeName] : null;
}
