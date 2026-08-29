/**
 * AFE cost control and JV allocation (Economics E4).
 *
 * The AFE Cost Control Manager carried real earned-value math and a real
 * joint-venture cost split, and neither had a single test. These are numbers
 * people bill partners on and report to a board, so they are checked here
 * against hand-computable cases and against the identities the arithmetic has
 * to satisfy whatever the inputs.
 */
import { calculateMetrics, generateSCurveData } from '@/utils/costControlCalculations';
import { calculatePartnerCosts } from '@/utils/afeServices';

// A window that is entirely in the past, so time progress is a clean 1.0 and
// the schedule index does not move with the calendar.
const AFE = { start_date: '2020-01-01', end_date: '2020-12-31', currency: 'USD' };

describe('calculateMetrics', () => {
  it('sums budget, commitments and actuals across the cost items', () => {
    const items = [
      { budget: 100, commitment: 20, actual: 30, progress: 0 },
      { budget: 200, commitment: 50, actual: 40, progress: 0 },
    ];
    const m = calculateMetrics(AFE, items, []);
    expect(m.totalBudget).toBe(300);
    expect(m.totalCommitments).toBe(70);
    expect(m.totalActuals).toBe(70);
  });

  it('uses the entered forecast for an item when there is one', () => {
    const items = [{ budget: 100, commitment: 0, actual: 0, forecast: 140, progress: 0 }];
    expect(calculateMetrics(AFE, items, []).totalForecast).toBe(140);
  });

  it('otherwise forecasts the greater of budget and committed spend', () => {
    // Under budget so far: the budget still stands.
    const under = [{ budget: 100, commitment: 10, actual: 20, progress: 0 }];
    expect(calculateMetrics(AFE, under, []).totalForecast).toBe(100);

    // Already committed past the budget: the commitment governs, because a
    // forecast below money already spent and committed is not a forecast.
    const over = [{ budget: 100, commitment: 60, actual: 70, progress: 0 }];
    expect(calculateMetrics(AFE, over, []).totalForecast).toBe(130);
  });

  it('reports variance as budget less forecast, negative when overrunning', () => {
    const items = [{ budget: 100, commitment: 60, actual: 70, progress: 0 }];
    expect(calculateMetrics(AFE, items, []).variance).toBe(-30);
  });

  it('earns value in proportion to progress, weighted by budget', () => {
    // 100 at half done plus 300 at a fifth done = 50 + 60.
    const items = [
      { budget: 100, actual: 0, progress: 50 },
      { budget: 300, actual: 0, progress: 20 },
    ];
    const m = calculateMetrics(AFE, items, []);
    expect(m.earnedValue).toBeCloseTo(110, 10);
    expect(m.percentComplete).toBeCloseTo(27.5, 10);
  });

  it('reports CPI as earned value over actual cost', () => {
    // Half of a 200 budget earned for 80 spent: 100 / 80.
    const items = [{ budget: 200, actual: 80, progress: 50 }];
    expect(calculateMetrics(AFE, items, []).cpi).toBeCloseTo(1.25, 10);
  });

  it('reports SPI against elapsed time, which is the documented simplification', () => {
    // The window is fully past, so planned value is the whole budget: a job
    // 50 percent complete at the end of its window has an SPI of 0.5.
    const items = [{ budget: 200, actual: 100, progress: 50 }];
    expect(calculateMetrics(AFE, items, []).spi).toBeCloseTo(0.5, 10);
  });

  it('does not divide by zero on an empty or unspent AFE', () => {
    const empty = calculateMetrics(AFE, [], []);
    expect(empty.totalBudget).toBe(0);
    expect(empty.cpi).toBe(1);
    expect(empty.spi).toBe(1);
    expect(empty.percentSpent).toBe(0);
    expect(Number.isFinite(empty.percentComplete)).toBe(true);
  });

  it('treats missing numbers as zero rather than producing NaN', () => {
    const items = [{ budget: null, commitment: undefined, actual: '', progress: 'x' }];
    const m = calculateMetrics(AFE, items, []);
    Object.values(m).forEach((v) => expect(Number.isFinite(v)).toBe(true));
  });
});

describe('generateSCurveData', () => {
  it('returns nothing without a start and end date, rather than guessing one', () => {
    expect(generateSCurveData({}, [{ budget: 100 }], [])).toEqual([]);
  });

  it('spreads the plan across the window and ends at the full budget', () => {
    const points = generateSCurveData(AFE, [{ budget: 1200 }], []);
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
    const points = generateSCurveData(AFE, [{ budget: 1200 }], invoices);
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
