// Gates for the P3 allocation analytics (utils/production/allocation).
// Fixtures are hand-built fields with arithmetic that can be checked by
// hand: two producers on known tests, a known metered total, and the
// factor those two imply.
import {
  monthKey, groupTests, testInForce, computeAllocation, monthlyFactors,
  allocatedLedgerRows, imbalanceSeries, validateWellTests,
  DEFAULT_ALLOCATION_SETTINGS,
} from '../allocation';
import { buildWellSeries } from '../surveillance';

const P1 = { id: 'w1', name: 'P-1', well_type: 'producer' };
const P2 = { id: 'w2', name: 'P-2', well_type: 'producer' };
const I1 = { id: 'w3', name: 'I-1', well_type: 'injector' };
const WELLS = [P1, P2, I1];

const test = (wellId, date, o, w, g, extra = {}) => ({
  id: `t-${wellId}-${date}`,
  well_id: wellId,
  test_date: date,
  oil_rate_stbd: o,
  water_rate_stbd: w,
  gas_rate_mscfd: g,
  is_valid: true,
  ...extra,
});

const ledgerRow = (well, date, v = {}) => ({
  id: `l-${well.id}-${date}`,
  well_id: well.id,
  prod_date: date,
  oil_stb: v.oil ?? 0,
  water_stb: v.water ?? 0,
  gas_mscf: v.gas ?? 0,
  winj_stb: v.winj ?? 0,
  ginj_mscf: v.ginj ?? 0,
  hours_on: v.hours ?? null,
  well,
});

const total = (date, oil, water, gas) => ({
  total_date: date, oil_stb: oil, water_stb: water, gas_mscf: gas,
});

// Both producers tested on 2025-01-01: P-1 at 1000 stb/d, P-2 at 500.
const TESTS = [
  test('w1', '2025-01-01', 1000, 100, 500),
  test('w2', '2025-01-01', 500, 50, 250),
];

describe('monthKey', () => {
  it('collapses a date to the first of its month', () => {
    expect(monthKey('2025-03-17')).toBe('2025-03-01');
  });
});

describe('groupTests', () => {
  it('groups by well, date-ascending, dropping tests that failed QC', () => {
    const tests = [
      test('w1', '2025-02-01', 900, 100, 400),
      test('w1', '2025-01-01', 1000, 100, 500),
      test('w1', '2025-03-01', 10, 0, 0, { is_valid: false }),
    ];
    const grouped = groupTests(tests);
    expect(grouped.get('w1').map((t) => t.test_date)).toEqual(['2025-01-01', '2025-02-01']);
  });

  it('keeps invalid tests when asked', () => {
    const tests = [test('w1', '2025-03-01', 10, 0, 0, { is_valid: false })];
    expect(groupTests(tests, { includeInvalid: true }).get('w1')).toHaveLength(1);
  });
});

describe('testInForce', () => {
  const tests = [
    test('w1', '2025-01-01', 1000, 100, 500),
    test('w1', '2025-03-01', 800, 200, 450),
  ];

  it('takes the most recent test on or before the date', () => {
    expect(testInForce(tests, '2025-02-15').test_date).toBe('2025-01-01');
    expect(testInForce(tests, '2025-03-01').test_date).toBe('2025-03-01');
  });

  it('returns null before the first test rather than extrapolating backwards', () => {
    expect(testInForce(tests, '2024-12-31')).toBeNull();
  });

  it('lets a test expire rather than carrying a stale rate forever', () => {
    expect(testInForce(tests, '2025-12-01', 180)).toBeNull();
    expect(testInForce(tests, '2025-12-01', 400).test_date).toBe('2025-03-01');
  });
});

