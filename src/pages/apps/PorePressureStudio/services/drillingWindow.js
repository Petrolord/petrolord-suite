// Drilling window (Pore Pressure T1-E1): the margin between pore pressure
// and fracture pressure, in EMW (ppg) against the EMW datum, and where it is
// narrowest. The mud weight must stay above PP and below FG; a narrow window
// is where a casing point or managed pressure drilling is argued.

import { emwPpg, emwReferenceDepthM, PPG_PER_SG } from './units';
import { casingSeatsBottomUp, lineAt } from '../engine/casingSeats';

// The top of the hole is drilled behind the conductor, where PP and FG
// converge on the seawater gradient by construction; the window that
// decides the casing design starts below it.
export const WINDOW_FROM_BML_M = 300;

/**
 * @param {{porePressurePa:number[], fracPressurePa:number[]}} profile
 * @param {number[]} zBmlM depths below mudline (m)
 * @param {Object} params dock params (water depth, mudline MD) for the EMW datum
 * @param {number} fromBmlM shallowest depth considered (m below mudline)
 * @returns {{narrowest:{zBmlM:number, ppPpg:number, fgPpg:number, windowPpg:number}|null,
 *   maxPp:{zBmlM:number, ppPpg:number}|null}}
 */
export function drillingWindow(profile, zBmlM, params, fromBmlM = WINDOW_FROM_BML_M) {
  if (!profile || !zBmlM?.length) return { narrowest: null, maxPp: null };
  let narrowest = null; let maxPp = null;
  for (let i = 0; i < zBmlM.length; i++) {
    const z = zBmlM[i];
    if (!(z > 0) || z < fromBmlM) continue; // the mudline is degenerate (S = Ph = PP = FG)
    const ref = emwReferenceDepthM(z, params);
    const pp = emwPpg(profile.porePressurePa[i], ref);
    const fg = emwPpg(profile.fracPressurePa[i], ref);
    if (!Number.isFinite(pp) || !Number.isFinite(fg)) continue;
    const w = fg - pp;
    if (!narrowest || w < narrowest.windowPpg) narrowest = { zBmlM: z, ppPpg: pp, fgPpg: fg, windowPpg: w };
    if (!maxPp || pp > maxPp.ppPpg) maxPp = { zBmlM: z, ppPpg: pp };
  }
  return { narrowest, maxPp };
}

// ---- U2-003: kick and trip margins and the casing seats --------------------
// The drilling engineer's deliverable on the window: a planned mud weight
// (PP + trip margin), a design fracture line (FG - kick margin) and the
// bottom-up casing seats they imply (engine casingSeats.js, gated on the
// published Applied Drilling Engineering example). Margins live in the
// project params in kg/m3 (SI, as every param) and are shown in the dock's
// density unit; the seats are computed in ppg EMW against the same datum
// the window uses, from the conductor cut-off down to the deepest sample.



export const KG_M3_PER_PPG_DOCK = 1000 / PPG_PER_SG; // the dock's ppg (fresh water 8.345404 ppg)
/** Default margins: 0.5 ppg each (the Applied Drilling Engineering example uses 4 pcf, 0.53 ppg). */
export const DEFAULT_MARGINS = Object.freeze({
  tripKgM3: 0.5 * KG_M3_PER_PPG_DOCK,
  kickKgM3: 0.5 * KG_M3_PER_PPG_DOCK,
  minShallowSeatBmlM: 0,
});
export const marginsOf = (params) => ({ ...DEFAULT_MARGINS, ...(params?.margins || {}) });
const toPpg = (kgM3) => kgM3 / KG_M3_PER_PPG_DOCK;

/**
 * Casing design on the prognosis.
 * @returns {{tripPpg: number, kickPpg: number, zBmlM: number[], mudPpg: number[], designFgPpg: number[],
 *   seats: {zBmlM: number, mudBelowPpg: number, designFgPpg: number, driver: string}[],
 *   sections: {topBmlM: number, baseBmlM: number, mudPpg: number, minDesignFgPpg: number, marginPpg: number}[],
 *   closedAtBmlM: ?number, fromBmlM: number}|{error: string}|null}
 */
export function casingDesign(profile, zBmlM, params, fromBmlM = WINDOW_FROM_BML_M) {
  if (!profile || !zBmlM?.length) return null;
  const m = marginsOf(params);
  const zs = []; const pp = []; const fg = [];
  for (let i = 0; i < zBmlM.length; i++) {
    const z = zBmlM[i];
    if (!(z > 0) || z < fromBmlM) continue;
    if (zs.length && !(z > zs[zs.length - 1])) continue;
    const ref = emwReferenceDepthM(z, params);
    const a = emwPpg(profile.porePressurePa[i], ref);
    const b = emwPpg(profile.fracPressurePa[i], ref);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    zs.push(z); pp.push(a); fg.push(b);
  }
  if (zs.length < 2) return { error: `Casing seats need the prognosis below ${fromBmlM} m below mudline.` };
  const tripPpg = toPpg(m.tripKgM3); const kickPpg = toPpg(m.kickKgM3);
  try {
    const r = casingSeatsBottomUp({
      depths: zs, ppEmw: pp, fgEmw: fg, tripMargin: tripPpg, kickMargin: kickPpg,
      minShallowSeat: m.minShallowSeatBmlM > fromBmlM ? m.minShallowSeatBmlM : 0,
    });
    return {
      tripPpg,
      kickPpg,
      zBmlM: zs,
      mudPpg: r.mud,
      designFgPpg: r.designFg,
      seats: r.seats.map((s) => ({ zBmlM: s.depth, mudBelowPpg: s.mudBelow, designFgPpg: s.designFgAtShoe, driver: s.driver })),
      sections: r.sections.map((s) => ({ topBmlM: s.top, baseBmlM: s.base, mudPpg: s.mud, minDesignFgPpg: s.minDesignFg, marginPpg: s.margin })),
      closedAtBmlM: r.closedAt,
      fromBmlM,
      at: (z) => ({ mudPpg: lineAt(zs, r.mud, z), designFgPpg: lineAt(zs, r.designFg, z) }),
    };
  } catch (e) {
    return { error: e.message };
  }
}
