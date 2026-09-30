// Contour Map Digitizer georeference and exports (MAP-U1-005, -007).
import { fitGeoreference, describeGeoreference, usableControlPoints } from '../georeference';
import { contoursGeoJSON, contoursDXF, contoursCSV } from '../contourExport';

// a scan rotated 7 degrees, 2.5 m per pixel, image y down
const TH = (7 * Math.PI) / 180;
const S = 2.5;
const toWorld = (px, py) => [500000 + S * (px * Math.cos(TH) + py * Math.sin(TH)), 6700000 + S * (px * Math.sin(TH) - py * Math.cos(TH))];
const gcp = (px, py) => ({ pixel: [px, py], world: toWorld(px, py).map(String) }); // typed values arrive as strings

describe('MAP-U1-005: the georeference uses every control point and its rotation', () => {
  const pts = [gcp(100, 120), gcp(1800, 150), gcp(160, 1400), gcp(1700, 1350)];

  test('a rotated scan: a far corner lands where it belongs', () => {
    const g = fitGeoreference(pts);
    const [x, y] = g.pixelToWorld(2000, 1600);
    const [tx, ty] = toWorld(2000, 1600);
    expect(Math.hypot(x - tx, y - ty)).toBeLessThan(1e-6);
    expect(g.rms).toBeLessThan(1e-6);
    expect(g.rotationDeg).toBeCloseTo(7, 6);
    expect(g.unitsPerPixel).toBeCloseTo(2.5, 6);
    expect(describeGeoreference(g, 'm')).toMatch(/rotated 7\.0 deg, 2\.50 m per pixel; RMS error 0\.0 m over 4 points/);
  });

  test('negative control: the previous two-point, square-to-the-grid transform misses by hundreds of metres', () => {
    // the transform the hook used before (first two points, no rotation)
    const [p1, p2] = pts;
    const sx = (Number(p2.world[0]) - Number(p1.world[0])) / (p2.pixel[0] - p1.pixel[0]);
    const sy = (Number(p2.world[1]) - Number(p1.world[1])) / (p2.pixel[1] - p1.pixel[1]);
    const old = (px, py) => [sx * px + (Number(p1.world[0]) - p1.pixel[0] * sx), sy * py + (Number(p1.world[1]) - p1.pixel[1] * sy)];
    const [x, y] = old(2000, 1600);
    const [tx, ty] = toWorld(2000, 1600);
    expect(Math.hypot(x - tx, y - ty)).toBeGreaterThan(300);
  });

  test('a misplaced point shows in the residuals', () => {
    const bad = [...pts, { pixel: [900, 700], world: toWorld(900, 700).map((v, i) => String(v + (i === 0 ? 60 : 0))) }];
    const g = fitGeoreference(bad);
    const worst = g.residuals.reduce((a, b) => (b.error > a.error ? b : a));
    expect(worst.index).toBe(4);
    expect(g.rms).toBeGreaterThan(10);
  });

  test('three points fit exactly and say there is no check; collinear or blank points are refused', () => {
    const g = fitGeoreference(pts.slice(0, 3));
    expect(g.exact).toBe(true);
    expect(describeGeoreference(g, 'm')).toMatch(/add a fourth/);
    expect(() => fitGeoreference([gcp(0, 0), gcp(100, 100), gcp(200, 200)])).toThrow(/one line/);
    // two points sharing a pixel column broke the old code (scale Infinity)
    expect(() => fitGeoreference([gcp(100, 0), gcp(100, 500), gcp(700, 300)])).not.toThrow();
    expect(usableControlPoints([{ pixel: [1, 2], world: ['', '5'] }])).toHaveLength(0);
    expect(() => fitGeoreference([gcp(0, 0), gcp(10, 0), { pixel: [5, 5], world: ['', ''] }])).toThrow(/2 usable/);
  });
});

