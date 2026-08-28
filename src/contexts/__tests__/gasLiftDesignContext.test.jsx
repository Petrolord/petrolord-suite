/**
 * Gates for the Gas Lift Design Studio state layer (P4).
 *
 * The design math is gated in the engine package and in
 * src/utils/production/__tests__/gasLift.test.js. These prove the
 * context wires it: the well model builds from typed strings, the
 * point-of-injection construction feeds the spacing floor, expensive
 * runs stay explicit and go stale when inputs change, the spine link
 * stays an identity link (never design data), and the legacy import
 * only moves what maps.
 *
 * Only the Supabase-facing edges are mocked; the derivation path runs
 * for real.
 */
import React from 'react';
import { render, act } from '@testing-library/react';

jest.mock('@/lib/productionSpine', () => ({
  listFields: jest.fn(),
  listPoWells: jest.fn(),
  listFieldWellTests: jest.fn(),
  getWellModel: jest.fn(),
  upsertWellModel: jest.fn(),
}));
jest.mock('@/utils/savedProjects', () => {
  const service = { list: jest.fn(), load: jest.fn(), save: jest.fn(), remove: jest.fn() };
  return { createSavedProjectsService: () => service, __service: service };
});
jest.mock('@/lib/customSupabaseClient', () => {
  const result = { data: [], error: null };
  const builder = {
    select: jest.fn(() => builder),
    order: jest.fn(() => Promise.resolve(result)),
  };
  return { supabase: { from: jest.fn(() => builder) }, __result: result, __builder: builder };
});

const spine = jest.requireMock('@/lib/productionSpine');
const savedService = jest.requireMock('@/utils/savedProjects').__service;
const supabaseMock = jest.requireMock('@/lib/customSupabaseClient');

import {
  GasLiftDesignProvider, useGasLift, defaultInputs, inputsFromPayload,
  designFormFrom, buildWellModel,
} from '@/contexts/GasLiftDesignContext';

const FIELD = { id: 'f1', name: 'Test Field', is_own: true };
const WELL = { id: 'w1', name: 'P-1', field_id: 'f1' };
const TEST = {
  id: 't1', well_id: 'w1', test_date: '2025-03-01', duration_hours: 12,
  oil_rate_stbd: 520, water_rate_stbd: 480, gas_rate_mscfd: 260,
  thp_psia: 180, is_valid: true,
};

let api = null;
const Probe = () => {
  api = useGasLift();
  return null;
};

