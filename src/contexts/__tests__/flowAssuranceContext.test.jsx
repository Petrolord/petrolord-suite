/**
 * Gates for the Flow Assurance Studio state layer (Production P10).
 *
 * The physics is gated in the engine package and in
 * src/utils/production/__tests__/flowAssurance.test.js. These prove the
 * context wires it: the shared well record round-trips whole, the
 * coating stack survives a save and reopen without leaving yesterday's
 * layers behind, duty stays with the study rather than the well, and
 * the expensive sweep stays explicit and goes stale.
 */
import React from 'react';
import { render, act } from '@testing-library/react';

jest.mock('@/lib/productionSpine', () => ({
  listFields: jest.fn(),
  listPoWells: jest.fn(),
  getWellModel: jest.fn(),
  upsertWellModel: jest.fn(),
}));
jest.mock('@/utils/savedProjects', () => {
  const service = { list: jest.fn(), load: jest.fn(), save: jest.fn(), remove: jest.fn() };
  return { createSavedProjectsService: () => service, __service: service };
});

const spine = jest.requireMock('@/lib/productionSpine');
const savedService = jest.requireMock('@/utils/savedProjects').__service;

import {
  FlowAssuranceProvider, useFlowAssurance, defaultInputs, inputsFromPayload, defaultLeg,
} from '@/contexts/FlowAssuranceContext';
import { WELL_MODEL_SECTIONS } from '@/utils/production/wellModel';

const FIELD = { id: 'f1', name: 'Test Field', is_own: true };
const WELL = { id: 'w1', name: 'P-1', field_id: 'f1' };

let api = null;
const Probe = () => {
  api = useFlowAssurance();
  return null;
};

