// Economics E1 gates for FDP economics.
//
// FDP had two untested NPV implementations and neither applied royalty or
// tax. These gates lock the two things that matter: the numbers come from
// the sanctioned engine, and they are post-fiscal.
import { runFdpCase, paybackYears, DEFAULT_FISCAL } from '@/utils/fdp/economics';
import {
  calculateCashFlows, calculateNPV, calculateIRR, calculatePaybackPeriod,
} from '@/utils/fdp/costCalculations';
import { runScenario, scenarioNPV, conceptProfileKbpd } from '@/utils/fdp/scenarioCalculations';
import { calculateEconomics } from '@/utils/npvCalculations';

const profile = [10, 25, 45, 50, 48, 42, 35, 30, 25, 20];
const prices = profile.map(() => 75);

describe('runFdpCase', () => {
  test('FISCAL TERMS ARE APPLIED: royalty and tax are both non-zero', () => {
    // The defect this replaces: FDP reported pre-fiscal cash as NPV.
    const r = runFdpCase({
      capexMM: 800, annualOpexMM: 60, productionKbpd: profile, pricesUsd: prices,
    });
    expect(r.metrics.totalRoyalty).toBeGreaterThan(0);
    expect(r.metrics.totalTax).toBeGreaterThan(0);
    expect(r.metrics.totalGovTake).toBeGreaterThan(0);
  });

  test('post-fiscal NPV is materially below the pre-fiscal number', () => {
    const withFiscal = runFdpCase({
      capexMM: 800, annualOpexMM: 60, productionKbpd: profile, pricesUsd: prices,
    }).metrics.npv;
    const withoutFiscal = runFdpCase({
      capexMM: 800,
      annualOpexMM: 60,
      productionKbpd: profile,
      pricesUsd: prices,
      fiscal: { royaltyRate: 0, taxRate: 0 },
    }).metrics.npv;
    expect(withFiscal).toBeLessThan(withoutFiscal);
    // Roughly forty percent of the value, which is the size of the error
    // the old pre-fiscal calculation was making.
    expect(withFiscal / withoutFiscal).toBeLessThan(0.75);
  });

  test('it IS the sanctioned engine, not a copy of it', () => {
    const r = runFdpCase({
      capexMM: 800, annualOpexMM: 60, productionKbpd: profile, pricesUsd: prices,
    });
    const life = profile.length + 1;
    const oil = [0, ...profile.map((k) => k * 1000 * 365)];
    const capexArr = new Array(life).fill(0);
    capexArr[0] = 800;
    const direct = calculateEconomics({
      startYear: 0,
      projectLife: life,
      discountRate: DEFAULT_FISCAL.discountRate,
      fiscalType: 'TaxRoyalty',
      production: { oil, gas: new Array(life).fill(0) },
      price: { oil: [0, ...prices], gas: new Array(life).fill(0) },
      capex: capexArr,
      opexFixed: [0, ...profile.map(() => 60)],
      opexVariable: [0, ...profile.map((k) => (k * 1000 * 365 * 5) / 1e6)],
      abandonment: new Array(life).fill(0),
      royaltyRate: DEFAULT_FISCAL.royaltyRate,
      taxRate: DEFAULT_FISCAL.taxRate,
    });
    expect(r.metrics.npv).toBeCloseTo(direct.metrics.npv, 9);
  });

  test('development year carries the capex and no revenue', () => {
    const r = runFdpCase({
      capexMM: 800, annualOpexMM: 60, productionKbpd: profile, pricesUsd: prices,
    });
    expect(r.cashflow[0].capex).toBe(800);
    expect(r.cashflow[0].grossRevenue).toBe(0);
    expect(r.cashflow[0].ncf).toBeLessThan(0);
  });
});

