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
import { refElevOrNull } from '@/lib/wellDatum';

export const SURFACE_COLORS = ['#4ade80', '#60a5fa', '#facc15', '#f472b6', '#c084fc', '#f87171'];

/** Depth range across every live node of the stack. */
export function stackRange(clamped) {
  let zMin = Infinity; let zMax = -Infinity;
  for (const z of clamped) for (const v of z) { if (isNull(v)) continue; if (v < zMin) zMin = v; if (v > zMax) zMax = v; }
  if (!Number.isFinite(zMin)) return null;
  if (zMax - zMin < 1) zMax = zMin + 1;
  return { zMin, zMax };
}

/** Min and max of a property over every zone (live nodes), or null. */
export function propertyRange(built, prop) {
  let lo = Infinity; let hi = -Infinity;
  for (const z of built.zones || []) for (const v of z.props?.[prop] || []) { if (isNull(v) || !Number.isFinite(v)) continue; if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!Number.isFinite(lo)) return null;
  if (hi - lo < 1e-9) hi = lo + 1e-9;
  return { lo, hi };
}

/** The property ramp (the structure ramp, low blue to high red) as [r, g, b] in 0..1. */
export function propertyColor(v, range) {
  const f = Math.min(1, Math.max(0, (v - range.lo) / (range.hi - range.lo)));
  const i = Math.min(255, Math.floor(f * 256)) * 4;
  return [STRUCTURE_LUT[i] / 255, STRUCTURE_LUT[i + 1] / 255, STRUCTURE_LUT[i + 2] / 255];
}

/**
 * A fence section in 3D (U2-018): vertical panels along a polyline (map
 * coordinates of the model frame), one band per zone from its top to its
 * base, coloured by the zone's property (or the zone's flat colour).
 * Samples every cell along the line (at most `maxSamples`).
 * @returns {{positions: Float32Array, colors: Float32Array, indices: Uint32Array, quads: number, samples: Array<{x, y}>}}
 */
export function fenceMesh(built, vertices, { prop = null, range = null, toModel, maxSamples = 600 } = {}) {
  const { spec, clamped } = built;
  if (!vertices || vertices.length < 2) return null;
  const step = Math.min(Math.abs(spec.dx), Math.abs(spec.dy));
  const samples = [];
  for (let k = 0; k + 1 < vertices.length; k++) {
    const [x1, y1] = vertices[k]; const [x2, y2] = vertices[k + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / step));
    for (let q = (k === 0 ? 0 : 1); q <= n; q++) samples.push({ x: x1 + ((x2 - x1) * q) / n, y: y1 + ((y2 - y1) * q) / n });
  }
  const pick = samples.length > maxSamples ? samples.filter((_, i) => i % Math.ceil(samples.length / maxSamples) === 0 || i === samples.length - 1) : samples;
  const positions = []; const colors = []; const indices = [];
  let quads = 0;
  for (let z = 0; z + 1 < clamped.length; z++) {
    const flat = hexToRgb(SURFACE_COLORS[z % SURFACE_COLORS.length]);
    const pg = prop ? built.zones[z]?.props?.[prop] : null;
    const col = (x, y) => {
      if (!pg || !range) return flat;
      const v = sampleAtXY(pg, spec, x, y);
      return isNull(v) || !Number.isFinite(v) ? [0.35, 0.35, 0.4] : propertyColor(v, range);
    };
    let prev = null;
    for (const p of pick) {
      const dt = sampleAtXY(clamped[z], spec, p.x, p.y);
      const db = sampleAtXY(clamped[z + 1], spec, p.x, p.y);
      if (isNull(dt) || isNull(db) || !Number.isFinite(dt) || !Number.isFinite(db)) { prev = null; continue; }
      const c = col(p.x, p.y);
      const base = positions.length / 3;
      positions.push(...toModel(p.x, p.y, dt), ...toModel(p.x, p.y, db));
      colors.push(...c, ...c);
      if (prev !== null) { indices.push(prev, prev + 1, base, base, prev + 1, base + 1); quads += 1; }
      prev = base;
    }
  }
  return { positions: Float32Array.from(positions), colors: Float32Array.from(colors), indices: Uint32Array.from(indices), quads, samples: pick };
}

/**
 * @param {object} built the built model ({spec, clamped, labels})
 * @param {object[]} wells registry wells (surface_x/y, kb_m, deviation, tops)
 * @param {{ve?:number, surfaceNames?:string[], visible?:boolean[], faultPolygons?:Array,
 *          depthUnit?:string, colorBy?:'depth'|'surface'}} opts
 */