describe('MAP-U1-007: exports carry map coordinates, values and faults', () => {
  const g = fitGeoreference([gcp(0, 0), gcp(1000, 0), gcp(0, 1000), gcp(1000, 1000)]);
  const layers = {
    contours: [{ id: 'a', value: 1500, points: [[0, 0], [100, 50]] }, { id: 'b', value: null, points: [[10, 10], [20, 20]] }],
    faults: [{ id: 'f', value: null, points: [[500, 0], [520, 900]] }],
  };

  test('GeoJSON: world coordinates, the fault layer, the elevation and the CRS', () => {
    const doc = JSON.parse(contoursGeoJSON(layers, g.pixelToWorld, { valuesAre: 'depth', zUnit: 'm', crs: 'EPSG:32632' }));
    expect(doc.features).toHaveLength(3);
    const [x, y] = doc.features[0].geometry.coordinates[1];
    const [tx, ty] = toWorld(100, 50);
    expect(Math.hypot(x - tx, y - ty)).toBeLessThan(1e-6);
    expect(doc.features[0].properties).toMatchObject({ layer: 'contour', value: 1500, elevation: -1500 });
    expect(doc.features[2].properties.layer).toBe('fault');
    expect(doc.crs.properties.name).toBe('EPSG:32632');
  });

  test('DXF: CONTOURS and FAULTS layers, Z is the elevation', () => {
    const t = contoursDXF(layers, g.pixelToWorld, { valuesAre: 'depth' });
    expect(t).toContain('\nFAULTS\n');
    const m = t.match(/VERTEX\n8\nCONTOURS\n10\n([-\d.e]+)\n20\n([-\d.e]+)\n30\n(-?[\d.]+)\n/);
    expect(Number(m[1])).toBeCloseTo(500000, 4);
    expect(Number(m[2])).toBeCloseTo(6700000, 4);
    expect(Number(m[3])).toBe(-1500);
  });

  test('CSV in world coordinates; no georeference, no file', () => {
    const t = contoursCSV(layers, g.pixelToWorld, { valuesAre: 'elevation', zUnit: 'ft' });
    expect(t.split('\n')[0]).toBe('x,y,value_elevation_ft,elevation_ft,line,layer');
    expect(t).toContain('500000.000,6700000.000,1500,1500,1,contour');
    expect(() => contoursCSV(layers, null)).toThrow(/georeference/);
    expect(() => contoursGeoJSON(layers, undefined)).toThrow(/image pixels/);
  });
});

import { layersFromSaved } from '../savedProject';

describe('MAP-U1-006: saved projects from every release open', () => {
  test('a bare array of lines (earliest rows), string values, no faults layer', () => {
    const { layers, settings } = layersFromSaved([{ id: 'a', points: [[0, 0], [1, 1]], value: '1500' }, { id: 'b', points: [[0, 0], [2, 2]], value: '' }]);
    expect(layers.contours.map((l) => l.value)).toEqual([1500, null]);
    expect(layers.faults).toEqual([]);
    expect(settings).toEqual({});
  });
  test('the MS5 shape and the current shape with settings', () => {
    expect(layersFromSaved({ contours: [], faults: [{ id: 'f', points: [[0, 0], [1, 1]], value: null }] }).layers.faults).toHaveLength(1);
    const now = layersFromSaved({ contours: [], faults: [], settings: { valuesAre: 'elevation', zUnit: 'ft', crs: 'EPSG:32632', image: { name: 'scan.png', width: 2000, height: 1500 } } });
    expect(now.settings).toMatchObject({ valuesAre: 'elevation', zUnit: 'ft', crs: 'EPSG:32632' });
    expect(now.layers).toEqual({ contours: [], faults: [] });
    expect(layersFromSaved(null).layers).toEqual({ contours: [], faults: [] });
  });
});

describe('MAP-U1-009: no false AI claims on the digitizer', () => {
  test('the page, panels and empty state describe tracing as tracing', () => {
    // eslint-disable-next-line global-require
    const fs = require('fs');
    for (const f of ['src/components/contourmap/InputPanel.jsx', 'src/components/contourmap/EmptyState.jsx', 'src/components/contourmap/ResultsPanel.jsx', 'src/pages/apps/ContourMapDigitizer.jsx']) {
      const text = fs.readFileSync(f, 'utf8').replace(/^\s*(\/\/|\*).*$/gm, '');
      expect([f, /\bAI\b|3D Grid/.test(text)]).toEqual([f, false]);
    }
  });
});
