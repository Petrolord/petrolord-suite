// MAP-U1-031 (Earth Modeling upgrade U1, 2026-09-30): a Well Design target
// from a registry surface goes through the shared door. Before: TVDSS was
// Math.abs(z) with no ft to m, and MD/TVD attribute maps and isochores were
// read as TVDSS.
jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('@/lib/wellsRegistry', () => ({}));
jest.mock('@/lib/surfacesRegistry', () => ({}));

// eslint-disable-next-line import/first
import { targetDepthFromSurface, sampleGrid } from '../components/TargetFromRegistryDialog';

const row = (extra = {}) => ({
  id: 's1', name: 'Top Keta', kind: 'structure', z_domain: 'depth', z_unit: 'm', xy_unit: 'm', crs: 'EPSG:32631',
  origin_x: 1000, origin_y: 2000, dx: 100, dy: 100, nx: 3, ny: 3, ...extra,
});
const flat = (v) => new Float32Array(9).fill(v);

test('an elevation in feet becomes TVDSS in metres (before: 8202 "m")', () => {
  const t = targetDepthFromSurface(row({ z_unit: 'ft' }), flat(-8202), 1100, 2100);
  expect(t.tvdss_m).toBeCloseTo(8202 * 0.3048, 3);
  // negative control: the old arithmetic
  expect(Math.abs(sampleGrid(row({ z_unit: 'ft' }), flat(-8202), 1100, 2100))).toBeCloseTo(8202, 3);
});

test('a metre elevation gives positive TVDSS; a point above the datum stays negative', () => {
  expect(targetDepthFromSurface(row(), flat(-2500), 1150, 2050).tvdss_m).toBeCloseTo(2500, 3);
  expect(targetDepthFromSurface(row(), flat(120), 1150, 2050).tvdss_m).toBeCloseTo(-120, 3);
});

test('MD/TVD attribute maps, isochores and time rows are refused with the reason', () => {
  expect(() => targetDepthFromSurface(row({ kind: 'attribute', z_domain: 'attribute' }), flat(2500), 1100, 2100)).toThrow(/attribute map/);
  expect(() => targetDepthFromSurface(row({ kind: 'isochore' }), flat(40), 1100, 2100)).toThrow(/isochore/);
  expect(() => targetDepthFromSurface(row({ z_domain: 'time', z_unit: 'ms' }), flat(1800), 1100, 2100)).toThrow(/Depth-convert/);
});

test('a rotated lattice is sampled where the point is (before: the unrotated arithmetic)', () => {
  // z rises 10 m per column along the grid's local X, turned 90 degrees: local X points north
  const g = new Float32Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) g[r * 3 + c] = -(2000 + 10 * c);
  const rot = row({ rotation_deg: 90 });
  // 200 m north of the origin is column 2 on the rotated lattice
  expect(targetDepthFromSurface(rot, g, 1000, 2200).tvdss_m).toBeCloseTo(2020, 3);
  expect(() => targetDepthFromSurface(rot, g, 1200, 2000)).toThrow(/outside the surface grid/);
});
