/**
 * Production engineering defects found by the Ekene demo kit (2026-09-23):
 *  1. production spine list reads stopped silently at PostgREST's 1,000 rows
 *  2. wells created on import were all producers, injectors included
 *  3. (engines #245) a choke-held test on the unstable crossing read 'off'
 *  4. Well Test skin came from the first gauge point when the pressure at
 *     shut-in was blank, already into the buildup
 */
const mockState = { rows: [], ranges: [], inserted: [] };

jest.mock('@/lib/customSupabaseClient', () => {
  const builder = (table) => {
    const q = {
      _table: table,
      select: () => q, eq: () => q, gte: () => q, lte: () => q, order: () => q,
      range: (from, to) => {
        mockState.ranges.push([from, to]);
        return Promise.resolve({ data: mockState.rows.slice(from, to + 1), error: null });
      },
      insert: (rows) => {
        mockState.inserted.push(...rows);
        const withIds = rows.map((r, i) => ({ id: `new-${i}-${r.name}`, well_type: 'producer', ...r }));
        return { select: () => Promise.resolve({ data: withIds, error: null }) };
      },
      upsert: (rows) => ({ select: () => Promise.resolve({ data: rows.map((_, i) => ({ id: i })), error: null }) }),
      // a plain (unranged) read gets what PostgREST gives: the first 1,000
      then: (res) => Promise.resolve({ data: mockState.rows.slice(0, 1000), error: null }).then(res),
    };
    return q;
  };
  return {
    supabase: {
      from: (t) => builder(t),
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } }, error: null }) },
    },
  };
});

/* eslint-disable import/first */
import {
  getDailyProduction, getFieldTotals, listFieldWellTests, selectAllPages, PAGE_ROWS,
  inferWellTypes, importDailyProduction,
} from '@/lib/productionSpine';
import { crossCheckTestsAgainstNodal } from '@/utils/production/allocation';
import {
  prepareTestData, buildReservoirInputs, buildTestConfig, DEFAULT_RESERVOIR, DEFAULT_TEST_CONFIG,
} from '@/contexts/WellTestStudioContext';
/* eslint-enable import/first */

beforeEach(() => { mockState.rows = []; mockState.ranges = []; mockState.inserted = []; });

