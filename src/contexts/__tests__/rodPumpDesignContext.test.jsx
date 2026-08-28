/**
 * Gates for the Rod Pump Design Studio state layer (P6).
 *
 * The mechanics, the wave equation and the unit kinematics are gated in
 * the engine package, and the Suite chain in
 * src/utils/production/__tests__/rodPump.test.js. These prove the
 * context wires them: the well model builds from typed strings, the
 * flat form is assembled without duplicating the perforation depth, the
 * design recomputes live while the speed sweep stays an explicit run
 * that goes stale, the diagnostic stays silent until it is given a
 * card, the spine link stays an identity link, and the legacy import
 * refuses to carry a rod string.
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
  RodPumpDesignProvider, useRodPump, defaultInputs, inputsFromPayload,
  designFormFrom, buildWellModel,
} from '@/contexts/RodPumpDesignContext';

const FIELD = { id: 'f1', name: 'Test Field', is_own: true };
const WELL = { id: 'w1', name: 'P-1', field_id: 'f1' };
const TEST = {
  id: 't1', well_id: 'w1', test_date: '2025-03-01',
  oil_rate_stbd: 60, water_rate_stbd: 140, gas_rate_mscfd: 6,
  thp_psia: 110, is_valid: true,
};

let api = null;
const Probe = () => {
  api = useRodPump();
  return null;
};

const mount = async () => {
  await act(async () => {
    render(
      <RodPumpDesignProvider>
        <Probe />
      </RodPumpDesignProvider>,
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
    expect(d.well.depthFt).toBe('5000');
    expect(d.rods.sectionsText).toMatch(/7\/8/);
    expect(d.unit.unitSource).toBe('generic');
    expect(d.link).toEqual({ fieldId: null, wellId: null, wellName: '' });
    expect(d).not.toHaveProperty('design');
    expect(d).not.toHaveProperty('sweep.points');
  });

  it('restores a partial payload without dropping defaults', () => {
    const restored = inputsFromPayload({ inputs: { duty: { designRateStbd: '250' } } });
    expect(restored.duty.designRateStbd).toBe('250');
    expect(restored.duty.wctPct).toBe(defaultInputs().duty.wctPct);
    expect(restored.rods).toEqual(defaultInputs().rods);
  });

  it('returns null for a missing payload', () => {
    expect(inputsFromPayload(null)).toBeNull();
  });

  it('flattens the sections the engine call needs, without a second perforation depth', () => {
    const inputs = defaultInputs();
    const form = designFormFrom(inputs);
    expect(form.designRateStbd).toBe('120');
    expect(form.strokeIn).toBe('64');
    expect(form.sectionsText).toBe(inputs.rods.sectionsText);
    // The producing gas-oil ratio and the oil gravity have one home.
    expect(form.gorScfStb).toBe(inputs.fluid.gor);
    expect(form.api).toBe(inputs.fluid.api);
    // Perforation depth is the well model's node depth, never a form field.
    expect(form).not.toHaveProperty('perfTvdFt');
  });
});

describe('well model from typed strings', () => {
  it('builds the nodal bundle a vertical well needs', () => {
    const model = buildWellModel(defaultInputs());
    expect(model.trajectory.tvdMax).toBe(5000);
    expect(model.tvdMax).toBe(5000);
    expect(model.ipr.qmax).toBeGreaterThan(0);
  });

  it('reads a deviated survey and stretches measured depth', () => {
    const inputs = defaultInputs();
    inputs.well.mode = 'deviated';
    const model = buildWellModel(inputs);
    expect(model.trajectory.mdMax).toBeGreaterThan(model.trajectory.tvdMax);
  });

  it('refuses to build without a depth rather than inventing one', () => {
    const inputs = defaultInputs();
    inputs.well.depthFt = '';
    expect(buildWellModel(inputs)).toBeNull();
  });
});

describe('live derivation', () => {
  it('designs a complete installation on mount', async () => {
    await mount();
    expect(api.result.ok).toBe(true);
    const d = api.design;
    // The plunger loses stroke to rod stretch.
    expect(d.plungerStrokeIn).toBeLessThan(64);
    expect(d.groups.spOverS).toBeLessThan(1);
    // The load brackets the buoyed string weight.
    expect(d.pprlLb).toBeGreaterThan(api.string.weightFluidLb);
    expect(d.mprlLb).toBeLessThan(api.string.weightFluidLb);
    // The unit balances, and a conventional linkage is not a sine wave.
    expect(d.balance.balanced).toBe(true);
    expect(Math.abs(api.unit.kin.upstrokeFraction - 0.5)).toBeGreaterThan(0.02);
  });

  it('a design that cannot be run is reported, not silently empty', async () => {
    await mount();
    await act(async () => { api.setSection('unit', 'plungerDIn', ''); });
    expect(api.result.ok).toBe(false);
    expect(api.result.errors.join(' ')).toMatch(/Plunger diameter/);
    expect(api.design).toBeNull();
  });

  it('refuses a rod string that does not reach its pump', async () => {
    await mount();
    await act(async () => { api.setSection('rods', 'sectionsText', '7/8, 1000'); });
    expect(api.result.ok).toBe(false);
    expect(api.result.errors.join(' ')).toMatch(/reaches its pump/);
  });

  it('parses the taper as fractions, not decimals', async () => {
    await mount();
    expect(api.sections).toEqual([
      { size: '7/8', lengthFt: 2400 }, { size: '3/4', lengthFt: 2400 },
    ]);
    expect(api.string.sections[0].dIn).toBeCloseTo(0.875, 9);
  });

  it('proposes a taper that fills the string', async () => {
    await mount();
    await act(async () => { api.proposeTaper(['1', '7/8', '3/4']); });
    const total = api.sections.reduce((a, s) => a + s.lengthFt, 0);
    expect(api.sections).toHaveLength(3);
    expect(Math.abs(total - 4800)).toBeLessThanOrEqual(3);
  });
});

describe('the explicit speed sweep', () => {
  it('runs on demand and goes stale when inputs change', async () => {
    await mount();
    expect(api.sweep).toBeNull();
    await act(async () => { await api.runSweep(); });
    expect(api.sweep.points.length).toBeGreaterThan(2);
    expect(api.sweepStale).toBe(false);
    const ok = api.sweep.points.filter((p) => p.ok);
    // Pump faster, make more, load the rods harder.
    expect(ok[ok.length - 1].producedBpd).toBeGreaterThan(ok[0].producedBpd);
    expect(ok[ok.length - 1].loadingPct).toBeGreaterThan(ok[0].loadingPct);
    await act(async () => { api.setSection('duty', 'whp', '150'); });
    expect(api.sweepStale).toBe(true);
  });
}, 120000);

describe('diagnostics', () => {
  it('stays silent until it is given a card', async () => {
    await mount();
    expect(api.measuredCard).toEqual([]);
    expect(api.diagnosis).toBeNull();
  });

  it('reads the design\'s own predicted card back to the pump it assumed', async () => {
    // Two solvers sharing no code path: the design marches the wave
    // equation forward, the diagnostic carries Fourier harmonics down.
    await mount();
    const expected = api.design;
    await act(async () => { api.useDesignCardForDiagnosis(); });
    expect(api.measuredCard.length).toBeGreaterThan(16);
    expect(api.diagnosis).not.toBeNull();
    expect(api.diagnosis.ok).toBe(true);
    const err = Math.abs(api.diagnosis.plungerStrokeIn - expected.plungerStrokeIn)
      / expected.plungerStrokeIn;
    expect(err).toBeLessThan(0.05);
  });
}, 60000);

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
    await act(async () => { api.applyLatestTest(); });
    expect(api.inputs.duty.designRateStbd).toBe('60');
    expect(api.inputs.duty.wctPct).toBe('70.0');
    expect(api.inputs.duty.whp).toBe('110');
    expect(api.inputs.fluid.gor).toBe('100');
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
  it('finds only the saves that carry rod pump inputs', async () => {
    supabaseMock.__result.data = [
      { id: 'a1', design_name: 'ESP only', design_data: { espInputs: {} } },
      { id: 'a2', design_name: 'Old rod', design_data: { rodPumpInputs: { pumpDepth: 4500 } } },
    ];
    await mount();
    await act(async () => { await api.loadLegacyDesigns(); });
    expect(api.legacyDesigns).toHaveLength(1);
    expect(api.legacyDesigns[0].id).toBe('a2');
  });

  it('imports the well numbers and refuses to carry the rod string', async () => {
    supabaseMock.__result.data = [{
      id: 'a2',
      design_name: 'Old rod',
      design_data: {
        rodPumpInputs: {
          pumpDepth: 4500, liquidRate: 90, tubingPressure: 120, waterCut: 75,
          oilApi: 28, strokeLength: 54, pumpingSpeed: 7, pumpDiameter: 1.5,
          rodString: '7/8, 3/4',
        },
      },
    }];
    await mount();
    await act(async () => { await api.loadLegacyDesigns(); });
    let outcome = null;
    await act(async () => { outcome = api.importLegacyDesign('a2'); });
    expect(api.inputs.duty.pumpTvdFt).toBe('4500');
    expect(api.inputs.duty.designRateStbd).toBe('90');
    expect(api.inputs.duty.whp).toBe('120');
    expect(api.inputs.duty.wctPct).toBe('75');
    expect(api.inputs.fluid.api).toBe('28');
    expect(api.inputs.unit.strokeIn).toBe('54');
    expect(api.inputs.unit.spm).toBe('7');
    expect(api.inputs.unit.plungerDIn).toBe('1.5');
    // The old tab read 7/8 as 7.8 inches, so its saved strings describe
    // rods that do not exist; the taper is left as it was.
    expect(outcome.unmapped).toHaveLength(1);
    expect(api.inputs.rods.sectionsText).toBe(defaultInputs().rods.sectionsText);
  });
});

describe('project lifecycle', () => {
  it('saves the inputs and reopens them', async () => {
    await mount();
    await act(async () => { api.setSection('unit', 'spm', '9.5'); });
    await act(async () => { await api.createProject('Design B'); });
    const payload = savedService.save.mock.calls[0][1];
    expect(payload.inputs.unit.spm).toBe('9.5');
    savedService.load.mockResolvedValue(payload);
    await act(async () => { await api.openProject(payload.id); });
    expect(api.inputs.unit.spm).toBe('9.5');
    expect(api.projectName).toBe('Design B');
  });

  it('a missing table is explained rather than dumped raw', async () => {
    savedService.list.mockRejectedValue({
      code: '42P01',
      message: 'relation "saved_rodpump_projects" does not exist',
    });
    await mount();
    expect(api.notifications.some((n) => /p6_saved_rodpump_projects migration/.test(n.message)))
      .toBe(true);
  });
});

describe('the shared well model on the spine (P6.5)', () => {
  it('saves only the well, never the duty this design is run at', async () => {
    await mount();
    await act(async () => { api.patchSection('link', { fieldId: 'f1' }); });
    await act(async () => { api.linkWell('w1'); });
    await act(async () => { await api.saveToSpine(); });
    expect(spine.upsertWellModel).toHaveBeenCalledWith('w1', expect.anything());
    const [, payload] = spine.upsertWellModel.mock.calls[0];
    expect(Object.keys(payload).sort())
      .toEqual(['completion', 'fluid', 'inflow', 'schema', 'well']);
    // The duty stays with the design. If it leaked into the shared
    // record, two studios sharing a well would overwrite each other's
    // design conditions -- worse than the duplication this replaced.
    expect(payload).not.toHaveProperty('duty');
    expect(JSON.stringify(payload)).not.toContain('designRateStbd');
  });

  it('refuses to save without a linked well', async () => {
    await mount();
    await act(async () => { await api.saveToSpine(); });
    expect(spine.upsertWellModel).not.toHaveBeenCalled();
    expect(api.notifications.some((n) => /belongs to a well/.test(n.message))).toBe(true);
  });

  it('loading a saved model replaces the well and leaves the duty alone', async () => {
    const saved = {
      id: 'm1',
      well_id: 'w1',
      updated_at: '2026-08-28T00:00:00Z',
      model_data: { schema: 1, inflow: { pr: '4321' } },
    };
    spine.getWellModel.mockResolvedValue(saved);
    await mount();
    await act(async () => { api.patchSection('link', { fieldId: 'f1' }); });
    await act(async () => { api.linkWell('w1'); });
    const dutyBefore = JSON.stringify(api.inputs.duty);
    await act(async () => { api.loadFromSpine(); });
    expect(api.inputs.inflow.pr).toBe('4321');
    expect(JSON.stringify(api.inputs.duty)).toBe(dutyBefore);
  });

  it('says when the design has drifted from the well record', async () => {
    spine.getWellModel.mockImplementation(async () => ({
      id: 'm1', well_id: 'w1', updated_at: '2026-08-28T00:00:00Z',
      model_data: { schema: 1, ...JSON.parse(JSON.stringify({
        well: api.inputs.well, fluid: api.inputs.fluid,
        inflow: api.inputs.inflow, completion: api.inputs.completion,
      })) },
    }));
    await mount();
    await act(async () => { api.patchSection('link', { fieldId: 'f1' }); });
    await act(async () => { api.linkWell('w1'); });
    expect(api.wellModelDirty).toBe(false);
    await act(async () => { api.setSection('inflow', 'pr', '9999'); });
    expect(api.wellModelDirty).toBe(true);
    // Changing the DUTY is not a drift from the well record.
    await act(async () => { api.setSection('inflow', 'pr', api.savedWellModel.inputs.inflow.pr); });
    expect(api.wellModelDirty).toBe(false);
  });
});
