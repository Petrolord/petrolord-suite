// Seismic horizons at the wells of a section (AppUpgrade WC-U2-003), read
// only from the shared surface registry (geo_surfaces): a horizon Seismolord
// converted to a surface (TWT ms, or depth as elevation, negative down, in
// ft or m) is sampled where each wellbore crosses it and drawn as a marker
// the section can correlate and flatten on. Nothing is written.
//
// Where the wellbore crosses: the grid is sampled at the wellhead, then at the
// borehole position at that depth (the survey offsets), until it settles, so a
// deviated well meets the horizon under its path, not under its rig. A time
// horizon needs the well's checkshots to reach depth. Wells the grid does not
// cover, wells in another coordinate system, and time horizons on wells with
// no checkshots are named, never guessed. Pure.

import { tvdssAtTwt, twtAtTvdss } from './timeDepth';
import { unitToMetres } from '../../../../packages/engines/lib/crs/catalog';

const M_PER_FT = 0.3048;
const isNull = (v, nullValue) => v == null || !Number.isFinite(v) || Math.abs(v) >= 1e29 || (Number.isFinite(nullValue) && Math.abs(v - nullValue) < 1e-6);
const crsKey = (c) => (c ? String(c).trim().toUpperCase() : null);
const metresPer = (u) => { try { return unitToMetres(u || 'm'); } catch { return NaN; } };

/** Registry rows a section can draw: time or depth structure surfaces. */
export function horizonCandidates(rows = []) {
  return rows
    .filter((r) => (r.z_domain === 'time' || r.z_domain === 'depth') && (r.kind || 'structure') === 'structure')
    .map((r) => ({
      id: r.id, name: r.name, domain: r.z_domain, zUnit: r.z_domain === 'time' ? 'ms' : (r.z_unit || 'm'),
      source: r.provenance?.app === 'seismolord' ? 'Seismolord' : (r.provenance?.app || 'registry'),
      horizonName: r.provenance?.horizon?.name || r.name, is_own: r.is_own !== false,
    }));
}

/**
 * Bilinear sample of a row-major nx*ny grid at world (x, y) in the surface's
 * frame, honouring rotation_deg (counter-clockwise, about the origin); null
 * outside the grid or next to a null node.
 */
export function sampleSurface(row, grid, x, y) {
  const { origin_x: ox, origin_y: oy, dx, dy, nx, ny } = row;
  const rot = (Number(row.rotation_deg) || 0) * Math.PI / 180;
  const ex = x - ox; const ey = y - oy;
  const lx = ex * Math.cos(rot) + ey * Math.sin(rot);
  const ly = -ex * Math.sin(rot) + ey * Math.cos(rot);
  const fx = lx / dx; const fy = ly / dy;
  if (!(fx >= -1e-9 && fy >= -1e-9 && fx <= nx - 1 + 1e-9 && fy <= ny - 1 + 1e-9)) return null;
  const c0 = Math.min(nx - 2, Math.max(0, Math.floor(fx)));
  const r0 = Math.min(ny - 2, Math.max(0, Math.floor(fy)));
  const tx = fx - c0; const ty = fy - r0;
  const z = [grid[r0 * nx + c0], grid[r0 * nx + c0 + 1], grid[(r0 + 1) * nx + c0], grid[(r0 + 1) * nx + c0 + 1]];
  if (z.some((v) => isNull(v, row.null_value))) return null;
  return z[0] * (1 - tx) * (1 - ty) + z[1] * tx * (1 - ty) + z[2] * (1 - tx) * ty + z[3] * tx * ty;
}

/**
 * Where a horizon crosses one well.
 * @param {Object} row geo_surfaces row @param {ArrayLike<number>} grid
 * @param {{name, surface_x, surface_y, crs, xy_unit, kb_m, frame, checkshots}} well section well
 * @returns {{md: number, tvdss: number, twt: ?number} | {problem: string}}
 */
export function horizonAtWell(row, grid, well) {
  const sx = Number(well.surface_x); const sy = Number(well.surface_y);
  if (well.surface_x == null || well.surface_y == null || !Number.isFinite(sx) || !Number.isFinite(sy)) return { problem: 'no surface location' };
  const ws = crsKey(well.crs); const ss = crsKey(row.crs);
  if (ws && ss && ws !== ss) return { problem: `in ${ws}, the horizon is in ${ss}` };
  const wm = metresPer(well.xy_unit); const smm = metresPer(row.xy_unit || well.xy_unit);
  if (!Number.isFinite(wm) || !Number.isFinite(smm)) return { problem: 'geographic coordinates' };
  const kb = Number(well.kb_m) || 0;
  const time = row.z_domain === 'time';
  if (time && !(Array.isArray(well.checkshots) && well.checkshots.length >= 2)) return { problem: 'no checkshots for a time horizon' };
  const zToTvdss = (z) => (time ? tvdssAtTwt(well.checkshots, z) : -z * (row.z_unit === 'ft' ? M_PER_FT : 1));
  const tvdssToMd = (t) => (well.frame ? well.frame.tvdssToMd(t) : (t + kb >= 0 ? { md: t + kb, ambiguous: false } : null));
  let x = sx; let y = sy;
  let hit = null; let tvdss = NaN; let z = null;
  for (let k = 0; k < 12; k++) { // converges as (dip x tan(inclination))^k
    // world position in the surface's unit: wellhead (well unit) + survey offsets (m)
    z = sampleSurface(row, grid, (x * wm) / smm, (y * wm) / smm);
    if (z === null) return { problem: k ? 'the grid does not reach the borehole there' : 'outside the horizon grid' };
    tvdss = zToTvdss(z);
    if (!Number.isFinite(tvdss)) return { problem: 'outside the checkshots' };
    hit = tvdssToMd(tvdss);
    if (!hit || !Number.isFinite(hit.md)) return { problem: 'above the depth reference or outside the survey' };
    if (hit.ambiguous) return { problem: 'the well crosses that depth twice' };
    if (!well.frame || well.frame.isVertical) break;
    let off;
    try { off = well.frame.mdToPosition(hit.md); } catch { break; }
    const nx = sx + off.x / wm; const ny = sy + off.y / wm;
    if (Math.hypot(nx - x, ny - y) * wm < 0.01) break;
    x = nx; y = ny;
  }
  return { md: hit.md, tvdss, twt: time ? z : (Number.isFinite(twtAtTvdss(well.checkshots, tvdss)) ? twtAtTvdss(well.checkshots, tvdss) : null) };
}

/** Marker name of a horizon in the section (never a registry top name). */
export const horizonLabel = (c) => `H: ${c.horizonName}${c.domain === 'time' ? ' (TWT)' : ''}`;
