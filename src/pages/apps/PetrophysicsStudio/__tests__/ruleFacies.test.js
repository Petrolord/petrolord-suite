// PT9e: rule-based facies — first matching class wins, missing inputs
// fail a condition, a conditionless class is the fallthrough, validation
// names every problem, thickness sums to the log length.

import { classifyRules, validateRules, defaultRules, classThickness, rulesCurves, describeRule } from '../services/ruleFacies';

const curves = {
  VSH: Float64Array.from([0.1, 0.2, 0.5, 0.9, NaN]),
  PHIE: Float64Array.from([0.2, 0.05, 0.15, 0.02, 0.2]),
  SW: Float64Array.from([0.3, 0.3, 0.9, 1, 0.3]),
};

test('default rules classify in order; NaN input fails its condition and falls through', () => {
  const rules = defaultRules();
  const { data, missing } = classifyRules(curves, rules, 5);
  expect(missing).toEqual([]);
  // 0: clean, porous, low Sw -> Pay sand; 1: clean but tight -> Tight sand;
  // 2: Vsh 0.5 -> Shaly sand; 3: Vsh 0.9 -> Shale (fallthrough);
  // 4: VSH NaN fails every Vsh condition -> Shale (the only conditionless class)
  expect(Array.from(data)).toEqual([0, 2, 3, 4, 4]);
});

test('no fallthrough class leaves unmatched samples NaN; missing curves are reported', () => {
  const rules = [{ name: 'Sand', color: '#fff', conditions: [{ curve: 'VSH', op: '<', value: 0.35 }, { curve: 'KPERM', op: '>', value: 1 }] }];
  const { data, missing } = classifyRules(curves, rules, 5);
  expect(missing).toEqual(['KPERM']);
  expect(Array.from(data).every(Number.isNaN)).toBe(true);
  expect(rulesCurves(rules)).toEqual(['VSH', 'KPERM']);
});

test('validation: names, duplicates, operators, numbers', () => {
  expect(validateRules(defaultRules())).toEqual([]);
  const bad = [
    { name: '', conditions: [] },
    { name: 'A', conditions: [{ curve: 'VSH', op: '~', value: 'x' }] },
    { name: 'a', conditions: [] },
  ];
  const p = validateRules(bad);
  expect(p.some((m) => m.includes('no name'))).toBe(true);
  expect(p.some((m) => m.includes('unknown operator'))).toBe(true);
  expect(p.some((m) => m.includes('needs a number'))).toBe(true);
  expect(p.some((m) => m.includes('used twice'))).toBe(true);
});

test('class thickness sums to the log length and names unclassified samples', () => {
  const depth = Float64Array.from([2000, 2000.5, 2001, 2001.5, 2002]);
  const data = Float64Array.from([0, 0, 1, NaN, 1]);
  const { thickness, unclassified } = classThickness(depth, data, 2);
  expect(thickness[0]).toBeCloseTo(1.0, 12);
  expect(thickness[1]).toBeCloseTo(1.0, 12);
  expect(unclassified).toBeCloseTo(0.5, 12);
  expect(describeRule(defaultRules()[0])).toBe('VSH < 0.35 and PHIE >= 0.1 and SW <= 0.6');
  expect(describeRule(defaultRules()[4])).toBe('everything else');
});
