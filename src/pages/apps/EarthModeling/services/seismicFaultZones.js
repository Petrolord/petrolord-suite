// Seismolord faults as a polygon per zone top (Earth Modeling upgrade
// U2-001, 2026-10-01; findings EM-T1-010 and EM-U1-019). A vertical fault
// polygon puts the same block boundary at every horizon, but a fault dips:
// its trace on a deeper horizon lies further toward the hanging wall. Here
// an interpreted fault surface (Seismolord's lofted rails, each a polyline
// down the fault plane) is cut with each zone top, giving one trace per
// top, and the hanging-wall block of that zone is the model frame on the
// side the fault dips towards.
//
// THE CONTRACT (SEISMIC_FAULTS_HOOK). Seismolord U2-003 built the read-only
// contract src/lib/seismicFaultsReader.js; it was on a branch while this was
// built behind this hook and reached main (#837) before this merged, so the
// registry backend's listSeismicFaults is the reader's listSeismicFaultsForModel.
// normalizeSeismicFault accepts that contract's fault object
//   {id, name, volumeName?, crsStatus?, sticks: [[{x, y, twtMs, depthM}]],
//    surface: [[{x, y, twtMs, depthM}]] (rails), notes?}
// and the shape this app's UPGRADE doc recorded before it
//   {id, name, crs?, z_domain: 'depth', sticks: [[[x, y, z]]]}.
// The harness serves the reader's own fixture plus one in its shape. Depth is required: a time-only fault (no velocity model
// on its volume) is listed with the reason and cannot be added.
// Pure, no I/O.

import { isNull } from '@/lib/gridding/gridmath';
import { pointInPolygon, validatePolygon } from '../engine/blocks';

export const SEISMIC_FAULTS_HOOK = Object.freeze({
  contract: 'src/lib/seismicFaultsReader.js (Seismolord U2-003, branch feat/seis-u2)',
  method: 'listSeismicFaults',
  reason: 'This backend cannot read Seismolord faults. Use fault polygons from Mapping & Surface Studio or draw them.',
});

/**
 * A fault in the contract's shape as rails of depth points.
 * @returns {{ok: true, id, name, crs, volumeName, rails: Array<Array<{x, y, d}>>, notes: string[]} | {ok: false, id, name, reason}}
 */
export function normalizeSeismicFault(f) {
  const id = f?.id ?? null; const name = f?.name || 'Seismolord fault';
  const pt = (p) => (Array.isArray(p) ? { x: Number(p[0]), y: Number(p[1]), d: f.z_domain === 'time' ? NaN : Number(p[2]) } : { x: Number(p?.x), y: Number(p?.y), d: Number(p?.depthM ?? NaN) });
  const lines = (Array.isArray(f?.surface) && f.surface.length >= 2 ? f.surface : f?.sticks) || [];
  const rails = lines.map((l) => (Array.isArray(l) ? l : l?.points || []).map(pt).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)))
    .filter((l) => l.length >= 2);
  if (rails.length < 2) return { ok: false, id, name, reason: 'it needs two or more sticks to make a fault surface' };
  if (rails.some((l) => l.some((p) => !Number.isFinite(p.d)))) return { ok: false, id, name, reason: 'its volume has no velocity model, so the fault has no depth (time only)' };
  return { ok: true, id, name, crs: f.crs || null, volumeName: f.volumeName || null, rails, notes: f.notes || [] };
}

/** Bilinear depth of a grid at (x, y) on an unrotated spec; NaN outside or on a null. */
export function sampleGrid(grid, spec, x, y, { extrapolate = 0 } = {}) {
  const fc = (x - spec.x0) / spec.dx; const fr = (y - spec.y0) / spec.dy;
  // `extrapolate` nodes past the edge continue the edge cell's plane (a rail
  // just outside the model frame still finds the horizon)
  const e = extrapolate;
  if (fc < -e || fr < -e || fc > spec.nx - 1 + e || fr > spec.ny - 1 + e) return NaN;
  const c0 = Math.max(0, Math.min(spec.nx - 2, Math.floor(fc))); const r0 = Math.max(0, Math.min(spec.ny - 2, Math.floor(fr)));
  const tx = fc - c0; const ty = fr - r0;
  const at = (r, c) => grid[r * spec.nx + c];
  const v = [at(r0, c0), at(r0, c0 + 1), at(r0 + 1, c0), at(r0 + 1, c0 + 1)];
  if (v.some((z) => isNull(z))) return NaN;
  return (v[0] * (1 - tx) + v[1] * tx) * (1 - ty) + (v[2] * (1 - tx) + v[3] * tx) * ty;
}

