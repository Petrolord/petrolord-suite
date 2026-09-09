// Owner decision 1 (2026-09-09): one meaning of a P-label across the Suite,
// probability of exceedance of a hydrocarbon outcome (SPE PRMS / SEC).
// These are the two gates the decision asked for, plus the strings.

import fs from 'fs';
import path from 'path';
import {
  EXCEEDANCE_DEFINITION, OUTCOME_LABELS, OUTCOME_ORDER, P_LABELS, CASES,
  parameterPercentileLabel, casePercentile, caseLabel, caseOutcomeLabel, findPLabels, outcomeOrderViolation,
} from '../percentileConventions';
import {
  runProbabilistic, distFromPercentiles, quantileSuffix, QUANTILE_CURVES, OUTCOME_FIELDS, PARAMETER_FIELDS,
  EXCEEDANCE_DEFINITION as ENGINE_DEFINITION,
} from '@/pages/apps/PetrophysicsStudio/engine/probabilistic';
import { DEFAULT_PARAMS } from '@/pages/apps/PetrophysicsStudio/engine/pipeline';

test('the words: definition sentence (shared with the engine), outcome labels, case labels with the direction, parameter percentiles', () => {
  expect(EXCEEDANCE_DEFINITION).toBe('P90 means a 90% probability the actual quantity meets or exceeds this value, per SPE PRMS.');
  expect(ENGINE_DEFINITION).toBe(EXCEEDANCE_DEFINITION);
  expect(OUTCOME_LABELS).toEqual({ p90: 'P90', p50: 'P50', p10: 'P10' });
  expect(OUTCOME_ORDER).toEqual(['p90', 'p50', 'p10']);
  expect(P_LABELS).toEqual(['P10', 'P50', 'P90']);
  expect(CASES.map((c) => c.label)).toEqual(['Low case', 'Best case', 'High case']);
  expect(caseOutcomeLabel('low')).toBe('P90');
  expect(caseOutcomeLabel('high')).toBe('P10');
  expect(parameterPercentileLabel('Sw', 'q90')).toBe('90th percentile of Sw');
  expect(parameterPercentileLabel('PHIE', 10)).toBe('10th percentile of PHIE');
  expect(parameterPercentileLabel(null, 'q50')).toBe('50th percentile');
  // the Sw example: low case Sw is the high value; low case porosity the low value
  expect(casePercentile('low', false)).toBe('q90');
  expect(casePercentile('high', false)).toBe('q10');
  expect(casePercentile('low', true)).toBe('q10');
  expect(casePercentile('best', true)).toBe('q50');
  expect(caseLabel('low', 'Sw', false)).toBe('Low case Sw (high value)');
  expect(caseLabel('high', 'Sw', false)).toBe('High case Sw (low value)');
  expect(caseLabel('low', 'porosity', true)).toBe('Low case porosity (low value)');
  expect(caseLabel('best', 'Sw', false)).toBe('Best case Sw');
});

test('gate: no P-label on any parameter output (engine curve names, zone parameter keys, the label builder)', () => {
  const names = [
    ...QUANTILE_CURVES.flatMap((c) => [0.1, 0.5, 0.9].map((q) => `${c}_${quantileSuffix(q)}`)),
    ...PARAMETER_FIELDS.flatMap((f) => ['q10', 'q50', 'q90'].map((k) => `${f}.${k}`)),
    ...['Sw', 'PHIE', 'k'].flatMap((qty) => ['q10', 'q50', 'q90'].map((k) => parameterPercentileLabel(qty, k))),
    ...['Sw', 'PHIE'].flatMap((qty) => ['low', 'best', 'high'].map((c) => caseLabel(c, qty, qty !== 'Sw'))),
  ];
  expect(findPLabels(names)).toEqual([]);
  // and the helper does catch one
  expect(findPLabels(['Sw P90', 'ok', 'P10 of phi'])).toEqual(['Sw P90', 'P10 of phi']);
  expect(findPLabels(['SP90', 'P100'])).toEqual([]);
});

test('gate: P90 <= P50 <= P10 on every published outcome case of a type-well run', () => {
  const DATA_DIR = path.join(__dirname, '..', '..', '..', 'packages', 'engines', 'test-data', 'petrophysics');
  const typewell = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'typewell.json'), 'utf8'));
  const curve = (name) => Float64Array.from(typewell.curves[name], (v) => (v === null ? NaN : v));
  const curves = { DEPT: curve('DEPT'), GR: curve('GR'), RHOB: curve('RHOB'), NPHI: curve('NPHI'), DT: curve('DT'), RT: curve('RT') };
  const zones = Object.entries(typewell.params.zones).map(([name, [top, base]]) => ({ id: name, name, top_md_m: top, base_md_m: base }));
  const spec = { rw: distFromPercentiles(0.04, 0.05, 0.06), cutSw: distFromPercentiles(0.55, 0.6, 0.65), phiShale: distFromPercentiles(0.04, 0.06, 0.08) };
  const res = runProbabilistic(curves, { ...DEFAULT_PARAMS, phiShale: typewell.params.phi_shale }, [], spec, { n: 120, seed: 9, zones });
  expect(res.zones.length).toBe(2);
  for (const z of res.zones) {
    for (const f of OUTCOME_FIELDS) expect(outcomeOrderViolation(z.outcomes[f], `${z.name}.${f}`)).toBeNull();
  }
  expect(outcomeOrderViolation({ p90: 5, p50: 4, p10: 6 }, 'x')).toMatch(/violated/);
  expect(outcomeOrderViolation({ p90: NaN, p50: 4, p10: 6 }, 'x')).toBeNull();
});
