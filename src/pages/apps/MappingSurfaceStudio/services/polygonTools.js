// Fault-block and boundary polygons for the map (Mapping MS3,
// 2026-09-05). Polygons live in the shared geo_culture registry
// (owner decision: kinds `fault_polygon` and `boundary`, polygon
// geometry in the map's frame) so Earth Modeling and Seismolord can
// read them later. Gridding treats a fault polygon the Earth Modeling
// way: the surface is gridded independently inside and outside each
// polygon (a block), so a throw shows as a step at the polygon edge; a
// boundary nulls every node outside it. Pure helpers, no I/O.

import { labelBlocks, pointInPolygon, validatePolygon } from '@/pages/apps/EarthModeling/engine/blocks';

export const POLYGON_KINDS = Object.freeze({ fault: 'fault_polygon', boundary: 'boundary' });
export const POLYGON_STYLE = Object.freeze({
  fault_polygon: { color: '#eab308', weight: 1.5 },
  boundary: { color: '#22d3ee', weight: 1.5 },
});

/** A culture row that the map treats as a drawn polygon. */
export const isPolygonLayer = (row) => row?.kind === POLYGON_KINDS.fault || row?.kind === POLYGON_KINDS.boundary;

/** First ring of a normalized polygon feature as [x, y] pairs (open). */
export function ringOf(feature) {
  const ring = feature?.rings?.[0] || feature?.vertices || [];
  const pts = ring.map((v) => (Array.isArray(v) ? [v[0], v[1]] : [v.x, v.y]));
  if (pts.length > 1) {
    const [a, b] = [pts[0], pts[pts.length - 1]];
    if (a[0] === b[0] && a[1] === b[1]) pts.pop();
  }
  return pts;
}

/** Bounding box of [x, y] vertices. */
export function bboxOf(vertices) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const [x, y] of vertices) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

/**
 * The geo_culture payload for a polygon drawn on the map: validated
 * (>= 3 finite vertices, non-degenerate, no self-intersection), the
 * ring closed, the style by kind, the frame the map was in.
 */
export function polygonPayload({ name, kind, vertices, crs = null, xyUnit = null, drawnOn = null }) {
  if (!Object.values(POLYGON_KINDS).includes(kind)) throw new Error(`Unknown polygon kind "${kind}".`);
  const label = String(name || '').trim();
  if (!label) throw new Error('Give the polygon a name.');
  const pts = validatePolygon(vertices).map(([x, y]) => [x, y]);
  const ring = [...pts, pts[0]];
  return {
    name: label,
    kind,
    geometryType: 'polygon',
    features: [{ type: 'polygon', rings: [ring], props: { NAME: label, KIND: kind }, label }],
    style: { ...POLYGON_STYLE[kind] },
    crs,
    xyUnit,
    bbox: bboxOf(pts),
    provenance: { engine: 'mapping-surface-studio', drawn: true, drawn_on: drawnOn, vertices: pts.length, drawn_at: new Date().toISOString() },
  };
}

/**
 * Block ids for the control points against fault polygons (1 + index of
 * the first containing polygon, 0 outside all: the labelBlocks rule).
 */
export function blocksForPoints(points, rings) {
  const polys = rings.map(validatePolygon);
  return points.map((p) => {
    let block = 0;
    for (let i = 0; i < polys.length; i++) {
      if (pointInPolygon(p.x, p.y, polys[i])) { block = i + 1; break; }
    }
    return { ...p, block };
  });
}

/** Per-node block ids on a grid spec (the gridSurfaceBlocked input). */
export function nodeBlocksFor(spec, rings) {
  return labelBlocks(spec, rings);
}