describe('computeAllocation', () => {
  it('splits the metered total in proportion to the tests', () => {
    const result = computeAllocation({
      wells: WELLS,
      tests: TESTS,
      ledger: [],
      totals: [total('2025-01-10', 1200, 120, 600)],
    });
    const day = result.days[0];
    // Theoretical 1000 + 500 = 1500 stb; measured 1200 -> factor 0.8.
    expect(day.theoretical.oil).toBe(1500);
    expect(day.factors.oil).toBeCloseTo(0.8, 10);
    const [p1, p2] = day.entries;
    expect(p1.allocated.oil).toBeCloseTo(800, 10);
    expect(p2.allocated.oil).toBeCloseTo(400, 10);
    // The split is exact: allocated adds back to the meter.
    expect(day.allocated.oil).toBeCloseTo(1200, 10);
    expect(day.allocated.gas).toBeCloseTo(600, 10);
  });

  it('never gives an injector a share of produced volumes', () => {
    const result = computeAllocation({
      wells: WELLS,
      tests: [...TESTS, test('w3', '2025-01-01', 0, 0, 0)],
      ledger: [],
      totals: [total('2025-01-10', 1200, 120, 600)],
    });
    expect(result.days[0].entries.map((e) => e.wellId)).toEqual(['w1', 'w2']);
  });

  it('scales the test rate by hours on stream', () => {
    const result = computeAllocation({
      wells: [P1, P2],
      tests: TESTS,
      ledger: [
        ledgerRow(P1, '2025-01-10', { hours: 24 }),
        ledgerRow(P2, '2025-01-10', { hours: 12 }),
      ],
      totals: [total('2025-01-10', 1250, 0, 0)],
    });
    const day = result.days[0];
    // P-2 at half a day contributes 250, so theoretical is 1250 and the
    // factor is exactly 1.
    expect(day.theoretical.oil).toBeCloseTo(1250, 10);
    expect(day.factors.oil).toBeCloseTo(1, 10);
    expect(day.entries[1].allocated.oil).toBeCloseTo(250, 10);
  });

  it('ignores uptime when the setting is off', () => {
    const result = computeAllocation({
      wells: [P1, P2],
      tests: TESTS,
      ledger: [ledgerRow(P2, '2025-01-10', { hours: 12 })],
      totals: [total('2025-01-10', 1500, 0, 0)],
      settings: { useUptime: false },
    });
    expect(result.days[0].theoretical.oil).toBe(1500);
  });

  it('excludes a well with no test in force and says so', () => {
    const result = computeAllocation({
      wells: [P1, P2],
      tests: [TESTS[0]],
      ledger: [],
      totals: [total('2025-01-10', 1000, 0, 0)],
    });
    expect(result.days[0].entries).toHaveLength(1);
    const diag = result.diagnostics.find((d) => d.code === 'no_test_in_force');
    expect(diag.wellName).toBe('P-2');
  });

  it('allocates nothing, and flags it, when no well can carry the volume', () => {
    const result = computeAllocation({
      wells: [P1],
      tests: [],
      ledger: [],
      totals: [total('2025-01-10', 900, 0, 0)],
    });
    expect(result.days[0].factors.oil).toBeNull();
    expect(result.days[0].allocated.oil).toBe(0);
    expect(result.diagnostics.some((d) => d.code === 'no_basis')).toBe(true);
  });

  it('flags a factor outside the band without clamping it', () => {
    const result = computeAllocation({
      wells: [P1],
      tests: [TESTS[0]],
      ledger: [],
      totals: [total('2025-01-10', 2000, 0, 0)],
    });
    expect(result.days[0].factors.oil).toBeCloseTo(2, 10);
    expect(result.days[0].entries[0].allocated.oil).toBeCloseTo(2000, 10);
    expect(result.diagnostics.some((d) => d.code === 'factor_out_of_band')).toBe(true);
  });

  it('only allocates dates that carry a metered total', () => {
    const result = computeAllocation({
      wells: [P1],
      tests: [TESTS[0]],
      ledger: [ledgerRow(P1, '2025-01-11', { oil: 900 })],
      totals: [total('2025-01-10', 1000, 0, 0)],
    });
    expect(result.days.map((d) => d.date)).toEqual(['2025-01-10']);
  });

  it('prorates the wells own meters on the ledger basis', () => {
    const result = computeAllocation({
      wells: [P1, P2],
      tests: [],
      ledger: [
        ledgerRow(P1, '2025-01-10', { oil: 900 }),
        ledgerRow(P2, '2025-01-10', { oil: 300 }),
      ],
      totals: [total('2025-01-10', 1000, 0, 0)],
      settings: { basis: 'ledger' },
    });
    const day = result.days[0];
    expect(day.theoretical.oil).toBe(1200);
    // 1000 / 1200 = 0.8333: 750 and 250.
    expect(day.entries[0].allocated.oil).toBeCloseTo(750, 6);
    expect(day.entries[1].allocated.oil).toBeCloseTo(250, 6);
  });

  it('rolls the period up per well and in total', () => {
    const result = computeAllocation({
      wells: [P1, P2],
      tests: TESTS,
      ledger: [],
      totals: [total('2025-01-10', 1500, 0, 0), total('2025-01-11', 1500, 0, 0)],
    });
    expect(result.totals.days).toBe(2);
    expect(result.totals.measured.oil).toBe(3000);
    expect(result.totals.allocated.oil).toBeCloseTo(3000, 6);
    const p1 = result.wells.find((w) => w.wellId === 'w1');
    expect(p1.days).toBe(2);
    expect(p1.allocated.oil).toBeCloseTo(2000, 6);
  });
});

