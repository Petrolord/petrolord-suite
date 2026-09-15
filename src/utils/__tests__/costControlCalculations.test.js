/**
 * AFE cost control and JV allocation (Economics E4).
 *
 * The AFE Cost Control Manager carried real earned-value math and a real
 * joint-venture cost split, and neither had a single test. These are numbers
 * people bill partners on and report to a board, so they are checked here
 * against hand-computable cases and against the identities the arithmetic has
 * to satisfy whatever the inputs.
 */
import {
  AfeInputError, calculateMetrics, generateSCurveData, itemForecast,
  calculatePartnerCosts as shimPartnerCosts,
} from '@/utils/costControlCalculations';
import { calculatePartnerCosts } from '@/utils/afeServices';

// A window that is entirely in the past, so time progress is a clean 1.0.
// EC5-0: every call passes asOf explicitly, as the app does, so nothing here
// reads the clock.
const AFE = { start_date: '2020-01-01', end_date: '2020-12-31', currency: 'USD' };
const AS_OF = '2026-09-14';

describe('calculateMetrics', () => {
  it('sums budget, commitments and actuals across the cost items', () => {
    const items = [
      { budget: 100, commitment: 20, actual: 30, progress: 0 },
      { budget: 200, commitment: 50, actual: 40, progress: 0 },
    ];
    const m = calculateMetrics(AFE, items, [], AS_OF);
    expect(m.totalBudget).toBe(300);
    expect(m.totalCommitments).toBe(70);
    expect(m.totalActuals).toBe(70);
  });

  it('uses the entered forecast for an item when there is one', () => {
    const items = [{ budget: 100, commitment: 0, actual: 0, forecast: 140, progress: 0 }];
    expect(calculateMetrics(AFE, items, [], AS_OF).totalForecast).toBe(140);
  });

  it('otherwise forecasts the greater of budget and committed spend', () => {
    // Under budget so far: the budget still stands.
    const under = [{ budget: 100, commitment: 10, actual: 20, progress: 0 }];
    expect(calculateMetrics(AFE, under, [], AS_OF).totalForecast).toBe(100);

    // Already committed past the budget: the commitment governs, because a
    // forecast below money already spent and committed is not a forecast.
    const over = [{ budget: 100, commitment: 60, actual: 70, progress: 0 }];
    expect(calculateMetrics(AFE, over, [], AS_OF).totalForecast).toBe(130);
  });

  it('reports variance as budget less forecast, negative when overrunning', () => {
    const items = [{ budget: 100, commitment: 60, actual: 70, progress: 0 }];
    expect(calculateMetrics(AFE, items, [], AS_OF).variance).toBe(-30);
  });

  it('earns value in proportion to progress, weighted by budget', () => {
    // 100 at half done plus 300 at a fifth done = 50 + 60.
    const items = [
      { budget: 100, actual: 0, progress: 50 },
      { budget: 300, actual: 0, progress: 20 },
    ];
    const m = calculateMetrics(AFE, items, [], AS_OF);
    expect(m.earnedValue).toBeCloseTo(110, 10);
    expect(m.percentComplete).toBeCloseTo(27.5, 10);
  });

  it('reports CPI as earned value over actual cost', () => {
    // Half of a 200 budget earned for 80 spent: 100 / 80.
    const items = [{ budget: 200, actual: 80, progress: 50 }];
    expect(calculateMetrics(AFE, items, [], AS_OF).cpi).toBeCloseTo(1.25, 10);
  });

  it('reports SPI against elapsed time, which is the documented simplification', () => {
    // The window is fully past, so planned value is the whole budget: a job
    // 50 percent complete at the end of its window has an SPI of 0.5.
    const items = [{ budget: 200, actual: 100, progress: 50 }];
    expect(calculateMetrics(AFE, items, [], AS_OF).spi).toBeCloseTo(0.5, 10);
  });

  // EC5-3 and the CPI item (engines #185): an undefined ratio is null with a
  // status saying why, where it used to be a flattering 1.
  it('reports no ratio, with the reason, on an empty or unspent AFE', () => {
    const empty = calculateMetrics(AFE, [], [], AS_OF);
    expect(empty.totalBudget).toBe(0);
    expect(empty.cpi).toBeNull();
    expect(empty.cpiStatus).toBe('no-spend');
    expect(empty.spi).toBeNull();
    expect(empty.spiStatus).toBe('no-budget');
    expect(empty.percentSpent).toBe(0);
    expect(Number.isFinite(empty.percentComplete)).toBe(true);

    // Negative control: with a budget and spend, both ratios are reported.
    const live = calculateMetrics(AFE, [{ budget: 200, actual: 80, progress: 50 }], [], AS_OF);
    expect(live.cpiStatus).toBe('ok');
    expect(live.spiStatus).toBe('ok');
    expect(Number.isFinite(live.cpi)).toBe(true);
  });

  it('treats missing numbers as zero rather than producing NaN', () => {
    const items = [{ budget: null, commitment: undefined, actual: '', progress: 'x' }];
    const m = calculateMetrics(AFE, items, [], AS_OF);
    const RATIOS = ['cpi', 'spi'];
    const STATUSES = ['cpiStatus', 'spiStatus'];
    Object.entries(m).forEach(([k, v]) => {
      if (STATUSES.includes(k)) return;
      if (RATIOS.includes(k) && v === null) return;
      expect(Number.isFinite(v)).toBe(true);
    });
    // and no NaN hides behind a null: nothing is NaN
    Object.values(m).forEach((v) => expect(typeof v === 'number' && Number.isNaN(v)).toBe(false));
  });

  // EC5-8: progress above 100 percent is refused like negative progress.
  it('refuses progress above 100 percent by name', () => {
    expect(() => calculateMetrics(AFE, [{ code: 'X1', budget: 10, progress: 140 }], [], AS_OF))
      .toThrow(/Cost item "X1" has progress above 100 percent \(140 percent\)/);
    // Negative control: 100 exactly is accepted.
    expect(() => calculateMetrics(AFE, [{ code: 'X1', budget: 10, progress: 100 }], [], AS_OF))
      .not.toThrow();
  });
});

