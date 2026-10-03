/**
 * FLUID-U2-006: the z-factor of the Fluid Systems Studio black-oil table
 * comes from the canonical engines library (Dranchuk-Abou-Kassem by
 * default, Hall-Yarborough selectable), gated there on readings of the
 * Standing-Katz chart (packages/engines/__tests__/fluid.blackOilU2.test.js).
 * This gate holds the table to that engine call, and checks the app path
 * against one printed chart reading.
 */
import {
  analyzeFluidSystem, sampleFluidStudioData, normalizeFluid, gasZ, zFactor, bgAt, muGas, computePvtRow,
} from '../fluidStudioCalculations';
import { dranchukAbouKassemZ, hallYarboroughZ, gasZDetail } from '../../../packages/engines/engines/fluid/blackOil';

const withZ = (method) => {
  const inputs = sampleFluidStudioData();
  inputs.correlations = { ...inputs.correlations, z_factor: method };
  return inputs;
};

describe('the table is the engine call', () => {
  it('every row\'s Z is Dranchuk-Abou-Kassem at the row\'s pseudo-reduced state (Sutton, 459.67 degR offset)', () => {
    const r = analyzeFluidSystem(sampleFluidStudioData());
    const ppc = 756.8 - 131.0 * 0.75 - 3.6 * 0.75 * 0.75;
    const tpc = 169.2 + 349.5 * 0.75 - 74.0 * 0.75 * 0.75;
    // a row prints its pressure to the whole psia and Z to four decimals
    for (const row of r.pvt.table) expect(Math.abs(row.Z - dranchukAbouKassemZ(row.pressure / ppc, 659.67 / tpc))).toBeLessThan(2e-4);
    // negative control: the 460 degR offset of the legacy form moves Z by less than that, a Papay row by more
    expect(r.pvt.table.some((row) => Math.abs(row.Z - zFactor(row.pressure, 200, 0.75)) > 0.01)).toBe(true);
    const pb = r.pvt.pb;
    expect(r.pvt.kpis.z_at_pb).toBeCloseTo(dranchukAbouKassemZ(pb / ppc, 659.67 / tpc), 4);
    expect(r.meta.methods.find((m) => m.key === 'z').method).toBe('Dranchuk-Abou-Kassem, with Sutton pseudo-critical properties');
  });

  it('Hall-Yarborough when selected, named as such', () => {
    const r = analyzeFluidSystem(withZ('hall_yarborough'));
    const d = gasZDetail(r.pvt.pb, 200, 0.75, 'hall_yarborough');
    expect(r.pvt.kpis.z_at_pb).toBeCloseTo(hallYarboroughZ(d.ppr, d.tpr), 4);
    expect(r.meta.methods.find((m) => m.key === 'z').method).toBe('Hall-Yarborough, with Sutton pseudo-critical properties');
    expect(r.meta.fluid.correlations.z_factor).toBe('hall_yarborough');
    // an unknown name runs the default
    expect(normalizeFluid(withZ('papay')).correlations.z_factor).toBe('dranchuk_abou_kassem');
  });

  it('a project saved before the choice existed opens on the default', () => {
    const inputs = sampleFluidStudioData();
    delete inputs.correlations.z_factor;
    expect(analyzeFluidSystem(inputs).pvt.kpis.z_at_pb).toBe(analyzeFluidSystem(sampleFluidStudioData()).pvt.kpis.z_at_pb);
  });
});

describe('GATE: the app path against a printed Standing-Katz chart reading', () => {
  // Ahmed, Reservoir Engineering Handbook, Example 2-5: ppr 4.50, Tpr 1.67, z = 0.85 read from the chart.
  // A gas of gravity 0.70 at 170.9 degF and 2,985 psia has that state with Sutton's pseudo-criticals.
  const sg = 0.7;
  const tpc = 169.2 + 349.5 * sg - 74.0 * sg * sg;
  const ppc = 756.8 - 131.0 * sg - 3.6 * sg * sg;
  const T = 1.67 * tpc - 459.67;
  const p = 4.5 * ppc;
  it('Dranchuk-Abou-Kassem and Hall-Yarborough are within 1.5 percent of the chart', () => {
    expect(Math.abs(gasZ(p, T, sg) - 0.85) / 0.85).toBeLessThan(0.015);
    expect(Math.abs(gasZ(p, T, sg, 'hall_yarborough') - 0.85) / 0.85).toBeLessThan(0.015);
  });
  it('negative control: the retired Papay form misses the same reading by more than 3 percent', () => {
    // the legacy function uses a 460 offset; the state moves by less than 0.01 percent
    expect(Math.abs(zFactor(p, T, sg) - 0.85) / 0.85).toBeGreaterThan(0.03);
  });
});

describe('before and after on the sample fluid (API 32, GOR 650, gas gravity 0.75, 200 degF)', () => {
  // pinned so the change stays stated: Papay before, Dranchuk-Abou-Kassem after
  const r = analyzeFluidSystem(sampleFluidStudioData());
  const f = r.meta.fluid;
  const pb = r.pvt.pb;
  const papay = zFactor(pb, f.temp, f.gasGravity);
  it('Z, Bg and gas viscosity at the bubble point', () => {
    expect(papay).toBeCloseTo(0.88727, 5);
    expect(r.pvt.kpis.z_at_pb).toBe(0.871);
    expect(bgAt(pb, f.temp, papay) * 1000).toBeCloseTo(0.98454, 5);
    expect(r.pvt.kpis.bg_at_pb * 1000).toBeCloseTo(0.966, 3);
    expect(muGas(pb, f.temp, f.gasGravity, papay)).toBeCloseTo(0.02051, 5);
    expect(computePvtRow(pb, f, pb).mu_g).toBeCloseTo(0.02075, 5);
  });
  it('the largest change of Z in the table is under 8 percent', () => {
    let worst = 0;
    for (const row of r.pvt.table) worst = Math.max(worst, Math.abs(row.Z - zFactor(row.pressure, f.temp, f.gasGravity)) / zFactor(row.pressure, f.temp, f.gasGravity));
    expect(worst).toBeGreaterThan(0.07);
    expect(worst).toBeLessThan(0.08);
  });
});
