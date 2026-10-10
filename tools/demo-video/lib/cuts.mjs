// Cuts: a step's `wait` (a worker job, for example) runs off the narration and
// the stretch it takes is dropped from the finished video. The recorder logs
// each dropped stretch on the raw capture's clock; these map raw times to the
// finished picture and build the ffmpeg filter that drops them.

/** Cuts sorted, clipped to positive length, and merged where they touch. */
export function normaliseCuts(cuts) {
  const s = (cuts || []).filter((c) => c && c.to > c.from).map((c) => ({ from: c.from, to: c.to })).sort((a, b) => a.from - b.from);
  const out = [];
  for (const c of s) {
    const last = out[out.length - 1];
    if (last && c.from <= last.to) last.to = Math.max(last.to, c.to);
    else out.push({ ...c });
  }
  return out;
}

/** A raw-capture time on the cut picture's clock (a time inside a cut maps to the cut point). */
export function cutTime(t, cuts) {
  let removed = 0;
  for (const c of normaliseCuts(cuts)) {
    if (t >= c.to) removed += c.to - c.from;
    else if (t > c.from) return c.from - removed;
  }
  return t - removed;
}

/** The ffmpeg video filter that drops the cuts (empty when there are none). */
export function cutFilter(cuts) {
  const n = normaliseCuts(cuts);
  if (!n.length) return '';
  const keep = n.map((c) => `between(t,${c.from.toFixed(3)},${c.to.toFixed(3)})`).join('+');
  return `,select='not(${keep})',setpts=N/FRAME_RATE/TB`;
}

/** Total seconds the cuts remove. */
export const cutTotal = (cuts) => normaliseCuts(cuts).reduce((a, c) => a + (c.to - c.from), 0);
