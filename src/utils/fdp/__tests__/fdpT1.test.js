// FDP Accelerator senior test T1 (Wave 2 #24).
import { fmtMM } from '../formatting';
import { computePlanEconomics } from '../planEconomics';

describe('fmtMM (FDP-T1-001)', () => {
  it('prints a $MM value as $MM, not as compact dollars', () => {
    expect(fmtMM(1421.5)).toBe('$1,422MM');
    expect(fmtMM(3.44)).toBe('$3.4MM');
    expect(fmtMM(-12.6)).toBe('-$13MM');
    expect(fmtMM(NaN)).toBe('-');
  });
});

describe('economics carry the plan reserves check (FDP-T1-004)', () => {
  const plan = (p50) => ({
    fieldData: { fieldName: 'T1' },
    subsurface: { reserves: { breakdown: [{ id: 'r1', fluid: 'Oil', p50 }] } },
    concepts: { list: [{ id: 1, name: 'FPSO', peakProduction: 25 }], selectedId: 1 },
    scenarios: { list: [{ id: 2, name: 'Base', conceptId: 1, oilPrice: 70, discountRate: 10 }], selectedId: 2 },
    wells: { list: [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }] },
    facilities: { list: [] },
    costs: { items: [{ id: 'c1', type: 'CAPEX', amount: 574.3 }, { id: 'c2', type: 'OPEX', amount: 0.5 }] },
    schedule: { activities: [] },
  });

  it('flags a 25 kbpd screening profile (95.8 MMbbl) against 85 MMbbl P50', () => {
    const e = computePlanEconomics(plan(85));
    expect(e.available).toBe(true);
    const w = e.reservesCheck.warnings.find((x) => x.code === 'profile-exceeds-p50');
    expect(w).toBeTruthy();
    expect(w.message).toMatch(/95\.8 MMbbl over 20 years/);
  });

  it('negative control: the same profile against 120 MMbbl raises nothing', () => {
    const e = computePlanEconomics(plan(120));
    expect(e.reservesCheck.warnings.some((x) => x.code === 'profile-exceeds-p50')).toBe(false);
  });
});
