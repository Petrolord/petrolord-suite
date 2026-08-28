/**
 * Gates for the Production Allocation Studio state layer (P3).
 *
 * The allocation math is gated in
 * src/utils/production/__tests__/allocation.test.js. These prove the
 * context wires it: spine data loads for the selected field and stays
 * out of the saved payload, the period range filters what is allocated,
 * thresholds arriving as strings still drive numeric rules, and the two
 * write-backs send the right rows to the spine.
 *
 * Only the Supabase-facing edges are mocked; the derivation path runs
 * for real.
 */
import React from 'react';
import { render, act } from '@testing-library/react';

jest.mock('@/lib/productionSpine', () => ({
  listFields: jest.fn(),
  listPoWells: jest.fn(),
  getDailyProduction: jest.fn(),
  listFieldWellTests: jest.fn(),
  getFieldTotals: jest.fn(),
  listAllocationFactors: jest.fn(),
  saveField: jest.fn(),
  deleteField: jest.fn(),
  shareField: jest.fn(),
  unshareField: jest.fn(),
  importFieldTotals: jest.fn(),
  importWellTests: jest.fn(),
  saveFieldTotal: jest.fn(),
  deleteFieldTotal: jest.fn(),
  updateWellTest: jest.fn(),
  deleteWellTest: jest.fn(),
  upsertAllocationFactors: jest.fn(),
  writeAllocatedProduction: jest.fn(),
}));
jest.mock('@/utils/savedProjects', () => {
  const service = { list: jest.fn(), load: jest.fn(), save: jest.fn(), remove: jest.fn() };
  return { createSavedProjectsService: () => service, __service: service };
});
jest.mock('@/contexts/SupabaseAuthContext', () => ({
  useAuth: () => ({ organization: { id: 'org-1', name: 'Test Org' } }),
}));

const spine = jest.requireMock('@/lib/productionSpine');
const savedService = jest.requireMock('@/utils/savedProjects').__service;

import {
  ProductionAllocationProvider, useAllocation, defaultInputs, inputsFromPayload,
} from '@/contexts/ProductionAllocationContext';

const FIELD = { id: 'f1', name: 'Test Field', is_own: true, organization_id: null };
const P1 = { id: 'w1', name: 'P-1', well_type: 'producer', field_id: 'f1' };
const P2 = { id: 'w2', name: 'P-2', well_type: 'producer', field_id: 'f1' };

const TESTS = [
  {
    id: 't1', well_id: 'w1', test_date: '2025-01-01', duration_hours: 8,
    oil_rate_stbd: 1000, water_rate_stbd: 100, gas_rate_mscfd: 500, is_valid: true,
    well: { id: 'w1', name: 'P-1' },
  },
  {
    id: 't2', well_id: 'w2', test_date: '2025-01-01', duration_hours: 8,
    oil_rate_stbd: 500, water_rate_stbd: 50, gas_rate_mscfd: 250, is_valid: true,
    well: { id: 'w2', name: 'P-2' },
  },
];

const LEDGER = ['2025-01-10', '2025-01-11'].flatMap((date) => ([
  {
    id: `l1-${date}`, well_id: 'w1', prod_date: date, oil_stb: 950, water_stb: 95,
    gas_mscf: 470, winj_stb: 0, ginj_mscf: 0, hours_on: 24, well: P1,
  },
  {
    id: `l2-${date}`, well_id: 'w2', prod_date: date, oil_stb: 480, water_stb: 48,
    gas_mscf: 240, winj_stb: 0, ginj_mscf: 0, hours_on: 24, well: P2,
  },
]));

const TOTALS = [
  { id: 'ft1', total_date: '2025-01-10', oil_stb: 1200, water_stb: 120, gas_mscf: 600 },
  { id: 'ft2', total_date: '2025-01-11', oil_stb: 1500, water_stb: 150, gas_mscf: 750 },
];

let api = null;
const Probe = () => {
  api = useAllocation();
  return null;
};

const mount = async () => {
  await act(async () => {
    render(
      <ProductionAllocationProvider>
        <Probe />
      </ProductionAllocationProvider>,
    );
  });
};

