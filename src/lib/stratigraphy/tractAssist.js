// Suggest-only sequence surfaces from the gamma-ray trend (AppUpgrade
// STRAT-U2-016). Programme rule (the Well Correlation U2-009 decision): the
// interpretation stays the stratigrapher's. The app proposes a surface with
// the reason it has; each proposal is accepted or rejected; nothing here
// writes.
//
// Method. GR is read as a grain-size proxy (high GR finer, low coarser). The
// log is smoothed with a centred moving average and its turning points are
// found with a zig-zag of minimum swing `minSwingApi`: a point counts only
// when the log moves at least that far away from it on both sides, so the
// wiggle inside a bed is ignored. Walking up the hole:
//   - a GR maximum is where fining-upward (retrogradation, transgression)
//     turns to coarsening-upward (progradation): a maximum flooding surface
//     (MFS) candidate;
//   - a GR minimum is where coarsening-upward turns to fining-upward: a
//     maximum regressive surface (MRS) candidate.
// A flat top or bottom (within 1 API of the extreme) is reported at its
// middle. A candidate near an existing formation top proposes typing that
// top; near a surface already typed with the same code it is skipped as
// already picked; otherwise it proposes a new pick. Closed form; validated
// in __tests__ against logs with known turning points (negative controls: a
// flat log and a wiggle below the swing give nothing).

import { normalizeSurfaceType } from './vocabulary';

export const TRACT_ASSIST_DEFAULTS = Object.freeze({ smoothM: 5, minSwingApi: 20, nearM: 5 });

/** Depth-ascending finite samples of a log. */
function samples(depth, values) {
  const out = [];
  for (let i = 0; i < (depth?.length || 0); i++) if (Number.isFinite(depth[i]) && Number.isFinite(values[i])) out.push([depth[i], values[i]]);
  return out.sort((a, b) => a[0] - b[0]);
}

/** Centred moving average over a depth window (m). */
export function smoothLog(pts, windowM) {
  if (!(windowM > 0)) return pts.map((p) => p.slice());
  const half = windowM / 2;
  const out = [];
  let lo = 0; let hi = 0; let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    while (hi < pts.length && pts[hi][0] <= pts[i][0] + half) { sum += pts[hi][1]; hi += 1; }
    while (pts[lo][0] < pts[i][0] - half) { sum -= pts[lo][1]; lo += 1; }
    out.push([pts[i][0], sum / (hi - lo)]);
  }
  return out;
}

/**
 * Turning points of a log with a minimum swing (zig-zag), depth ascending.
 * @returns {Array<{kind: 'max'|'min', md: number, value: number, swingAbove: number, swingBelow: number}>}
 */
export function turningPoints(pts, minSwing) {
  if (pts.length < 3) return [];
  const pivots = [];
  let dir = 0; // +1 looking for a max, -1 for a min
  let ext = 0; // index of the running extreme
  let lo = 0; let hi = 0;
  for (let i = 1; i < pts.length; i++) {
    const v = pts[i][1];
    if (dir === 0) {
      if (v > pts[hi][1]) hi = i;
      if (v < pts[lo][1]) lo = i;
      if (pts[hi][1] - pts[lo][1] >= minSwing) {
        if (hi > lo) { pivots.push({ kind: 'min', i: lo }); dir = 1; ext = hi; } else { pivots.push({ kind: 'max', i: hi }); dir = -1; ext = lo; }
      }
      continue;
    }
    if (dir === 1) {
      if (v > pts[ext][1]) ext = i;
      else if (pts[ext][1] - v >= minSwing) { pivots.push({ kind: 'max', i: ext }); dir = -1; ext = i; }
    } else if (v < pts[ext][1]) ext = i;
    else if (v - pts[ext][1] >= minSwing) { pivots.push({ kind: 'min', i: ext }); dir = 1; ext = i; }
  }
  // interior pivots only: each needs a confirmed swing on both sides
  const inner = pivots.slice(1);
  return inner.map((p, k) => {
    const v = pts[p.i][1];
    // the middle of a flat extreme (within 1 API)
    let a = p.i; let b = p.i;
    while (a > 0 && Math.abs(pts[a - 1][1] - v) <= 1) a -= 1;
    while (b < pts.length - 1 && Math.abs(pts[b + 1][1] - v) <= 1) b += 1;
    const md = (pts[a][0] + pts[b][0]) / 2;
    const prev = pivots[k]; const next = inner[k + 1] ? pts[inner[k + 1].i][1] : (p.kind === 'max' ? Math.min(...pts.slice(p.i).map((x) => x[1])) : Math.max(...pts.slice(p.i).map((x) => x[1])));
    return { kind: p.kind, md, value: v, swingAbove: Math.abs(v - pts[prev.i][1]), swingBelow: Math.abs(v - next) };
  });
}

/**
 * Suggestions for one well.
 * @param {{depth: ArrayLike<number>, gr: ArrayLike<number>, tops: Array}} well
 * @returns {Array<{kind: 'type'|'new', code: 'MFS'|'MRS', md: number, topId?: string, topName?: string, reason: string}>}
 */
export function suggestSurfaces({ depth, gr, tops = [] }, opts = {}) {
  const o = { ...TRACT_ASSIST_DEFAULTS, ...opts };
  const pts = smoothLog(samples(depth, gr), o.smoothM);
  const turns = turningPoints(pts, o.minSwingApi);
  const out = [];
  for (const t of turns) {
    const code = t.kind === 'max' ? 'MFS' : 'MRS';
    const near = tops.filter((x) => Number.isFinite(Number(x.md_m)) && Math.abs(Number(x.md_m) - t.md) <= o.nearM).sort((a, b) => Math.abs(a.md_m - t.md) - Math.abs(b.md_m - t.md));
    if (near.some((x) => normalizeSurfaceType(x.surface_type) === code)) continue; // already picked
    const why = t.kind === 'max'
      ? `GR rises upward to ${Math.round(t.value)} API (fining-upward below, a ${Math.round(t.swingBelow)} API swing) and falls upward above it (coarsening-upward, ${Math.round(t.swingAbove)} API): the turnaround from retrogradation to progradation reads as a maximum flooding surface`
      : `GR falls upward to ${Math.round(t.value)} API (coarsening-upward below, a ${Math.round(t.swingBelow)} API swing) and rises upward above it (fining-upward, ${Math.round(t.swingAbove)} API): the turnaround from progradation to retrogradation reads as a maximum regressive surface`;
    const fm = near.find((x) => normalizeSurfaceType(x.surface_type) === 'formation_top');
    if (fm) out.push({ kind: 'type', code, md: t.md, topId: fm.id, topName: fm.name, reason: `${why}; ${fm.name} is ${Math.abs(fm.md_m - t.md).toFixed(1)} m from it` });
    else out.push({ kind: 'new', code, md: Number(t.md.toFixed(2)), reason: why });
  }
  return out;
}