/**
 * The fault's trace on a horizon: where each rail passes through the
 * horizon (depth positive down, metres; rails and spec in the same frame).
 * @returns {{trace: Array<{x, y}>, dip: ?{x, y}}} dip: horizontal direction down the fault
 */
export function faultTraceOnSurface(rails, grid, spec) {
  const trace = [];
  // rails up to a quarter of the frame outside it still count
  const ext = Math.ceil(0.25 * Math.max(spec.nx, spec.ny));
  let dx = 0; let dy = 0;
  for (const rail of rails) {
    const pts = [...rail].sort((a, b) => a.d - b.d);
    dx += pts[pts.length - 1].x - pts[0].x; dy += pts[pts.length - 1].y - pts[0].y;
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k]; const b = pts[k + 1];
      const ha = a.d - sampleGrid(grid, spec, a.x, a.y, { extrapolate: ext });
      const hb = b.d - sampleGrid(grid, spec, b.x, b.y, { extrapolate: ext });
      if (!Number.isFinite(ha) || !Number.isFinite(hb)) continue;
      if (ha === 0) { trace.push({ x: a.x, y: a.y }); break; }
      if ((ha < 0) !== (hb < 0) || hb === 0) {
        // refine on the segment by bisection (the horizon need not be planar)
        let lo = 0; let hi = 1; let flo = ha;
        for (let it = 0; it < 40; it++) {
          const m = (lo + hi) / 2;
          const x = a.x + m * (b.x - a.x); const y = a.y + m * (b.y - a.y); const d = a.d + m * (b.d - a.d);
          const fm = d - sampleGrid(grid, spec, x, y, { extrapolate: ext });
          if (!Number.isFinite(fm)) break;
          if ((fm < 0) === (flo < 0)) { lo = m; flo = fm; } else hi = m;
        }
        const m = (lo + hi) / 2;
        trace.push({ x: a.x + m * (b.x - a.x), y: a.y + m * (b.y - a.y) });
        break;
      }
    }
  }
  const len = Math.hypot(dx, dy);
  return { trace, dip: len > 0 ? { x: dx / len, y: dy / len } : null };
}

function rayExit(p, dir, r) {
  let best = Infinity;
  if (dir.x > 1e-12) best = Math.min(best, (r.x1 - p.x) / dir.x);
  if (dir.x < -1e-12) best = Math.min(best, (r.x0 - p.x) / dir.x);
  if (dir.y > 1e-12) best = Math.min(best, (r.y1 - p.y) / dir.y);
  if (dir.y < -1e-12) best = Math.min(best, (r.y0 - p.y) / dir.y);
  return Number.isFinite(best) && best >= 0 ? { x: p.x + best * dir.x, y: p.y + best * dir.y } : null;
}
const perim = (p, r) => {
  const e = 1e-6 * Math.max(r.x1 - r.x0, r.y1 - r.y0);
  if (Math.abs(p.y - r.y0) <= e) return (p.x - r.x0) / (r.x1 - r.x0);
  if (Math.abs(p.x - r.x1) <= e) return 1 + (p.y - r.y0) / (r.y1 - r.y0);
  if (Math.abs(p.y - r.y1) <= e) return 2 + (r.x1 - p.x) / (r.x1 - r.x0);
  return 3 + (r.y1 - p.y) / (r.y1 - r.y0);
};

/**
 * The frame on one side of a trace as a closed polygon: the side containing
 * `towards`. The trace is extended straight to the frame at both ends.
 * @returns {{polygon?: number[][], error?: string}}
 */