const mountWithField = async () => {
  await mount();
  await act(async () => { api.selectField('f1'); });
};

beforeEach(() => {
  jest.clearAllMocks();
  api = null;
  spine.listFields.mockResolvedValue([FIELD]);
  spine.listPoWells.mockResolvedValue([P1, P2]);
  spine.getDailyProduction.mockResolvedValue(LEDGER);
  spine.listFieldWellTests.mockResolvedValue(TESTS);
  spine.getFieldTotals.mockResolvedValue(TOTALS);
  spine.listAllocationFactors.mockResolvedValue([]);
  spine.upsertAllocationFactors.mockResolvedValue(2);
  spine.writeAllocatedProduction.mockResolvedValue(4);
  spine.updateWellTest.mockResolvedValue({});
  savedService.list.mockResolvedValue([]);
  savedService.save.mockResolvedValue(undefined);
});

describe('payload shape', () => {
  it('defaults carry the analysis state and no spine data', () => {
    const d = defaultInputs();
    expect(d).toMatchObject({ fieldId: null });
    expect(d.settings.basis).toBe('test');
    expect(d.qc.minDurationHours).toBeGreaterThan(0);
    expect(d).not.toHaveProperty('fieldTotals');
    expect(d).not.toHaveProperty('tests');
  });

  it('restores a partial payload without dropping defaults', () => {
    const restored = inputsFromPayload({ inputs: { fieldId: 'f9', settings: { basis: 'ledger' } } });
    expect(restored.fieldId).toBe('f9');
    expect(restored.settings.basis).toBe('ledger');
    expect(restored.settings.maxTestAgeDays).toBe(defaultInputs().settings.maxTestAgeDays);
    expect(restored.qc).toEqual(defaultInputs().qc);
  });

  it('returns null for a missing payload', () => {
    expect(inputsFromPayload(null)).toBeNull();
  });
});

describe('spine loading and allocation', () => {
  it('loads every spine read for the selected field', async () => {
    await mountWithField();
    expect(spine.getFieldTotals).toHaveBeenCalledWith('f1');
    expect(spine.listFieldWellTests).toHaveBeenCalledWith('f1');
    expect(api.fieldTotals).toHaveLength(2);
    expect(api.tests).toHaveLength(2);
  });

  it('allocates the metered total across the tested wells', async () => {
    await mountWithField();
    // Day 1: 1200 stb measured, 1500 theoretical -> factor 0.8.
    const day = api.allocation.days[0];
    expect(day.factors.oil).toBeCloseTo(0.8, 10);
    expect(api.allocation.wells).toHaveLength(2);
    const p1 = api.allocation.wells.find((w) => w.wellId === 'w1');
    // 800 on day 1 + 1000 on day 2 (1500 measured, factor 1.0).
    expect(p1.allocated.oil).toBeCloseTo(1800, 6);
  });

  it('confines the run to the selected period', async () => {
    await mountWithField();
    await act(async () => { api.setRangeField('from', '2025-01-11'); });
    expect(api.allocation.days.map((d) => d.date)).toEqual(['2025-01-11']);
  });

  it('rolls monthly factors up for the period', async () => {
    await mountWithField();
    expect(api.factors).toHaveLength(2);
    expect(api.factors[0].periodMonth).toBe('2025-01-01');
    // 1800 allocated over 2000 theoretical for P-1 across both days.
    const p1 = api.factors.find((f) => f.wellId === 'w1');
    expect(p1.factors.oil).toBeCloseTo(0.9, 10);
  });

  it('reconciles the meter against the wells own ledger', async () => {
    await mountWithField();
    const [first] = api.imbalance;
    expect(first.oil.measured).toBe(1200);
    expect(first.oil.booked).toBe(1430); // 950 + 480
    expect(first.oil.imbalance).toBe(-230);
  });

  it('clears everything when the field selection is cleared', async () => {
    await mountWithField();
    await act(async () => { api.selectField(null); });
    expect(api.fieldTotals).toEqual([]);
    expect(api.allocation.days).toEqual([]);
    expect(api.factors).toEqual([]);
  });
});

