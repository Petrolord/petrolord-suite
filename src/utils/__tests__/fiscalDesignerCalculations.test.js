// Economics E1 gates for the Fiscal Regime Designer sandbox.
//
// The D1 round repaired this engine's tax base and IRR solver but left it
// as a parallel implementation nobody had reconciled against the
// canonical PSC semantics. These tests do that reconciliation, and they
// are written as LEDGER IDENTITIES rather than as remembered numbers:
// a fiscal model that does not conserve money is wrong no matter what
// any golden value says.
import {
  calculateCashFlowForRegime,
  calculateNPV,
  calculateIRR,
  calculateIRRResult,
  deriveInsights,
} from '@/utils/fiscalDesignerCalculations';
import { calculateEconomics } from '@/utils/npvCalculations';

const project = {
  production: {
    oil: { initial: 30000, decline: 12 },
    gas: { initial: 0, decline: 0 },
    ngl: { initial: 0, decline: 0 },
  },
  prices: [{ year: 1, oil: 80, gas: 3, ngl: 45 }],
  costs: {
    capex: { drilling: 400, facilities: 500, subsea: 100 },
    opex: { fixed: 60, variable: 4 },
  },
  discountRate: 10,
};

/** A plain regime: flat royalty, full cost recovery, flat split, CIT only. */
const flatRegime = (over = {}) => ({
  id: 'flat',
  name: 'Flat',
  royalty: { type: 'flat', rate: 12.5 },
  costRecoveryLimit: 100,
  profitSplit: { type: 'flat', split: 100 },
  tax: { cit: 30, rrt: 0, minTax: 0, rrtUpliftPct: 0 },
  ...over,
});

