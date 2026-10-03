/**
 * SCAL-U1-001 (S1): the averaged Leverett J of several core samples.
 *
 * averageJCurves normalises each sample to Sw* = (Sw - Swirr)/(1 - Swirr).
 * Without an override it took each sample's OWN Swirr (just under its own
 * lowest Sw), while buildJSpec mapped the averaged fit back to true Sw with
 * ONE Swirr (just under the lowest Sw of all samples). Two rocks generated
 * from one true J curve, whose data start at different water saturations,
 * came back with J 16 percent low at Sw 0.5 and 49 percent low at Sw 0.2,
 * with a refit r2 of 0.989 and no warning. Pc, the saturation-height
 * profile and the Sw that Petrophysics, Earth Modeling, Rock Physics and
 * ReservoirCalc Pro read from a SCAL project all follow the J curve.
 *
 * The gate calls buildJSpec, the function the app and those four consumers
 * call (shmFromScalProject), on a case where the two Swirr values differ.
 * The negative control rebuilds the old path from the engine and shows it
 * fails the same tolerance.
 */
import { buildJSpec, DEFAULT_CAPILLARY } from '@/contexts/ScalStudioContext';
import {
  computeJTable, averageJCurves, makeJFunction, LEVERETT_C,
} from '@/utils/scalCalculations';

const TRUE_J = { a: 0.28, b: 1.45, Swirr: 0.12 };
const jTrue = (Sw) => TRUE_J.a * Math.pow((Sw - TRUE_J.Swirr) / (1 - TRUE_J.Swirr), -TRUE_J.b);
const pcRows = (rock, sws) => sws.map((Sw) => ({ Sw, Pc_psi: (jTrue(Sw) * rock.sigma_dyncm) / (LEVERETT_C * Math.sqrt(rock.k_md / rock.phi)) }));
const ROCK_A = { k_md: 420, phi: 0.27, sigma_dyncm: 72, thetaDeg: 0 };
const ROCK_B = { k_md: 35, phi: 0.16, sigma_dyncm: 72, thetaDeg: 0 };
const samples = [
  { id: 'a', name: 'A', jRows: computeJTable(pcRows(ROCK_A, [0.15, 0.2, 0.3, 0.45, 0.6, 0.8, 0.95]), ROCK_A).rows },
  { id: 'b', name: 'B', jRows: computeJTable(pcRows(ROCK_B, [0.3, 0.35, 0.45, 0.6, 0.8, 0.95]), ROCK_B).rows },
];
const cap = (extra = {}) => ({ ...DEFAULT_CAPILLARY, jMode: 'samples', includedSampleIds: ['a', 'b'], SwirrOverride: '', ...extra });
const relErr = (spec, Sw) => Math.abs(makeJFunction(spec).j(Sw) / jTrue(Sw) - 1);

describe('SCAL-U1-001: one Swirr normalises the samples and maps the average back', () => {
  it('two rocks from one J curve, different lowest Sw: the working J is within 2 percent at Sw 0.5 and 0.8', () => {
    const { jSpec, meta, error } = buildJSpec(cap(), samples);
    expect(error).toBeNull();
    expect(jSpec.Swirr).toBeCloseTo(0.13, 12); // lowest Sw of all samples (0.15) less 0.02
    expect(meta.swirr).toEqual({ value: jSpec.Swirr, from: 'data' });
    expect(relErr(jSpec, 0.5)).toBeLessThan(0.02);
    expect(relErr(jSpec, 0.8)).toBeLessThan(0.02);
    expect(relErr(jSpec, 0.3)).toBeLessThan(0.05);
  });

  it('an override is used both ways and reported as entered', () => {
    const { jSpec, meta } = buildJSpec(cap({ SwirrOverride: '0.12' }), samples);
    expect(jSpec.Swirr).toBe(0.12);
    expect(meta.swirr).toEqual({ value: 0.12, from: 'override' });
    expect(relErr(jSpec, 0.5)).toBeLessThan(0.02);
  });

  it('an override at or above a sample\'s lowest Sw is refused with the sample named', () => {
    const { jSpec, error } = buildJSpec(cap({ SwirrOverride: '0.2' }), samples);
    expect(jSpec).toBeNull();
    expect(error).toMatch(/0\.2.*below the lowest Sw of sample "A" \(0\.15\)/);
  });

  it('negative control: the old path (per-sample Swirr, one Swirr back) is 16 percent low at Sw 0.5', () => {
    const avg = averageJCurves(samples.map((s) => ({ name: s.name, jRows: s.jRows })), {});
    const old = { type: 'power', a: avg.fit.a, b: avg.fit.b, Swirr: 0.13 };
    expect(relErr(old, 0.5)).toBeGreaterThan(0.1);
    expect(avg.fit.r2Log).toBeGreaterThan(0.98); // why nothing warned
  });

  it('samples that start at the same Sw are unchanged (the demo pair case)', () => {
    const same = [samples[0], { ...samples[1], jRows: computeJTable(pcRows(ROCK_B, [0.15, 0.2, 0.3, 0.45, 0.6, 0.8, 0.95]), ROCK_B).rows }];
    const now = buildJSpec(cap(), same).jSpec;
    const avg = averageJCurves(same.map((s) => ({ name: s.name, jRows: s.jRows })), {});
    expect(now.a).toBeCloseTo(avg.fit.a, 12);
    expect(now.b).toBeCloseTo(avg.fit.b, 12);
  });
});
