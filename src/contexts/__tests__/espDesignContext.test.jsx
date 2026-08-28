/**
 * Gates for the ESP Design Studio state layer (P5).
 *
 * The pump hydraulics, the gas split and the electrical side are gated
 * in the engine package, and the Suite chain in
 * src/utils/production/__tests__/esp.test.js. These prove the context
 * wires them: the well model builds from typed strings, the flat form
 * the engine call takes is assembled without duplicating the
 * perforation depth, the design recomputes live while the system curve
 * stays an explicit run that goes stale, diagnostics stay silent until
 * they are given measurements, the spine link stays an identity link,
 * and the legacy import only moves what maps.
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
  EspDesignProvider, useEsp, defaultInputs, inputsFromPayload,
  designFormFrom, buildWellModel,
} from '@/contexts/EspDesignContext';

const FIELD = { id: 'f1', name: 'Test Field', is_own: true };
const WELL = { id: 'w1', name: 'P-1', field_id: 'f1' };
const TEST = {
  id: 't1', well_id: 'w1', test_date: '2025-03-01', duration_hours: 12,
  oil_rate_stbd: 520, water_rate_stbd: 480, gas_rate_mscfd: 260,
  thp_psia: 180, is_valid: true,
};

let api = null;
const Probe = () => {
  api = useEsp();
  return null;
};

const mount = async () => {
  await act(async () => {
    render(
      <EspDesignProvider>
        <Probe />
      </EspDesignProvider>,
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
    expect(d.well.depthFt).toBe('7500');
    expect(d.pump.curveSource).toBe('reference');
    expect(d.link).toEqual({ fieldId: null, wellId: null, wellName: '' });
    expect(d).not.toHaveProperty('design');
    expect(d).not.toHaveProperty('systemRun');
  });

  it('restores a partial payload without dropping defaults', () => {
    const restored = inputsFromPayload({ inputs: { duty: { designRateStbd: '450' } } });
    expect(restored.duty.designRateStbd).toBe('450');
    expect(restored.duty.wctPct).toBe(defaultInputs().duty.wctPct);
    expect(restored.motor).toEqual(defaultInputs().motor);
  });

  it('returns null for a missing payload', () => {
    expect(inputsFromPayload(null)).toBeNull();
  });

  it('flattens the sections the engine call needs and takes the perforation depth from the model', () => {
    const inputs = defaultInputs();
    const model = buildWellModel(inputs);
    const form = designFormFrom(inputs, model);
    expect(form.designRateStbd).toBe('300');
    expect(form.nameplateHp).toBe('250');
    expect(form.referenceStageId).toBe('ref-562-4000');
    // The producing gas-oil ratio has one home, the fluid section.
    expect(form.gorScfStb).toBe(inputs.fluid.gor);
    // Perforation depth is the well node depth, never a second field
    // that can drift away from the traverse.
    expect(form.perfTvdFt).toBe(String(model.tvdMax));
    expect(defaultInputs()).not.toHaveProperty('duty.perfTvdFt');
  });
});

describe('well model from typed strings', () => {
  it('builds the nodal bundle a vertical well needs', () => {
    const model = buildWellModel(defaultInputs());
    expect(model.trajectory.tvdMax).toBe(7500);
    expect(model.vlp.nodeMd).toBe(7500);
    expect(model.vlp.idIn).toBeCloseTo(3.958, 9);
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
  it('sizes a stack on mount, with the net lift carrying most of the head', async () => {
    await mount();
    expect(api.result.ok).toBe(true);
    expect(api.design.sized.stages).toBeGreaterThan(1);
    const { breakdown, tdhFt } = api.design.duty;
    // The predecessor app omitted the net lift entirely, which is why
    // it staged roughly an order of magnitude short on a well like this.
    expect(breakdown.netLiftFt).toBeGreaterThan(0.5 * tdhFt);
    // The decomposition sums to the head it decomposes, exactly.
    expect(breakdown.netLiftFt + breakdown.whpHeadFt + breakdown.frictionFt)
      .toBeCloseTo(tdhFt, 6);
    // The stack is never short of the head the well demands.
    expect(api.design.sized.headMarginFt).toBeGreaterThanOrEqual(0);
  });

  it('builds a stack head curve without touching a traverse', async () => {
    await mount();
    expect(api.stackCurvePoints).toHaveLength(25);
    const heads = api.stackCurvePoints.map((p) => p.headFt);
    // A centrifugal curve falls with rate.
    expect(heads[0]).toBeGreaterThan(heads[heads.length - 1]);
  });

  it('a design that cannot be run is reported, not silently empty', async () => {
    await mount();
    await act(async () => { api.setSection('duty', 'pumpTvdFt', ''); });
    expect(api.result.ok).toBe(false);
    expect(api.result.errors.join(' ')).toMatch(/Pump setting depth/);
    expect(api.design).toBeNull();
  });

  it('refuses a pump below the perforations', async () => {
    await mount();
    await act(async () => { api.setSection('duty', 'pumpTvdFt', '9000'); });
    expect(api.result.ok).toBe(false);
    expect(api.result.errors.join(' ')).toMatch(/cannot be set below the perforations/);
  });

  it('refuses a design rate at or above the absolute open flow, naming it', async () => {
    await mount();
    const qMax = api.model.ipr.qmax;
    await act(async () => { api.setSection('duty', 'designRateStbd', String(Math.ceil(qMax) + 10)); });
    expect(api.result.ok).toBe(false);
    expect(api.result.errors.join(' ')).toMatch(/absolute open flow/);
  });
});

describe('the explicit system-curve run', () => {
  it('runs on demand, finds the operating point, and goes stale when inputs change', async () => {
    await mount();
    expect(api.systemRun).toBeNull();
    await act(async () => { await api.runSystemCurve(); });
    expect(api.systemRun.points.length).toBeGreaterThan(2);
    // A rounded-up stage count makes slightly more head than the design
    // rate demands, so the installation settles above that rate.
    expect(api.systemRun.operating).not.toBeNull();
    expect(api.systemRun.operating.qoStbd).toBeGreaterThan(0);
    expect(api.systemStale).toBe(false);
    await act(async () => { api.setSection('duty', 'whp', '260'); });
    expect(api.systemStale).toBe(true);
  });

  it('the system curve demands more head as the well produces harder', async () => {
    await mount();
    await act(async () => { await api.runSystemCurve(); });
    const pts = api.systemRun.points;
    expect(pts[pts.length - 1].tdhFt).toBeGreaterThan(pts[0].tdhFt);
  });
}, 60000);

describe('diagnostics', () => {
  it('stays silent until it is given a rate and both pressures', async () => {
    await mount();
    expect(api.diagnosis).toBeNull();
    await act(async () => { api.setSection('diagnostics', 'qBpd', '3000'); });
    expect(api.diagnosis).toBeNull();
  });

  it('reports a worn stack as a fraction of its own curve', async () => {
    await mount();
    const { pumpIntakeBpd, intake, tdhFt } = api.design.duty;
    const gradient = intake.gradientPsiPerFt;
    // Feed back pressures that make exactly 80 percent of the head the
    // curve says this stack should make at this rate.
    await act(async () => {
      api.patchSection('diagnostics', {
        qBpd: String(pumpIntakeBpd),
        pIntakePsia: '1000',
        pDischargePsia: String(1000 + 0.8 * tdhFt * gradient),
        hz: '60',
      });
    });
    expect(api.diagnosis).not.toBeNull();
    expect(api.diagnosis.headRatio).toBeLessThan(0.9);
    expect(api.diagnosis.flags.some((f) => f.code === 'underCurve')).toBe(true);
  });
});

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
    expect(api.inputs.duty.designRateStbd).toBe('520');
    expect(api.inputs.duty.wctPct).toBe('48.0');
    expect(api.inputs.duty.whp).toBe('180');
    expect(api.inputs.fluid.gor).toBe('500');
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

describe('the motor frame list', () => {
  it('fills the nameplate and leaves every number editable', async () => {
    await mount();
    await act(async () => { api.applyMotorFrame('m-400-3300'); });
    expect(api.inputs.motor.nameplateHp).toBe('400');
    expect(api.inputs.motor.nameplateVolts).toBe('3300');
    expect(api.inputs.motor.nameplateAmps).toBe('78');
    await act(async () => { api.setSection('motor', 'nameplateHp', '375'); });
    expect(api.inputs.motor.nameplateHp).toBe('375');
  });
});

describe('legacy Artificial Lift Designer import', () => {
  it('finds only the saves that carry ESP inputs', async () => {
    supabaseMock.__result.data = [
      { id: 'a1', design_name: 'Gas lift only', design_data: { gasLiftInputs: {} } },
      {
        id: 'a2',
        design_name: 'Old ESP',
        design_data: { espInputs: { wellDepth: 8200, pumpDepth: 7900 } },
      },
    ];
    await mount();
    await act(async () => { await api.loadLegacyDesigns(); });
    expect(api.legacyDesigns).toHaveLength(1);
    expect(api.legacyDesigns[0].id).toBe('a2');
  });

  it('imports the mapped fields and refuses to carry the invented pump model', async () => {
    supabaseMock.__result.data = [{
      id: 'a2',
      design_name: 'Old ESP',
      design_data: {
        espInputs: {
          wellDepth: 8200, pumpDepth: 7900, targetRate: 640, whp: 240, waterCut: 85,
          gor: 200, oilApi: 28, tubingID: 2.992, casingID: 6.184, frequency: 55,
          pumpModel: 'Some Vendor D2400N',
        },
      },
    }];
    await mount();
    await act(async () => { await api.loadLegacyDesigns(); });
    let outcome = null;
    await act(async () => { outcome = api.importLegacyDesign('a2'); });
    expect(api.inputs.well.depthFt).toBe('8200');
    expect(api.inputs.duty.pumpTvdFt).toBe('7900');
    expect(api.inputs.duty.designRateStbd).toBe('640');
    expect(api.inputs.duty.whp).toBe('240');
    expect(api.inputs.duty.wctPct).toBe('85');
    expect(api.inputs.fluid.gor).toBe('200');
    expect(api.inputs.fluid.api).toBe('28');
    expect(api.inputs.completion.idIn).toBe('2.992');
    expect(api.inputs.completion.casingIdIn).toBe('6.184');
    expect(api.inputs.pump.hz).toBe('55');
    // The old catalog's vendor-sounding names had invented curves behind
    // them, so the model name is reported as uncarried rather than
    // mapped onto a reference stage.
    expect(outcome.unmapped).toHaveLength(1);
    expect(outcome.unmapped[0]).toMatch(/Some Vendor D2400N/);
    expect(api.inputs.pump.curveSource).toBe('reference');
  });
});

describe('project lifecycle', () => {
  it('saves the inputs and reopens them', async () => {
    await mount();
    await act(async () => { api.setSection('duty', 'designRateStbd', '425'); });
    await act(async () => { await api.createProject('Design B'); });
    const payload = savedService.save.mock.calls[0][1];
    expect(payload.inputs.duty.designRateStbd).toBe('425');
    savedService.load.mockResolvedValue(payload);
    await act(async () => { await api.openProject(payload.id); });
    expect(api.inputs.duty.designRateStbd).toBe('425');
    expect(api.projectName).toBe('Design B');
  });

  it('reopening a project clears the previous system-curve run rather than keeping it', async () => {
    await mount();
    await act(async () => { await api.runSystemCurve(); });
    expect(api.systemRun).not.toBeNull();
    await act(async () => { await api.createProject('Design C'); });
    const payload = savedService.save.mock.calls[0][1];
    savedService.load.mockResolvedValue(payload);
    await act(async () => { await api.openProject(payload.id); });
    expect(api.systemRun).toBeNull();
  }, 60000);

  it('a missing table is explained rather than dumped raw', async () => {
    savedService.list.mockRejectedValue({
      code: '42P01',
      message: 'relation "saved_esp_projects" does not exist',
    });
    await mount();
    expect(api.notifications.some((n) => /p5_saved_esp_projects migration/.test(n.message)))
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