describe('ledger identities (the E1 defects)', () => {
  test('MASS BALANCE: contractor take plus government take equals revenue minus costs', () => {
    // The defect this replaces: cost oil was subtracted from profit oil
    // and then credited to nobody, so this identity failed by exactly the
    // cost recovered, every year.
    const rows = calculateCashFlowForRegime(flatRegime(), project);
    rows.forEach((cf) => {
      const shouldBe = cf.grossRevenue - cf.opex - cf.capex;
      expect(cf.contractorNCF + cf.governmentTake).toBeCloseTo(shouldBe, 8);
    });
  });

  test('mass balance holds under a sliding scale, tiered splits, RRT and a minimum tax', () => {
    const complex = flatRegime({
      royalty: {
        type: 'sliding',
        tiers: [
          { threshold: 0, rate: 5 },
          { threshold: 60, rate: 12.5 },
          { threshold: 100, rate: 20 },
        ],
      },
      costRecoveryLimit: 70,
      profitSplit: {
        type: 'tiered',
        tiers: [
          { threshold: 0, split: 80 },
          { threshold: 1.5, split: 55 },
          { threshold: 3, split: 35 },
        ],
      },
      tax: { cit: 30, rrt: 20, minTax: 2, rrtUpliftPct: 20 },
    });
    const rows = calculateCashFlowForRegime(complex, project);
    rows.forEach((cf) => {
      expect(cf.contractorNCF + cf.governmentTake)
        .toBeCloseTo(cf.grossRevenue - cf.opex - cf.capex, 8);
    });
  });

  test('REVENUE SPLIT: gross equals royalty plus cost oil plus profit oil', () => {
    const rows = calculateCashFlowForRegime(flatRegime(), project);
    rows.forEach((cf) => {
      // Only while the pool is not exhausted and profit oil is unclipped.
      if (cf.profitOil > 0) {
        expect(cf.royalty + cf.costRecovered + cf.profitOil)
          .toBeCloseTo(cf.grossRevenue, 8);
      }
    });
  });

  test('OPEX IS RECOVERABLE: the cost pool takes in opex, not capex alone', () => {
    // The second defect: the pool was seeded with capex and never fed
    // again, so operating cost could never be recovered. With a tight
    // recovery cap the pool must keep growing while opex accrues.
    const capped = flatRegime({ costRecoveryLimit: 5 });
    const rows = calculateCashFlowForRegime(capped, project);
    const late = rows[rows.length - 1];
    const totalCapex = 1000;
    // Far more than the capex alone is still sitting unrecovered, which
    // can only be true if opex entered the pool.
    expect(late.unrecoveredCostPool).toBeGreaterThan(totalCapex);
  });

  test('cost recovery never exceeds the cap or the pool', () => {
    const capped = flatRegime({ costRecoveryLimit: 40 });
    const rows = calculateCashFlowForRegime(capped, project);
    rows.forEach((cf) => {
      const cap = (cf.grossRevenue - cf.royalty) * 0.4;
      expect(cf.costRecovered).toBeLessThanOrEqual(cap + 1e-9);
      expect(cf.costRecovered).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('parity with the canonical screening engine', () => {
  // Where the two models describe the SAME regime they must agree. The
  // only permitted difference is the documented discounting convention.
  const rows = calculateCashFlowForRegime(flatRegime(), project);

  const screening = () => {
    const life = rows.length;
    const capex = new Array(life).fill(0);
    capex[0] = 1000;
    return calculateEconomics({
      startYear: 1,
      projectLife: life,
      discountRate: project.discountRate,
      fiscalType: 'PSC',
      production: {
        oil: rows.map((_, i) => 30000 * 365 * (0.88 ** i)),
        gas: new Array(life).fill(0),
      },
      price: { oil: new Array(life).fill(80), gas: new Array(life).fill(0) },
      capex,
      opexFixed: rows.map((cf) => cf.opex),
      opexVariable: new Array(life).fill(0),
      abandonment: new Array(life).fill(0),
      royaltyRate: 12.5,
      taxRate: 30,
      costRecoveryCap: 100,
      profitSplitContractor: 100,
    });
  };

  test('the two engines produce the same annual contractor cash flow', () => {
    const econ = screening();
    rows.forEach((cf, i) => {
      expect(cf.contractorNCF).toBeCloseTo(econ.cashflow[i].ncf, 6);
    });
  });

  test('CONVENTION: the NPVs differ by exactly one half year of discounting', () => {
    // This engine discounts year-end (t = 1, 2, ...) like the EPE engine;
    // the screening engine discounts mid-year. For identical cash flows
    // the ratio is therefore exactly (1 + r)^0.5, and nothing else.
    const r = project.discountRate / 100;
    const yearEnd = calculateNPV(rows, project.discountRate);
    const midYear = screening().metrics.npv;
    expect(midYear).toBeCloseTo(yearEnd * Math.sqrt(1 + r), 6);
  });
});

// EC2-5 (engines #186): the sandbox adopted the screening engine's IRR
// contract. A rate is reported only when it is a verified root inside -99 to
// 1000 percent; otherwise `irr` is null and `irrStatus` says which case it is.
// The bisection this replaced returned 0 both for a flow that never changes
// sign and for one whose only root is negative, so "0.0%" meant two different
// things and neither was a rate.
describe('solvers', () => {
  test('a reported IRR is a rate at which NPV is zero', () => {
    // One sign change, so there is one rate and it is reported.
    const rows = [
      { year: 1, contractorNCF: -1000 },
      { year: 2, contractorNCF: 400 },
      { year: 3, contractorNCF: 400 },
      { year: 4, contractorNCF: 400 },
    ];
    const result = calculateIRRResult(rows);
    expect(result.irrStatus).toBe('ok');
    expect(result.irr).toBeGreaterThan(0);
    expect(calculateIRR(rows)).toBe(result.irr);
    expect(calculateNPV(rows, result.irr)).toBeCloseTo(0, 6);
    expect(result.irrRoots).toBeNull();
  });

  test('the 25 year test project has no single IRR, and every root it names is one', () => {
    // The tail turns the contractor cash flow negative again, so the flow
    // changes sign more than once and no single rate is "the" return.
    const rows = calculateCashFlowForRegime(flatRegime(), project);
    const result = calculateIRRResult(rows);
    expect(result.irr).toBeNull();
    expect(result.irrStatus).toBe('multiple-roots');
    expect(result.irrRoots.length).toBeGreaterThan(1);
    // Each listed root really does zero the NPV, to the engine's scaled
    // tolerance (the flow is thousands of $MM, so an absolute 1e-6 is not
    // the right bar; use a relative one against the gross movement).
    const scale = rows.reduce((sum, cf) => sum + Math.abs(cf.contractorNCF), 0);
    result.irrRoots.forEach((root) => {
      expect(Math.abs(calculateNPV(rows, root)) / scale).toBeLessThan(1e-6);
    });
    expect(calculateIRR(rows)).toBeNull();
  });

  test('no IRR is reported when the cash flow never changes sign', () => {
    const allPositive = [
      { year: 1, contractorNCF: 10 },
      { year: 2, contractorNCF: 20 },
    ];
    expect(calculateIRR(allPositive)).toBeNull();
    expect(calculateIRRResult(allPositive).irrStatus).toBe('no-sign-change');
    // and the two cases the old solver both reported as 0 are told apart:
    // a flow whose only root is negative reports that negative root.
    const negativeRoot = [
      { year: 1, contractorNCF: -100 },
      { year: 2, contractorNCF: 40 },
      { year: 3, contractorNCF: 40 },
    ];
    const neg = calculateIRRResult(negativeRoot);
    expect(neg.irrStatus).toBe('ok');
    expect(neg.irr).toBeLessThan(0);
  });

  test('a tier table with a repeated threshold is refused, naming the regime', () => {
    const clash = flatRegime({
      name: 'Clashing PSC',
      royalty: { type: 'sliding_price', tiers: [{ threshold: 60, rate: 10 }, { threshold: 60, rate: 15 }] },
    });
    expect(() => calculateCashFlowForRegime(clash, project))
      .toThrow(/Fiscal regime "Clashing PSC": the royalty tier table has more than one tier at threshold 60/);
    // Negative control: distinct thresholds are accepted, in any order.
    const sorted = flatRegime({
      royalty: { type: 'sliding_price', tiers: [{ threshold: 80, rate: 15 }, { threshold: 60, rate: 10 }] },
    });
    expect(() => calculateCashFlowForRegime(sorted, project)).not.toThrow();
  });

  test('a harsher regime leaves the contractor less', () => {
    const soft = calculateCashFlowForRegime(flatRegime(), project);
    const harsh = calculateCashFlowForRegime(
      flatRegime({ profitSplit: { type: 'flat', split: 40 }, royalty: { type: 'flat', rate: 20 } }),
      project,
    );
    expect(calculateNPV(harsh, project.discountRate))
      .toBeLessThan(calculateNPV(soft, project.discountRate));
    // and the government correspondingly more
    const govOf = (r) => r.reduce((sum, cf) => sum + cf.governmentTake, 0);
    expect(govOf(harsh)).toBeGreaterThan(govOf(soft));
  });
});

// Economics E2: the Insights tab used to state four conclusions of which
// three were never computed. These pin the derived versions to the numbers.
describe('deriveInsights', () => {
  const sens = {
    price: {
      labels: [40, 80, 120],
      data: [
        { regimeId: 'a', values: [30, 35, 40], states: ['share', 'share', 'share'] }, // +10 points
        { regimeId: 'b', values: [35, 47, 60], states: ['share', 'share', 'share'] }, // +25 points, the progressive one
      ],
    },
    capex: {
      labels: ['0.8', '1.5'],
      data: [
        { regimeId: 'a', values: [200, 100] }, // gives up 100
        { regimeId: 'b', values: [180, 150] }, // gives up 30, the resilient one
      ],
    },
  };
  const summary = [
    { id: 'a', name: 'Alpha', npv: 150, irr: 22, paybackPeriod: 6, govTake: 400, effectiveTaxRate: 55 },
    { id: 'b', name: 'Beta', npv: 120, irr: 18, paybackPeriod: 4, govTake: 900, effectiveTaxRate: 70 },
  ];

  it('names the top-NPV regime for the contractor', () => {
    const out = deriveInsights(summary, sens);
    expect(out.find((i) => i.key === 'npv').text).toContain('Alpha');
  });

  it('names the regime that actually pays back fastest, not the top-NPV one', () => {
    // The old copy asserted the top-NPV regime also had the fastest payback.
    // Here it does not: Beta pays back two years sooner.
    const out = deriveInsights(summary, sens);
    const payback = out.find((i) => i.key === 'payback');
    expect(payback.text).toContain('Beta');
    expect(payback.text).toContain('year 4');
  });

  it('names the regime that actually collects the most, not the runner-up by NPV', () => {
    // The old copy always named summary[1]. Here that happens to be Beta, so
    // flip the order to prove the claim follows the take and not the rank.
    const flipped = [
      { ...summary[1], npv: 300 },
      { ...summary[0] },
    ];
    const out = deriveInsights(flipped, sens);
    const gov = out.find((i) => i.key === 'government');
    expect(gov.text).toContain('Beta');
    expect(gov.text).toContain('900');
  });

  it('ranks capex resilience by NPV actually given up across the sweep', () => {
    const out = deriveInsights(summary, sens);
    const capex = out.find((i) => i.key === 'capex');
    expect(capex.text).toMatch(/"Beta" gives up the least/);
    expect(capex.text).toMatch(/"Alpha" the most/);
  });

  it('ranks price progressivity by the actual climb in government share', () => {
    const out = deriveInsights(summary, sens);
    expect(out.find((i) => i.key === 'price').text).toContain('Beta');
  });

  it('says so plainly when nothing pays back, rather than printing a null year', () => {
    const never = summary.map((r) => ({ ...r, paybackPeriod: null }));
    const out = deriveInsights(never, sens);
    expect(out.find((i) => i.key === 'payback').text).toMatch(/No regime pays back/);
  });

  it('omits the sweep claims when there is only one regime to compare', () => {
    const one = [summary[0]];
    const oneSens = { price: { labels: [40, 80, 120], data: [sens.price.data[0]] }, capex: { labels: ['0.8', '1.5'], data: [sens.capex.data[0]] } };
    const out = deriveInsights(one, oneSens);
    expect(out.some((i) => i.key === 'capex')).toBe(false);
    expect(out.some((i) => i.key === 'price')).toBe(false);
    expect(out.some((i) => i.key === 'npv')).toBe(true);
  });

  // EC2-1 (owner decision 2026-09-14): progressivity is ranked only across
  // prices where every regime's point is a government share.
  const withPrice = (labels, a, b) => ({ ...sens, price: { labels, data: [{ regimeId: 'a', ...a }, { regimeId: 'b', ...b }] } });
  const priceText = (sensitivity) => deriveInsights(summary, sensitivity).find((i) => i.key === 'price').text;

  it('declines to rank on fewer than three comparable prices', () => {
    const text = priceText(withPrice([40, 120], { values: [30, 40], states: ['share', 'share'] }, { values: [35, 60], states: ['share', 'share'] }));
    expect(text).toMatch(/^No regime can be ranked across this sweep/);
    expect(text).not.toMatch(/most progressive/);
  });

  it('declines to rank when the lead is under one percentage point', () => {
    const text = priceText(withPrice([40, 80, 120],
      { values: [30, 35, 40], states: ['share', 'share', 'share'] },
      { values: [35, 40, 45.5], states: ['share', 'share', 'share'] }));
    expect(text).toMatch(/within one percentage point/);
  });

  it('never measures a climb from an exceeds point', () => {
    // Read from 40, Alpha would climb from 150 to 64. Over 50 to 70 Beta leads.
    const text = priceText(withPrice([40, 50, 60, 70],
      { values: [150, 60, 62, 64], states: ['exceeds', 'share', 'share', 'share'] },
      { values: [40, 45, 55, 66], states: ['share', 'share', 'share', 'share'] }));
    expect(text).toMatch(/^"Beta" is the most progressive/);
    expect(text).toMatch(/between 50 and 70 USD per bbl/);
  });

  it('names the first price at which a regime is economic when it cannot rank', () => {
    const text = priceText(withPrice([40, 50, 60, 70],
      { values: [null, null, 120, 90], states: ['undefined', 'undefined', 'exceeds', 'share'] },
      { values: [null, 80, 70, 65], states: ['undefined', 'share', 'share', 'share'] }));
    expect(text).toMatch(/The first regime to become economic is "Beta", at 50 USD per bbl\.$/);
  });

  it('does not call a falling share progressive', () => {
    const text = priceText(withPrice([40, 80, 120],
      { values: [60, 55, 50], states: ['share', 'share', 'share'] },
      { values: [60, 50, 40], states: ['share', 'share', 'share'] }));
    expect(text).toMatch(/^No regime is progressive/);
    expect(text).toMatch(/"Alpha" is the least regressive, falling 10\.0 percentage points/);
  });

  it('returns nothing at all rather than a conclusion about no regimes', () => {
    expect(deriveInsights([], sens)).toEqual([]);
  });
});