describe('EC5-0 AFE contracts', () => {
  it('itemForecast is the one EAC rule: an entered forecast above zero, else max(budget, actual + commitment)', () => {
    expect(itemForecast({ budget: 1000, forecast: 1100 })).toBe(1100);
    expect(itemForecast({ budget: 1000, actual: 1300 })).toBe(1300);
    expect(itemForecast({ budget: 1000, actual: 200, commitment: 100 })).toBe(1000);
    expect(itemForecast({ budget: 1000, actual: 1300, forecast: 0 })).toBe(1300);
  });

  it('reports SPI as null with no planned value on the start day, and a real SPI later', () => {
    const afe = { start_date: '2026-01-01', end_date: '2026-12-31' };
    const items = [{ budget: 100, actual: 0, progress: 10 }];
    const onStart = calculateMetrics(afe, items, [], '2026-01-01');
    expect(onStart.plannedValue).toBe(0);
    expect(onStart.spi).toBeNull();
    const later = calculateMetrics(afe, items, [], '2026-07-02');
    expect(later.spi).toBeGreaterThan(0);
    expect(later.timeProgress).toBeGreaterThan(0);
  });

  it('is reproducible for an explicit asOf', () => {
    const afe = { start_date: '2026-01-01', end_date: '2026-12-31' };
    const items = [{ budget: 100, actual: 0, progress: 40 }];
    expect(calculateMetrics(afe, items, [], '2026-06-01').spi)
      .toBe(calculateMetrics(afe, items, [], new Date(2026, 5, 1)).spi);
  });

  it('stops the S-curve at the window end', () => {
    const points = generateSCurveData(AFE, [{ budget: 1200 }], [], AS_OF);
    expect(points).toHaveLength(12);
  });

  it('refuses negative progress and an invalid asOf with an AfeInputError', () => {
    expect(() => calculateMetrics(AFE, [{ budget: 1, progress: -5 }], [], AS_OF)).toThrow(AfeInputError);
    expect(() => calculateMetrics(AFE, [], [], 'not a date')).toThrow(AfeInputError);
  });

  it('flags a negative working interest as invalid, through the shim and afeServices alike', () => {
    for (const fn of [shimPartnerCosts, calculatePartnerCosts]) {
      const out = fn(1000, [{ name: 'Oops', working_interest: -10 }]);
      expect(out.valid).toBe(false);
      expect(out.note).toMatch(/negative working interest/);
    }
  });
});

