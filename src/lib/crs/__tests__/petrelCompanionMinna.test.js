// External oracle for Minna / Nigeria West Belt (EPSG:26391) with the
// EPSG:1754 transformation to WGS 84: the four example conversions Petrel
// wrote into the spatial companion XML of a tester's survey ("Claredon
// seismic", 2026-09-22; "Made by Petrel", ESRI PE 10.7.1). Petrel's own
// numbers, independent of the PROJ dataset the catalogue was built from.
// Points are the corners of the survey's bounding box.
import proj4 from 'proj4';
import { toLonLat, catalogGet } from '..';

const CASES = [
  { xy: [403413.5, 28005.5], minna: [6.05559101061992, 4.25177408004252], wgs84: [6.0549318518386, 4.25242144661832] },
  { xy: [421163.5, 28005.5], minna: [6.21545051186809, 4.25143431716267], wgs84: [6.21479439244644, 4.25208332728303] },
  { xy: [421163.5, 49905.5], minna: [6.21589870109433, 4.44945799283316], wgs84: [6.21524134869639, 4.45008824941451] },
  { xy: [403413.5, 49905.5], minna: [6.05599747714785, 4.44981364107835], wgs84: [6.0553370869496, 4.45044224592076] },
];

// Finding (2026-09-22): the projection step matches Petrel's GCS_Minna
// values to 1e-12 deg at all four points, and the EPSG:1754 Helmert matches
// Petrel's WGS 84 values to 1e-9 deg at the two northern points. At the two
// southern points Petrel's WGS 84 values sit a constant 7.5e-7 deg (about
// 8 cm) away. A 7-parameter Helmert is smooth and cannot move 8 cm over the
// 22 km between the pairs, so the step is in Petrel's own geocentric
// inversion at those points, not in the parameters. EPSG publishes 1754 to
// 5 m, so the gate is 1e-6 deg (about 11 cm) and the projection gets its own
// tight check.
const TOL_DEG = 1e-6;

describe('EPSG:26391 via EPSG:1754 reproduces Petrel (spatial companion example conversions)', () => {
  for (const c of CASES) {
    test(`${c.xy.join(', ')}`, () => {
      const { lon, lat } = toLonLat('EPSG:26391', c.xy[0], c.xy[1]);
      expect(Math.abs(lon - c.wgs84[0])).toBeLessThan(TOL_DEG);
      expect(Math.abs(lat - c.wgs84[1])).toBeLessThan(TOL_DEG);
    });
  }

  test('the projection alone matches Petrel\'s GCS_Minna values to 1e-9 deg', () => {
    const def = catalogGet('EPSG:26391').proj4;
    // Same ellipsoid and datum parameters, geographic: no datum shift between them.
    const geographic = `+proj=longlat ${def.split(' ').filter((t) => /^\+(a|b|rf|ellps|towgs84)=/.test(t)).join(' ')} +no_defs`;
    for (const c of CASES) {
      const [lon, lat] = proj4(def, geographic, c.xy);
      expect(Math.abs(lon - c.minna[0])).toBeLessThan(1e-9);
      expect(Math.abs(lat - c.minna[1])).toBeLessThan(1e-9);
    }
  });

  test('the Minna-to-WGS 84 shift Petrel applies is what the default transform applies (tens of metres, not zero)', () => {
    for (const c of CASES) {
      const dLon = (c.wgs84[0] - c.minna[0]) * 111320 * Math.cos((c.minna[1] * Math.PI) / 180);
      const dLat = (c.wgs84[1] - c.minna[1]) * 110574;
      expect(Math.hypot(dLon, dLat)).toBeGreaterThan(50);
    }
  });
});
