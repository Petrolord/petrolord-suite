import { zoneCatalog, registryPatchForZone, areaPatchForSurface, aoiFromBoundary, isBoundaryLayer, describePatch } from '../registryDoor';
import { NULL_VALUE } from '@/lib/gridding/numeric';

const wells = [
  { name: 'A', zones: [{ name: 'Sand', properties: { phi_avg: 0.2, sw_avg: 0.3, ntg: 0.8, net_m: 20 } }] },
  { name: 'B', zones: [{ name: 'Sand', properties: { phi_avg: 0.3, sw_avg: 0.5, ntg: 0.6, net_m: 40 } }, { name: 'Shale', properties: {} }] },
  { name: 'C', zones: [{ name: 'Sand' }] },
];

test('zoneCatalog counts wells and publishes per zone', () => {
  expect(zoneCatalog(wells)).toEqual([{ name: 'Sand', wells: 3, published: 2 }, { name: 'Shale', wells: 1, published: 0 }]);
});

test('registryPatchForZone averages the published wells and converts net thickness to the system unit', () => {
  const f = registryPatchForZone(wells, 'Sand', 'field');
  expect(f.fromWells).toBe(2);
  expect(f.wellNames).toEqual(['A', 'B']);
  expect(f.patch.porosity).toBeCloseTo(0.25, 9);
  expect(f.patch.sw).toBeCloseTo(0.4, 9);
  expect(f.patch.ntg).toBeCloseTo(0.7, 9);
  expect(f.patch.thickness).toBeCloseTo(30 / 0.3048, 6);
  expect(f.provenance).toMatchObject({ source: 'shared-registry', zone: 'Sand', wells: ['A', 'B'] });
  expect(registryPatchForZone(wells, 'Sand', 'metric').patch.thickness).toBeCloseTo(30, 9);
  expect(() => registryPatchForZone(wells, 'Shale')).toThrow(/Publish zone summaries/);
  expect(describePatch(f.patch)).toMatch(/porosity 0\.250, Sw 0\.400, NTG 0\.700, net thickness 98\.4 ft/);
});

test('areaPatchForSurface measures the live footprint in the canonical area unit', () => {
  const surface = { id: 's1', name: 'Dome', dx: 100, dy: 100 };
  const grid = Float32Array.from([1, 2, NULL_VALUE, 4]); // 3 live nodes = 30,000 m2
  expect(areaPatchForSurface(surface, grid, 'field').patch.area).toBeCloseTo(30000 / 4046.8564224, 9);
  expect(areaPatchForSurface(surface, grid, 'metric').patch.area).toBeCloseTo(0.03, 9);
  expect(() => areaPatchForSurface(surface, Float32Array.from([NULL_VALUE]))).toThrow(/no live nodes/);
});

test('aoiFromBoundary builds an AOI from the first ring and records its source', () => {
  const row = { id: 'c1', name: 'Lease', kind: 'boundary', geometry_type: 'polygon' };
  const aoi = aoiFromBoundary(row, [{ type: 'polygon', rings: [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]] }]);
  expect(aoi.name).toBe('Lease');
  expect(aoi.vertices).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]);
  expect(aoi.area).toBeCloseTo(10000, 6);
  expect(aoi.source).toMatchObject({ kind: 'geo_culture', id: 'c1' });
  expect(() => aoiFromBoundary(row, [{ type: 'point' }])).toThrow(/no polygon/);
  expect(isBoundaryLayer({ kind: 'license_block', geometry_type: 'polygon' })).toBe(true);
  expect(isBoundaryLayer({ kind: 'fault_polygon', geometry_type: 'polygon' })).toBe(false);
});
