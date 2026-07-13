/**
 * G5.1 — the registry input reader. Exact mapping from published
 * geo_wells_zones properties + a geo_surfaces grid to RCP inputs.
 */

import {
  zoneAveragesToInputs, surfaceAreaM2, surfaceArea, buildRegistryInputs,
} from '../registryInputs';

const NULL_VALUE = 1e30;

const ZONES = [
  { properties: { phi_avg: 0.20, sw_avg: 0.30, ntg: 0.8, net_m: 18 } },
  { properties: { phi_avg: 0.24, sw_avg: 0.34, ntg: 0.9, net_m: 22 } },
  { properties: {} },                 // unpublished -> ignored
  { },                                // no properties -> ignored
];

test('zoneAveragesToInputs averages published properties only', () => {
  const o = zoneAveragesToInputs(ZONES);
  expect(o.fromWells).toBe(2);
  expect(o.porosity).toBeCloseTo(0.22, 10);
  expect(o.sw).toBeCloseTo(0.32, 10);
  expect(o.ntg).toBeCloseTo(0.85, 10);
  expect(o.thickness).toBeCloseTo(20, 10);
});

test('missing keys are absent, not invented', () => {
  const o = zoneAveragesToInputs([{ properties: { phi_avg: 0.2 } }]);
  expect(o.porosity).toBe(0.2);
  expect(o).not.toHaveProperty('sw');
  expect(o).not.toHaveProperty('thickness');
});

test('surfaceAreaM2 counts live nodes × cell area; nulls excluded', () => {
  // 3x2 grid, 4 live + 2 null, 100x100 m cells -> 4*10000 = 40000 m2
  const grid = Float32Array.from([10, 20, NULL_VALUE, 30, 40, NULL_VALUE]);
  expect(surfaceAreaM2({ dx: 100, dy: 100 }, grid)).toBe(40000);
});

test('surfaceArea unit conversions', () => {
  const grid = Float32Array.from([1, 1, 1, 1]); // 4 live
  const s = { dx: 100, dy: 100 }; // 40000 m2
  expect(surfaceArea(s, grid, 'm2')).toBe(40000);
  expect(surfaceArea(s, grid, 'km2')).toBeCloseTo(0.04, 10);
  expect(surfaceArea(s, grid, 'acres')).toBeCloseTo(40000 / 4046.8564224, 8);
});

test('buildRegistryInputs merges zone + surface with provenance', () => {
  const grid = Float32Array.from([1, 1, 1, NULL_VALUE]);
  const { patch, provenance } = buildRegistryInputs({
    zones: ZONES, surface: { name: 'Top Dome structure', dx: 200, dy: 200 }, grid, areaUnit: 'acres',
  });
  expect(patch.porosity).toBeCloseTo(0.22, 10);
  expect(patch.thickness).toBeCloseTo(20, 10);
  expect(patch.area).toBeCloseTo((3 * 200 * 200) / 4046.8564224, 8);
  expect(provenance).toMatchObject({ source: 'shared-registry', wells_averaged: 2, surface: 'Top Dome structure', area_unit: 'acres' });
});

test('surface-only or zones-only patches are valid', () => {
  expect(buildRegistryInputs({ zones: ZONES }).patch).not.toHaveProperty('area');
  const grid = Float32Array.from([1, 1]);
  expect(buildRegistryInputs({ surface: { dx: 10, dy: 10 }, grid }).patch.area).toBeGreaterThan(0);
});
