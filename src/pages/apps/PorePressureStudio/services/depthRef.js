// Depth reference for reading the prognosis (AppUpgrade PP-U2-004, PL3).
// The engine works below the mudline; the well plan reads TVD below the
// rotary table, the geologist TVDSS, the driller MD. Every computed sample
// carries its depth in each frame the source can support, converted through
// the well's survey (MD to TVD, PP-U1-002) and the datum (mudline MD, water
// depth, KB elevation); a frame the source cannot support is withheld with
// its reason. Pure. The datum arithmetic itself is the shared module's
// (src/lib/wellDatum.js).

import { tvdssFromTvd, datumFromElevation } from '../../../../lib/wellDatum';

export const DEPTH_REF_KEY = 'pp.depthRef';
export const VIEW_REFS = Object.freeze([
  { key: 'bml', label: 'below mudline', short: 'bml' },
  { key: 'tvdrkb', label: 'TVD below RKB', short: 'TVD RKB' },
  { key: 'tvdss', label: 'TVDSS', short: 'TVDSS' },
  { key: 'md', label: 'MD below RKB', short: 'MD' },
]);
export const refLabel = (key) => VIEW_REFS.find((r) => r.key === key)?.label || 'below mudline';
export const refShort = (key) => VIEW_REFS.find((r) => r.key === key)?.short || 'bml';

/**
 * @param {{zBmlM: number[], mdM?: number[]}} input
 * @param {{waterDepthM?: number, mudlineMdM?: number}} params
 * @param {{frame?: ?{mdToPosition: Function}, kbM?: ?number, datum?: ?Object, source?: 'well'|'seismic'}} ctx
 *   datum: the registry well's datum (readWellDatum); kbM is kept for sources that carry only an elevation
 * @returns {{bml: number[], tvdrkb: ?number[], tvdss: ?number[], md: ?number[],
 *   reasons: Object<string,string>, mudlineTvdM: ?number}}
 */
export function depthReferences(input, params = {}, { frame = null, kbM = null, datum = null, source = 'well' } = {}) {
  const d = datum || datumFromElevation(kbM);
  const zs = input?.zBmlM || [];
  const wd = Number(params.waterDepthM) || 0;
  const ml = Number(params.mudlineMdM) || 0;
  const reasons = {};
  let mudlineTvdM = null;
  if (source === 'well') {
    if (wd > 0 && ml < wd) {
      reasons.tvdrkb = 'set the mudline MD in Parameters (offshore, the rotary table is the air gap plus the water depth above the mudline)';
    } else if (ml > 0) {
      try { mudlineTvdM = frame ? frame.mdToPosition(ml).tvd : ml; } catch { mudlineTvdM = ml; }
    } else {
      mudlineTvdM = 0; // onshore with no mudline MD: the log MD is read as depth below the ground
    }
  } else if (ml > 0) {
    mudlineTvdM = ml; // a velocity trend: the rotary table of the well the trend was read at
  } else {
    reasons.tvdrkb = 'set the mudline MD in Parameters to place the rotary table';
  }
  const tvdrkb = mudlineTvdM == null ? null : zs.map((z) => z + mudlineTvdM);
  let tvdss = null;
  if (wd > 0) tvdss = zs.map((z) => z + wd); // offshore: the mudline is the water depth below sea level
  else if (tvdrkb && d.tvdssOk) tvdss = tvdrkb.map((t) => tvdssFromTvd(t, d));
  else reasons.tvdss = d.tvdssOk ? 'set the mudline MD in Parameters' : 'onshore TVDSS needs the KB elevation, and this source has none';
  let md = null;
  if (source !== 'well') reasons.md = 'a velocity trend has no measured depth';
  else if (Array.isArray(input?.mdM) && input.mdM.length === zs.length) md = input.mdM;
  else reasons.md = 'no measured depth on this input';
  return { bml: zs, tvdrkb, tvdss, md, reasons, mudlineTvdM };
}

/** The chosen frame, or below mudline when it is withheld. */
export function chosenRef(refs, key) {
  return refs && refs[key] ? key : 'bml';
}

/**
 * A mapper from depth below mudline to the chosen frame (linear between
 * samples, the frames being monotone in the samples kept), and back.
 */
export function refMapper(refs, key) {
  const k = chosenRef(refs, key);
  const xs = refs?.bml || [];
  const ys = refs?.[k] || xs;
  const interp = (a, b, v) => {
    const n = a.length;
    if (!n) return NaN;
    if (n === 1 || v <= a[0]) return b[0] + (v - a[0]);
    if (v >= a[n - 1]) return b[n - 1] + (v - a[n - 1]);
    let lo = 0; let hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (a[mid] <= v) lo = mid; else hi = mid; }
    const f = (v - a[lo]) / (a[hi] - a[lo] || 1);
    return b[lo] + f * (b[hi] - b[lo]);
  };
  return {
    key: k,
    fromBml: (z) => (k === 'bml' ? z : interp(xs, ys, z)),
    toBml: (d) => (k === 'bml' ? d : interp(ys, xs, d)),
    at: (i) => ys[i],
  };
}