const mount = async () => {
  await act(async () => {
    render(
      <GasLiftDesignProvider>
        <Probe />
      </GasLiftDesignProvider>,
    );
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  api = null;
  spine.listFields.mockResolvedValue([FIELD]);
  spine.listPoWells.mockResolvedValue([WELL]);
  spine.listFieldWellTests.mockResolvedValue([TEST]);
  spine.getWellModel.mockResolvedValue(null);
  spine.upsertWellModel.mockImplementation(async (wellId, modelData) => ({
    id: 'm1', well_id: wellId, model_data: modelData, updated_at: '2026-08-28T00:00:00Z',
  }));
  savedService.list.mockResolvedValue([]);
  savedService.save.mockResolvedValue(undefined);
  supabaseMock.__result.data = [];
  supabaseMock.__result.error = null;
});

describe('payload shape', () => {
  it('defaults carry a complete design and no results', () => {
    const d = defaultInputs();
    expect(d.well.depthFt).toBe('7000');
    expect(d.design.valveFamilyId).toBe('r15');
    expect(d.link).toEqual({ fieldId: null, wellId: null, wellName: '' });
    expect(d).not.toHaveProperty('valves');
    expect(d).not.toHaveProperty('performance');
  });

  it('restores a partial payload without dropping defaults', () => {
    const restored = inputsFromPayload({ inputs: { injection: { kickoffPsig: '1400' } } });
    expect(restored.injection.kickoffPsig).toBe('1400');
    expect(restored.injection.injGasSg).toBe(defaultInputs().injection.injGasSg);
    expect(restored.design).toEqual(defaultInputs().design);
  });

  it('returns null for a missing payload', () => {
    expect(inputsFromPayload(null)).toBeNull();
  });

  it('flattens the sections the engine call needs, injection depth included', () => {
    const form = designFormFrom(defaultInputs(), 5200);
    expect(form.kickoffPsig).toBe('1000');
    expect(form.whtF).toBe('100');
    expect(form.targetDepthFt).toBe(5200);
    expect(designFormFrom(defaultInputs()).targetDepthFt).toBe('');
  });
});

describe('well model from typed strings', () => {
  it('builds the nodal bundles a vertical well needs', () => {
    const model = buildWellModel(defaultInputs());
    expect(model.trajectory.tvdMax).toBe(7000);
    expect(model.vlp.nodeMd).toBe(7000);
    expect(model.vlp.rates.wct).toBeCloseTo(0.7, 9);
    // The vlp is self-contained so it can be spread into a traverse.
    expect(model.vlp.fluidModel).toBeDefined();
    expect(model.vlp.tAt).toBeInstanceOf(Function);
    expect(model.ipr.qmax).toBeGreaterThan(0);
  });

  it('reads a deviated survey and stretches measured depth', () => {
    const inputs = defaultInputs();
    inputs.well.mode = 'deviated';
    const model = buildWellModel(inputs);
    expect(model.vlp.nodeMd).toBeGreaterThan(model.trajectory.tvdMax);
  });

  it('refuses to build without a depth rather than inventing one', () => {
    const inputs = defaultInputs();
    inputs.well.depthFt = '';
    expect(buildWellModel(inputs)).toBeNull();
  });
});

describe('live derivation', () => {
  it('designs a valve string and a point of injection on mount', async () => {
    await mount();
    expect(api.installation.ok).toBe(true);
    expect(api.installation.design.valves.length).toBeGreaterThan(1);
    expect(api.valveSheet).toHaveLength(api.installation.design.valves.length);
    expect(api.injectionPoint).not.toBeNull();
    expect(api.injectionPoint.depthFt).toBeGreaterThan(0);
  });

  it('the computed injection point caps the spacing, and unticking it releases the cap', async () => {
    await mount();
    const capped = Math.max(...api.installation.design.depths);
    expect(capped).toBeLessThanOrEqual(api.injectionPoint.depthFt + 1e-6);
    await act(async () => { api.setSection('design', 'useComputedInjectionDepth', false); });
    expect(Math.max(...api.installation.design.depths))
      .toBeGreaterThanOrEqual(capped - 1e-6);
  });

  it('a design that cannot be run is reported, not silently empty', async () => {
    await mount();
    await act(async () => { api.setSection('injection', 'kickoffPsig', ''); });
    expect(api.installation.ok).toBe(false);
    expect(api.installation.errors.join(' ')).toMatch(/Kickoff injection pressure/);
    expect(api.installation.design).toBeNull();
  });
});

describe('explicit runs', () => {
  it('the performance curve runs on demand and goes stale when inputs change', async () => {
    await mount();
    expect(api.performance).toBeNull();
    await act(async () => { await api.runPerformance(); });
    expect(api.performance.response.length).toBeGreaterThan(2);
    expect(api.performanceStale).toBe(false);
    await act(async () => { api.setSection('injection', 'whp', '200'); });
    expect(api.performanceStale).toBe(true);
  });

  it('the depth sweep runs on demand and shows deeper injection producing more', async () => {
    await mount();
    await act(async () => { await api.runDepthSweep(); });
    expect(api.depthSweep.points).toHaveLength(6);
    const first = api.depthSweep.points[0];
    const last = api.depthSweep.points[api.depthSweep.points.length - 1];
    expect(last.q).toBeGreaterThan(first.q);
    expect(api.depthSweep.best.injectionMd).toBe(last.injectionMd);
  });
}, 30000);

describe('spine link', () => {
  it('loads fields on mount and wells only once a field is picked', async () => {
    await mount();
    expect(spine.listFields).toHaveBeenCalled();
    expect(spine.listPoWells).not.toHaveBeenCalled();
    await act(async () => { api.patchSection('link', { fieldId: 'f1' }); });
    expect(spine.listPoWells).toHaveBeenCalledWith('f1');
    expect(api.spineWells).toHaveLength(1);
  });

  it('applying a well test derives water cut and gas-oil ratio from its rates', async () => {
    await mount();
    await act(async () => { api.patchSection('link', { fieldId: 'f1' }); });
    await act(async () => { api.linkWell('w1'); });
    expect(api.inputs.link.wellName).toBe('P-1');
    expect(api.latestTestForLinkedWell.id).toBe('t1');
    await act(async () => { api.applyLatestTest(); });
    expect(api.inputs.injection.designRateStbd).toBe('520');
    // Water cut and wellhead pressure are DUTY, so they live with the
    // injection settings rather than in the shared well record (P6.5).
    expect(api.inputs.injection.wctPct).toBe('48.0');
    expect(api.inputs.injection.whp).toBe('180');
    expect(api.inputs.fluid.gor).toBe('500');
    expect(api.inputs.completion).not.toHaveProperty('wctPct');
    expect(api.inputs.completion).not.toHaveProperty('whp');
  });

  it('the link stays identity only: the saved payload carries ids, never spine rows', async () => {
    await mount();
    await act(async () => { api.patchSection('link', { fieldId: 'f1' }); });
    await act(async () => { api.linkWell('w1'); });
    await act(async () => { await api.createProject('Design A'); });
    const payload = savedService.save.mock.calls[0][1];
    expect(payload.inputs.link).toEqual({ fieldId: 'f1', wellId: 'w1', wellName: 'P-1' });
    expect(JSON.stringify(payload)).not.toContain('oil_rate_stbd');
  });
});

describe('legacy Artificial Lift Designer import', () => {
  it('finds only the saves that carry gas lift inputs', async () => {
    supabaseMock.__result.data = [
      { id: 'a1', design_name: 'ESP only', design_data: { espInputs: {} } },
      {
        id: 'a2',
        design_name: 'Old GL',
        design_data: { gasLiftInputs: { wellDepth: 8200, surfaceInjectionPressure: 1250 } },
      },
    ];
    await mount();
    await act(async () => { await api.loadLegacyDesigns(); });
    expect(api.legacyDesigns).toHaveLength(1);
    expect(api.legacyDesigns[0].id).toBe('a2');
  });

  it('imports the mapped fields into the right sections', async () => {
    supabaseMock.__result.data = [{
      id: 'a2',
      design_name: 'Old GL',
      design_data: {
        gasLiftInputs: {
          wellDepth: 8200, surfaceInjectionPressure: 1250, injectionGasGravity: 0.7,
          tubingID: 2.992, waterCut: 55, gor: 420, valveSpacingSafetyFactor: 100,
        },
      },
    }];
    await mount();
    await act(async () => { await api.loadLegacyDesigns(); });
    await act(async () => { api.importLegacyDesign('a2'); });
    expect(api.inputs.well.depthFt).toBe('8200');
    expect(api.inputs.design.packerDepthFt).toBe('8200');
    expect(api.inputs.injection.kickoffPsig).toBe('1250');
    expect(api.inputs.injection.injGasSg).toBe('0.7');
    expect(api.inputs.completion.idIn).toBe('2.992');
    expect(api.inputs.injection.wctPct).toBe('55');
    expect(api.inputs.fluid.gor).toBe('420');
  });
});

describe('project lifecycle', () => {
  it('saves the inputs and reopens them', async () => {
    await mount();
    await act(async () => { api.setSection('injection', 'kickoffPsig', '1300'); });
    await act(async () => { await api.createProject('Design B'); });
    const payload = savedService.save.mock.calls[0][1];
    expect(payload.inputs.injection.kickoffPsig).toBe('1300');
    savedService.load.mockResolvedValue(payload);
    await act(async () => { await api.openProject(payload.id); });
    expect(api.inputs.injection.kickoffPsig).toBe('1300');
    expect(api.projectName).toBe('Design B');
  });

  it('a missing table is explained rather than dumped raw', async () => {
    savedService.list.mockRejectedValue({
      code: '42P01',
      message: 'relation "saved_gaslift_projects" does not exist',
    });
    await mount();
    expect(api.notifications.some((n) => /p4_saved_gaslift_projects migration/.test(n.message)))
      .toBe(true);
  });
});
