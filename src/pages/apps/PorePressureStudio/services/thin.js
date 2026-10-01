// Display thinning for the depth plots (PP-U1-011, PL10). A real well at a
// half-foot step is 40,000 samples a curve; Recharts drew every one of them
// in five series and the page froze for seconds on each parameter change.
// The plots draw at most MAX_ROWS rows (every k-th sample plus the last);
// the readout, the drilling window, the CSV and the publish keep every
// sample.

export const MAX_ROWS = 1500;

/** Indices to draw out of n samples. */
export function thinIndices(n, max = MAX_ROWS) {
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const k = Math.ceil(n / max);
  const out = [];
  for (let i = 0; i < n; i += k) out.push(i);
  if (out[out.length - 1] !== n - 1) out.push(n - 1);
  return out;
}
