// VRR-U2-011: a target band per pattern. A pattern with its own band is
// flagged against it and its injection advice aims at its own lower edge;
// a pattern without one follows the field band. The gate calls the engine
// (flagPeriods, recommendPatternInjection) with the pattern band.
import { deriveVrr, resolvePatternBand } from '../workspace';
import { flagPeriods, recommendPatternInjection } from '@/utils/vrrCalculations';
import { demoFieldInputs } from '../demoField';
import { defaultInputs } from '@/contexts/VrrMonitorContext';
import { reportOf, pdfOf } from './vrrTestKit';
import { readPdf, flat } from '@/lib/reportKit/testKit';

const demo = (band) => {
  const base = { ...defaultInputs(), ...demoFieldInputs() };
  return { ...base, patterns: base.patterns.map((p) => (p.name === 'East' ? { ...p, band } : p)) };
};

describe('VRR-U2-011: target band per pattern', () => {
  it('a pattern band: flags and advice against it, through the engine', () => {
    const inputs = demo({ min: '0.8', max: '0.95' });
    const d = deriveVrr(inputs);
    const east = d.patternAnalyses.find((a) => a.pattern.name === 'East');
    expect(east.band).toEqual({ min: 0.8, max: 0.95, from: 'pattern', notes: [] });
    expect(east.flags).toEqual(flagPeriods(east.series, { min: 0.8, max: 0.95 }));
    const engine = recommendPatternInjection(inputs.wellRows, east.pattern, inputs.allocation, inputs.fvf, { targetVRR: 0.8, windowPeriods: 3, periodFvf: null });
    expect(east.recommendation.targetVRR).toBe(0.8);
    expect(east.recommendation.scale).toBeCloseTo(engine.scale, 12);
    // the other pattern keeps the field band
    const west = d.patternAnalyses.find((a) => a.pattern.name === 'West');
    expect(west.band).toMatchObject({ min: 1, max: 1.2, from: 'field' });
    expect(west.recommendation.targetVRR).toBe(1);
  });
  it('NEGATIVE CONTROL: on the field band the same pattern is flagged differently', () => {
    const own = deriveVrr(demo({ min: '0.8', max: '0.95' })).patternAnalyses.find((a) => a.pattern.name === 'East');
    const field = deriveVrr(demo(undefined)).patternAnalyses.find((a) => a.pattern.name === 'East');
    expect(own.flags).not.toEqual(field.flags);
    expect(own.recommendation.scale).not.toBeCloseTo(field.recommendation.scale, 6);
  });
  it('blank, mistyped and reversed bands', () => {
    const field = { min: 1, max: 1.2 };
    expect(resolvePatternBand({ band: { min: '', max: '' } }, field)).toEqual({ min: 1, max: 1.2, from: 'field', notes: [] });
    expect(resolvePatternBand({ name: 'E', band: { min: 'abc', max: '1.1' } }, field)).toEqual({ min: 1, max: 1.2, from: 'field', notes: ['Pattern "E": target band "abc" to "1.1" is not usable; the field band 1 to 1.2 is used.'] });
    expect(resolvePatternBand({ name: 'E', band: { min: '1.1', max: '0.9' } }, field)).toEqual({ min: 0.9, max: 1.1, from: 'pattern', notes: ['Pattern "E": target band min 1.1 is above max 0.9; the two are swapped.'] });
  });
  it('the report prints each pattern band and where it came from', () => {
    const { model } = reportOf(demo({ min: '0.8', max: '0.95' }));
    expect(model.patterns.rollup.head).toContain('Target band');
    const east = model.patterns.rollup.rows.find((r) => r[0] === 'East');
    expect(east).toContain('0.8 to 0.95 (pattern)');
    expect(model.patterns.rollup.rows.find((r) => r[0] === 'West')).toContain('1 to 1.2 (field)');
    const { built } = pdfOf(demo({ min: '0.8', max: '0.95' }));
    const pdf = readPdf(built.doc);
    expect(flat(pdf.text)).toMatch(/East .* 0\.8 to 0\.95 \(pattern\)/);
    pdf.close?.();
  });
});
