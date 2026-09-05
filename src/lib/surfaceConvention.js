// Depth sign and unit convention of the shared surface registry
// (geo_surfaces), decided by the owner 2026-09-05: every DEPTH surface
// stores ELEVATION (z negative below datum, TVDSS) in metres or feet
// per `z_unit`. Time surfaces stay positive TWT ms, isochores stay
// positive thickness, attributes are raw. Readers that compute
// positive-down internally (Earth Modeling) convert at the door
// through the two helpers below; ReservoirCalc Pro reads the sign
// through zConventionForImport. Pure, no I/O.

import { NULL_VALUE } from '@/lib/gridding/numeric';

export const M_PER_FT = 0.3048;
export const SURFACE_Z_CONVENTION = 'elevation';

const isNull = (v) => !Number.isFinite(v) || Math.abs(v) >= 1e29;
const outArray = (like, n) => new (ArrayBuffer.isView(like) ? like.constructor : Float32Array)(n);

/** -1 for a depth surface (elevation stored, positive-down = -z), +1 for
 *  every other domain (time, attribute, isochore thickness). */
export function surfaceZSign(row) {
  return row?.z_domain === 'depth' ? -1 : 1;
}

/** Metres per stored z unit (`z_unit` 'ft' -> 0.3048, else 1). */
export function surfaceZUnitToM(row) {
  return row?.z_unit === 'ft' ? M_PER_FT : 1;
}

/** ReservoirCalc Pro's import vocabulary: 'elevation' flips the sign on
 *  the way in, 'depth' passes values through. */
export function zConventionForImport(row) {
  return row?.z_domain === 'depth' ? 'elevation' : 'depth';
}

/** A registry grid as positive-down METRES (what the Earth Modeling
 *  engine and any depth-down consumer expects); nulls preserved. */
export function surfaceZToDepthDown(row, grid) {
  const f = surfaceZSign(row) * surfaceZUnitToM(row);
  const out = outArray(grid, grid.length);
  for (let i = 0; i < grid.length; i++) out[i] = isNull(grid[i]) ? NULL_VALUE : grid[i] * f;
  return out;
}

/** Positive-down metres -> registry elevation in `zUnit` (default m);
 *  nulls preserved. */
export function depthDownToSurfaceZ(grid, { zUnit = 'm' } = {}) {
  const f = zUnit === 'ft' ? -1 / M_PER_FT : -1;
  const out = outArray(grid, grid.length);
  for (let i = 0; i < grid.length; i++) out[i] = isNull(grid[i]) ? NULL_VALUE : grid[i] * f;
  return out;
}
