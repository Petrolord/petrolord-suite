/**
 * G5.1 — the registry input reader. Exact mapping from published
 * geo_wells_zones properties + a geo_surfaces grid to RCP inputs.
 */

import {
  zoneAveragesToInputs, surfaceAreaM2, surfaceArea, buildRegistryInputs,
} from '../registryInputs';

const NULL_VALUE = 1e30;

const ZONES = [
  { properties: { phi_avg: 0.20, sw_avg: 0.30, ntg: 0.8, net_m: 18, gross_m: 22.5 } },
  { properties: { phi_avg: 0.24, sw_avg: 0.34, ntg: 0.9, net_m: 22, gross_m: 22 / 0.9 } },
  { properties: {} },                 // unpublished -> ignored
  { },                                // no properties -> ignored
];

test('zoneAveragesToInputs averages published properties only', () => {
  const o = zoneAveragesToInputs(ZONES);
  expect(o.fromWells).toBe(2);
  expect(o.porosity).toBeCloseTo(0.22, 10);
  expect(o.sw).toBeCloseTo(0.32, 10);
  expect(o.ntg).toBeCloseTo(0.85, 10);
  // RCP applies NTG to its thickness, so the thickness is GROSS
  expect(o.thickness).toBeCloseTo((22.5 + 22 / 0.9) / 2, 10);
});

// PETRO-U1-001 (S1): the door fed net pay into RCP's gross thickness AND
// set NTG, so GRV x NTG applied net-to-gross twice. Negative control: the
// pre-fix mapping (thickness = net_m) gives 20 x 0.5 = 10 m of pay here.
test('thickness x NTG is the net pay the zone published, not net x NTG', () => {
  const o = zoneAveragesToInputs([{ properties: { phi_avg: 0.2, sw_avg: 0.3, ntg: 0.5, net_m: 20, gross_m: 40 } }]);
  expect(o.thickness * o.ntg).toBeCloseTo(20, 12);
  expect(o.thickness).toBe(40);
});

test('true vertical thickness wins over along-hole when published', () => {
  const o = zoneAveragesToInputs([{ properties: {
    phi_avg: 0.2, ntg: 0.5, net_m: 23.094, gross_m: 46.188, gross_tvt_m: 40, net_tvt_m: 20,
  } }]);
  expect(o.thickness).toBe(40);
  expect(o.ntg).toBeCloseTo(0.5, 12);
  expect(o.thicknessBasis).toBe('gross, true vertical');
});

test('a legacy row with net pay only goes in as gross = net / NTG, or NTG 1', () => {
  expect(zoneAveragesToInputs([{ properties: { phi_avg: 0.2, ntg: 0.8, net_m: 16 } }])).toMatchObject({ thickness: 20, ntg: 0.8 });
  expect(zoneAveragesToInputs([{ properties: { phi_avg: 0.2, net_m: 16 } }])).toMatchObject({ thickness: 16, ntg: 1 });
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
  expect(patch.thickness).toBeCloseTo((22.5 + 22 / 0.9) / 2, 10);
  expect(patch.area).toBeCloseTo((3 * 200 * 200) / 4046.8564224, 8);
  expect(provenance).toMatchObject({ source: 'shared-registry', wells_averaged: 2, surface: 'Top Dome structure', area_unit: 'acres' });
});

test('surface-only or zones-only patches are valid', () => {
  expect(buildRegistryInputs({ zones: ZONES }).patch).not.toHaveProperty('area');
  const grid = Float32Array.from([1, 1]);
  expect(buildRegistryInputs({ surface: { dx: 10, dy: 10 }, grid }).patch.area).toBeGreaterThan(0);
});
