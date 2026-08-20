// Fault-object deliverables (W3.1), pure and jest-tested: the stored
// lofted surface as world XYZ text, the horizon-intersection polygon +
// throw map as CSV, and the export-grid node mask that lets gridding
// null the fault gap (the heave polygon, wider than the one-cell
// barrier whenever the fault dips).
//
// World conversion is the survey affine (lattice indices in, map
// coordinates out); vertical is TWT ms with the suite's negative-down
// export sign (zSign 'positive' flips for Petrel-bound files).

import {
  loftFaultSurface, faultHorizonIntersection, polygonMask, surfaceLevelTrace,
} from '../engine/faultObjects';
import { rasterizeTraces } from '../engine/faultBarriers';
import { ilxlToWorld, worldToIlxl } from '../engine/surveyGeometry';

const fmt = (v) => (Number.isFinite(v) ? v.toFixed(2) : '');

/** The fault's persisted surface, lofting on the fly when the row
 *  predates persistence (or sticks changed shape). */
export function faultSurfaceOf(fault, opts = {}) {
  if (fault?.surface?.rails?.length >= 2) return fault.surface;
  return loftFaultSurface(fault?.sticks || [], opts);
}

/**
 * Lofted fault surface -> XYZ text (x y z rows, rail by rail).
 * @param {Object} fault seismic_faults row
 * @param {Object} affine survey affine
 * @param {number} dtMs sample interval ms
 * @param {'negative'|'positive'} [zSign]
 * @returns {{text: string, points: number}|null} null without a surface
 */
export function faultSurfaceXyz(fault, affine, dtMs, zSign = 'negative') {
  const surf = faultSurfaceOf(fault);
  if (!surf) return null;
  const sign = zSign === 'positive' ? 1 : -1;
  const lines = [];
  for (const rail of surf.rails) {
    for (const [il, xl, s] of rail) {
      const w = ilxlToWorld(affine, il, xl);
      lines.push(`${fmt(w.x)} ${fmt(w.y)} ${fmt(sign * s * dtMs)}`);
    }
  }
  return { text: `${lines.join('\n')}\n`, points: lines.length };
}

/**
 * Horizon-intersection deliverable: cutoff walls + per-stick throw/heave
 * as CSV. Throw is reported in ms (throwSamples x dtMs); heave in map
 * units from the world-space distance between the paired cutoffs.
 *
 * @param {Object} p
 * @param {Object} p.intersection faultHorizonIntersection result
 * @param {Object} p.affine @param {number} p.dtMs
 * @param {string} p.faultName @param {string} p.horizonName
 * @returns {{text: string, segments: number}}
 */
export function faultPolygonCsv({
  intersection, affine, dtMs, faultName, horizonName,
}) {
  const rows = [
    `# fault polygon: ${faultName} vs ${horizonName}`,
    'section,wall,index,il,xl,x,y,twt_ms',
  ];
  const wall = (name, pts) => {
    pts.forEach((q, k) => {
      const w = ilxlToWorld(affine, q.il, q.xl);
      rows.push(`cutoff,${name},${k},${fmt(q.il)},${fmt(q.xl)},${fmt(w.x)},${fmt(w.y)},${fmt(q.s * dtMs)}`);
    });
  };
  wall('footwall', intersection.cutNeg);
  wall('hangingwall', intersection.cutPos);
  rows.push('section,index,il,xl,x,y,throw_ms,heave_m');
  intersection.segments.forEach((seg, k) => {
    const w = ilxlToWorld(affine, seg.i, seg.j);
    const a = intersection.cutNeg[k];
    const b = intersection.cutPos[k];
    const wa = ilxlToWorld(affine, a.il, a.xl);
    const wb = ilxlToWorld(affine, b.il, b.xl);
    const heaveM = Math.hypot(wb.x - wa.x, wb.y - wa.y);
    rows.push(`throw,${k},${fmt(seg.i)},${fmt(seg.j)},${fmt(w.x)},${fmt(w.y)},${fmt(seg.throwSamples * dtMs)},${fmt(heaveM)}`);
  });
  return { text: `${rows.join('\n')}\n`, segments: intersection.segments.length };
}

/**
 * Fault-gap polygons for a horizon: one ring per visible fault that
 * yields a polygon. The map layer and the gridding clip share this.
 * @returns {Array<{fault: Object, intersection: Object}>}
 */
export function faultIntersections(faults, picks, geom, opts = {}) {
  const out = [];
  for (const f of faults || []) {
    const x = faultHorizonIntersection(f, picks, geom, opts);
    if (x) out.push({ fault: f, intersection: x });
  }
  return out;
}

/**
 * Fault-aware tracking barriers (W3.2): each fault's surface trace at
 * the seed's time level, rasterized onto the lattice. Works BEFORE any
 * horizon exists — the surface knows where the fault lives at that
 * level. Faults whose surface does not reach the level contribute
 * nothing (they cannot block a horizon they do not cut).
 *
 * @param {Array<{sticks, surface?}>} faults
 * @param {number} sampleLevel seed sample (float)
 * @param {{nIl:number, nXl:number}} geom
 * @returns {Uint8Array|null} barrier mask, null when no fault reaches
 */
export function barriersFromFaults(faults, sampleLevel, geom) {
  const traces = [];
  for (const f of faults || []) {
    const surf = faultSurfaceOf(f);
    const trace = surf && surfaceLevelTrace(surf, sampleLevel);
    if (trace) traces.push(trace);
  }
  if (!traces.length) return null;
  return rasterizeTraces(traces, geom.nIl, geom.nXl);
}

/**
 * Export-grid node mask from lattice-space polygon rings: a node is
 * masked when its lattice cell falls inside a ring (same inverse-affine
 * node walk the fault-block labels use).
 *
 * @param {Array<Array<{il,xl}>>} rings
 * @param {{nIl:number, nXl:number}} geom
 * @param {Object} affine @param {{x0,y0,dx,dy,nx,ny}} spec
 * @returns {Uint8Array|null} spec.nx x spec.ny, 1 = null this node;
 *   null when there is nothing to mask
 */
export function maskGridNodesByRings(rings, geom, affine, spec) {
  if (!rings || !rings.length) return null;
  const mask = polygonMask(rings, geom.nIl, geom.nXl);
  let any = false;
  const nodes = new Uint8Array(spec.nx * spec.ny);
  for (let r = 0; r < spec.ny; r++) {
    for (let c = 0; c < spec.nx; c++) {
      const g = worldToIlxl(affine, spec.x0 + c * spec.dx, spec.y0 + r * spec.dy);
      if (!g) continue;
      const ci = Math.round(g.i);
      const cj = Math.round(g.j);
      if (ci < 0 || ci >= geom.nIl || cj < 0 || cj >= geom.nXl) continue;
      if (mask[ci * geom.nXl + cj]) { nodes[r * spec.nx + c] = 1; any = true; }
    }
  }
  return any ? nodes : null;
}
