// The registry depth convention (elevation, m|ft) in one place.
import {
  surfaceZSign, surfaceZUnitToM, zConventionForImport, surfaceZToDepthDown, depthDownToSurfaceZ, M_PER_FT,
} from '../surfaceConvention';

const isNull = (v) => !Number.isFinite(v) || Math.abs(v) >= 1e29;

test('depth rows are elevation (sign -1); time, attribute and isochore rows pass through', () => {
  expect(surfaceZSign({ z_domain: 'depth' })).toBe(-1);
  for (const d of ['time', 'attribute', 'isochore', undefined]) expect(surfaceZSign({ z_domain: d })).toBe(1);
  expect(zConventionForImport({ z_domain: 'depth', provenance: { engine: 'mapping-surface-studio' } })).toBe('elevation');
  expect(zConventionForImport({ z_domain: 'depth', provenance: { app: 'seismolord' } })).toBe('elevation');
  expect(zConventionForImport({ z_domain: 'attribute' })).toBe('depth');
});

test('surfaceZToDepthDown negates and converts feet to metres, keeps nulls and the array type', () => {
  const ft = Float32Array.from([-5000, -4921.26, 1e30]);
  const m = surfaceZToDepthDown({ z_domain: 'depth', z_unit: 'ft' }, ft);
  expect(m).toBeInstanceOf(Float32Array);
  expect(m[0]).toBeCloseTo(5000 * M_PER_FT, 2);
  expect(m[1]).toBeCloseTo(1500, 1);
  expect(isNull(m[2])).toBe(true);
  expect(surfaceZUnitToM({ z_unit: 'ft' })).toBe(M_PER_FT);
  expect(surfaceZUnitToM({ z_unit: 'm' })).toBe(1);
  const iso = Float32Array.from([50, 1e30]);
  expect(Array.from(surfaceZToDepthDown({ z_domain: 'isochore' }, iso)).slice(0, 1)).toEqual([50]);
});

test('depthDownToSurfaceZ is the inverse in m and ft', () => {
  const down = Float64Array.from([1500, 0, 1e30]);
  const m = depthDownToSurfaceZ(down);
  expect(Array.from(m).slice(0, 2)).toEqual([-1500, -0]);
  expect(isNull(m[2])).toBe(true);
  const ft = depthDownToSurfaceZ(down, { zUnit: 'ft' });
  expect(ft[0]).toBeCloseTo(-1500 / M_PER_FT, 6);
  const back = surfaceZToDepthDown({ z_domain: 'depth', z_unit: 'ft' }, ft);
  expect(back[0]).toBeCloseTo(1500, 9);
});
