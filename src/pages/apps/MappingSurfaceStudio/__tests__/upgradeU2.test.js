// Mapping & Surface Studio upgrade Step 2 (2026-09-30): service tests, one
// block per item (docs/upgrade/MappingSurfaceStudio-UPGRADE.md). Every
// gate calls the shipped function; numeric items carry a negative control.
import { runGriddingSync } from '../services/gridSync';
import { blocksForPoints, nodeBlocksFor } from '../services/polygonTools';
import { isNull } from '@/lib/gridding/gridmath';

// a N-S fault at x = 500 with a 100 m throw; the east block is a polygon
const planeW = (x, y) => -1500 - 0.05 * x + 0.02 * y;
const planeE = (x, y) => planeW(x, y) - 100;
const eastBlock = [[500, -50], [1100, -50], [1100, 1100], [500, 1100]];
const spec = { x0: 0, y0: 0, dx: 25, dy: 25, nx: 41, ny: 41 };
const wellXY = [[60, 80], [300, 120], [420, 700], [150, 950], [260, 450], [380, 300], [620, 90], [900, 200], [760, 640], [980, 930], [560, 500], [840, 420]];
const wells = wellXY.map(([x, y]) => ({ x, y, z: x < 500 ? planeW(x, y) : planeE(x, y), well: `W${x}` }));

describe('MAP-U2-001: fault blocks with the spline in tension and kriging', () => {
  const nodeBlocks = nodeBlocksFor(spec, [eastBlock]);
  const pts = blocksForPoints(wells, [eastBlock]);
  const worst = (z) => {
    let m = 0;
    for (let r = 0; r < spec.ny; r++) for (let c = 0; c < spec.nx; c++) {
      const v = z[r * spec.nx + c]; if (isNull(v)) continue;
      const x = c * spec.dx; const y = r * spec.dy;
      m = Math.max(m, Math.abs(v - (nodeBlocks[r * spec.nx + c] ? planeE(x, y) : planeW(x, y))));
    }
    return m;
  };
  test.each([
    ['blocked-tension', { tension: 0.5, smoothing: 0, maxExtrapolation: 1e9 }],
    ['blocked-kriging', { model: 'spherical', range: 600, sill: 100, nugget: 0, detrend: true, maxExtrapolation: 1e9 }],
  ])('%s keeps the 100 m throw as a step at the polygon edge', (method, opts) => {
    const g = runGriddingSync(method, pts, spec, { ...opts, nodeBlocks });
    expect(worst(g.z)).toBeLessThan(2e-3);
    expect(g.blockCount).toBe(2);
    // across the fault, one cell apart, the map steps by the throw
    const r = 20; const cW = 19; const cE = 20;
    expect(g.z[r * spec.nx + cW] - g.z[r * spec.nx + cE]).toBeGreaterThan(95);
  });
  test('negative control: the same wells without the polygon smear the throw', () => {
    const t = runGriddingSync('tension', wells, spec, { tension: 0.5, mask: 'none' });
    expect(worst(t.z)).toBeGreaterThan(20);
    const k = runGriddingSync('kriging', wells, spec, { model: 'spherical', range: 600, sill: 100, nugget: 0, detrend: true, mask: 'none', maxExtrapolation: 1e9 });
    expect(worst(k.z)).toBeGreaterThan(20);
  });
});

describe('MAP-U2-004: fault polygon files become fault blocks', () => {
  // eslint-disable-next-line global-require
  const fs = require('fs');
  // eslint-disable-next-line global-require
  const path = require('path');
  const { parsePolygonLinesFile, parseZmapLines, parseIrapLines, polygonRingsOf, detectPolygonFileFormat } = require('@/lib/culturePolygonFiles');
  const { parseGeoJSON } = require('@/lib/cultureImport');
  const { maskOutsideRings } = require('../services/polygonTools');
  const hostile = (f) => fs.readFileSync(path.join(process.cwd(), 'e2e/fixtures/map/hostile', f), 'utf8');

  test('the Petrel ZMAP+ lines export reads as one closed fault polygon', () => {
    const r = parsePolygonLinesFile(hostile('petrel_fault_polygons_zmap_lines.dat'));
    expect(r.format).toBe('zmap-lines');
    expect(r.features).toHaveLength(1);
    expect(r.features[0].type).toBe('polygon');
    expect(polygonRingsOf(r.features)[0]).toEqual([[501700, 6699200], [501800, 6699200], [501900, 6700800], [501800, 6700800]]);
  });

  test('two polygons by id or by null rows, and Irap lines with 999 separators', () => {
    const z = parseZmapLines(['@F HEADER, POLYGON, 4', '20, -999, , 4, 1', '@',
      '0 0 1 1', '10 0 1 1', '10 10 1 1', '0 0 1 1',
      '20 0 1 2', '30 0 1 2', '30 10 1 2', '20 0 1 2',
      '-999 -999 -999 2', '40 0 1 2', '41 5 1 2'].join('\n'));
    expect(z.features.map((f) => f.type)).toEqual(['polygon', 'polygon', 'polyline']); // two points cannot close
    const lineSet = parseZmapLines(['@Traces HEADER, LINE, 4', '20, 1E+30, , 4, 1', '@', '0 0 1 1', '10 5 1 1'].join('\n'));
    expect(lineSet.features[0].type).toBe('polyline');
    const irap = parseIrapLines(['0 0 -1500', '100 0 -1500', '100 100 -1500', '0 0 -1500', '999.000000 999.000000 999.000000', '200 0 -1', '300 50 -1', '999 999 999'].join('\n'));
    expect(irap.features.map((f) => f.type)).toEqual(['polygon', 'polyline']);
    expect(detectPolygonFileFormat('999 999 999\n1 2 3')).toBe('irap-lines');
    expect(() => parsePolygonLinesFile('X,Y,Z\n1,2,3')).toThrow(/ZMAP\+ lines .* Irap classic lines/);
    expect(() => parseZmapLines('@F HEADER, POLYGON\n20, 1E+30')).toThrow(/closing @/);
  });

  test('every polygon of a two-fault GeoJSON is a block (the map used only the first)', () => {
    const feats = parseGeoJSON(hostile('fault_polygons_two.geojson')).features;
    const rings = polygonRingsOf(feats);
    expect(rings).toHaveLength(2);
    const s = { x0: 501500, y0: 6699000, dx: 50, dy: 50, nx: 41, ny: 41 };
    const labels = nodeBlocksFor(s, rings);
    expect(new Set(labels)).toEqual(new Set([0, 1, 2]));
    // negative control: the first feature alone gives two labels
    expect(new Set(nodeBlocksFor(s, rings.slice(0, 1)))).toEqual(new Set([0, 1]));
  });

  test('a boundary with two polygons keeps the union', () => {
    const s = { x0: 0, y0: 0, dx: 10, dy: 10, nx: 11, ny: 3 };
    const z = new Float32Array(33).fill(-1500);
    const out = maskOutsideRings(z, s, [[[-5, -5], [25, -5], [25, 25], [-5, 25]], [[75, -5], [105, -5], [105, 25], [75, 25]]]);
    const kept = Array.from(out).filter((v) => !isNull(v)).length;
    expect(kept).toBe(3 * 3 + 3 * 3);
    expect(() => maskOutsideRings(z, s, [])).toThrow(/boundary/);
  });
});
