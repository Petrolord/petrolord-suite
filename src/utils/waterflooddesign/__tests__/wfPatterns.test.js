/**
 * WF-U2-002: the line drive patterns in the app. The engine gate is
 * packages/engines/__tests__/waterflood.wfu2.test.js (Ahmed Example 14-11,
 * the Fassihi table, the fixed point); here the app passes the pattern to
 * the engine, the report and the contract name it, and a project without a
 * pattern stays a five-spot with the numbers it had.
 */
import { reviewerPayload, BUILDERS, reportOf } from '@/components/waterflooddesign/__tests__/wfTestKit';
import { forecastPattern, fassihiArealSweep } from '@/utils/patternForecastCalculations';
import { buildWfForecastContract } from '../wfForecastContract';
import { mcInputsFingerprint } from '../mcSummary';
import { DEFAULT_PATTERN } from '@/contexts/WaterfloodDesignContext';

const withPattern = (patternType) => {
  const p = reviewerPayload();
  p.patternInputs = { ...p.patternInputs, patternType };
  return p;
};

describe('the flood pattern in Waterflood Design Studio', () => {
  it('a project without a pattern is a five-spot with the forecast it had (no number moves)', () => {
    const p = reviewerPayload();
    expect(p.patternInputs.patternType).toBeUndefined();
    const built = BUILDERS.buildPatternInputs(p.patternInputs);
    expect(built.patternType).toBe('five-spot');
    const spec = BUILDERS.buildDisplacementSpec(p.displacementInputs).spec;
    const { patternType: _t, ...asBefore } = built;
    expect(forecastPattern({ displacementSpec: spec, pattern: built }).series).toEqual(forecastPattern({ displacementSpec: spec, pattern: asBefore }).series);
    // DEFAULT_PATTERN has no pattern key, so a saved Monte Carlo summary keeps its fingerprint
    expect(Object.keys(DEFAULT_PATTERN)).not.toContain('patternType');
    expect(mcInputsFingerprint({ displacementInputs: p.displacementInputs, patternInputs: { ...DEFAULT_PATTERN, ...p.patternInputs }, uncertaintyConfig: {} }))
      .toBe(mcInputsFingerprint({ displacementInputs: p.displacementInputs, patternInputs: { ...p.patternInputs, ...DEFAULT_PATTERN, ...p.patternInputs }, uncertaintyConfig: {} }));
  });

  it('a staggered line drive reaches the engine, the report and the contract', () => {
    const p = withPattern('staggered-line');
    const r = reportOf(p);
    const sum = r.state.patternResult.summary;
    expect(sum.patternType).toBe('staggered-line');
    expect(sum.EAbt).toBeCloseTo(fassihiArealSweep('staggered-line', sum.M, 0), 14);
    const ident = Object.fromEntries(r.model.identification);
    expect(ident['Analysis type']).toMatch(/staggered line drive pattern forecast/);
    const row = r.model.inputs.rows.find((x) => x.key === 'patternType');
    expect(row.value).toBe('Staggered line drive');
    expect(row.source).toMatch(/^Chosen in the app: staggered line drive: Fassihi/);
    expect(r.model.model.find((x) => x[0] === 'Areal sweep')[1]).toMatch(/Ahmed eq\. 14-67/);
    expect(r.model.limits.ranges.rows[0][0]).toBe('Staggered line drive areal sweep (Fassihi regression)');
    const k = buildWfForecastContract({ projectId: 'x', payload: { ...p, floodStart: '2027-01-01' } }, BUILDERS).contract;
    expect(k.model.pattern).toBe('staggered-line');
    expect(k.model.arealSweep.correlation).toMatch(/Fassihi/);
  });

  it('the five-spot report keeps its words', () => {
    const r = reportOf(reviewerPayload());
    expect(r.model.model.find((x) => x[0] === 'Areal sweep')[1]).toMatch(/^Five-spot: EA at breakthrough from Craig/);
    expect(JSON.stringify(r.model)).not.toMatch(/Fassihi \(1986\)/);
  });
});
