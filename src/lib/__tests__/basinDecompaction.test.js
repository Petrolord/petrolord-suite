/**
 * BF-U2-016 / STRAT-U2-020: Stratigraphy's decompacted rates come from Basin's
 * engine through src/lib/basinDecompaction.js. The decompacted thickness is
 * checked against an independent bisection of the Athy solid-thickness
 * integral; an interval at the surface is not decompacted (control).
 */
import { decompactedRates, DECOMPACTION_SCHEMA } from '../basinDecompaction';
import { LithologyCompaction } from '../../../packages/engines/engines/basin/CompactionModelLibrary';

const solidOf = (top, h, phi0, c) => h + (phi0 / c) * Math.exp(-c * top) * (Math.exp(-c * h) - 1);
const atSurface = (hs, phi0, c) => { let lo = hs; let hi = hs / (1 - phi0) + 1; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (solidOf(0, m, phi0, c) > hs) hi = m; else lo = m; } return (lo + hi) / 2; };

test('a deep shale interval decompacts to the Athy thickness at the surface, with its rates', () => {
  const r = decompactedRates([{ top_m: 3000, base_m: 3500, age_top_ma: 60, age_base_ma: 70, upper: 'A', lower: 'B' }]);
  expect(r.schema).toBe(DECOMPACTION_SCHEMA);
  const { phi0, c } = LithologyCompaction.shale;
  const hs = solidOf(3000, 500, phi0, c);
  const row = r.rows[0];
  expect(row.solidM).toBeCloseTo(hs, 9);
  expect(Math.abs(row.decompactedM - atSurface(hs, phi0, c))).toBeLessThan(1e-5);
  expect(row.decompactedM).toBeGreaterThan(800);
  expect(row.compactedRate).toBeCloseTo(50, 9);
  expect(row.decompactedRate).toBeCloseTo(row.decompactedM / 10, 9);
  expect(r.basis).toMatch(/Basin & Charge Modeling's engine as shale/);
});

test('control: an interval at the sediment surface keeps its thickness; the datum and lithology move the answer; an event bed has no rate', () => {
  const s = decompactedRates([{ top_m: 0, base_m: 0.001, age_top_ma: 0, age_base_ma: 1 }]);
  expect(s.rows[0].decompactedM).toBeCloseTo(0.001, 6);
  const seg = [{ top_m: 2000, base_m: 2400, age_top_ma: 10, age_base_ma: 20 }];
  const offshore = decompactedRates(seg, { datumM: 1500 }).rows[0].decompactedM;
  const onshore = decompactedRates(seg).rows[0].decompactedM;
  expect(offshore).toBeLessThan(onshore);
  expect(decompactedRates(seg, { lithology: 'sandstone' }).rows[0].decompactedM).toBeLessThan(onshore);
  expect(decompactedRates([{ top_m: 100, base_m: 200, age_top_ma: 5, age_base_ma: 5 }]).rows[0].decompactedRate).toBeNull();
});
