import {
  dailyDecline, runCase, annualProfile, monthlySeries, cumAtYear,
  indicativeEconomics, compareCases, sampleScenarioCases, DAYS_PER_YEAR,
} from '../forecastScenarioCalculations';

const EXP_CASE = { id: 'e', name: 'Exp', qi: 1000, declineAnnualPct: 20, b: 0, years: 10, economicLimit: 0 };

describe('runCase (through the shared DCA engine)', () => {
  it('matches the exponential closed form for rate and EUR', () => {
    const r = runCase(EXP_CASE);
    const D = dailyDecline(20);
    // Rate after ~1 year: q = qi * exp(-D t)
    const t = DAYS_PER_YEAR;
    expect(r.rates[t - 1].rate).toBeCloseTo(1000 * Math.exp(-D * t), 6);
    // EUR over the window: Np = (qi - q_end)/D, daily-sum tolerance ~0.5%
    const qEnd = r.rates[r.rates.length - 1].rate;
    const closedForm = (1000 - qEnd) / D;
    expect(Math.abs(r.eur - closedForm) / closedForm).toBeLessThan(0.005);
  });

  it('honors the economic limit and reports time to limit', () => {
    const r = runCase({ ...EXP_CASE, economicLimit: 500 });
    // q = 500 at t = ln(2)/D days
    const D = dailyDecline(20);
    const expectedDays = Math.log(2) / D;
    expect(Math.abs(r.timeToLimitDays - expectedDays)).toBeLessThanOrEqual(1);
    const lastRate = r.rates[r.rates.length - 1].rate;
    expect(lastRate).toBeGreaterThanOrEqual(500);
  });

  it('runs harmonic (b=1) with the closed-form rate', () => {
    const r = runCase({ ...EXP_CASE, b: 1 });
    const D = dailyDecline(20);
    const t = 500;
    expect(r.rates[t - 1].rate).toBeCloseTo(1000 / (1 + D * t), 6);
  });

  it('rejects unusable inputs with an explicit error', () => {
    expect(runCase({ ...EXP_CASE, qi: 0 }).error).toBeTruthy();
    expect(runCase({ ...EXP_CASE, declineAnnualPct: -5 }).error).toBeTruthy();
  });
});

describe('profiles and milestones', () => {
  it('annual profile sums to the EUR', () => {
    const r = runCase(EXP_CASE);
    const annual = annualProfile(r.rates, 10);
    const total = annual.reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(r.eur, 3);
    expect(annual[0]).toBeGreaterThan(annual[1]); // decline
  });

  it('cumAtYear reads the running cumulative', () => {
    const r = runCase(EXP_CASE);
    expect(cumAtYear(r.rates, 5)).toBeGreaterThan(cumAtYear(r.rates, 1));
    expect(cumAtYear(r.rates, 10)).toBeCloseTo(r.eur, 3);
  });

  it('monthly series downsamples without inventing points', () => {
    const r = runCase(EXP_CASE);
    const m = monthlySeries(r.rates);
    expect(m.length).toBe(Math.ceil(r.rates.length / 30));
    expect(m[0].rate).toBeCloseTo(r.rates[0].rate, 9);
  });
});

describe('indicativeEconomics', () => {
  it('matches the hand calculation', () => {
    // Two years of 1e6 bbl at $50 margin, 10%: 50e6/1.1 + 50e6/1.21
    const { npv, undiscounted } = indicativeEconomics([1e6, 1e6], {
      pricePerBbl: 70, opexPerBbl: 20, discountRatePct: 10,
    });
    expect(undiscounted).toBeCloseTo(100, 9);
    expect(npv).toBeCloseTo(50 / 1.1 + 50 / 1.21, 6);
  });
});

describe('compareCases + sample', () => {
  it('summarizes the shipped sample sensibly', () => {
    const { cases: defs, econ } = sampleScenarioCases();
    const { summaries } = compareCases(defs, econ);
    expect(summaries).toHaveLength(3);
    const byName = Object.fromEntries(summaries.map((s) => [s.id, s]));
    // High case outproduces base outproduces low.
    expect(byName.high.eurMMbbl).toBeGreaterThan(byName.base.eurMMbbl);
    expect(byName.base.eurMMbbl).toBeGreaterThan(byName.low.eurMMbbl);
    // Same ordering for the indicative NPV at common economics.
    expect(byName.high.economics.npv).toBeGreaterThan(byName.base.economics.npv);
    expect(byName.base.economics.npv).toBeGreaterThan(byName.low.economics.npv);
    // Every case hit its economic limit inside the 20-year horizon or ran full term.
    summaries.forEach((s) => expect(s.timeToLimitYears).toBeLessThanOrEqual(20));
  });
});
