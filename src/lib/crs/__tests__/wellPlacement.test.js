// Well-door placement: declared coordinates -> Project CRS, azimuth
// references -> grid north, with real proj4 math.

import { placeWellLocation, placeDeviation } from '@/lib/crs/wellPlacement';
import { getTransformer, projectorFor, convergenceAt } from '@/lib/crs';

const CTX = { projectTag: 'EPSG:32631', customDefs: {} };

describe('placeWellLocation', () => {
  test('declared equals project: numbers pass through, unit conversion applies', () => {
    const same = placeWellLocation({ mode: 'xy', crsTag: 'EPSG:32631', x: 500000, y: 700000 }, CTX);
    expect(same).toMatchObject({
      surfaceX: 500000, surfaceY: 700000, crs: 'EPSG:32631', xyUnit: 'm', autoSetProject: null,
    });
    const feet = placeWellLocation(
      { mode: 'xy', crsTag: 'EPSG:32631', x: 1000, y: 2000, xyUnit: 'ft' }, CTX,
    );
    expect(feet.surfaceX).toBeCloseTo(304.8, 10);
    expect(feet.surfaceY).toBeCloseTo(609.6, 10);
    expect(feet.crsProvenance).toMatchObject({ declared_unit: 'ft', declared_x: 1000 });
  });

  test('differing declaration converts into the Project CRS', () => {
    const p = placeWellLocation({ mode: 'xy', crsTag: 'EPSG:23031', x: 450000, y: 5760000 }, CTX);
    const direct = getTransformer('EPSG:23031', 'EPSG:32631').forward(450000, 5760000);
    expect(p.surfaceX).toBeCloseTo(direct.x, 9);
    expect(p.surfaceY).toBeCloseTo(direct.y, 9);
    expect(p.crs).toBe('EPSG:32631');
    expect(Math.hypot(p.surfaceX - 450000, p.surfaceY - 5760000)).toBeGreaterThan(50);
    expect(p.crsProvenance).toMatchObject({
      declared_crs: 'EPSG:23031', declared_x: 450000, transform: 'proj4',
    });
  });

  test('lat/lon entry lands at the projected wellhead; needs a Project CRS', () => {
    const p = placeWellLocation({ mode: 'latlon', lat: 52, lon: 5 }, CTX);
    const direct = projectorFor('EPSG:32631').fromLonLat(5, 52);
    expect(p.surfaceX).toBeCloseTo(direct.x, 9);
    expect(p.surfaceY).toBeCloseTo(direct.y, 9);
    expect(p.crsProvenance).toMatchObject({ declared_lat: 52, declared_lon: 5 });
    expect(() => placeWellLocation({ mode: 'latlon', lat: 52, lon: 5 }, {}))
      .toThrow(/Project CRS/);
    expect(() => placeWellLocation({ mode: 'latlon', lat: 95, lon: 5 }, CTX))
      .toThrow(/Latitude/);
  });

  test('first placed import flags autoSetProject', () => {
    const p = placeWellLocation({ mode: 'xy', crsTag: 'EPSG:26332', x: 400000, y: 700000 }, {});
    expect(p).toMatchObject({
      crs: 'EPSG:26332', projectTag: 'EPSG:26332', autoSetProject: 'EPSG:26332',
      surfaceX: 400000, surfaceY: 700000,
    });
  });

  test('LOCAL and UNKNOWN store as declared, untransformed', () => {
    expect(placeWellLocation({ mode: 'xy', crsTag: 'LOCAL', x: 1000, y: 2000 }, CTX))
      .toMatchObject({ surfaceX: 1000, surfaceY: 2000, crs: 'LOCAL', autoSetProject: null });
    expect(placeWellLocation({ mode: 'xy', crsTag: null, x: 1000, y: 2000 }, CTX))
      .toMatchObject({ surfaceX: 1000, surfaceY: 2000, crs: null });
    expect(() => placeWellLocation({ mode: 'xy', crsTag: 'EPSG:32631', x: 'abc', y: 0 }, CTX))
      .toThrow(/numbers/);
  });
});

describe('placeDeviation', () => {
  const wellhead = projectorFor('EPSG:32631').fromLonLat(5, 52);
  const placed = { crs: 'EPSG:32631', surfaceX: wellhead.x, surfaceY: wellhead.y };
  const stations = [{ md: 0, inc: 0, azi: 10 }, { md: 500, inc: 30, azi: 10 }];

  test('grid reference passes through untouched', () => {
    const r = placeDeviation(stations, { azimuthRef: 'grid' }, placed);
    expect(r.deviation).toEqual(stations);
    expect(r.azimuthProvenance).toEqual({ azimuth_ref: 'grid', rotation_deg: 0 });
  });

  test('true-north azimuths rotate by the wellhead convergence', () => {
    const gamma = convergenceAt('EPSG:32631', wellhead.x, wellhead.y);
    const r = placeDeviation(stations, { azimuthRef: 'true' }, placed);
    expect(r.deviation[1].azi).toBeCloseTo(10 + gamma, 9);
    expect(r.azimuthProvenance.convergence_deg).toBeCloseTo(gamma, 9);
    // At 52N 5E in UTM 31N the convergence is about -1.58 degrees.
    expect(gamma).toBeLessThan(-1.5);
    expect(gamma).toBeGreaterThan(-1.7);
  });

  test('true or magnetic azimuths without a known CRS refuse loudly', () => {
    expect(() => placeDeviation(stations, { azimuthRef: 'true' }, { crs: null, surfaceX: 0, surfaceY: 0 }))
      .toThrow(/known CRS/);
    expect(() => placeDeviation(stations, { azimuthRef: 'magnetic' }, { crs: 'LOCAL', surfaceX: 0, surfaceY: 0 }))
      .toThrow(/known CRS/);
  });
});