const mount = async () => {
  await act(async () => {
    render(
      <FlowAssuranceProvider>
        <Probe />
      </FlowAssuranceProvider>,
    );
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  api = null;
  spine.listFields.mockResolvedValue([FIELD]);
  spine.listPoWells.mockResolvedValue([WELL]);
  spine.getWellModel.mockResolvedValue(null);
  spine.upsertWellModel.mockImplementation(async (wellId, modelData) => ({
    id: 'm1', well_id: wellId, model_data: modelData, updated_at: '2026-08-28T00:00:00Z',
  }));
  savedService.list.mockResolvedValue([]);
  savedService.save.mockResolvedValue(undefined);
});

describe('payload shape', () => {
  it('defaults carry a complete study and no results', () => {
    const d = defaultInputs();
    expect(d.well.depthFt).toBe('8000');
    expect(d.flowline.enabled).toBe(true);
    expect(d.riser.enabled).toBe(false);
    expect(d).not.toHaveProperty('trace');
    expect(d).not.toHaveProperty('analysis');
  });

  it('duty stays with the STUDY, never in the shared well record', () => {
    // A rate, a water cut and a wellhead pressure are what the well was
    // doing on the day. Putting them in the record would overwrite
    // another studio's duty every time this one saved (P6.5).
    const d = defaultInputs();
    WELL_MODEL_SECTIONS.forEach((s) => {
      expect(d[s]).not.toHaveProperty('whpPsia');
      expect(d[s]).not.toHaveProperty('qoStbd');
      expect(d[s]).not.toHaveProperty('wctPct');
    });
    expect(d.duty.whpPsia).toBe('900');
  });

  it('restores a partial payload without dropping defaults', () => {
    const restored = inputsFromPayload({ inputs: { choke: { pDownPsia: '250' } } });
    expect(restored.choke.pDownPsia).toBe('250');
    expect(restored.choke.jtCoeffFPerPsi).toBe(defaultInputs().choke.jtCoeffFPerPsi);
    expect(restored.flowline).toEqual(defaultInputs().flowline);
  });

  it('a restored coating stack REPLACES the default one rather than merging into it', () => {
    // A spread would leave the default layer sitting behind the
    // restored ones, silently thickening the pipe on every reopen.
    const restored = inputsFromPayload({
      inputs: { flowline: { ...defaultLeg(), coatings: [{ id: 'x', materialId: 'aerogel', thicknessIn: '2' }] } },
    });
    expect(restored.flowline.coatings).toHaveLength(1);
    expect(restored.flowline.coatings[0].materialId).toBe('aerogel');
  });

  it('returns null for a missing payload', () => {
    expect(inputsFromPayload(null)).toBeNull();
  });
});

describe('live derivation', () => {
  it('traces the whole path on mount', async () => {
    await mount();
    expect(api.analysis.ok).toBe(true);
    expect(api.analysis.trace.length).toBeGreaterThan(50);
    expect(api.analysis.legs).toHaveLength(1);
    expect(api.model.phase).toBe('oil');
  });

  it('the leg U is available even before the trace can run', async () => {
    await mount();
    await act(async () => { api.setSection('duty', 'whpPsia', ''); });
    expect(api.analysis.ok).toBe(false);
    // The user is still building the pipe up; the number has to move.
    expect(api.legUs.flowline.ok).toBe(true);
    expect(api.legUs.flowline.uBtuHrFt2F).toBeGreaterThan(0);
  });

  it('adding insulation lowers U and lands the fluid hotter', async () => {
    await mount();
    const before = api.analysis.arrival.tempF;
    await act(async () => { api.addCoating('flowline'); });
    expect(api.analysis.arrival.tempF).toBeGreaterThan(before);
  });

  it('removing every coating puts the line into the hydrate region', async () => {
    await mount();
    const id = api.inputs.flowline.coatings[0].id;
    await act(async () => { api.removeCoating('flowline', id); });
    expect(api.analysis.hydrate.inHydrate).toBe(true);
    expect(api.analysis.inhibition.required).toBe(true);
  });

  it('enabling the riser extends the trace', async () => {
    await mount();
    const before = api.analysis.trace.length;
    await act(async () => { api.setSection('riser', 'enabled', true); });
    expect(api.analysis.legs).toHaveLength(2);
    expect(api.analysis.trace.length).toBeGreaterThan(before);
    expect(api.analysis.arrival.leg).toBe('riser');
  });
});

describe('explicit run', () => {
  it('the insulation sweep runs on demand and goes stale when inputs change', async () => {
    await mount();
    expect(api.sweep).toBeNull();
    await act(async () => { await api.runSweep(); });
    expect(api.sweep.points.length).toBeGreaterThan(5);
    expect(api.sweepStale).toBe(false);
    await act(async () => { api.setSection('duty', 'qoStbd', '900'); });
    expect(api.sweepStale).toBe(true);
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

  it('saving to the spine carries the WHOLE well record, gas coefficients included', async () => {
    // The P6.5 regression: a studio that only wrote back the sections
    // it happens to edit would wipe a gas well's deliverability
    // coefficients the first time it saved.
    await mount();
    await act(async () => { api.patchSection('link', { fieldId: 'f1' }); });
    await act(async () => { api.linkWell('w1'); });
    await act(async () => { await api.saveToSpine(); });
    const payload = spine.upsertWellModel.mock.calls[0][1];
    WELL_MODEL_SECTIONS.forEach((s) => expect(payload[s]).toBeDefined());
    expect(payload.gasInflow).toBeDefined();
    // and never the duty, nor anything about the pipe
    expect(payload).not.toHaveProperty('duty');
    expect(payload).not.toHaveProperty('flowline');
    expect(payload).not.toHaveProperty('choke');
  });

  it('the link stays identity only: the saved payload carries ids, never spine rows', async () => {
    await mount();
    await act(async () => { api.patchSection('link', { fieldId: 'f1' }); });
    await act(async () => { api.linkWell('w1'); });
    await act(async () => { await api.createProject('Study A'); });
    const payload = savedService.save.mock.calls[0][1];
    expect(payload.inputs.link).toEqual({ fieldId: 'f1', wellId: 'w1', wellName: 'P-1' });
    expect(JSON.stringify(payload)).not.toContain('field_id');
  });
});

describe('project lifecycle', () => {
  it('saves the inputs and reopens them', async () => {
    await mount();
    await act(async () => { api.setSection('choke', 'pDownPsia', '325'); });
    await act(async () => { await api.createProject('Study B'); });
    const payload = savedService.save.mock.calls[0][1];
    expect(payload.inputs.choke.pDownPsia).toBe('325');
    savedService.load.mockResolvedValue(payload);
    await act(async () => { await api.openProject(payload.id); });
    expect(api.inputs.choke.pDownPsia).toBe('325');
    expect(api.projectName).toBe('Study B');
  });

  it('a missing table is explained rather than dumped raw', async () => {
    savedService.list.mockRejectedValue({
      code: '42P01',
      message: 'relation "saved_flowassurance_projects" does not exist',
    });
    await mount();
    expect(api.notifications.some((n) => /p10_saved_flowassurance_projects migration/.test(n.message)))
      .toBe(true);
  });
});
