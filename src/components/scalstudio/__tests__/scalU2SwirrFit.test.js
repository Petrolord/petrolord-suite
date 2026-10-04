/**
 * SCAL-U2-006 in the app: the shared Swirr of the averaged J can be fitted
 * (the engine's three-parameter fitJPowerLaw on the pooled lab J of the
 * included samples) instead of taken as the lowest Sw less 0.02. On the
 * demo pair (two rocks from one J curve with Swirr 0.12, b 1.45) the
 * data-driven Swirr gives b 1.15 (SCAL-U1-019); the fitted one gives the
 * generating curve back.
 */
import { fitJPowerLaw } from '@/utils/scalCalculations';
import { deriveScalState } from '@/utils/scalstudio/workspace';
import { buildDemoSamples } from '@/components/scalstudio/demoSamples';
import { openingInputs, stateOf, reportOf } from './scalTestKit';

const demoInputs = (capillary = {}) => {
  const inputs = openingInputs();
  inputs.samples = buildDemoSamples().map((s, i) => ({ ...s, id: `demo-${i}` }));
  inputs.capillary = { ...inputs.capillary, jMode: 'samples', includedSampleIds: ['demo-0', 'demo-1'], ...capillary };
  return inputs;
};

describe('fit Swirr for the averaged J', () => {
  it('NEGATIVE CONTROL (the U1 state): the data-driven Swirr gives b near 1.15 on the demo pair', () => {
    const s = deriveScalState(demoInputs());
    expect(s.jResolved.meta.swirr.from).toBe('data');
    expect(s.jResolved.jSpec.Swirr).toBeCloseTo(0.16, 10);
    expect(Math.abs(s.jResolved.jSpec.b - 1.15)).toBeLessThan(0.05);
  });

  it('fitted, the Swirr is the engine\'s three-parameter fit of the pooled lab J, and b comes back to 1.45', () => {
    const s = deriveScalState(demoInputs({ SwirrFit: true }));
    const pooled = s.samplesDerived.flatMap((x) => x.jRows);
    const direct = fitJPowerLaw(pooled, { fitSwirr: true });
    expect(s.jResolved.meta.swirr.from).toBe('fitted');
    expect(s.jResolved.jSpec.Swirr).toBe(direct.Swirr);
    expect(s.jResolved.meta.swirr.fit.ci95).toEqual(direct.ci95.Swirr);
    expect(s.jResolved.jSpec.Swirr).toBeCloseTo(0.12, 3);
    // the averaging with the true Swirr gives b 1.467 (SCAL-U1-019); the fitted Swirr gives the same
    const withTruth = deriveScalState(demoInputs({ SwirrOverride: '0.12' }));
    expect(s.jResolved.jSpec.b).toBeCloseTo(withTruth.jResolved.jSpec.b, 3);
    expect(Math.abs(s.jResolved.jSpec.b - 1.45)).toBeLessThan(0.03);
  });

  it('an override typed beside the fit is not used: the fit wins and the meta says so', () => {
    const s = deriveScalState(demoInputs({ SwirrFit: true, SwirrOverride: '0.05' }));
    expect(s.jResolved.meta.swirr.from).toBe('fitted');
  });

  it('the kr-1 block, the inputs table and the J section say the Swirr was fitted, with its interval', () => {
    const inputs = demoInputs({ SwirrFit: true });
    const c = stateOf(inputs).contract;
    expect(c.capillary.j.swirr_from).toBe('fitted');
    expect(c.capillary.j.swirr_fit.ci95).toHaveLength(2);
    const { model } = reportOf(inputs);
    const row = model.inputs.rows.find((r) => r.key === 'j.Swirr');
    expect(row.source).toMatch(/^Fitted with a and b to the pooled lab J of the included samples \(95% CI [0-9.]+ to [0-9.]+, 16 points, r2 [0-9.]+ in log space\)$/);
    expect(model.jSection.text).toMatch(/One Swirr, 0\.12\d* \(fitted with a and b/);
  });
});