describe('payback', () => {
  test('PAYBACK IS NOT A YEAR EARLY', () => {
    // Spend in the first period, earn in the second. Payback happens two
    // thirds of the way through the SECOND period, so 1.67 years, not
    // 0.67. Both previous implementations reported 0.67.
    const cashflow = [
      { ncf: -100, cumulativeNCF: -100 },
      { ncf: 150, cumulativeNCF: 50 },
    ];
    expect(paybackYears({ cashflow, metrics: { payback: 1 + 100 / 150 } }))
      .toBeCloseTo(1 + 100 / 150, 9);

    const rows = [
      { netCashFlow: -100, cumulativeCashFlow: -100 },
      { netCashFlow: 150, cumulativeCashFlow: 50 },
    ];
    expect(calculatePaybackPeriod(rows)).toBeCloseTo(1 + 100 / 150, 9);
  });

  test('payback lands after the crossing year begins and before it ends', () => {
    const r = runFdpCase({
      capexMM: 800, annualOpexMM: 60, productionKbpd: profile, pricesUsd: prices,
    });
    const pb = paybackYears(r);
    const crossing = r.cashflow.findIndex((c) => c.cumulativeNCF >= 0);
    expect(pb).toBeGreaterThanOrEqual(crossing);
    expect(pb).toBeLessThan(crossing + 1);
  });

  test('a project that never pays back reports null, not the project life', () => {
    const r = runFdpCase({
      capexMM: 100000, annualOpexMM: 60, productionKbpd: profile, pricesUsd: prices,
    });
    expect(paybackYears(r)).toBeNull();
    expect(calculatePaybackPeriod(calculateCashFlows(100000, 60, profile,
      prices.map((p) => ({ oil_price_usd: p }))))).toBeNull();
  });
});

describe('costCalculations delegation', () => {
  const deck = prices.map((p) => ({ oil_price_usd: p }));

  test('its NPV equals the engine NPV', () => {
    const rows = calculateCashFlows(800, 60, profile, deck);
    const engine = runFdpCase({
      capexMM: 800, annualOpexMM: 60, productionKbpd: profile, pricesUsd: prices,
    });
    expect(calculateNPV(rows)).toBeCloseTo(engine.metrics.npv, 6);
  });

  test('rows carry royalty and tax so the charts can show them', () => {
    const rows = calculateCashFlows(800, 60, profile, deck);
    expect(rows.slice(1).every((r) => r.royalty > 0)).toBe(true);
    expect(rows.some((r) => r.tax > 0)).toBe(true);
  });

  test('IRR is the rate that zeroes the NPV, and null when none exists', () => {
    const rows = calculateCashFlows(800, 60, profile, deck);
    const irr = calculateIRR(rows);
    expect(irr).toBeGreaterThan(0);
    const npvAtIrr = rows.reduce(
      (s, r, t) => s + r.netCashFlow / (1 + irr / 100) ** (t + 0.5), 0,
    );
    expect(npvAtIrr).toBeCloseTo(0, 4);

    // No sign change: the old Newton-Raphson returned whatever it drifted
    // to. Bisection reports that there is no IRR.
    expect(calculateIRR([
      { netCashFlow: 10, cumulativeCashFlow: 10 },
      { netCashFlow: 20, cumulativeCashFlow: 30 },
    ])).toBeNull();
  });
});

describe('scenarioCalculations delegation', () => {
  const concept = { capex: 800, opex: 60, peakProduction: 50 };
  const scenario = { oilPrice: 75, discountRate: 10 };

  test('the concept profile plateaus then declines', () => {
    const p = conceptProfileKbpd(concept);
    expect(p.slice(0, 3)).toEqual([50, 50, 50]);
    expect(p[3]).toBeLessThan(p[2]);
    expect(p[p.length - 1]).toBeLessThan(p[3]);
  });

  test('scenario NPV is post-fiscal and comes from the engine', () => {
    const r = runScenario(scenario, concept);
    expect(r.metrics.totalTax).toBeGreaterThan(0);
    expect(scenarioNPV(scenario, concept)).toBeCloseTo(r.metrics.npv, 9);
  });

  test('a higher price scenario is worth more', () => {
    expect(scenarioNPV({ ...scenario, oilPrice: 95 }, concept))
      .toBeGreaterThan(scenarioNPV({ ...scenario, oilPrice: 55 }, concept));
  });

  test('a higher discount rate is worth less', () => {
    expect(scenarioNPV({ ...scenario, discountRate: 15 }, concept))
      .toBeLessThan(scenarioNPV({ ...scenario, discountRate: 5 }, concept));
  });
});
