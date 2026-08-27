/**
 * Gates for the Production Surveillance Studio state layer (P2).
 *
 * The analytics gates live in
 * src/utils/production/__tests__/surveillance.test.js. These prove the
 * context wires them correctly: that spine data loads for the selected
 * field and never enters the saved payload, that a saved project
 * restores older or partial payloads without losing defaults, and that
 * thresholds arriving as STRINGS (from JSON, or from a half-typed
 * field) still drive the numeric exception rules.
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
  listDeferments: jest.fn(),
  saveField: jest.fn(),
  deleteField: jest.fn(),
  shareField: jest.fn(),
  unshareField: jest.fn(),
  importDailyProduction: jest.fn(),
  importWellTests: jest.fn(),
  applyRegistryLinks: jest.fn(),
  updatePoWell: jest.fn(),
  saveDeferment: jest.fn(),
  updateDeferment: jest.fn(),
  deleteDeferment: jest.fn(),
  DEFERMENT_CATEGORIES: [],
}));
jest.mock('@/lib/wellsRegistry', () => ({ listWells: jest.fn() }));
jest.mock('@/utils/savedProjects', () => {
  const service = {
    list: jest.fn(),
    load: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };
  return { createSavedProjectsService: () => service, __service: service };
});
jest.mock('@/contexts/SupabaseAuthContext', () => ({
  useAuth: () => ({ organization: { id: 'org-1', name: 'Test Org' } }),
}));

const spine = jest.requireMock('@/lib/productionSpine');
const registry = jest.requireMock('@/lib/wellsRegistry');
const savedService = jest.requireMock('@/utils/savedProjects').__service;

import {
  ProductionSurveillanceProvider, useSurveillance, defaultInputs, inputsFromPayload,
} from '@/contexts/ProductionSurveillanceContext';

const FIELD = { id: 'f1', name: 'Test Field', is_own: true, organization_id: null };
const P1 = { id: 'w1', name: 'P-1', well_type: 'producer', field_id: 'f1' };

const iso = (dayIndex) => new Date(Date.UTC(2025, 0, 1) + dayIndex * 86400000)
  .toISOString().slice(0, 10);

// 60 producing days: a healthy 1000 stb/d baseline, then a hard 60 %
// drop over the final week (well past any sane rate-drop threshold).
const LEDGER = Array.from({ length: 60 }, (_, i) => ({
  id: `r${i}`,
  prod_date: iso(i),
  oil_stb: i < 53 ? 1000 : 400,
  water_stb: 200,
  gas_mscf: 500,
  winj_stb: 0,
  ginj_mscf: 0,
  hours_on: 24,
  well: P1,
}));

let api = null;
const Probe = () => {
  api = useSurveillance();
  return null;
};

const mount = async () => {
  await act(async () => {
    render(
      <ProductionSurveillanceProvider>
        <Probe />
      </ProductionSurveillanceProvider>,
    );
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  api = null;
  spine.listFields.mockResolvedValue([FIELD]);
  spine.listPoWells.mockResolvedValue([P1]);
  spine.getDailyProduction.mockResolvedValue(LEDGER);
  spine.listDeferments.mockResolvedValue([]);
  savedService.list.mockResolvedValue([]);
});

describe('payload shape', () => {
  it('defaults carry the analysis state and no spine data', () => {
    const d = defaultInputs();
    expect(d).toHaveProperty('fieldId', null);
    expect(d).toHaveProperty('settings.rateDropPct');
    expect(d).toHaveProperty('trends.view', 'field');
    expect(d).toHaveProperty('dca.stream', 'oil');
    // Production data belongs to the shared spine, never to a project row.
    expect(d).not.toHaveProperty('ledgerRows');
    expect(d).not.toHaveProperty('wells');
  });

  it('restores a partial payload without dropping defaults', () => {
    const restored = inputsFromPayload({
      inputs: { fieldId: 'f9', settings: { rateDropPct: 35 } },
    });
    expect(restored.fieldId).toBe('f9');
    expect(restored.settings.rateDropPct).toBe(35);
    expect(restored.settings.baselineDays).toBe(defaultInputs().settings.baselineDays);
    expect(restored.trends.view).toBe('field');
    expect(restored.dca.forecastDays).toBe(defaultInputs().dca.forecastDays);
  });

  it('accepts a bare inputs object (payload written before the wrapper)', () => {
    const restored = inputsFromPayload({ fieldId: 'f8', trends: { view: 'well' } });
    expect(restored.fieldId).toBe('f8');
    expect(restored.trends.view).toBe('well');
    expect(restored.trends.stream).toBe('rates');
  });

  it('returns null for a missing payload', () => {
    expect(inputsFromPayload(null)).toBeNull();
  });
});

describe('spine loading and derivation', () => {
  it('loads fields on mount and field data on selection', async () => {
    await mount();
    expect(spine.listFields).toHaveBeenCalled();
    expect(api.fields).toEqual([FIELD]);
    // Nothing is loaded until a field is chosen.
    expect(spine.getDailyProduction).not.toHaveBeenCalled();

    await act(async () => { api.selectField('f1'); });
    expect(spine.getDailyProduction).toHaveBeenCalledWith('f1');
    expect(api.wells).toEqual([P1]);
    expect(api.ledgerRows).toHaveLength(60);
    expect(api.currentField).toEqual(FIELD);
    expect(api.canEditField).toBe(true);
  });

  it('derives series, KPIs and exceptions from the loaded ledger', async () => {
    await mount();
    await act(async () => { api.selectField('f1'); });

    expect(api.wellSeries).toHaveLength(1);
    expect(api.fieldSeries).toHaveLength(60);
    expect(api.kpis.asOf).toBe(iso(59));
    expect(api.kpis.oil).toBeCloseTo(400, 6);      // trailing 7 days, post-drop
    expect(api.kpis.uptimePct).toBeCloseTo(100, 6);

    const drop = api.surveillance.exceptions.find((e) => e.type === 'rate_drop');
    expect(drop).toBeDefined();
    expect(drop.wellName).toBe('P-1');
  });

  it('clears field data when the selection is cleared', async () => {
    await mount();
    await act(async () => { api.selectField('f1'); });
    await act(async () => { api.selectField(null); });
    expect(api.ledgerRows).toEqual([]);
    expect(api.wells).toEqual([]);
    expect(api.surveillance.exceptions).toEqual([]);
  });
});

describe('threshold coercion', () => {
  it('string thresholds from a saved payload still drive the numeric rules', async () => {
    savedService.list.mockResolvedValue([{ id: 'p1', name: 'Saved' }]);
    savedService.load.mockResolvedValue({
      id: 'p1',
      name: 'Saved',
      inputs: { fieldId: 'f1', settings: { rateDropPct: '80' } },
    });
    await mount();
    await act(async () => { await api.openProject('p1'); });

    // 80 % is above the well's 60 % drop, so the exception must clear.
    expect(api.activeSettings.rateDropPct).toBe(80);
    expect(api.surveillance.exceptions.some((e) => e.type === 'rate_drop')).toBe(false);

    // ...and drop back below it once the threshold is lowered.
    await act(async () => { api.setSettingsField('rateDropPct', '20'); });
    expect(api.surveillance.exceptions.some((e) => e.type === 'rate_drop')).toBe(true);
  });

  it('an unparseable threshold falls back to the default instead of disabling the rule', async () => {
    await mount();
    await act(async () => { api.selectField('f1'); });
    await act(async () => { api.setSettingsField('rateDropPct', ''); });
    expect(api.activeSettings.rateDropPct).toBe(defaultInputs().settings.rateDropPct);
    expect(api.surveillance.exceptions.some((e) => e.type === 'rate_drop')).toBe(true);
  });
});

describe('project persistence', () => {
  it('saves analysis state only, never the spine data', async () => {
    await mount();
    await act(async () => { api.selectField('f1'); });
    await act(async () => { await api.createProject('Field review'); });

    expect(savedService.save).toHaveBeenCalled();
    const payload = savedService.save.mock.calls[0][1];
    expect(payload.inputs.fieldId).toBe('f1');
    expect(JSON.stringify(payload)).not.toContain('oil_stb');
  });
});