describe('1. list reads page past 1,000 rows', () => {
  const ledger = (n) => Array.from({ length: n }, (_, i) => ({
    id: `r${i}`, prod_date: `2020-01-01`, po_wells: { id: 'w', name: 'Ekene-1' },
  }));

  test('2,500 ledger rows come back whole, in three ranges', async () => {
    mockState.rows = ledger(2500);
    const out = await getDailyProduction('f1');
    expect(out).toHaveLength(2500);
    expect(mockState.ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(out[2499].well.name).toBe('Ekene-1');
  });

  test('exactly 1,000 rows asks once more and stops on the empty page', async () => {
    mockState.rows = ledger(1000);
    expect(await getFieldTotals('f1')).toHaveLength(1000);
    expect(mockState.ranges).toEqual([[0, 999], [1000, 1999]]);
  });

  test('negative control: the old single query stops at the cap; the paged reader does not', async () => {
    mockState.rows = ledger(2500);
    // eslint-disable-next-line global-require
    const { supabase } = require('@/lib/customSupabaseClient');
    const { data } = await supabase.from('po_well_tests').select('*').order('test_date');
    expect(data).toHaveLength(1000);
    expect(await listFieldWellTests('f1')).toHaveLength(2500);
  });

  test('an error on any page is reported with what was being loaded', async () => {
    await expect(selectAllPages(() => ({ range: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }), 'well tests'))
      .rejects.toThrow('Could not load well tests: boom');
  });
});

describe('2. wells created on import take the type their data shows', () => {
  const rows = [
    { well: 'Ekene-1', date: '2023-01-01', oil_stb: 100, water_stb: 0, gas_mscf: 40, winj_stb: 0, ginj_mscf: 0 },
    { well: 'Ekene-2', date: '2023-01-01', oil_stb: 0, water_stb: 0, gas_mscf: 0, winj_stb: 2500, ginj_mscf: 0 },
    { well: 'Ekene-9', date: '2023-01-01', oil_stb: 0, water_stb: 0, gas_mscf: 0, winj_stb: 0, ginj_mscf: 0 },
  ];

  test('inferWellTypes: injecting only is an injector, producing is a producer, idle is left alone', () => {
    const t = inferWellTypes(rows);
    expect(t.get('Ekene-1')).toBe('producer');
    expect(t.get('Ekene-2')).toBe('injector');
    expect(t.has('Ekene-9')).toBe(false);
    // a well that both produces and injects in the file stays a producer
    expect(inferWellTypes([{ well: 'X', oil_stb: 5, winj_stb: 5 }]).get('X')).toBe('producer');
  });

  test('import creates Ekene-2 as an injector and says so', async () => {
    const res = await importDailyProduction('f1', rows);
    const created = Object.fromEntries(mockState.inserted.map((w) => [w.name, w.well_type]));
    expect(created['Ekene-2']).toBe('injector');
    expect(created['Ekene-1']).toBe('producer');
    expect(created['Ekene-9']).toBeUndefined();              // database default applies
    expect(res.typedInjectors).toEqual(['Ekene-2']);
    expect(res.mistypedInjectors).toEqual([]);
  });
});

describe('3. nodal cross-check: the vendored engine recognises the choke-held branch', () => {
  test('29.37 stb/d against crossings of 29.4 (unstable) and 460 (stable) agrees', () => {
    const [r] = crossCheckTestsAgainstNodal({
      tests: [{ id: 't', well_id: 'w1', well: { name: 'Ekene-1' }, oil_rate_stbd: 29.37, water_rate_stbd: 1, gas_rate_mscfd: 12, thp_psia: 300 }],
      wellModels: new Map([['w1', {}]]),
      buildModel: () => ({ ipr: {}, vlp: { rates: {} } }),
      solveNode: () => ({ intersections: [{ q: 29.4, stable: false }, { q: 460, stable: true }], op: { q: 460, stable: true } }),
    });
    expect(r.status).toBe('unstable-branch');
    expect(r.stableStbd).toBe(460);
  });
});

describe('4. Well Test: skin needs the pressure at the instant of shut-in', () => {
  const { reservoir } = buildReservoirInputs(DEFAULT_RESERVOIR);
  const cfg = (pwf) => buildTestConfig({ ...DEFAULT_TEST_CONFIG, pwfShutIn: pwf }).config;
  // a buildup whose gauge starts 0.01 h after shut-in, 12.6 psi already up
  const gauge = Array.from({ length: 40 }, (_, i) => {
    const t = 0.01 * 10 ** (i / 10);
    return { t, p: 2086.684 + 12.56 + 20 * Math.log10(t / 0.01) };
  });

  test('blank, and no reading at shut-in: skin withheld with the reason; the first point is not used silently', () => {
    const p = prepareTestData({ gaugeRows: gauge, reservoir, config: cfg('') });
    expect(p.skinWithheld).toMatch(/Skin is withheld: enter the flowing pressure at shut-in/);
    expect(p.skinWithheld).toMatch(/0\.0100 h after shut-in/);
    expect(p.warnings).toContain(p.skinWithheld);
  });

  test('entered: skin is computed from it', () => {
    const p = prepareTestData({ gaugeRows: gauge, reservoir, config: cfg('2086.684') });
    expect(p.skinWithheld).toBeNull();
    expect(p.pwfShutIn).toBeCloseTo(2086.684, 6);
  });

  test('a reading at t = 0 in the file is the pressure at shut-in', () => {
    const p = prepareTestData({ gaugeRows: [{ t: 0, p: 2086.684 }, ...gauge], reservoir, config: cfg('') });
    expect(p.skinWithheld).toBeNull();
    expect(p.pwfShutIn).toBeCloseTo(2086.684, 6);
  });
});
