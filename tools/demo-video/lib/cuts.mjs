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

// Time-lapse: a stretch where the screen keeps moving after the narration has
// finished (a long drag, a dialog filling in) plays faster instead of being
// dropped. A ramp is { from, to, speed } on the raw clock; a cut is a ramp of
// infinite speed. These generalise the cut helpers above.

/** Ramps outside any cut, clipped where they overlap one. */
export function normaliseRamps(ramps, cuts) {
  const c = normaliseCuts(cuts); const out = [];
  for (const r of (ramps || []).filter((x) => x && x.to > x.from && x.speed > 1)) {
    let pieces = [{ from: r.from, to: r.to }];
    for (const k of c) pieces = pieces.flatMap((p) => (k.to <= p.from || k.from >= p.to ? [p] : [
      ...(k.from > p.from ? [{ from: p.from, to: k.from }] : []), ...(k.to < p.to ? [{ from: k.to, to: p.to }] : [])]));
    out.push(...pieces.map((p) => ({ ...p, speed: r.speed })));
  }
  return out.sort((a, b) => a.from - b.from);
}

/** Seconds a stretch loses: all of a cut, (1 - 1/speed) of a ramp. */
const lost = (t, s) => Math.min(Math.max(t - s.from, 0), s.to - s.from) * (s.speed === Infinity ? 1 : 1 - 1 / s.speed);

/** A raw time on the finished picture's clock, with cuts and ramps applied. */
export function mapTime(t, cuts, ramps) {
  const segs = [...normaliseCuts(cuts).map((c) => ({ ...c, speed: Infinity })), ...normaliseRamps(ramps, cuts)];
  const inCut = normaliseCuts(cuts).find((c) => t > c.from && t < c.to);
  const tt = inCut ? inCut.from : t;
  return tt - segs.reduce((a, s) => a + lost(tt, s), 0);
}

/** The ffmpeg filter for cuts plus ramps (frames are retimed, then resampled to 30 fps). */
export function rampFilter(cuts, ramps) {
  const n = normaliseCuts(cuts); const r = normaliseRamps(ramps, cuts);
  if (!r.length) return cutFilter(cuts);
  const sel = n.length ? `,select='not(${n.map((c) => `between(t,${c.from.toFixed(3)},${c.to.toFixed(3)})`).join('+')})'` : '';
  const term = (s) => `clip(T-${s.from.toFixed(3)},0,${(s.to - s.from).toFixed(3)})*${s.speed === Infinity ? '1' : (1 - 1 / s.speed).toFixed(5)}`;
  const expr = [...n.map((c) => ({ ...c, speed: Infinity })), ...r].map(term).join('-');
  return `${sel},setpts='(T-${expr})/TB',fps=30`;
}

/** The ramps on the finished picture's clock, for a 'Sped up' badge. */
export const rampWindows = (cuts, ramps) => normaliseRamps(ramps, cuts).map((s) => ({ from: mapTime(s.from, cuts, ramps), to: mapTime(s.to, cuts, ramps), speed: s.speed }));

/**
 * Ramps for the silent tail of each step: from a beat after the narration
 * ends to just before the step's next event (its wait cut, or its end).
 * A tail longer than `min` seconds is played in min(max, base + (L - base) / div)
 * seconds (defaults 3, 8, 2, 4); a max of 0 cuts the tail;
 * `rampScale` scales every step's `rampMax`. A step with `ramp: false` always plays at real speed; `rampMax` overrides max.
 */
export function planRamps(sb, clips, rec, { min = 3, max = 8, base = 2, div = 4, keepAfter = 1.0, keepBefore = 0.8, rampScale = 1 } = {}) {
  const out = [];
  rec.timeline.forEach((t, i) => {
    const s = sb.steps[i]; if (!s || s.ramp === false) return;
    const from = t.sayAt + (clips[i]?.duration ?? 0) + (s.tail ?? 0.4) + keepAfter;
    const cut = (rec.cuts || []).find((c) => c.from >= t.start && c.from <= t.end);
    const to = (cut ? cut.from : t.end - (s.hold ?? 0)) - keepBefore;
    const L = to - from;
    if (L <= min) return;
    const target = Math.min(s.rampMax != null ? s.rampMax * rampScale : max, base + (L - base) / div);
    out.push({ from, to, speed: target > 0.05 ? L / target : Infinity, step: s.id });
  });
  return out;
}
