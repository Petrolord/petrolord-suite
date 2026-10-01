// Chart decimation that keeps the extremes (U2-014, PL10, 2026-10-01).
// U1 drew every k-th sample of a long zone, which can step over a thin
// fast streak or a washout spike: the picture then hides the very feature
// a log analyst looks for. Here the samples are cut into buckets and each
// bucket contributes its minimum and its maximum of the key series (in
// depth order), so every excursion survives at any zoom. Pure.

/**
 * @param {number[]} indices sample indices in depth order
 * @param {ArrayLike<number>} key the series whose extremes must survive (e.g. in-situ Vp)
 * @param {number} maxPoints the most indices to return (at least 4)
 * @returns {{indices: number[], buckets: number, decimated: boolean}}
 */
export function minMaxDecimate(indices, key, maxPoints) {
  const n = indices.length;
  const cap = Math.max(4, Math.floor(maxPoints));
  if (n <= cap) return { indices, buckets: n, decimated: false };
  const buckets = Math.floor(cap / 2);
  const out = [];
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor((b * n) / buckets);
    const to = Math.floor(((b + 1) * n) / buckets);
    let lo = -1; let hi = -1;
    for (let k = from; k < to; k++) {
      const v = key[indices[k]];
      if (!Number.isFinite(v)) continue;
      if (lo < 0 || v < key[indices[lo]]) lo = k;
      if (hi < 0 || v > key[indices[hi]]) hi = k;
    }
    if (lo < 0) { out.push(indices[from]); continue; } // a bucket of gaps keeps its first sample (the line breaks there)
    if (lo === hi) out.push(indices[lo]);
    else if (lo < hi) out.push(indices[lo], indices[hi]);
    else out.push(indices[hi], indices[lo]);
  }
  return { indices: out, buckets, decimated: true };
}