describe('monthlyFactors', () => {
  it('weights a well month by volume and keys on the first of the month', () => {
    const allocation = computeAllocation({
      wells: [P1],
      tests: [TESTS[0]],
      ledger: [],
      totals: [
        total('2025-01-10', 500, 0, 0),   // factor 0.5
        total('2025-01-20', 1500, 0, 0),  // factor 1.5
        total('2025-02-05', 1000, 0, 0),  // factor 1.0
      ],
    });
    const rows = monthlyFactors(allocation);
    expect(rows).toHaveLength(2);
    expect(rows[0].periodMonth).toBe('2025-01-01');
    // (500 + 1500) allocated over (1000 + 1000) theoretical = 1.0
    expect(rows[0].factors.oil).toBeCloseTo(1, 10);
    expect(rows[1].periodMonth).toBe('2025-02-01');
    expect(rows[1].factors.oil).toBeCloseTo(1, 10);
  });

  it('carries a neutral factor where a phase had no theoretical volume', () => {
    const allocation = computeAllocation({
      wells: [P1],
      tests: [test('w1', '2025-01-01', 1000, 0, 0)], // no water, no gas
      ledger: [],
      totals: [total('2025-01-10', 1000, 0, 0)],
    });
    expect(monthlyFactors(allocation)[0].factors.water).toBe(1);
  });
});

describe('allocatedLedgerRows', () => {
  it('returns ledger-shaped rows carrying the uptime that produced them', () => {
    const allocation = computeAllocation({
      wells: [P1],
      tests: [TESTS[0]],
      ledger: [ledgerRow(P1, '2025-01-10', { hours: 12 })],
      totals: [total('2025-01-10', 500, 0, 0)],
    });
    const rows = allocatedLedgerRows(allocation);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ wellId: 'w1', date: '2025-01-10', hours_on: 12 });
    expect(rows[0].oil_stb).toBeCloseTo(500, 6);
  });
});

describe('imbalanceSeries', () => {
  it('reports what the meter saw against what the wells booked', () => {
    const ledger = [ledgerRow(P1, '2025-01-10', { oil: 900 })];
    const allocation = computeAllocation({
      wells: [P1], tests: [TESTS[0]], ledger, totals: [total('2025-01-10', 1000, 0, 0)],
    });
    const [row] = imbalanceSeries(allocation, ledger);
    expect(row.oil.measured).toBe(1000);
    expect(row.oil.booked).toBe(900);
    expect(row.oil.imbalance).toBe(100);
    expect(row.oil.imbalancePct).toBeCloseTo(11.11, 2);
  });

  it('leaves the percentage null when the wells booked nothing', () => {
    const allocation = computeAllocation({
      wells: [P1], tests: [TESTS[0]], ledger: [], totals: [total('2025-01-10', 1000, 0, 0)],
    });
    expect(imbalanceSeries(allocation, [])[0].oil.imbalancePct).toBeNull();
  });
});