describe('test QC', () => {
  it('reports, at info level, tests with no ledger row on the test date', async () => {
    await mountWithField();
    // The fixture ledger starts on the 10th, so neither 1 January test
    // has a row to cross-check against. That is a note, not a failure.
    const t1 = api.testQc.find((r) => r.testId === 't1');
    expect(t1.severity).toBe('info');
    expect(t1.issues.map((i) => i.code)).toEqual(['no_ledger']);
  });

  it('flags a test that disagrees with the ledger on its own date', async () => {
    spine.listFieldWellTests.mockResolvedValue([
      { ...TESTS[0], test_date: '2025-01-10', oil_rate_stbd: 2000 }, TESTS[1],
    ]);
    await mountWithField();
    const t1 = api.testQcById.get('t1');
    expect(t1.issues.some((i) => i.code === 'ledger_mismatch')).toBe(true);
  });

  it('rejecting a test writes the QC flag to the spine', async () => {
    await mountWithField();
    await act(async () => { await api.setTestValid('t1', false); });
    expect(spine.updateWellTest).toHaveBeenCalledWith('t1', { is_valid: false });
  });

  it('a rejected test stops carrying its well', async () => {
    spine.listFieldWellTests.mockResolvedValue([{ ...TESTS[0], is_valid: false }, TESTS[1]]);
    await mountWithField();
    expect(api.allocation.days[0].entries.map((e) => e.wellId)).toEqual(['w2']);
    expect(api.allocation.diagnostics.some((d) => d.code === 'no_test_in_force')).toBe(true);
  });
});

describe('threshold coercion', () => {
  it('a string test-age from a saved payload still expires tests', async () => {
    savedService.list.mockResolvedValue([{ id: 'p1', name: 'Saved' }]);
    savedService.load.mockResolvedValue({
      id: 'p1', name: 'Saved', inputs: { fieldId: 'f1', settings: { maxTestAgeDays: '5' } },
    });
    await mount();
    await act(async () => { await api.openProject('p1'); });
    expect(api.activeSettings.maxTestAgeDays).toBe(5);
    // Tests are 9 days before the first metered date, so nothing carries.
    expect(api.allocation.days[0].entries).toHaveLength(0);
  });

  it('an unparseable threshold falls back to the default', async () => {
    await mountWithField();
    await act(async () => { api.setSettingsField('maxTestAgeDays', ''); });
    expect(api.activeSettings.maxTestAgeDays).toBe(defaultInputs().settings.maxTestAgeDays);
    expect(api.allocation.days[0].entries).toHaveLength(2);
  });
});

describe('write-backs', () => {
  it('saves the monthly factors it derived', async () => {
    await mountWithField();
    await act(async () => { await api.saveFactors(); });
    const rows = spine.upsertAllocationFactors.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveProperty('periodMonth', '2025-01-01');
    expect(rows[0].factors.oil).toBeGreaterThan(0);
  });

  it('books allocated volumes as ledger rows carrying their uptime', async () => {
    await mountWithField();
    await act(async () => { await api.bookAllocation(); });
    const rows = spine.writeAllocatedProduction.mock.calls[0][0];
    expect(rows).toHaveLength(4); // 2 wells x 2 dates
    expect(rows[0]).toMatchObject({ wellId: 'w1', date: '2025-01-10', hours_on: 24 });
    expect(rows[0].oil_stb).toBeCloseTo(800, 6);
  });

  it('refuses both write-backs on a field shared read-only', async () => {
    spine.listFields.mockResolvedValue([{ ...FIELD, is_own: false }]);
    await mountWithField();
    await act(async () => { await api.saveFactors(); });
    await act(async () => { await api.bookAllocation(); });
    expect(spine.upsertAllocationFactors).not.toHaveBeenCalled();
    expect(spine.writeAllocatedProduction).not.toHaveBeenCalled();
  });
});

describe('project persistence', () => {
  it('saves analysis state only, never the spine data', async () => {
    await mountWithField();
    await act(async () => { await api.createProject('January allocation'); });
    const payload = savedService.save.mock.calls[0][1];
    expect(payload.inputs.fieldId).toBe('f1');
    const json = JSON.stringify(payload);
    expect(json).not.toContain('oil_stb');
    expect(json).not.toContain('oil_rate_stbd');
  });
});
