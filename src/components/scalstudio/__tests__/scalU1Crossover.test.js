/**
 * SCAL-U1-006 (S4, PL1): the "Crossover Sw" card. T1 oracle: 0.35 S^2.5 =
 * 0.9 (1 - S)^2 on the default set at S = 0.6418 (the spec comment rounds it to
 * 0.6415), so Sw = 0.2 + 0.55 x 0.6418 = 0.5530. The card took the first row of the 101-interval chart grid
 * past the crossing (0.554).
 */
import { crossoverSw } from '@/utils/scalstudio/series';
import { coreyKr } from '@/utils/fractionalFlowCalculations';
import { buildCoreyOilWater } from '@/utils/scalCalculations';
import { buildOwParams, DEFAULT_CURVES } from '@/utils/scalstudio/workspace';

const p = buildOwParams(DEFAULT_CURVES.ow).params;

test('solved on the curves: krw equals kro at the returned Sw, 0.5530', () => {
  const sw = crossoverSw(p);
  expect(sw).toBeCloseTo(0.5530, 4);
  expect(sw.toFixed(3)).toBe('0.553');
  const { krw, kro } = coreyKr(sw, p);
  expect(Math.abs(krw - kro)).toBeLessThan(1e-12);
});

test('negative control: the grid row the card used reads 0.554', () => {
  const rows = buildCoreyOilWater(p, { n: 101 }).rows;
  expect(rows.find((r) => r.krw >= r.kro).Sw.toFixed(3)).toBe('0.554');
});

test('a tiny krw still crosses inside the mobile range, near 1 - Sor; no parameters give null', () => {
  const sw = crossoverSw({ ...p, krwMax: 1e-6 });
  expect(sw).toBeGreaterThan(0.74);
  expect(sw).toBeLessThan(0.75);
  expect(crossoverSw(null)).toBeNull();
});
