/**
 * FLUID-U2-022: salinity in Bw. McCain's Bw of gas-free water times the
 * brine ratio of Numbere, Brigham and Standing (1977), Equation 10 (gated in
 * the engines on readings of Figures 6 and 7 of the report).
 */
import { analyzeFluidSystem, sampleFluidStudioData, bwAt, computePvtRow } from '../fluidStudioCalculations';
import { mccainBw, brineFvfRatio } from '../../../packages/engines/engines/fluid/blackOil';

describe('the table applies the salinity to Bw', () => {
  const r = analyzeFluidSystem(sampleFluidStudioData()); // 35,000 ppm, 200 degF
  it('worked value: 35,000 ppm, 200 degF, at the bubble point', () => {
    const pb = r.pvt.pb;
    const ratio = 1 + 3.5 * (5.1e-8 * pb + (5.47e-6 - 1.95e-10 * pb) * 140 - (3.23e-8 - 8.5e-13 * pb) * 140 * 140);
    expect(brineFvfRatio(pb, 200, 35000)).toBeCloseTo(ratio, 14);
    expect(r.pvt.kpis.bw_at_pb).toBe(Number((mccainBw(pb, 200) * ratio).toFixed(4)));
    expect(ratio).toBeGreaterThan(1.0007);
    expect(ratio).toBeLessThan(1.0009);
  });
  it('every row is McCain times the ratio at its pressure; no salinity is McCain exactly', () => {
    // a row prints its pressure to the whole psia and Bw to four decimals
    for (const row of r.pvt.table) expect(Math.abs(row.Bw - mccainBw(row.pressure, 200) * brineFvfRatio(row.pressure, 200, 35000))).toBeLessThan(1.5e-4);
    expect(bwAt(3000, 200, 0)).toBe(mccainBw(3000, 200));
    const fresh = sampleFluidStudioData();
    fresh.streamA.blackOil.salinity = 0;
    expect(analyzeFluidSystem(fresh).meta.methods.find((m) => m.key === 'bw').method).toBe('McCain');
  });
  it('negative control: a strong brine at high temperature lowers Bw, at low temperature raises it', () => {
    expect(bwAt(3000, 350, 250000)).toBeLessThan(mccainBw(3000, 350));
    expect(bwAt(3000, 150, 250000)).toBeGreaterThan(mccainBw(3000, 150));
  });
  it('the method names the correction and the range of the brine ratio is flagged', () => {
    expect(r.meta.methods.find((m) => m.key === 'bw').method).toBe('McCain, with the Numbere-Brigham-Standing salinity correction');
    const salty = sampleFluidStudioData();
    salty.streamA.blackOil.salinity = 300000;
    expect(analyzeFluidSystem(salty).meta.rangeFlags.some((f) => f.id === 'numbere_brine:salinity')).toBe(true);
    expect(computePvtRow(3000, analyzeFluidSystem(salty).meta.fluid, 2998).Bw).toBeGreaterThan(0.9);
  });
});
