/**
 * G5.4 — the loop acceptance, in code: shared-registry data (a mapped
 * surface's area + published zone averages) flows into RCP volumetric
 * inputs, produces an unrisked volume, and gets risked — with ZERO file
 * exports. This is the "logs → tops → correlation → surface → risked
 * volumes on one shared dataset" chain the roadmap requires, exercised
 * through the real engines end to end.
 */

import { buildRegistryInputs } from '../registryInputs';
import { riskProspect, chanceOfSuccess } from '../ProspectRiskEngine';
import { VolumeCalculationEngine } from '../VolumeCalculationEngine';

const NULL_VALUE = 1e30;

test('registry surface + zones -> RCP inputs -> volume -> risked volume', () => {
  // a mapped surface (G4): 40x40 grid of 100 m cells, all live -> a
  // known planimetric area; and published zone averages (G2.5).
  const nx = 40;
  const ny = 40;
  const grid = new Float32Array(nx * ny).fill(1500);
  const surface = { name: 'Top Dome structure', nx, ny, dx: 100, dy: 100 };
  const zones = [
    { properties: { phi_avg: 0.22, sw_avg: 0.30, ntg: 0.85, net_m: 20 } },
    { properties: { phi_avg: 0.24, sw_avg: 0.34, ntg: 0.80, net_m: 24 } },
  ];

  // build inputs straight from the registry (no file)
  const { patch, provenance } = buildRegistryInputs({ zones, surface, grid, areaUnit: 'acres' });
  expect(provenance.source).toBe('shared-registry');
  expect(patch.area).toBeGreaterThan(0);
  expect(patch.porosity).toBeCloseTo(0.23, 10);
  expect(patch.thickness).toBeCloseTo(22, 10);

  // feed RCP's real deterministic volumetrics (simple/analytic method).
  // signature: calculateDeterministic(inputs, unitSystem, inputMethod);
  // recovery is a percentage.
  const inputs = {
    ...patch,
    sw: patch.sw, ntg: patch.ntg, thickness: patch.thickness, area: patch.area,
    fluidType: 'oil', bo: 1.25, recovery: 30, porosity: patch.porosity,
  };
  const result = VolumeCalculationEngine.calculateDeterministic(inputs, 'field', 'simple');
  const stooip = result.stooip;
  expect(Number.isFinite(stooip)).toBe(true);
  expect(stooip).toBeGreaterThan(0);

  // risk it (G5.0) — the loop's end
  const risked = riskProspect({
    name: 'Registry Prospect',
    factors: { trap: 0.5, reservoir: 0.7, charge: 0.9, seal: 0.8 },
    unrisked: { mean: stooip },
  });
  expect(risked.pg).toBeCloseTo(chanceOfSuccess({ trap: 0.5, reservoir: 0.7, charge: 0.9, seal: 0.8 }), 12);
  expect(risked.riskedMean).toBeCloseTo(risked.pg * stooip, 6);
  // success case is the unscaled in-place volume; risked mean is smaller
  expect(risked.successCase.mean).toBe(stooip);
  expect(risked.riskedMean).toBeLessThan(stooip);
});
