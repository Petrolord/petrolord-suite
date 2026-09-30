// Mapping & Surface Studio upgrade Step 1 (practitioner lens, 2026-09-30):
// pure-service tests, one block per finding (docs/upgrade/MappingSurfaceStudio-UPGRADE.md).
import { quickGrv } from '../services/quickGrv';
import { metresPerXy, metresToXy, xyUnitOf } from '../services/xyUnits';

const M_PER_FT_US = 1200 / 3937;
const cone = (xm, ym) => -1800 - 0.1 * Math.hypot(xm, ym);
const gridOf = (fn, spec, s = 1) => {
  const z = new Float32Array(spec.nx * spec.ny);
  for (let r = 0; r < spec.ny; r++) for (let c = 0; c < spec.nx; c++) z[r * spec.nx + c] = fn((spec.x0 + c * spec.dx) * s, (spec.y0 + r * spec.dy) * s);
  return z;
};
const V1 = (Math.PI * 1000 ** 2 * 100) / 3; // cone above -1900 m, m3

describe('MAP-U1-001: areas and volumes on a feet frame', () => {
  // the same cone on a metre frame and on a US-survey-feet frame
  const specM = { x0: -1500, y0: -1500, dx: 25, dy: 25, nx: 121, ny: 121 };
  const dxFt = 25 / M_PER_FT_US;
  const specFt = { x0: -1500 / M_PER_FT_US, y0: -1500 / M_PER_FT_US, dx: dxFt, dy: dxFt, nx: 121, ny: 121 };
  const zM = gridOf(cone, specM);
  const zFt = gridOf(cone, specFt, M_PER_FT_US);

  test('the feet frame gives the metre frame GRV and area when its unit is honoured', () => {
    const m = quickGrv({ spec: specM, gridM: zM, contactM: -1900 });
    const ft = quickGrv({ spec: specFt, gridM: zFt, contactM: -1900, xyToM: M_PER_FT_US });
    expect(Math.abs(m.grvM3 / V1 - 1)).toBeLessThan(0.005);
    expect(ft.grvM3 / m.grvM3).toBeCloseTo(1, 6);
    expect(ft.areaM2 / m.areaM2).toBeCloseTo(1, 6);
    expect(ft.grvAcreFt / m.grvAcreFt).toBeCloseTo(1, 6);
    // the curve and the other closures carry the same scale
    expect(ft.curve[ft.curve.length - 1].grvM3 / m.curve[m.curve.length - 1].grvM3).toBeCloseTo(1, 6);
  });

  test('negative control: read as metres, the feet frame is 10.76 times too big', () => {
    const wrong = quickGrv({ spec: specFt, gridM: zFt, contactM: -1900 });
    expect(wrong.grvM3 / V1).toBeGreaterThan(10.5);
  });

  test('a geographic frame is refused, never measured in square degrees', () => {
    expect(() => quickGrv({ spec: specM, gridM: zM, contactM: -1900, xyToM: NaN })).toThrow(/geographic/);
  });

  test('units resolve from the row, the preview and the CRS', () => {
    expect(xyUnitOf({ xy_unit: 'ftUS' })).toBe('ftUS');
    expect(xyUnitOf({ crs: 'EPSG:2274' })).toBe('ftUS');
    expect(xyUnitOf({ crs: 'EPSG:32632' })).toBe('m');
    expect(xyUnitOf({ crs: null })).toBeNull();
    expect(metresPerXy(null)).toBe(1);
    expect(metresPerXy('ft')).toBe(0.3048);
    expect(metresToXy(150, 'ftUS')).toBeCloseTo(150 / M_PER_FT_US, 9);
    expect(() => metresToXy(150, 'deg')).toThrow(/geographic/);
  });
});

import { topMapKind, describeGridResult } from '../services/gridStatus';
import { topsToControlPoints } from '../engine/surface';

describe('MAP-U1-002: a TVD top map is not a structure map', () => {
  // two vertical wells, the same horizon at -1500 m TVDSS, KBs 30 m and 90 m apart
  const wells = [
    { name: 'A', surface_x: 0, surface_y: 0, kb_m: 30, td_md_m: 2000, deviation: [], tops: [{ name: 'T', md_m: 1530 }] },
    { name: 'B', surface_x: 1000, surface_y: 0, kb_m: 120, td_md_m: 2000, deviation: [], tops: [{ name: 'T', md_m: 1620 }] },
  ];

  test('TVDSS agrees across KBs and is published as a structure; TVD disagrees and is an attribute', () => {
    const ss = topsToControlPoints(wells, 'T', { depthRef: 'tvdss' }).points.map((p) => p.z);
    const tvd = topsToControlPoints(wells, 'T', { depthRef: 'tvd' }).points.map((p) => p.z);
    expect(ss[0]).toBeCloseTo(ss[1], 6);          // one horizon, one elevation
    expect(Math.abs(tvd[0] - tvd[1])).toBeCloseTo(90, 6); // TVD differs by the KB difference
    expect(topMapKind('tvdss', 'T')).toMatchObject({ kind: 'structure', name: 'T structure' });
    const k = topMapKind('tvd', 'T');
    expect(k).toMatchObject({ kind: 'attribute', name: 'T TVD (below KB, m)', zUnit: 'm' });
    // the published values are positive metres below KB
    expect(tvd.map((z) => k.zSign * z)).toEqual([1530, 1620]);
    expect(topMapKind('md', 'T')).toMatchObject({ kind: 'attribute', zSign: 1 });
  });

  test('the status never calls TVD or MD an elevation', () => {
    const spec = { nx: 3, ny: 3 };
    const say = (depthRef) => describeGridResult({ name: 'X', result: { points: [], skipped: [], extrapolated: 0, depthRef }, spec, depthUnit: 'ft' });
    expect(say('tvdss')).toContain('(TVDSS elevation, ft)');
    expect(say('tvd')).toContain('(TVD below KB, m, an attribute)');
    expect(say('md')).not.toContain('elevation');
  });
});
