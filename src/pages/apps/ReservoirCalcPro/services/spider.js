// Spider plot data (ReservoirCalc Pro upgrade U2-017). For each uncertain
// input, the in-place volume when that input sits at the 10th, 25th, 50th,
// 75th and 90th percentile of its own sampled values and every other input
// at its sampled median. The volume comes from the canonical engine itself
// (MonteCarloEngine.simulate run on constants), so the plot shows what the
// run's own arithmetic does; nothing is restated here.
//
// The x axis is the input's own percentile (non-exceedance, 10th = low
// input). PRMS P90/P50/P10 labels are kept for outcomes only.

export const SPIDER_PCTS = [0.1, 0.25, 0.5, 0.75, 0.9];
// sample records name porosity "phi"; everything else by its key
const SAMPLE_KEY = { porosity: 'phi' };

const quantileSorted = (s, p) => {
  if (!s.length) return NaN;
  const h = (s.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return s[lo] + (s[hi] - s[lo]) * (h - lo);
};

/**
 * @param {(config, inputs) => Object} simulate the engine's simulate (bound)
 * @param {Object} config the run's config
 * @param {string[]} varKeys the run's uncertain inputs
 * @param {Array<{inputs: Object}>} samples the run's realizations
 * @returns {?{base: number, stream: string, lines: Array<{key, values: number[], points: Array<{pct, input, volume}>}>}}
 */
export function spiderFromRun(simulate, config, varKeys, samples) {
  if (!varKeys?.length || !samples?.length) return null;
  const sampled = {};
  for (const k of varKeys) {
    const sk = SAMPLE_KEY[k] || k;
    const v = samples.map((s) => s.inputs?.[sk]).filter(Number.isFinite).sort((a, b) => a - b);
    if (v.length) sampled[k] = v;
  }
  const keys = varKeys.filter((k) => sampled[k]);
  if (!keys.length) return null;
  const medians = Object.fromEntries(keys.map((k) => [k, quantileSorted(sampled[k], 0.5)]));
  const gas = config.fluidType === 'gas';
  const volumeAt = (vals) => {
    const constInputs = Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, { type: 'constant', value: v }]));
    const r = simulate({ ...config, iterations: 100, spider: false, seed: 1, correlations: [] }, constInputs);
    return gas ? r.raw.giip[0] : r.raw.stooip[0];
  };
  const base = volumeAt(medians);
  const lines = keys.map((k) => {
    const points = SPIDER_PCTS.map((p) => {
      const input = quantileSorted(sampled[k], p);
      return { pct: p, input, volume: volumeAt({ ...medians, [k]: input }) };
    });
    return { key: k, points };
  });
  // widest swing first, as the tornado
  lines.sort((a, b) => Math.abs(b.points[4].volume - b.points[0].volume) - Math.abs(a.points[4].volume - a.points[0].volume));
  return { base, stream: gas ? 'giip' : 'stooip', medians, lines };
}
