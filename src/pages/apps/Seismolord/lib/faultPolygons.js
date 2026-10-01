// Fault polygons in the 3D window and as GeoJSON (upgrade U2-007). The
// polygon is the W3.1 fault/horizon intersection: the footwall cutoffs,
// then the hanging-wall cutoffs back, closed; every vertex keeps its own
// cutoff time, so in 3D the loop sits on the horizon on both sides of the
// fault gap. Pure.

import { faultPolylines } from '../viewer/interpMesh';
import { ilxlToWorld } from '../engine/surveyGeometry';

/**
 * The closed polygon as lattice points with time (cutoff walls).
 * @param {{cutNeg: {il, xl, s}[], cutPos: {il, xl, s}[]}} intersection
 * @returns {?{il, xl, s}[]} closed (first point repeated), null when fewer than two cutoffs
 */
export function polygonLoop(intersection) {
  const a = intersection?.cutNeg || [];
  const b = intersection?.cutPos || [];
  if (a.length < 2 || b.length < 2) return null;
  const ring = [...a, ...[...b].reverse()].map((p) => ({ il: p.il, xl: p.xl, s: p.s }));
  return [...ring, ring[0]];
}

/** Line-segment soup of the loop in normalized cube space (CubeRenderer line sets). */
export function polygonLoopLines(intersection, geom) {
  const loop = polygonLoop(intersection);
  return loop ? faultPolylines([{ points: loop }], geom) : new Float32Array(0);
}

const round = (v, d) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

/**
 * GeoJSON FeatureCollection of fault polygons.
 * With toLonLat (a transformable CRS) the coordinates are WGS 84
 * longitude and latitude (RFC 7946); otherwise they stay in the survey's
 * projected CRS and the collection carries the legacy "crs" member with
 * the CRS name, which GIS tools read, and says so in its properties.
 *
 * @param {{items: {faultName: string, horizonName: string, intersection: Object}[],
 *   affine: Object, dtMs: number, crsName?: ?string,
 *   toLonLat?: ?((x: number, y: number) => {lon: number, lat: number})}} p
 */
export function faultPolygonsGeoJson({
  items, affine, dtMs, crsName = null, toLonLat = null,
}) {
  const features = [];
  const skipped = [];
  for (const it of items || []) {
    const loop = polygonLoop(it.intersection);
    if (!loop) { skipped.push(`${it.faultName} vs ${it.horizonName}`); continue; }
    let coords = loop.map((q) => {
      const w = ilxlToWorld(affine, q.il, q.xl);
      if (toLonLat) {
        const g = toLonLat(w.x, w.y);
        return [round(g.lon, 8), round(g.lat, 8)];
      }
      return [round(w.x, 2), round(w.y, 2)];
    });
    // RFC 7946 right-hand rule: the exterior ring counterclockwise
    let area2 = 0;
    for (let k = 0; k + 1 < coords.length; k++) area2 += coords[k][0] * coords[k + 1][1] - coords[k + 1][0] * coords[k][1];
    if (area2 < 0) coords = [...coords].reverse();
    const throws = (it.intersection.segments || []).map((s) => s.throwSamples * dtMs);
    const times = loop.map((q) => q.s * dtMs);
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [coords] },
      properties: {
        fault: it.faultName,
        horizon: it.horizonName,
        kind: 'fault_polygon',
        source: 'Seismolord',
        twt_min_ms: round(Math.min(...times), 1),
        twt_max_ms: round(Math.max(...times), 1),
        throw_mean_ms: throws.length ? round(throws.reduce((s, v) => s + v, 0) / throws.length, 1) : null,
        throw_max_ms: throws.length ? round(Math.max(...throws.map(Math.abs)), 1) : null,
      },
    });
  }
  const fc = {
    type: 'FeatureCollection',
    features,
  };
  if (!toLonLat) {
    fc.crs = { type: 'name', properties: { name: crsName || 'unknown' } };
    fc.properties = { coordinates: `projected, ${crsName || 'CRS not set'} (not RFC 7946 longitude and latitude)` };
  }
  return { geojson: fc, count: features.length, skipped };
}
