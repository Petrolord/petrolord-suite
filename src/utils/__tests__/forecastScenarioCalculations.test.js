import {
  dailyDecline, runCase, annualProfile, monthlySeries, cumAtYear,
  indicativeEconomics, compareCases, sampleScenarioCases, DAYS_PER_YEAR, EUR_MAX_YEARS,
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
    expect(Math.abs(r.cumHorizon - closedForm) / closedForm).toBeLessThan(0.005);
    // no economic limit: EUR runs to the maximum life and there is no time to limit
    expect(r.eurCapped).toBe(true);
    expect(r.timeToLimitDays).toBeNull();
    const capped = (1000 / D) * (1 - Math.exp(-D * EUR_MAX_YEARS * DAYS_PER_YEAR));
    expect(Math.abs(r.eur - capped) / capped).toBeLessThan(0.005);
  });

  it('follows the decline past the horizon to the economic limit for EUR (FSH-T1-001)', () => {
    // Base-like case: qi 1200, 18 %/yr nominal, b 0.5, 20 yr, limit 60 bbl/d.
    const c = { id: 'b', name: 'Base', qi: 1200, declineAnnualPct: 18, b: 0.5, years: 20, economicLimit: 60 };
    const r = runCase(c);
    const D = dailyDecline(18);
    // Arps hyperbolic cumulative to rate q: qi^b / ((1-b) D) * (qi^(1-b) - q^(1-b))
    const eurClosed = (1200 ** 0.5 / (0.5 * D)) * (1200 ** 0.5 - 60 ** 0.5);
    const tLimitYears = ((1200 / 60) ** 0.5 - 1) / (0.5 * 0.18);
    expect(Math.abs(r.eur - eurClosed) / eurClosed).toBeLessThan(0.005); // ~3.78 MMbbl
    expect(r.timeToLimitYears).toBeCloseTo(tLimitYears, 1);               // ~38.6 yr
    expect(r.limitInHorizon).toBe(false);
    expect(r.eurCapped).toBe(false);
    // the horizon cumulative is what the table used to call EUR (~3.13 MMbbl)
    const cum20 = (1200 * DAYS_PER_YEAR / (0.5 * 0.18)) * (1 - 1 / (1 + 0.09 * 20));
    expect(Math.abs(r.cumHorizon - cum20) / cum20).toBeLessThan(0.005);
    expect(r.eur).toBeGreaterThan(r.cumHorizon * 1.2);
    expect(r.rates).toHaveLength(20 * DAYS_PER_YEAR);
  });

  it('caps EUR at the maximum life when the limit is further out', () => {
    const r = runCase({ id: 'h', name: 'Harm', qi: 1000, declineAnnualPct: 5, b: 1, years: 10, economicLimit: 10 });
    const D = dailyDecline(5);
    // harmonic cumulative to t: qi/D * ln(1 + D t)
    const capped = (1000 / D) * Math.log(1 + D * EUR_MAX_YEARS * DAYS_PER_YEAR);
    expect(r.eurCapped).toBe(true);
    expect(r.timeToLimitYears).toBeNull();
    expect(Math.abs(r.eur - capped) / capped).toBeLessThan(0.005);
  });

  it('honors the economic limit and reports time to limit', () => {
    const r = runCase({ ...EXP_CASE, economicLimit: 500 });
    // q = 500 at t = ln(2)/D days
    const D = dailyDecline(20);
    const expectedDays = Math.log(2) / D;
    expect(Math.abs(r.timeToLimitDays - expectedDays)).toBeLessThanOrEqual(1);
    const lastRate = r.rates[r.rates.length - 1].rate;
    expect(lastRate).toBeGreaterThanOrEqual(500);
    expect(r.limitInHorizon).toBe(true);
    expect(r.eur).toBeCloseTo(r.cumHorizon, 6);
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
    expect(total).toBeCloseTo(r.cumHorizon, 3);
    expect(annual[0]).toBeGreaterThan(annual[1]); // decline
  });

  it('cumAtYear reads the running cumulative', () => {
    const r = runCase(EXP_CASE);
    expect(cumAtYear(r.rates, 5)).toBeGreaterThan(cumAtYear(r.rates, 1));
    expect(cumAtYear(r.rates, 10)).toBeCloseTo(r.cumHorizon, 3);
  });

  it('monthly series downsamples without inventing points', () => {
    const r = runCase(EXP_CASE);
    const m = monthlySeries(r.rates);
    // every 30th day plus the final day, so the curve reaches the horizon
    expect(m.length).toBe(Math.ceil(r.rates.length / 30) + 1);
    expect(m[0].rate).toBeCloseTo(r.rates[0].rate, 9);
    expect(m[m.length - 1].day).toBe(r.rates.length);
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
    // None of the sample cases reaches 30 bbl/d inside 20 years, so EUR
    // exceeds the horizon cumulative and the time to limit lies past 20 yr
    // (or past the 50-year maximum life, and is then null).
    summaries.forEach((s) => {
      expect(s.limitInHorizon).toBe(false);
      expect(s.eurMMbbl).toBeGreaterThan(s.cumHorizonMMbbl);
      if (s.timeToLimitYears != null) expect(s.timeToLimitYears).toBeGreaterThan(20);
    });
    expect(byName.low.timeToLimitYears).toBeCloseTo(((1000 / 30) ** 0.3 - 1) / (0.3 * 0.24), 1);
    expect(byName.base.eurCapped).toBe(true); // limit at ~59 yr
    expect(byName.high.eurCapped).toBe(true); // limit at ~148 yr
  });
});
