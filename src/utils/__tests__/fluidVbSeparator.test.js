/**
 * FLUID-U2-007: Vasquez-Beggs reads the gas gravity at its 100 psig
 * reference separator, brought there from the first separator stage
 * entered (it used a fixed 100 psia separator at the reservoir
 * temperature). Gated through the app's own Rs on the six oils of Ahmed,
 * Reservoir Engineering Handbook, Examples 2-18 and 2-19 (pressures psig).
 */
import { analyzeFluidSystem, normalizeFluid, rsAt, vbGasGravity, sampleFluidStudioData } from '../fluidStudioCalculations';
import { pvtCalcs } from '../pvtCalculations';

const OILS = [
  { T: 250, pb: 2377, psep: 150, tsep: 60, api: 47.1, sg: 0.851, sgRef: 0.8731, rs: 779 },
  { T: 220, pb: 2620, psep: 100, tsep: 75, api: 40.7, sg: 0.855, sgRef: 0.855, rs: 733 },
  { T: 260, pb: 2051, psep: 100, tsep: 72, api: 48.6, sg: 0.911, sgRef: 0.911, rs: 702 },
  { T: 237, pb: 2884, psep: 60, tsep: 120, api: 40.5, sg: 0.898, sgRef: 0.850, rs: null },
  { T: 218, pb: 3045, psep: 200, tsep: 60, api: 44.2, sg: 0.781, sgRef: 0.814, rs: 947 },
  { T: 180, pb: 4239, psep: 85, tsep: 173, api: 27.3, sg: 0.848, sgRef: 0.834, rs: 841 },
];
const inputsOf = (o, stages) => {
  const i = sampleFluidStudioData();
  i.streamA.blackOil = { api: o.api, gor: 700, gasSg: o.sg, temp: o.T, pb: null, salinity: 0 };
  i.correlations = { pb_rs_bo: 'vasquez_beggs', viscosity: 'beggs_robinson' };
  i.separatorTrain = { stages: stages ?? [{ pressure: o.psep + 14.7, temperature: o.tsep, enabled: true }, { pressure: 30, temperature: 60, enabled: true }] };
  return i;
};

describe('the app\'s Vasquez-Beggs on the published oils', () => {
  it('the reference gravity of all six, from the first (highest pressure) stage', () => {
    for (const o of OILS) expect(Math.abs(vbGasGravity(normalizeFluid(inputsOf(o))) - o.sgRef)).toBeLessThan(0.0006);
  });
  it('the printed Rs at the bubble point of five oils within 1.5 scf/STB', () => {
    for (const o of OILS.filter((x) => x.rs !== null)) {
      expect(Math.abs(rsAt(o.pb + 14.7, normalizeFluid(inputsOf(o))) - o.rs)).toBeLessThan(1.5);
    }
  });
  it('negative control: the fixed 100 psia separator at the reservoir temperature misses them', () => {
    const misses = OILS.filter((o) => o.rs !== null && Math.abs(pvtCalcs.vasquez_beggs_rs(o.pb + 14.7, o.api, o.sg, o.T) - o.rs) > 1.5);
    expect(misses.length).toBeGreaterThanOrEqual(4);
  });
  it('worked value, oil 1: 0.851 x [1 + 5.912e-5 (47.1)(60) log10(164.7 / 114.7)] = 0.8733', () => {
    expect(vbGasGravity(normalizeFluid(inputsOf(OILS[0])))).toBeCloseTo(0.851 * (1 + 5.912e-5 * 47.1 * 60 * Math.log10(164.7 / 114.7)), 12);
    expect(vbGasGravity(normalizeFluid(inputsOf(OILS[0])))).toBeCloseTo(0.8733, 4);
  });
});

describe('what the app says and what it leaves alone', () => {
  it('no stage: the gravity is taken as given, and the methods table says so', () => {
    const r = analyzeFluidSystem(inputsOf(OILS[0], []));
    expect(r.meta.fluid.separator).toBeNull();
    expect(vbGasGravity(r.meta.fluid)).toBe(0.851);
    expect(r.meta.methods.find((m) => m.key === 'rs').note).toMatch(/No separator stage is entered, so the gas gravity 0\.851 is taken as the gravity at the 100 psig reference separator\./);
  });
  it('with a stage the note names it and the gravity used', () => {
    const r = analyzeFluidSystem(inputsOf(OILS[0]));
    expect(r.meta.methods.find((m) => m.key === 'rs').note).toMatch(/brought to the 100 psig reference separator from the first separator stage \(164\.7 psia, 60 degF\): 0\.8733\./);
  });
  it('Standing and Glaso do not read the stage, and the sample is unchanged', () => {
    const i = inputsOf(OILS[0]);
    i.correlations.pb_rs_bo = 'standing';
    expect(normalizeFluid(i).separator).toBeUndefined();
    const s = sampleFluidStudioData();
    expect(analyzeFluidSystem(s).pvt.kpis.pb).toBe(2998);
  });
});