describe('generateSCurveData', () => {
  it('returns nothing without a start and end date, rather than guessing one', () => {
    expect(generateSCurveData({}, [{ budget: 100 }], [], AS_OF)).toEqual([]);
  });

  it('spreads the plan across the window and ends at the full budget', () => {
    const points = generateSCurveData(AFE, [{ budget: 1200 }], [], AS_OF);
    expect(points.length).toBeGreaterThan(1);
    expect(points[0].Planned).toBe(0);
    expect(points[points.length - 1].Planned).toBeLessThanOrEqual(1200);
    // Monotone: a cumulative curve may never go backwards.
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i].Planned).toBeGreaterThanOrEqual(points[i - 1].Planned);
    }
  });

  it('builds actuals from invoices up to each date', () => {
    const invoices = [
      { invoice_date: '2020-02-15', amount: 100 },
      { invoice_date: '2020-06-15', amount: 250 },
    ];
    const points = generateSCurveData(AFE, [{ budget: 1200 }], invoices, AS_OF);
    const last = points[points.length - 1];
    // Both invoices are inside the window and in the past, so the final
    // actual is their sum.
    expect(last.Actual).toBe(350);
  });
});

describe('calculatePartnerCosts', () => {
  const partners = [
    { name: 'A', working_interest: 30 },
    { name: 'B', working_interest: 15 },
  ];

  it('allocates each partner their working interest of the cost', () => {
    const { partnerAllocations } = calculatePartnerCosts(1000, partners);
    expect(partnerAllocations[0].shareAmount).toBeCloseTo(300, 10);
    expect(partnerAllocations[1].shareAmount).toBeCloseTo(150, 10);
  });

  it('leaves the operator carrying the rest', () => {
    const { operatorShare, operatorAmount } = calculatePartnerCosts(1000, partners);
    expect(operatorShare).toBeCloseTo(55, 10);
    expect(operatorAmount).toBeCloseTo(550, 10);
  });

  it('allocates every currency unit exactly once', () => {
    // The identity that matters for billing: the split conserves the cost.
    const { partnerAllocations, operatorAmount } = calculatePartnerCosts(1234.56, partners);
    const total = partnerAllocations.reduce((s, p) => s + p.shareAmount, 0) + operatorAmount;
    expect(total).toBeCloseTo(1234.56, 8);
  });

  it('flags interests that add to more than the whole instead of billing them', () => {
    // Economics E4: this used to return a negative operator share silently,
    // so a mistyped interest would bill out more than the cost.
    const tooMuch = [
      { name: 'A', working_interest: 70 },
      { name: 'B', working_interest: 45 },
    ];
    const out = calculatePartnerCosts(1000, tooMuch);
    expect(out.valid).toBe(false);
    expect(out.note).toMatch(/115\.00 percent/);
    expect(out.operatorShare).toBeCloseTo(-15, 10);
  });

  it('accepts a shortfall as valid, since the operator may simply hold the balance', () => {
    const out = calculatePartnerCosts(1000, [{ name: 'A', working_interest: 10 }]);
    expect(out.valid).toBe(true);
    expect(out.note).toBeNull();
    expect(out.operatorShare).toBeCloseTo(90, 10);
  });

  it('gives the operator the whole cost when there are no partners', () => {
    const out = calculatePartnerCosts(500, []);
    expect(out.operatorShare).toBe(100);
    expect(out.operatorAmount).toBe(500);
    expect(out.valid).toBe(true);
  });

  it('treats a non-numeric interest as zero rather than producing NaN', () => {
    const out = calculatePartnerCosts(1000, [{ name: 'A', working_interest: '' }]);
    expect(out.partnerAllocations[0].shareAmount).toBe(0);
    expect(out.operatorAmount).toBe(1000);
  });
});
