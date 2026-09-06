// The framework as a 3D scene (Earth Modeling EM6, 2026-09-06): the
// clamped surfaces as depth-coloured meshes, wells as polylines with top
// crosses, fault polygons draped on the top surface, cube edges and
// axis ticks. Normalized model space (the shared viewer3d convention):
// x = (X - x0) / L, z = (Y - y0) / L, y = -(depth - zMin) / zRange, so the
// renderer's u_scale = (extX / L, ve * zRange / L, extY / L) turns the
// vertical exaggeration into a uniform update. Pure, no WebGL.

import { gridMesh, hexToRgb } from '@/components/viewer3d/gridMesh';
import { cubeEdges, niceTicks } from '@/components/viewer3d/math3d';
import { STRUCTURE_LUT } from '@/components/maps/lut';
import { isNull, sampleAtXY, gridXY } from '@/lib/gridding/gridmath';
import { minCurvature } from '../engine/wellties';

export const SURFACE_COLORS = ['#4ade80', '#60a5fa', '#facc15', '#f472b6', '#c084fc', '#f87171'];

/** Depth range across every live node of the stack. */
export function stackRange(clamped) {
  let zMin = Infinity; let zMax = -Infinity;
  for (const z of clamped) for (const v of z) { if (isNull(v)) continue; if (v < zMin) zMin = v; if (v > zMax) zMax = v; }
  if (!Number.isFinite(zMin)) return null;
  if (zMax - zMin < 1) zMax = zMin + 1;
  return { zMin, zMax };
}

/**
 * @param {object} built the built model ({spec, clamped, labels})
 * @param {object[]} wells registry wells (surface_x/y, kb_m, deviation, tops)
 * @param {{ve?:number, surfaceNames?:string[], visible?:boolean[], faultPolygons?:Array,
 *          depthUnit?:string, colorBy?:'depth'|'surface'}} opts
 */
