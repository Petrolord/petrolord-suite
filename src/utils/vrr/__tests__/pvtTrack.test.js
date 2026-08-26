// Gates for the pressure-dependent PVT bridge (V3): unit seam
// (rb/scf -> RB/Mscf), Rs clamp at the model GOR above Pb, consistency
// with the goldened nodal pvtAt route, null pass-through.
import { derivePeriodFvf } from '../pvtTrack';
import { buildFluidModel, pvtAt } from '@/utils/nodal/pvt';

const FLUID = { api: '35', gasSg: '0.7', gor: '550', salinityPpm: '35000', tempF: '180' };

describe('derivePeriodFvf', () => {
  it('matches the nodal pvtAt route exactly, with Bg scaled to RB/Mscf', () => {
    const { overrides } = derivePeriodFvf(FLUID, [2500]);
    const model = buildFluidModel({ api: 35, gasSg: 0.7, gor: 550, salinityPpm: 35000 });
    const r = pvtAt(model, 2500, 180);
    expect(overrides[0].Bo).toBeCloseTo(r.bo, 12);
    expect(overrides[0].Bw).toBeCloseTo(r.bw, 12);
    expect(overrides[0].Bg).toBeCloseTo(r.bg * 1000, 12);
    expect(overrides[0].Rs).toBeCloseTo(r.rs, 12);
  });

  it('produces Bg in a sane RB/Mscf magnitude (order 1, not order 0.001)', () => {
    const { overrides } = derivePeriodFvf(FLUID, [2000, 3000]);
    overrides.forEach((f) => {
      expect(f.Bg).toBeGreaterThan(0.3);
      expect(f.Bg).toBeLessThan(5);
    });
  });

  it('clamps Rs at the model GOR above the bubble point and drops it below', () => {
    const model = buildFluidModel({ api: 35, gasSg: 0.7, gor: 550, salinityPpm: 35000 });
    const pb = pvtAt(model, 1e9, 180).pb; // pb independent of p
    const { overrides } = derivePeriodFvf(FLUID, [pb + 500, Math.max(200, pb - 800)]);
    expect(overrides[0].Rs).toBeCloseTo(550, 6);
    expect(overrides[1].Rs).toBeLessThan(550);
  });

  it('declining pressure below Pb raises Bg and lowers Rs (physics direction)', () => {
    const model = buildFluidModel({ api: 35, gasSg: 0.7, gor: 550, salinityPpm: 35000 });
    const pb = pvtAt(model, 1e9, 180).pb;
    const pHigh = Math.max(400, pb - 200);
    const pLow = Math.max(250, pb - 900);
    const { overrides } = derivePeriodFvf(FLUID, [pHigh, pLow]);
    expect(overrides[1].Bg).toBeGreaterThan(overrides[0].Bg);
    expect(overrides[1].Rs).toBeLessThan(overrides[0].Rs);
  });

  it('passes null/invalid pressures through as null overrides', () => {
    const { overrides } = derivePeriodFvf(FLUID, [null, 'x', -5, 2500]);
    expect(overrides[0]).toBe(null);
    expect(overrides[1]).toBe(null);
    expect(overrides[2]).toBe(null);
    expect(overrides[3]).not.toBe(null);
  });

  it('surfaces correlation-band warnings from the fluid model', () => {
    const { warnings } = derivePeriodFvf({ ...FLUID, api: '80' }, [2500]);
    expect(warnings.some((w) => /API/i.test(w))).toBe(true);
  });
});
