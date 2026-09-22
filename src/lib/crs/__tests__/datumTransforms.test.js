// Site-level datum transformation choice through the Suite CRS binding.
// Oracle: the vendored EPSG/PROJ goldens (packages/engines/test-data/crs),
// coordinates PROJ computed through each named EPSG operation.

import fs from 'fs';
import path from 'path';
import {
  toLonLat, getTransformer, convergenceAt, datumTransformInfo, insideTransformArea,
  resolveDef, catalogGet, searchCatalog,
} from '..';

const G = JSON.parse(fs.readFileSync(path.join(
  __dirname, '../../../../packages/engines/test-data/crs/goldens/minna_epsg_goldens.json',
), 'utf8'));
const golden = (crs, transform) => G.projected.find((r) => r.crs === crs && r.transform === transform);
const MINNA_FIVE = ['EPSG:26391', 'EPSG:26392', 'EPSG:26393', 'EPSG:26331', 'EPSG:26332'];

// Metres on the ground between two lon/lat points (local flat earth, fine
// at these separations).
const groundM = (a, b) => Math.hypot(
  (a.lon - b.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180),
  (a.lat - b.lat) * 110574,
);

test("searching 'Nigeria' and 'Minna' each return all five Minna projected systems", () => {
  for (const q of ['Nigeria', 'Minna']) {
    const codes = searchCatalog(q).map((e) => e.code);
    for (const c of MINNA_FIVE) expect(codes).toContain(c);
  }
});

test('toLonLat honours the override: West Belt point under EPSG:1754 (default) and EPSG:1168', () => {
  const g3 = golden('EPSG:26391', 'EPSG:1754');
  const g2 = golden('EPSG:26391', 'EPSG:1168');
  expect(g3.x).toBe(g2.x);
  const byDefault = toLonLat('EPSG:26391', g3.x, g3.y);
  const by1754 = toLonLat('EPSG:26391', g3.x, g3.y, {}, { datumTransform: 'EPSG:1754' });
  const by1168 = toLonLat('EPSG:26391', g3.x, g3.y, {}, { datumTransform: 'EPSG:1168' });
  expect(byDefault).toEqual(by1754);
  for (const [got, want] of [[by1754, g3], [by1168, g2]]) {
    expect(Math.abs(got.lon - want.lonWgs84)).toBeLessThan(1e-7);
    expect(Math.abs(got.lat - want.latWgs84)).toBeLessThan(1e-7);
  }
  // The two EPSG transformations put the same grid point about 10 m apart,
  // exactly as far apart as PROJ puts them.
  const expected = groundM({ lon: g3.lonWgs84, lat: g3.latWgs84 }, { lon: g2.lonWgs84, lat: g2.latWgs84 });
  expect(expected).toBeGreaterThan(8);
  expect(expected).toBeLessThan(12);
  expect(Math.abs(groundM(by1754, by1168) - expected)).toBeLessThan(0.01);
});

test('offshore UTM pair defaults to EPSG:15706 and takes EPSG:1818 as an override', () => {
  const g13 = golden('EPSG:26331', 'EPSG:15706');
  const g4 = golden('EPSG:26331', 'EPSG:1818');
  const a = toLonLat('EPSG:26331', g13.x, g13.y);
  const b = toLonLat('EPSG:26331', g4.x, g4.y, {}, { datumTransform: 'EPSG:1818' });
  expect(Math.abs(a.lon - g13.lonWgs84)).toBeLessThan(1e-7);
  expect(Math.abs(b.lat - g4.latWgs84)).toBeLessThan(1e-7);
});

test('an override not published for the CRS throws; datumTransformInfo reports it instead', () => {
  expect(() => toLonLat('EPSG:26393', 1e6, 5e5, {}, { datumTransform: 'EPSG:1754' })).toThrow();
  const info = datumTransformInfo('EPSG:26393', 'EPSG:1754');
  expect(info.overrideIgnored).toBe(true);
  expect(info.transform.code).toBe('EPSG:1168');
  expect(info.transform.accuracyM).toBe(15);
  expect(datumTransformInfo('EPSG:32631')).toBeNull();
  expect(datumTransformInfo('LOCAL')).toBeNull();
  expect(resolveDef('EPSG:32631')).toBe(catalogGet('EPSG:32631').proj4);
});

test('datumTransformInfo for every Minna system names the transformation and accuracy', () => {
  const want = {
    'EPSG:26391': ['EPSG:1754', 5], 'EPSG:26392': ['EPSG:1754', 5], 'EPSG:26393': ['EPSG:1168', 15],
    'EPSG:26331': ['EPSG:15706', 7], 'EPSG:26332': ['EPSG:15706', 7], 'EPSG:4263': ['EPSG:1168', 15],
  };
  for (const [crs, [code, acc]] of Object.entries(want)) {
    const info = datumTransformInfo(crs);
    expect(info.transform.code).toBe(code);
    expect(info.transform.accuracyM).toBe(acc);
    expect(info.isDefault).toBe(true);
    expect(info.options[0].code).toBe(code);
  }
  expect(insideTransformArea(datumTransformInfo('EPSG:26391').transform, 5, 5.5)).toBe(true);
  expect(insideTransformArea(datumTransformInfo('EPSG:26391').transform, 3.4, 6.45)).toBe(false);
});

test('Minna belt to belt is a pure projection change whatever each side would use', () => {
  const t = getTransformer('EPSG:26391', 'EPSG:26392');
  const t2 = getTransformer('EPSG:26391', 'EPSG:26392', {}, { fromTransform: 'EPSG:1168' });
  const p = t.forward(300000, 200000);
  const p2 = t2.forward(300000, 200000);
  expect(Math.hypot(p.x - p2.x, p.y - p2.y)).toBeLessThan(1e-3);
  // Round trip through Minna lat/lon (default EPSG:1168) lands back on the grid point.
  const ll = getTransformer('EPSG:26391', 'EPSG:4263').forward(300000, 200000);
  const back = getTransformer('EPSG:4263', 'EPSG:26391').forward(ll.x, ll.y);
  expect(Math.hypot(back.x - 300000, back.y - 200000)).toBeLessThan(1e-3);
});

test('non-Minna pairs are untouched (defaults equal the old definitions)', () => {
  const a = getTransformer('EPSG:23031', 'EPSG:32631').forward(500000, 5000000);
  expect(Number.isFinite(a.x)).toBe(true);
  expect(Number.isFinite(convergenceAt('EPSG:26391', 300000, 200000, {}, { datumTransform: 'EPSG:1168' }))).toBe(true);
});