export function buildFrameworkScene(built, wells, opts = {}) {
  const { ve = 2, surfaceNames = [], visible = null, faultPolygons = [], depthUnit = 'm', colorBy = 'depth', property = 'phi', fence = null } = opts;
  const { spec, clamped } = built;
  // EM-U1-001: metres per map unit, so VE compares metres with metres and
  // survey offsets (metres) land right on a feet frame
  const k = Number.isFinite(built.xyToM) && built.xyToM > 0 ? built.xyToM : 1;
  const extX = (spec.nx - 1) * spec.dx;
  const extY = (spec.ny - 1) * spec.dy;
  const L = Math.max(extX, extY) || 1;
  const range = stackRange(clamped);
  if (!range) throw new Error('The framework has no live nodes to draw.');
  const { zMin, zMax } = range;
  const zRange = zMax - zMin;
  const ext = { X: extX / L, D: Math.max(1e-3, ve) * (zRange / (L * k)), Z: extY / L };
  const nx = (x) => (x - spec.x0) / L;
  const nz = (y) => (y - spec.y0) / L;
  const ny = (d) => -(d - zMin) / zRange;
  const lutColor = (d) => {
    // shallow warm, deep cool: the structure ramp reversed by depth
    const f = 1 - Math.min(1, Math.max(0, (d - zMin) / zRange));
    const i = Math.min(255, Math.floor(f * 256)) * 4;
    return [STRUCTURE_LUT[i] / 255, STRUCTURE_LUT[i + 1] / 255, STRUCTURE_LUT[i + 2] / 255];
  };

  // U2-018: a surface coloured by a property shows the zone below it (the
  // last surface shows the deepest zone)
  const pRange = colorBy === 'property' ? propertyRange(built, property) : null;
  const surfaces = clamped.map((z, s) => {
    if (visible && visible[s] === false) return null;
    const flat = hexToRgb(SURFACE_COLORS[s % SURFACE_COLORS.length]);
    const pg = pRange ? built.zones[Math.min(s, built.zones.length - 1)]?.props?.[property] : null;
    const colorOf = (r, c, v) => {
      if (colorBy === 'surface') return flat;
      if (pg) { const pv = pg[r * spec.nx + c]; return isNull(pv) || !Number.isFinite(pv) ? [0.35, 0.35, 0.4] : propertyColor(pv, pRange); }
      return lutColor(v);
    };
    const mesh = gridMesh(z, spec.ny, spec.nx, (r, c, v) => {
      if (isNull(v)) return null;
      const w = gridXY(spec, r, c);
      return [nx(w.x), ny(v), nz(w.y)];
    }, { maxDim: 400, colorOf });
    return { id: `surface-${s}`, name: surfaceNames[s] || `Surface ${s + 1}`, color: SURFACE_COLORS[s % SURFACE_COLORS.length], ...mesh };
  }).filter(Boolean);

  const wellSets = []; const topMarkers = []; const labels = [];
  const margin = 0.15 * zRange;
  for (const w of wells || []) {
    if (!Number.isFinite(w.surface_x) || !Number.isFinite(w.surface_y)) continue;
    // a well with no reference elevation has no subsea path to draw (the build notes name it)
    const refElev = refElevOrNull(w);
    if (refElev === null) continue;
    const traj = minCurvature(w.deviation || [], refElev, w.surface_x * k, w.surface_y * k)
      .map((st) => ({ ...st, x: st.x / k, y: st.y / k }));
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
    // Seismolord U2-003: the interpreter's sticks in depth, when the volume had a velocity model
    for (const st of p.sticks3d || []) {
      for (let i = 0; i + 1 < st.length; i++) {
        faultSoup.push(nx(st[i][0]), ny(st[i][2]), nz(st[i][1]), nx(st[i + 1][0]), ny(st[i + 1][2]), nz(st[i + 1][1]));
      }
    }
    // U2-001: a Seismolord fault's rails down its surface, in depth
    for (const rail of p.rails || []) {
      for (let i = 0; i + 1 < rail.length; i++) {
        const [x1, y1, d1] = rail[i]; const [x2, y2, d2] = rail[i + 1];
        faultSoup.push(nx(x1), ny(d1), nz(y1), nx(x2), ny(d2), nz(y2));
      }
    }
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

  // U2-018: the fence along the section line
  const fenceM = fence && fence.length >= 2
    ? fenceMesh(built, fence, { prop: colorBy === 'property' ? property : null, range: pRange, toModel: (x, y, d) => [nx(x), ny(d), nz(y)] })
    : null;

  return {
    ext, zMin, zMax, ve, surfaces, fence: fenceM, propertyRange: pRange,
    wells: wellSets,
    tops: Float32Array.from(topMarkers),
    faults: Float32Array.from(faultSoup),
    axes: { edges, ticks },
    labels,
  };
}
