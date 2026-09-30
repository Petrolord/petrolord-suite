// Contour Map Digitizer upgrade findings (MAP-U1-005, -007): the
// georeference and the exports, on a synthetic scan rotated 7 degrees.
import { fitGeoreference, describeGeoreference, usableControlPoints } from '../georeference';
import { contoursGeoJSON, contoursDXF, contoursCSV } from '../contourExport';

const TH = (7 * Math.PI) / 180;
const S = 2.5; // metres per pixel
const T = [500000, 6702000];
// the true scan: image y runs down, north up after a 7 degree rotation
const truth = (px, py) => [
  T[0] + S * (px * Math.cos(TH) + py * Math.sin(TH)),
  T[1] + S * (px * Math.sin(TH) - py * Math.cos(TH)),
];
const gcp = (px, py, noise = [0, 0]) => {
  const [x, y] = truth(px, py);
  return { pixel: [px, py], world: [String(x + noise[0]), String(y + noise[1])] }; // typed inputs are strings
};

// what the page did before the fix: first two points, square to the grid
const previous = (pts) => {
  const [p1, p2] = pts;
  const sx = (p2.world[0] - p1.world[0]) / (p2.pixel[0] - p1.pixel[0]);
  const sy = (p2.world[1] - p1.world[1]) / (p2.pixel[1] - p1.pixel[1]);
  return (px, py) => [sx * px + (p1.world[0] - p1.pixel[0] * sx), sy * py + (p1.world[1] - p1.pixel[1] * sy)];
};

describe('MAP-U1-005: the georeference uses every control point', () => {
  const pts = [gcp(100, 100), gcp(1800, 150), gcp(200, 1300), gcp(1700, 1200)];

  test('a rotated scan is placed to the millimetre anywhere on it', () => {
    const g = fitGeoreference(pts);
    const [x, y] = g.pixelToWorld(1000, 700);
    const [tx, ty] = truth(1000, 700);
    expect(Math.hypot(x - tx, y - ty)).toBeLessThan(1e-3);
    expect(g.rotationDeg).toBeCloseTo(7, 6);
    expect(g.unitsPerPixel).toBeCloseTo(2.5, 6);
    expect(g.rms).toBeLessThan(1e-6);
    expect(g.exact).toBe(false);
  });

  test('negative control: the two-point square fit misplaces the middle of the same scan by more than 100 m', () => {
    const old = previous(pts.map((p) => ({ pixel: p.pixel, world: p.world.map(Number) })));
    const [x, y] = old(1000, 700);
    const [tx, ty] = truth(1000, 700);
    expect(Math.hypot(x - tx, y - ty)).toBeGreaterThan(100);
  });

  test('a misplaced point shows in the residuals and the RMS', () => {
    const g = fitGeoreference([...pts.slice(0, 3), gcp(1700, 1200, [40, 0])]);
    expect(g.rms).toBeGreaterThan(5);
    const worst = g.residuals.reduce((a, b) => (b.error > a.error ? b : a));
    expect(worst.error).toBeGreaterThan(10);
    expect(describeGeoreference(g, 'm')).toMatch(/Affine from 4 control points, rotated 7\.\d deg, .* RMS error [\d.]+ m over 4 points/);
  });

  test('three points fit exactly and say there is no check', () => {
    const g = fitGeoreference(pts.slice(0, 3));
    expect(g.exact).toBe(true);
    expect(describeGeoreference(g)).toMatch(/no check on a misplaced point: add a fourth/);
  });

  test('points in a row, blanks and two points are refused with the reason', () => {
    expect(() => fitGeoreference([gcp(100, 100), gcp(200, 200), gcp(300, 300)])).toThrow(/lie on one line/);
    expect(() => fitGeoreference([gcp(100, 100), gcp(200, 900), { pixel: [700, 300], world: ['', '6700000'] }])).toThrow(/2 usable/);
    expect(usableControlPoints([{ pixel: [1, 2], world: ['', 3] }])).toHaveLength(0);
  });
});

describe('MAP-U1-007: exports are in map coordinates with value, elevation and layer', () => {
  const g = fitGeoreference([gcp(0, 0), gcp(1000, 0), gcp(0, 1000), gcp(1000, 1000)]);
  const layers = {
    contours: [{ id: 'a', points: [[0, 0], [1000, 0]], value: 1500 }, { id: 'b', points: [[0, 500], [1000, 500]], value: null }],
    faults: [{ id: 'f', points: [[500, 0], [500, 1000]], value: null }],
  };

  test('GeoJSON carries world coordinates, the CRS, both layers and the elevation', () => {
    const fc = JSON.parse(contoursGeoJSON(layers, g.pixelToWorld, { valuesAre: 'depth', zUnit: 'm', crs: 'EPSG:26332' }));
    expect(fc.crs.properties.name).toBe('EPSG:26332');
    expect(fc.features.map((f) => f.properties.layer)).toEqual(['contour', 'contour', 'fault']);
    const [x, y] = fc.features[0].geometry.coordinates[1];
    const [tx, ty] = truth(1000, 0);
    expect(Math.hypot(x - tx, y - ty)).toBeLessThan(1e-3);
    expect(fc.features[0].properties.elevation).toBe(-1500);
  });

  test('DXF polylines on CONTOURS and FAULTS layers at their elevation', () => {
    const t = contoursDXF(layers, g.pixelToWorld, { valuesAre: 'depth' });
    expect(t).toContain('\nCONTOURS\n');
    expect(t).toContain('\nFAULTS\n');
    expect(t).toMatch(/\n30\n-1500\n/);
    expect(t).toContain(String(truth(1000, 0)[0]).slice(0, 8));
  });

  test('CSV in world coordinates; every export refuses without a georeference', () => {
    const csv = contoursCSV(layers, g.pixelToWorld, { valuesAre: 'elevation', zUnit: 'ft' });
    expect(csv.split('\n')[0]).toBe('x,y,value_elevation_ft,elevation_ft,line,layer');
    expect(csv).toContain(truth(0, 0)[0].toFixed(3));
    for (const fn of [contoursGeoJSON, contoursDXF, contoursCSV]) expect(() => fn(layers, null)).toThrow(/georeference first/);
  });
});