export function buildFrameworkScene(built, wells, opts = {}) {
  const { ve = 2, surfaceNames = [], visible = null, faultPolygons = [], depthUnit = 'm', colorBy = 'depth' } = opts;
  const { spec, clamped } = built;
  const extX = (spec.nx - 1) * spec.dx;
  const extY = (spec.ny - 1) * spec.dy;
  const L = Math.max(extX, extY) || 1;
  const range = stackRange(clamped);
  if (!range) throw new Error('The framework has no live nodes to draw.');
  const { zMin, zMax } = range;
  const zRange = zMax - zMin;
  const ext = { X: extX / L, D: Math.max(1e-3, ve) * (zRange / L), Z: extY / L };
  const nx = (x) => (x - spec.x0) / L;
  const nz = (y) => (y - spec.y0) / L;
  const ny = (d) => -(d - zMin) / zRange;
  const lutColor = (d) => {
    // shallow warm, deep cool: the structure ramp reversed by depth
    const f = 1 - Math.min(1, Math.max(0, (d - zMin) / zRange));
    const i = Math.min(255, Math.floor(f * 256)) * 4;
    return [STRUCTURE_LUT[i] / 255, STRUCTURE_LUT[i + 1] / 255, STRUCTURE_LUT[i + 2] / 255];
  };

  const surfaces = clamped.map((z, s) => {
    if (visible && visible[s] === false) return null;
    const flat = hexToRgb(SURFACE_COLORS[s % SURFACE_COLORS.length]);
    const mesh = gridMesh(z, spec.ny, spec.nx, (r, c, v) => {
      if (isNull(v)) return null;
      const w = gridXY(spec, r, c);
      return [nx(w.x), ny(v), nz(w.y)];
    }, { maxDim: 400, colorOf: (r, c, v) => (colorBy === 'surface' ? flat : lutColor(v)) });
    return { id: `surface-${s}`, name: surfaceNames[s] || `Surface ${s + 1}`, color: SURFACE_COLORS[s % SURFACE_COLORS.length], ...mesh };
  }).filter(Boolean);

  const wellSets = []; const topMarkers = []; const labels = [];
  const margin = 0.15 * zRange;
  for (const w of wells || []) {
    if (!Number.isFinite(w.surface_x) || !Number.isFinite(w.surface_y)) continue;
    const traj = minCurvature(w.deviation || [], w.kb_m || 0, w.surface_x, w.surface_y);
    const pts = [];
    for (const st of traj) {
      if (st.tvdss < zMin - margin || st.tvdss > zMax + margin) continue;
      pts.push([nx(st.x), ny(st.tvdss), nz(st.y)]);
    }
    // the top-of-window entry and the deepest station keep a stick visible
    if (traj.length) {
      const first = traj[0]; const last = traj[traj.length - 1];
      if (first.tvdss < zMin - margin) pts.unshift([nx(first.x), ny(zMin - margin), nz(first.y)]);
      if (last.tvdss > zMax + margin) pts.push([nx(last.x), ny(zMax + margin), nz(last.y)]);
    }
    const soup = [];
    for (let i = 0; i + 1 < pts.length; i++) soup.push(...pts[i], ...pts[i + 1]);
    if (soup.length) wellSets.push({ id: `well-${w.id}`, name: w.name, positions: Float32Array.from(soup), color: [0.9, 0.93, 0.96] });
    if (pts.length) labels.push({ kind: 'well', text: w.name, pos: pts[0], color: '#e2e8f0' });
    for (const t of w.tops || []) {
      const idx = traj.findIndex((st) => st.md >= t.md_m);
      const st = idx <= 0 ? traj[0] : traj[idx];
      const prev = idx <= 0 ? traj[0] : traj[idx - 1];
      const f = idx <= 0 || st.md === prev.md ? 0 : (t.md_m - prev.md) / (st.md - prev.md);
      const px = prev.x + f * (st.x - prev.x); const py = prev.y + f * (st.y - prev.y); const pz = prev.tvdss + f * (st.tvdss - prev.tvdss);
      if (pz < zMin - margin || pz > zMax + margin) continue;
      const h = 0.01;
      const [x, y, z] = [nx(px), ny(pz), nz(py)];
      topMarkers.push(x - h, y, z, x + h, y, z, x, y - h, z, x, y + h, z, x, y, z - h, x, y, z + h);
    }
  }

  // fault polygons draped on the top surface (line loops)
  const faultSoup = [];
  const top = clamped[0];
  for (const p of faultPolygons || []) {
    const verts = (p.vertices || []).map((v) => (Array.isArray(v) ? v : [v.x, v.y]));
    if (verts.length < 3) continue;
    const ring = verts.map(([x, y]) => {
      const d = sampleAtXY(top, spec, x, y);
      return [nx(x), ny(isNull(d) ? zMin : d), nz(y)];
    });
    for (let i = 0; i < ring.length; i++) faultSoup.push(...ring[i], ...ring[(i + 1) % ring.length]);
  }

  // cube edges in ext space (unscaled) and ticks along three edges
  const edges = cubeEdges(ext);
  const toDisp = (m) => (depthUnit === 'ft' ? m / 0.3048 : m);
  const ticks = [];
  for (const t of niceTicks(spec.x0, spec.x0 + extX, 5)) ticks.push({ text: t.toFixed(0), pos: [nx(t) * ext.X, 0, 0], axis: 'x' });
  for (const t of niceTicks(spec.y0, spec.y0 + extY, 5)) ticks.push({ text: t.toFixed(0), pos: [0, 0, nz(t) * ext.Z], axis: 'y' });
  for (const t of niceTicks(toDisp(zMin), toDisp(zMax), 5)) {
    const m = depthUnit === 'ft' ? t * 0.3048 : t;
    ticks.push({ text: `${t.toFixed(0)} ${depthUnit}`, pos: [0, ny(m) * ext.D, 0], axis: 'z' });
  }

  return {
    ext, zMin, zMax, ve, surfaces,
    wells: wellSets,
    tops: Float32Array.from(topMarkers),
    faults: Float32Array.from(faultSoup),
    axes: { edges, ticks },
    labels,
  };
}
