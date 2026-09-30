// U2-007: fault polygons in the 3D window and as GeoJSON, on the analytic
// faulted horizon the W3.1 engine oracles use (a step of 8 samples across a
// fault dipping 0.5 crossline per sample, 25 m bins).
import { polygonLoop, polygonLoopLines, faultPolygonsGeoJson } from '@/pages/apps/Seismolord/lib/faultPolygons';
import { faultHorizonIntersection } from '@/pages/apps/Seismolord/engine/faultObjects';
import { NULL_VALUE } from '@/pages/apps/Seismolord/engine/manifest';
import { toLonLat } from '@/lib/crs';

const NULL_F32 = Math.fround(NULL_VALUE);
const NIL = 64; const NXL = 64; const geom = { nIl: NIL, nXl: NXL, ns: 100 };
const affine = { origin: { x: 500000, y: 6000000 }, ilVec: { x: 0, y: 25 }, xlVec: { x: 25, y: 0 } };
const BETA = 0.5;
function stepHorizon() {
  const picks = new Float32Array(NIL * NXL).fill(NULL_F32);
  for (let i = 0; i < NIL; i++) {
    for (let j = 0; j < NXL; j++) {
      if (j < 32 + BETA * (40 - 50)) picks[i * NXL + j] = 40;
      else if (j >= 32 + BETA * (48 - 50)) picks[i * NXL + j] = 48;
    }
  }
  return picks;
}
const fault = {
  name: 'F1',
  sticks: [8, 24, 40, 56].map((il) => ({
    points: Array.from({ length: 13 }, (_, n) => { const s = 20 + n * 5; return { il, xl: 32 + BETA * (s - 50), s }; }),
  })),
};
const x = faultHorizonIntersection(fault, stepHorizon(), geom);

describe('3D loop', () => {
  test('closed, footwall then hanging wall, each vertex at its own cutoff time', () => {
    const loop = polygonLoop(x);
    expect(loop[0]).toEqual(loop[loop.length - 1]);
    const n = x.cutNeg.length;
    expect(loop.slice(0, n).every((q) => Math.abs(q.s - 40) < 1)).toBe(true);
    expect(loop.slice(n, 2 * n).every((q) => Math.abs(q.s - 48) < 1)).toBe(true);
    // line soup: one segment per edge, xyz pairs
    const lines = polygonLoopLines(x, geom);
    expect(lines.length).toBe((loop.length - 1) * 6);
    for (const v of lines) expect(Math.abs(v)).toBeLessThanOrEqual(1); // normalized cube space
  });

  test('negative control: no crossing, no loop', () => {
    const flat = new Float32Array(NIL * NXL).fill(NULL_F32);
    expect(polygonLoop(faultHorizonIntersection(fault, flat, geom))).toBeNull();
    expect(polygonLoopLines(null, geom).length).toBe(0);
  });
});

describe('GeoJSON', () => {
  test('projected: world metres, closed CCW ring, throw in ms, the CRS named', () => {
    const { geojson, count } = faultPolygonsGeoJson({
      items: [{ faultName: 'F1', horizonName: 'Top Reservoir', intersection: x }], affine, dtMs: 4, crsName: 'Local test grid',
    });
    expect(count).toBe(1);
    const f = geojson.features[0];
    expect(f.geometry.type).toBe('Polygon');
    const ring = f.geometry.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    let a2 = 0;
    for (let k = 0; k + 1 < ring.length; k++) a2 += ring[k][0] * ring[k + 1][1] - ring[k + 1][0] * ring[k][1];
    expect(a2).toBeGreaterThan(0);
    // the fault gap spans crossline 27 to 31 at 25 m: x between 500675 and 500775
    for (const [px] of ring) { expect(px).toBeGreaterThan(500650); expect(px).toBeLessThan(500800); }
    expect(f.properties.throw_mean_ms).toBeCloseTo(32, 0); // 8 samples x 4 ms
    expect(f.properties).toMatchObject({ fault: 'F1', horizon: 'Top Reservoir', source: 'Seismolord' });
    expect(geojson.crs.properties.name).toBe('Local test grid');
  });

  test('RFC 7946: WGS 84 longitude and latitude when the CRS converts (UTM 31N)', () => {
    const { geojson } = faultPolygonsGeoJson({
      items: [{ faultName: 'F1', horizonName: 'H', intersection: x }], affine, dtMs: 4, toLonLat: (px, py) => toLonLat('EPSG:32631', px, py),
    });
    expect(geojson.crs).toBeUndefined();
    const [lon, lat] = geojson.features[0].geometry.coordinates[0][0];
    // UTM 31N, easting 500 7xx m, northing 6 000 xxx m: about 3.01 E, 54.14 N
    expect(lon).toBeGreaterThan(3.0); expect(lon).toBeLessThan(3.03);
    expect(lat).toBeGreaterThan(54.13); expect(lat).toBeLessThan(54.16);
  });

  test('a pair without a polygon is named, not dropped silently (PL4)', () => {
    const r = faultPolygonsGeoJson({ items: [{ faultName: 'F9', horizonName: 'H', intersection: { cutNeg: [], cutPos: [] } }], affine, dtMs: 4 });
    expect(r.count).toBe(0);
    expect(r.skipped).toEqual(['F9 vs H']);
  });
});