describe('validateWellTests', () => {
  const seriesFor = (rows) => buildWellSeries(rows);

  it('passes a test that agrees with the ledger', () => {
    const rows = [ledgerRow(P1, '2025-01-05', { oil: 1000, water: 100, gas: 500, hours: 24 })];
    const issues = validateWellTests(
      [test('w1', '2025-01-05', 1000, 100, 500, { duration_hours: 8 })],
      seriesFor(rows),
    );
    expect(issues).toHaveLength(0);
  });

  it('flags a test that recorded no flow', () => {
    const issues = validateWellTests([test('w1', '2025-01-05', 0, 0, 0)], []);
    expect(issues[0].issues.some((i) => i.code === 'zero_rate')).toBe(true);
    expect(issues[0].severity).toBe('high');
  });

  it('flags a test too short to stabilize', () => {
    const rows = [ledgerRow(P1, '2025-01-05', { oil: 1000, water: 100, gas: 500, hours: 24 })];
    const issues = validateWellTests(
      [test('w1', '2025-01-05', 1000, 100, 500, { duration_hours: 1 })],
      seriesFor(rows),
    );
    expect(issues[0].issues.some((i) => i.code === 'short_duration')).toBe(true);
  });

  it('flags a rate far off the wells own test history', () => {
    const tests = [
      test('w1', '2025-01-01', 1000, 100, 500),
      test('w1', '2025-02-01', 1000, 100, 500),
      test('w1', '2025-03-01', 1000, 100, 500),
      test('w1', '2025-04-01', 300, 100, 500),
    ];
    const issues = validateWellTests(tests, []);
    const outlier = issues.find((r) => r.testDate === '2025-04-01');
    expect(outlier.issues.some((i) => i.code === 'rate_outlier')).toBe(true);
    // The first three set the baseline; only the fourth is an outlier.
    expect(issues.filter((r) => r.issues.some((i) => i.code === 'rate_outlier'))).toHaveLength(1);
  });

  it('flags a test that disagrees with the ledger on the test date', () => {
    const rows = [ledgerRow(P1, '2025-01-05', { oil: 500, water: 50, gas: 250, hours: 24 })];
    const issues = validateWellTests(
      [test('w1', '2025-01-05', 1000, 100, 500, { duration_hours: 8 })],
      seriesFor(rows),
    );
    expect(issues[0].issues.some((i) => i.code === 'ledger_mismatch')).toBe(true);
  });

  it('compares against the producing-day rate, so a part-day well is judged fairly', () => {
    // 500 stb over 12 hours is 1000 stb/d producing, which matches the test.
    const rows = [ledgerRow(P1, '2025-01-05', { oil: 500, water: 50, gas: 250, hours: 12 })];
    const issues = validateWellTests(
      [test('w1', '2025-01-05', 1000, 100, 500, { duration_hours: 8 })],
      seriesFor(rows),
    );
    expect(issues).toHaveLength(0);
  });

  it('flags a watercut that disagrees with the ledger', () => {
    const rows = [ledgerRow(P1, '2025-01-05', { oil: 500, water: 500, gas: 250, hours: 24 })];
    const issues = validateWellTests(
      [test('w1', '2025-01-05', 500, 50, 250, { duration_hours: 8 })],
      seriesFor(rows),
    );
    expect(issues[0].issues.some((i) => i.code === 'watercut_mismatch')).toBe(true);
  });

  it('notes, at info level, a test with no ledger row to check against', () => {
    const issues = validateWellTests(
      [test('w1', '2025-01-05', 1000, 100, 500, { duration_hours: 8 })], [],
    );
    expect(issues[0].issues[0].code).toBe('no_ledger');
    expect(issues[0].severity).toBe('info');
  });

  it('judges tests already marked invalid too, so a verdict can be revisited', () => {
    const issues = validateWellTests(
      [test('w1', '2025-01-05', 0, 0, 0, { is_valid: false })], [],
    );
    expect(issues).toHaveLength(1);
  });
});

describe('defaults', () => {
  it('ship the documented allocation settings', () => {
    expect(DEFAULT_ALLOCATION_SETTINGS).toMatchObject({
      basis: 'test', useUptime: true, maxTestAgeDays: 180, includeInvalidTests: false,
    });
  });
});

// ---------------------------------------------------------------------------
// The nodal cross-check (P6.5). Deferred at P3 for want of a per-well
// model; possible once wells got one.

