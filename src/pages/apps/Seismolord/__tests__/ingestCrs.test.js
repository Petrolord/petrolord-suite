// CRS decision + application at SEG-Y commit: Petrel semantics (first
// placed import defines the Project CRS; differing declarations convert
// by refitting the survey affine; LOCAL/UNKNOWN store untransformed),
// with real proj4 math through src/lib/crs.

import { planCrs, planFromRecord, applyCrsToScan } from '@/pages/apps/Seismolord/services/ingestCrs';
import { getTransformer } from '@/lib/crs';
import { ilxlToWorld } from '@/pages/apps/Seismolord/engine/surveyGeometry';

describe('planCrs', () => {
  test('unknown declaration stores null and never transforms', () => {
    expect(planCrs(null, 'EPSG:32631')).toMatchObject({
      nativeTag: 'UNKNOWN', storeTag: null, needsTransform: false, autoSetProject: false,
    });
  });
  test('LOCAL stores LOCAL untransformed', () => {
    expect(planCrs('LOCAL', 'EPSG:32631')).toMatchObject({
      storeTag: 'LOCAL', needsTransform: false,
    });
  });
  test('first placed import defines the Project CRS', () => {
    expect(planCrs('EPSG:23031', null)).toMatchObject({
      projectTag: 'EPSG:23031', storeTag: 'EPSG:23031', needsTransform: false, autoSetProject: true,
    });
  });
  test('matching project needs no transform; differing does', () => {
    expect(planCrs('EPSG:32631', 'EPSG:32631').needsTransform).toBe(false);
    expect(planCrs('EPSG:23031', 'EPSG:32631')).toMatchObject({
      storeTag: 'EPSG:32631', needsTransform: true, autoSetProject: false,
    });
  });
});

describe('planFromRecord (resume finishes under the original declaration)', () => {
  test('pre-CRS records resume as UNKNOWN', () => {
    expect(planFromRecord({ mapping: { il_byte: 189, xl_byte: 193 } })).toMatchObject({
      nativeTag: 'UNKNOWN', storeTag: null, needsTransform: false,
    });
  });
  test('recorded declarations are honored verbatim', () => {
    expect(planFromRecord({ crs: { native: 'EPSG:23031', project: 'EPSG:32631' } })).toMatchObject({
      nativeTag: 'EPSG:23031', projectTag: 'EPSG:32631', storeTag: 'EPSG:32631', needsTransform: true,
    });
    expect(planFromRecord({ crs: { native: 'LOCAL', project: 'UNKNOWN' } })).toMatchObject({
      storeTag: 'LOCAL', needsTransform: false,
    });
  });
});

describe('applyCrsToScan', () => {
  const scan = {
    il: { min: 100, max: 299, step: 1, count: 200 },
    xl: { min: 300, max: 599, step: 1, count: 300 },
    corners: { first: { x: 450000, y: 5760000 }, last: { x: 457475, y: 5764975 } },
    affine: {
      origin: { x: 450000, y: 5760000 },
      ilVec: { x: 0, y: 25 },
      xlVec: { x: 25, y: 0 },
      fit: { n: 60000, rmsM: 0.01 },
    },
  };

  test('no transform: scan untouched, crs block records the declaration', () => {
    const plan = planCrs('EPSG:32631', 'EPSG:32631');
    const { scan: out, crsBlock } = applyCrsToScan(scan, plan, {});
    expect(out).toBe(scan);
    expect(crsBlock).toMatchObject({
      project: 'EPSG:32631', native: 'EPSG:32631', transform: 'none', max_residual_m: 0,
    });
  });

  test('unknown declaration produces an explicit UNKNOWN block', () => {
    const plan = planCrs(null, null);
    const { crsBlock } = applyCrsToScan(scan, plan, {});
    expect(crsBlock).toEqual({ project: 'UNKNOWN', native: 'UNKNOWN', native_xy_unit: null });
  });

  test('transform refits the affine in the project CRS and keeps the native one', () => {
    const plan = planCrs('EPSG:23031', 'EPSG:32631');
    const { scan: out, crsBlock } = applyCrsToScan(scan, plan, {});

    // Corners agree with direct point transforms.
    const t = getTransformer('EPSG:23031', 'EPSG:32631');
    const first = t.forward(450000, 5760000);
    expect(out.corners.first.x).toBeCloseTo(first.x, 6);
    expect(out.corners.first.y).toBeCloseTo(first.y, 6);
    // ED50 -> WGS84 moves the survey on the order of 100 m.
    expect(Math.hypot(out.corners.first.x - 450000, out.corners.first.y - 5760000)).toBeGreaterThan(50);

    // The refit affine reproduces direct transforms within the residual.
    const mid = ilxlToWorld(out.affine, 100, 150);
    const midNative = ilxlToWorld(scan.affine, 100, 150);
    const midDirect = t.forward(midNative.x, midNative.y);
    expect(Math.hypot(mid.x - midDirect.x, mid.y - midDirect.y))
      .toBeLessThan(crsBlock.max_residual_m + 0.01);
    expect(crsBlock.max_residual_m).toBeLessThan(0.1);

    // Native placement preserved for chain-free later reprojection.
    expect(crsBlock.native_affine.origin).toEqual({ x: 450000, y: 5760000 });
    expect(crsBlock.native_corners.first).toEqual({ x: 450000, y: 5760000 });
    expect(crsBlock).toMatchObject({
      project: 'EPSG:32631', native: 'EPSG:23031', native_xy_unit: 'm', transform: 'proj4',
    });
    // The input scan object was not mutated.
    expect(scan.corners.first).toEqual({ x: 450000, y: 5760000 });
    expect(scan.affine.origin).toEqual({ x: 450000, y: 5760000 });
  });
});
