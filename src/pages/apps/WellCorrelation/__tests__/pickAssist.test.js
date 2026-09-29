/**
 * AppUpgrade WC-U2-009 engine gate (validation-first, the gate calls the
 * engine): the lag suggestion recovers known shifts to within one sample,
 * refuses when there is no pattern to match (negative controls), and the
 * snap finds a known step. The sample KETA section's own tops are the
 * field case: Top Dome is at 1,500 m on KETA-1 and 1,540 m on KETA-2.
 */
import { lagSuggestion, snapSuggestion, sampleAt, MIN_R } from '../services/pickAssist';
import { sampleWells } from '../services/sampleSection';

const grid = (a, b, s) => Array.from({ length: Math.round((b - a) / s) + 1 }, (_, i) => a + i * s);
// a deterministic, non-periodic log: sand/shale beds of varying thickness plus ripple
const bedLog = (z) => 60 + 40 * Math.sign(Math.sin(z / 7.3) + 0.3 * Math.sin(z / 2.1)) + 5 * Math.sin(z * 1.7);

test('sampling is linear between samples and NaN outside', () => {
  expect(sampleAt([0, 1, 2], [0, 10, 20], 1.5)).toBe(15);
  expect(sampleAt([0, 1, 2], [0, 10, 20], 3)).toBeNaN();
});

test.each([12.4, -17.0, 0, 26.2])('recovers a known shift of %p m within one sample', (shift) => {
  const step = 0.1524;
  const d = grid(1000, 1400, step);
  const ref = { depth: d, values: d.map(bedLog), topMd: 1200 };
  const tgt = { depth: d, values: d.map((z) => bedLog(z - shift)), seedMd: 1200 };
  const s = lagSuggestion(ref, tgt);
  expect(s.none).toBeUndefined();
  expect(Math.abs(s.md - (1200 + shift))).toBeLessThanOrEqual(step);
  expect(s.r).toBeGreaterThan(0.95);
});

test('negative controls: a flat log or an unrelated log gets no suggestion', () => {
  const d = grid(1000, 1400, 0.5);
  const ref = { depth: d, values: d.map(bedLog), topMd: 1200 };
  expect(lagSuggestion(ref, { depth: d, values: d.map(() => 75), seedMd: 1200 }).none).toBe(true);
  let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const noise = lagSuggestion(ref, { depth: d, values: d.map(() => 100 * rnd()), seedMd: 1200 });
  expect(noise.none).toBe(true);
  expect(noise.bestR).toBeLessThan(MIN_R);
});

test('field case: the KETA GR logs place Top Dome on KETA-2 at its picked 1,540 m', () => {
  const [w1, w2] = sampleWells();
  const ref = { depth: Array.from(w1.curves.DEPT), values: Array.from(w1.curves.GR), topMd: 1500 };
  const s = lagSuggestion(ref, { depth: Array.from(w2.curves.DEPT), values: Array.from(w2.curves.GR), seedMd: 1525 });
  expect(Math.abs(s.md - 1540)).toBeLessThanOrEqual(1);
});

test('snap finds the strongest change near a pick', () => {
  const d = grid(1000, 1100, 0.25);
  const v = d.map((z) => (z < 1043 ? 110 : 40));
  const s = snapSuggestion(d, v, 1040, { windowM: 5 });
  expect(Math.abs(s.md - 1043)).toBeLessThanOrEqual(1);
  expect(s.from).toBeGreaterThan(s.to);
});

test('the search starts between the tops both wells carry', () => {
  // eslint-disable-next-line global-require
  const { bracketSeed } = require('../services/pickAssist');
  const ref = [{ name: 'A', md_m: 1440 }, { name: 'X', md_m: 1500 }, { name: 'B', md_m: 1580 }];
  const tgt = [{ name: 'A', md_m: 1470 }, { name: 'B', md_m: 1610 }];
  expect(bracketSeed(ref, tgt, 1500)).toEqual({ md: 1470 + (60 / 140) * 140, how: 'between A and B' });
  expect(bracketSeed(ref, [{ name: 'B', md_m: 1600 }], 1500)).toEqual({ md: 1520, how: 'by the offset of B' });
  expect(bracketSeed(ref, [], 1500)).toBeNull();
});