export function sidePolygon(trace, rect, towards) {
  if (!trace || trace.length < 2) return { error: 'the fault does not cross the model frame at this horizon' };
  // extend both ends far past the frame, then keep the part inside it
  const far = 10 * Math.max(rect.x1 - rect.x0, rect.y1 - rect.y0);
  const n0 = trace.length;
  const ext = (p, q) => { const L = Math.hypot(p.x - q.x, p.y - q.y) || 1; return { x: p.x + ((p.x - q.x) / L) * far, y: p.y + ((p.y - q.y) / L) * far }; };
  const poly = [ext(trace[0], trace[1]), ...trace, ext(trace[n0 - 1], trace[n0 - 2])];
  const line = [];
  for (let k = 0; k + 1 < poly.length; k++) {
    const a = poly[k]; const b = poly[k + 1];
    // Liang-Barsky clip of segment a-b to the rect
    let t0 = 0; let t1 = 1;
    const dx = b.x - a.x; const dy = b.y - a.y;
    const clip = (pp, qq) => {
      if (pp === 0) return qq >= 0;
      const t = qq / pp;
      if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
      return true;
    };
    if (!(clip(-dx, a.x - rect.x0) && clip(dx, rect.x1 - a.x) && clip(-dy, a.y - rect.y0) && clip(dy, rect.y1 - a.y))) continue;
    const p0 = { x: a.x + t0 * dx, y: a.y + t0 * dy }; const p1 = { x: a.x + t1 * dx, y: a.y + t1 * dy };
    if (!line.length || Math.hypot(line[line.length - 1].x - p0.x, line[line.length - 1].y - p0.y) > 1e-9) line.push(p0);
    line.push(p1);
  }
  if (line.length < 2) return { error: 'the fault does not cross the model frame at this horizon' };
  const start = line[0]; const end = line[line.length - 1];
  const corners = [[rect.x0, rect.y0, 0], [rect.x1, rect.y0, 1], [rect.x1, rect.y1, 2], [rect.x0, rect.y1, 3]];
  const walk = (ccw) => {
    const s0 = perim(end, rect); const s1 = perim(start, rect);
    const span = ccw ? ((s1 - s0 + 4) % 4) : ((s0 - s1 + 4) % 4);
    const cs = corners.map(([cx, cy, k]) => ({ cx, cy, d: ccw ? ((k - s0 + 4) % 4) : ((s0 - k + 4) % 4) }))
      .filter((c) => c.d > 1e-12 && c.d < span).sort((u, v) => u.d - v.d).map((c) => [c.cx, c.cy]);
    return [...line.map((p) => [p.x, p.y]), ...cs];
  };
  const a = walk(true); const b = walk(false);
  const inA = pointInPolygon(towards.x, towards.y, a);
  if (inA === pointInPolygon(towards.x, towards.y, b)) return { error: 'the hanging-wall side could not be placed in the model frame' };
  return { polygon: inA ? a : b };
}

/**
 * The hanging-wall block of a fault at one horizon.
 * @param {Array<Array<{x, y, d}>>} rails in the frame's units (x, y) and metres (d)
 * @param {ArrayLike<number>} grid horizon depth, metres positive down
 * @param {{x0, y0, dx, dy, nx, ny}} spec
 * @returns {{polygon?: number[][], trace?: Array<{x, y}>, error?: string}}
 */
export function hangingWallAtSurface(rails, grid, spec) {
  const { trace, dip } = faultTraceOnSurface(rails, grid, spec);
  if (trace.length < 2) return { error: 'the fault surface does not reach this horizon inside the model frame' };
  if (!dip) return { error: 'the fault dip direction is unknown' };
  const span = Math.max((spec.nx - 1) * spec.dx, (spec.ny - 1) * spec.dy);
  const pad = 0.01 * span;
  const rect = { x0: spec.x0 - pad, y0: spec.y0 - pad, x1: spec.x0 + (spec.nx - 1) * spec.dx + pad, y1: spec.y0 + (spec.ny - 1) * spec.dy + pad };
  const mid = trace[Math.floor(trace.length / 2)];
  const towards = { x: mid.x + dip.x * 0.05 * span, y: mid.y + dip.y * 0.05 * span };
  const r = sidePolygon(trace, rect, towards);
  if (r.error) return r;
  validatePolygon(r.polygon);
  return { polygon: r.polygon, trace };
}
