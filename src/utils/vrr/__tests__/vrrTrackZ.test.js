// VRR-U2-018: the pressure track's gas Z on Dranchuk-Abou-Kassem from the
// canonical engines (engines/fluid/blackOil gasZDetail, Sutton
// pseudo-criticals; Fluid Systems Studio's default since FLUID-U2-006),
// replacing Papay. The gate calls the engine's Z; the old route (the nodal
// pvtAt Bg on Papay Z) is the negative control. Before and after on the
// demo field are stated in the upgrade doc.
import { derivePeriodFvf } from '../pvtTrack';
import { gasZDetail } from '../../../../packages/engines/engines/fluid/blackOil';
import { buildFluidModel, pvtAt } from '@/utils/nodal/pvt';
import { deriveVrr, TRACK_METHODS } from '../workspace';
import { demoFieldInputs } from '../demoField';
import { defaultInputs } from '@/contexts/VrrMonitorContext';

const FLUID = { api: '35', gasSg: '0.7', gor: '550', salinityPpm: '35000', tempF: '180' };

describe('VRR-U2-018: Z by Dranchuk-Abou-Kassem in the pressure track', () => {
  it('Bg = 0.00504 Z (T + 460) / p x 1,000 with the engine Z at every pressure', () => {
    const ps = [800, 1500, 2500, 3500, 4000];
    const { overrides } = derivePeriodFvf(FLUID, ps);
    ps.forEach((p, i) => {
      const z = gasZDetail(p, 180, 0.7, 'dranchuk_abou_kassem').z;
      expect(overrides[i].Bg).toBeCloseTo(0.00504 * z * 640 / p * 1000, 12);
      expect(overrides[i].Z).toBeCloseTo(z, 12);
    });
  });
  it('NEGATIVE CONTROL: the Papay route differs, by more than 1 percent at 3,500 psia', () => {
    const model = buildFluidModel({ api: 35, gasSg: 0.7, gor: 550, salinityPpm: 35000 });
    const papay = pvtAt(model, 3500, 180).bg * 1000;
    const dak = derivePeriodFvf(FLUID, [3500]).overrides[0].Bg;
    expect(Math.abs(dak - papay) / papay).toBeGreaterThan(0.01);
  });
  it('Bo, Bw and Rs are unchanged (the Z only reaches Bg)', () => {
    const model = buildFluidModel({ api: 35, gasSg: 0.7, gor: 550, salinityPpm: 35000 });
    const r = pvtAt(model, 2500, 180);
    const o = derivePeriodFvf(FLUID, [2500]).overrides[0];
    expect([o.Bo, o.Bw, o.Rs]).toEqual([r.bo, r.bw, r.rs]);
  });
  it('the method is named for the screen and the report', () => {
    expect(TRACK_METHODS.bg).toMatch(/Z by Dranchuk-Abou-Kassem \(1975\) with Sutton pseudo-criticals/);
    expect(TRACK_METHODS.bg).not.toMatch(/Papay/);
  });
  it('before and after on the demo field with the pressure track (stated in the upgrade doc)', () => {
    const d = deriveVrr({ ...defaultInputs(), ...demoFieldInputs(), pvtMode: 'track' });
    expect(d.pvt.active).toBe(true);
    // the old route on the same periods: Papay Bg from pvtAt, everything else equal
    const model = buildFluidModel({ api: 35, gasSg: 0.7, gor: 550, salinityPpm: 35000 });
    const p0 = d.periodsWithPressure[0].pressure;
    expect(d.pvt.overrides[0].Bg).not.toBeCloseTo(pvtAt(model, p0, 180).bg * 1000, 4);
    expect(d.summary.cumulativeVRR).toBeCloseTo(AFTER_VRR, 6);
  });
});

// cumulative VRR of the demo field on the pressure track with DAK Z (0.7803362 with Papay before U2-018)
const AFTER_VRR = 0.7790386;
