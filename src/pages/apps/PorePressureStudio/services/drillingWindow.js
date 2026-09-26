// Drilling window (Pore Pressure T1-E1): the margin between pore pressure
// and fracture pressure, in EMW (ppg) against the EMW datum, and where it is
// narrowest. The mud weight must stay above PP and below FG; a narrow window
// is where a casing point or managed pressure drilling is argued.

import { emwPpg, emwReferenceDepthM } from './units';

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