describe('crossCheckTestsAgainstNodal', () => {
  const { crossCheckTestsAgainstNodal, DEFAULT_NODAL_CHECK_SETTINGS } = require('../allocation');
  const { buildWellModel, defaultWellInputs } = require('../wellModel');
  const { solveOperatingPoint } = require('@/utils/nodal/system');

  // A well that flows on its own, so there is a nodal rate to compare to.
  const inputs = () => {
    const w = defaultWellInputs();
    w.inflow.pr = '3800';
    w.inflow.pb = '2200';
    w.inflow.pi = '1.2';
    w.fluid.gor = '600';
    return w;
  };
  const nodalRate = () => {
    const m = buildWellModel(inputs());
    return solveOperatingPoint({
      ipr: m.ipr, vlp: { ...m.vlp, whp: 200, rates: { wct: 0.2, gor: 600 } },
    }).op.q;
  };
  const test = (id, oil, over = {}) => ({
    id,
    well_id: 'w1',
    well: { name: 'P-1' },
    test_date: '2025-03-01',
    oil_rate_stbd: oil,
    water_rate_stbd: oil * 0.25,
    gas_rate_mscfd: oil * 0.6,
    thp_psia: 200,
    ...over,
  });
  const run = (tests, models) => crossCheckTestsAgainstNodal({
    tests,
    wellModels: models ?? new Map([['w1', inputs()]]),
    buildModel: buildWellModel,
    solveNode: solveOperatingPoint,
  });

  it('a test that matches its well is reported as agreeing', () => {
    const q = nodalRate();
    const [r] = run([test('t1', Math.round(q))]);
    expect(r.status).toBe('ok');
    expect(Math.abs(r.deviationPct)).toBeLessThan(2);
    expect(r.nodalStbd).toBeCloseTo(q, 0);
  });

  it('a test well off its well is flagged, with the direction named', () => {
    const q = nodalRate();
    const low = run([test('t-low', Math.round(q * 0.4))])[0];
    expect(low.status).toBe('off');
    expect(low.deviationPct).toBeLessThan(0);
    expect(low.message).toMatch(/below/);
    const high = run([test('t-high', Math.round(q * 1.9))])[0];
    expect(high.status).toBe('off');
    expect(high.message).toMatch(/above/);
  });

  it('uses the TEST conditions, not the model\'s: its own water cut and gas ratio', () => {
    // A wetter test is a heavier column, so the well the model describes
    // makes less. If the check ignored the test's own conditions this
    // would come back identical.
    const q = nodalRate();
    const dry = run([test('t-dry', Math.round(q))])[0];
    const wet = run([test('t-wet', Math.round(q), {
      water_rate_stbd: Math.round(q) * 4, gas_rate_mscfd: Math.round(q) * 0.6,
    })])[0];
    expect(wet.nodalStbd).not.toBeCloseTo(dry.nodalStbd, 0);
  });

  it('a well with no model is reported as such, not silently skipped', () => {
    const [r] = run([test('t1', 500)], new Map());
    expect(r.status).toBe('no-model');
    expect(r.nodalStbd).toBeNull();
    expect(r.message).toMatch(/no model on the spine/);
  });

  it('a test with no wellhead pressure cannot be checked, and says why', () => {
    const [r] = run([test('t1', 500, { thp_psia: null })]);
    expect(r.status).toBe('no-thp');
    expect(r.message).toMatch(/tubing head pressure/);
  });

  it('a model that will not flow at the test conditions is a finding, not a crash', () => {
    // Watered out and nearly gasless: the column is too heavy for this
    // well to lift on its own, which is exactly why such a well is a
    // gas lift or ESP candidate. The check has to say so rather than
    // throw or return a number.
    const [r] = run(
      [test('t1', 400, { water_rate_stbd: 3600, gas_rate_mscfd: 20 })],
      new Map([['w1', defaultWellInputs()]]),
    );
    expect(r.status).toBe('dead');
    expect(r.nodalStbd).toBeNull();
    expect(r.message).toMatch(/does not flow/);
  });

  it('sorts the worst findings first', () => {
    const q = nodalRate();
    const rows = run([
      test('t-ok', Math.round(q)),
      test('t-off', Math.round(q * 0.3)),
      test('t-nothp', 500, { thp_psia: null }),
    ]);
    expect(rows[0].testId).toBe('t-off');
    expect(rows[rows.length - 1].testId).toBe('t-ok');
  });

  it('never divides by a rate that says nothing', () => {
    const [r] = run([test('t1', 0)]);
    expect(r.status).toBe('ok');
    expect(r.deviationPct).toBeNull();
    expect(DEFAULT_NODAL_CHECK_SETTINGS.minRateStbd).toBeGreaterThan(0);
  });

  it('solves each well once however many tests it has', () => {
    const q = nodalRate();
    const built = jest.fn(buildWellModel);
    crossCheckTestsAgainstNodal({
      tests: [test('a', q), test('b', q), test('c', q)],
      wellModels: new Map([['w1', inputs()]]),
      buildModel: built,
      solveNode: solveOperatingPoint,
    });
    expect(built).toHaveBeenCalledTimes(1);
  });
});
