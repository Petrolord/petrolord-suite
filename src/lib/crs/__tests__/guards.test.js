// Consumption guards: the overlay matrix with real proj4 math.

import { placeWellsForHost, explainOverlapFailure, cachedTransformer } from '@/lib/crs/guards';
import { getTransformer } from '@/lib/crs';

const WELL = {
  name: 'A-1', surfaceX: 450000, surfaceY: 5760000,
  path: [{ x: 450000, y: 5760000, tvdss: 0 }, { x: 450100, y: 5760200, tvdss: 1000 }],
};

describe('placeWellsForHost', () => {
  test('same tag passes through untouched', () => {
    const r = placeWellsForHost([{ ...WELL, crs: 'EPSG:32631' }], 'EPSG:32631');
    expect(r.wells[0]).toMatchObject({ surfaceX: 450000, crsStatus: 'same' });
    expect(r.skipped).toEqual([]);
  });

  test('known different tags convert surface and path exactly', () => {
    const r = placeWellsForHost([{ ...WELL, crs: 'EPSG:23031' }], 'EPSG:32631');
    const t = getTransformer('EPSG:23031', 'EPSG:32631');
    const direct = t.forward(450000, 5760000);
    expect(r.wells[0].surfaceX).toBeCloseTo(direct.x, 9);
    expect(r.wells[0].surfaceY).toBeCloseTo(direct.y, 9);
    const p1 = t.forward(450100, 5760200);
    expect(r.wells[0].path[1].x).toBeCloseTo(p1.x, 9);
    expect(r.wells[0].path[1].tvdss).toBe(1000);
    expect(r.wells[0].crsStatus).toBe('converted');
    expect(r.converted).toBe(1);
  });

  test('unknown tags render flagged, never transformed', () => {
    const r = placeWellsForHost([{ ...WELL, crs: null }], 'EPSG:32631');
    expect(r.wells[0]).toMatchObject({ surfaceX: 450000, crsStatus: 'unverified' });
    expect(r.unverified).toBe(1);
    const rHostUnknown = placeWellsForHost([{ ...WELL, crs: 'EPSG:32631' }], null);
    expect(rHostUnknown.wells[0].crsStatus).toBe('unverified');
  });

  test('local-grid wells drop from a georeferenced frame, and vice versa', () => {
    const r = placeWellsForHost([{ ...WELL, crs: 'LOCAL' }], 'EPSG:32631');
    expect(r.wells).toEqual([]);
    expect(r.skipped[0].name).toBe('A-1');
    const same = placeWellsForHost([{ ...WELL, crs: 'LOCAL' }], 'LOCAL');
    expect(same.wells[0].crsStatus).toBe('same');
  });
});

describe('explainOverlapFailure', () => {
  test('names the CRS as likely cause when tags are unknown or differ', () => {
    expect(explainOverlapFailure('Top X', null, 'EPSG:32631'))
      .toMatch(/no recorded CRS/);
    expect(explainOverlapFailure('Top X', 'EPSG:23031', 'EPSG:32631'))
      .toMatch(/ED50/);
    expect(explainOverlapFailure('Top X', 'LOCAL', 'EPSG:32631'))
      .toMatch(/local grid/);
    expect(explainOverlapFailure('Top X', 'EPSG:32631', 'EPSG:32631'))
      .toBe('"Top X" does not overlap this volume\'s survey area.');
  });
});

test('cachedTransformer returns the same instance per pair', () => {
  expect(cachedTransformer('EPSG:23031', 'EPSG:32631'))
    .toBe(cachedTransformer('EPSG:23031', 'EPSG:32631'));
});
