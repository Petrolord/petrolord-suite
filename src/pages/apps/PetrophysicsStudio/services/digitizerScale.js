// Backup (wrapped) scales for digitized curves (AppUpgrade PETRO-U2-018,
// PT7 follow-up). A printed log keeps a curve inside its track by wrapping
// it: a gamma ray past 150 API on a 0 to 150 track reappears from the left
// edge on the backup scale (150 to 300). A tracer reads the wrapped pixels
// as values near the left end again, so the saved curve drops by a whole
// scale width. With the backup scale set, every jump of more than half a
// track between neighbouring samples is taken as a wrap and undone: one
// scale width added (or removed) on a linear track, one scale ratio
// multiplied (or divided) on a logarithmic one.

/**
 * @param {ArrayLike<number>} values digitized values in depth order
 * @param {{left: number, right: number, log?: boolean}} scale the printed track ends
 * @returns {{data: Float64Array, wraps: number}}
 */
export function unwrapBackupScale(values, { left, right, log = false }) {
  const n = values.length;
  const data = new Float64Array(n);
  let k = 0;
  let wraps = 0;
  let prev = NaN;
  const toT = (v) => (log ? Math.log10(v) : v);
  const span = log ? Math.log10(right) - Math.log10(left) : right - left;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (!Number.isFinite(v) || (log && !(v > 0))) { data[i] = NaN; continue; }
    const t = toT(v);
    if (Number.isFinite(prev)) {
      const d = t - prev;
      if (Math.abs(d) > 0.5 * Math.abs(span)) {
        const step = Math.sign(d) === Math.sign(span) ? -1 : 1;
        k += step;
        wraps += 1;
      }
    }
    prev = t;
    const tt = t + k * span;
    data[i] = log ? 10 ** tt : tt;
  }
  return { data, wraps };
}
