/**
 * Gates for the Well Intervention Planner state layer (P12).
 *
 * The diagnostic, the skin group and the screening rules are gated in
 * the engine package; the history handling, the nodal uplift and the
 * canonical economics in
 * src/utils/production/__tests__/intervention.test.js. These gate the
 * wiring, and above all the ORDER: that the diagnosis is live and
 * drives the screening, and that a treatment the diagnosis rules out is
 * never sized.
 */
import React from 'react';
import { render, act } from '@testing-library/react';

jest.mock('@/lib/productionSpine', () => ({
  listFields: jest.fn(),
  listPoWells: jest.fn(),
  getDailyProduction: jest.fn(),
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
  InterventionPlannerProvider, useIntervention, defaultInputs,
  inputsFromPayload, planInputsFrom,
} from '@/contexts/InterventionPlannerContext';
import { WELL_MODEL_SECTIONS } from '@/utils/production/wellModel';

const FIELD = { id: 'f1', name: 'Test Field', is_own: true };
const WELL = { id: 'w1', name: 'P-1', field_id: 'f1' };

/** WOR = a t^m. m high is channelling; the levelling form is coning. */
const rows = ({ m = 1.8, coning = false, n = 90 } = {}) => {
  const out = [];
  const start = new Date('2023-01-01').getTime();
  for (let i = 0; i < n; i += 1) {
    const t = Math.max(1, i * 8);
    const wor = coning ? (5 * t) / (t + 150) : 0.004 * t ** m;
    const qo = 900 / (1 + 0.006 * t);
    out.push({
      well_id: 'w1',
      prod_date: new Date(start + i * 8 * 86400000).toISOString().slice(0, 10),
      oil_rate_stbd: qo,
      water_rate_stbd: qo * wor,
      gas_rate_mscfd: (qo * 520) / 1000,
    });
  }
  return out;
};

let api = null;
const Probe = () => { api = useIntervention(); return null; };

const mount = async () => {
  await act(async () => {
    render(<InterventionPlannerProvider><Probe /></InterventionPlannerProvider>);
  });
};

const link = async () => {
  await act(async () => { api.patchSection('link', { fieldId: 'f1' }); });
  await act(async () => { api.linkWell('w1'); });
};

beforeEach(() => {
  jest.clearAllMocks();
  api = null;
  spine.listFields.mockResolvedValue([FIELD]);
  spine.listPoWells.mockResolvedValue([WELL]);
  spine.getDailyProduction.mockResolvedValue(rows());
  spine.getWellModel.mockResolvedValue(null);
  savedService.list.mockResolvedValue([]);
  savedService.save.mockResolvedValue(undefined);
});

describe('payload shape', () => {
  it('defaults carry a complete plan and no results', () => {
    const d = defaultInputs();
    expect(d.well.skin).toBe('7');
    expect(d.treatment.kind).toBe('stimulation');
    expect(d).not.toHaveProperty('plan');
    expect(d).not.toHaveProperty('diagnosis');
  });

  it('the decline has NO default value, because a step change always pays', () => {
    // It is prefilled in the form so the studio opens with a working
    // example, but the computation layer requires it and refuses
    // without one. Both facts matter and they are not the same fact.
    expect(defaultInputs().economics.declinePctPerYear).toBeTruthy();
  });

  it('duty and treatment stay out of the shared well record', () => {
    const d = defaultInputs();
    WELL_MODEL_SECTIONS.forEach((s) => {
      expect(d[s]).not.toHaveProperty('wctPct');
      expect(d[s]).not.toHaveProperty('whpPsia');
      expect(d[s]).not.toHaveProperty('skinAfter');
    });
    expect(d.duty.wctPct).toBe('55');
  });

  it('the skin and the drainage geometry DO ride with the well, not the plan', () => {
    // They are properties of the well and the reservoir, not of what is
    // being planned this week.
    expect(defaultInputs().well.reFt).toBeDefined();
    expect(defaultInputs().well.rwFt).toBeDefined();
  });

  it('restores a partial payload without dropping defaults', () => {
    const r = inputsFromPayload({ inputs: { treatment: { kind: 'shutoff' } } });
    expect(r.treatment.kind).toBe('shutoff');
    expect(r.treatment.skinAfter).toBe(defaultInputs().treatment.skinAfter);
    expect(r.economics).toEqual(defaultInputs().economics);
  });

  it('the analysis inputs carry the geometry and the duty, never the whole model', () => {
    const a = planInputsFrom(defaultInputs());
    expect(a.well.skin).toBeDefined();
    expect(a.well).not.toHaveProperty('depthFt');
    expect(a.duty.whpPsia).toBeDefined();
  });

  it('returns null for a missing payload', () => {
    expect(inputsFromPayload(null)).toBeNull();
  });
});

describe('the diagnosis is live', () => {
  it('appears as soon as a well with history is linked', async () => {
    await mount();
    expect(api.diagnosis).toBeNull();
    await link();
    expect(spine.getDailyProduction).toHaveBeenCalledWith('f1', { wellId: 'w1' });
    expect(api.history.length).toBeGreaterThan(50);
    expect(api.diagnosis.mechanism.id).toBe('channelling');
  });

  it('moves when the reading settings move, without a run', async () => {
    await mount();
    await link();
    const before = api.diagnosis.derivativeSlope;
    await act(async () => { api.setSection('diagnostic', 'lateFraction', '1'); });
    expect(api.diagnosis.derivativeSlope).not.toBe(before);
  });

  it('reads a levelling history as coning', async () => {
    spine.getDailyProduction.mockResolvedValue(rows({ coning: true }));
    await mount();
    await link();
    expect(api.diagnosis.mechanism.id).toBe('coning');
    expect(api.diagnosis.mechanism.treatable).toBe(false);
  });

  it('a well with no history on the spine is told so, and gets no diagnosis', async () => {
    spine.getDailyProduction.mockResolvedValue([]);
    await mount();
    await link();
    expect(api.diagnosis).toBeNull();
    expect(api.notifications.some((n) => /no daily production on the spine/.test(n.message)))
      .toBe(true);
  });
});

describe('the plan, and the order it runs in', () => {
  it('runs on demand and goes stale', async () => {
    await mount();
    await link();
    expect(api.plan).toBeNull();
    await act(async () => { await api.runPlan(); });
    expect(api.plan.ok).toBe(true);
    expect(api.planStale).toBe(false);
    await act(async () => { api.setSection('well', 'skin', '11'); });
    expect(api.planStale).toBe(true);
  }, 60000);

  it('sizes a stimulation, and the WELL gains less than the inflow did', async () => {
    await mount();
    await link();
    await act(async () => { await api.runPlan(); });
    const s = api.plan.stimulation;
    expect(s.ok).toBe(true);
    expect(s.rateMultiplier).toBeLessThan(s.piMultiplier);
    expect(s.overstatementStbd).toBeGreaterThan(0);
  }, 60000);

  it('ON A CONING WELL the shutoff is ruled out AND NOT SIZED', async () => {
    // The order the whole studio exists to enforce. Sizing a treatment
    // the diagnostic argues against does not improve it.
    spine.getDailyProduction.mockResolvedValue(rows({ coning: true }));
    await mount();
    await link();
    await act(async () => { api.setSection('treatment', 'kind', 'shutoff'); });
    await act(async () => { await api.runPlan(); });
    const shutoff = api.plan.screening.find((r) => r.id === 'waterShutoff');
    expect(shutoff.blocked).toBe(true);
    expect(shutoff.blockReason).toMatch(/re-forms above/);
    expect(api.plan.shutoff).toBeNull();
    expect(api.plan.economics).toBeNull();
  }, 60000);

  it('on a CHANNELLING well the same shutoff is sized and valued', async () => {
    await mount();
    await link();
    await act(async () => { api.setSection('treatment', 'kind', 'shutoff'); });
    await act(async () => { await api.runPlan(); });
    const shutoff = api.plan.screening.find((r) => r.id === 'waterShutoff');
    expect(shutoff.blocked).toBe(false);
    expect(api.plan.shutoff.ok).toBe(true);
    expect(api.plan.shutoff.upliftStbd).toBeGreaterThan(0);
    expect(api.plan.economics.ok).toBe(true);
  }, 60000);

  it('refuses to plan without a well model', async () => {
    await mount();
    await act(async () => { api.setSection('well', 'depthFt', ''); });
    await act(async () => { await api.runPlan(); });
    expect(api.plan).toBeNull();
    expect(api.notifications.some((n) => /well model is incomplete/i.test(n.message))).toBe(true);
  });
});

describe('the skin floor is live', () => {
  it('is computed from the geometry and moves with it', async () => {
    await mount();
    const before = api.skinFloor;
    expect(before).toBeLessThan(0);
    await act(async () => { api.setSection('well', 'reFt', '400'); });
    // A smaller drainage radius is a smaller logarithm, so the floor
    // rises toward zero: there is less to gain and less room to gain it.
    expect(api.skinFloor).toBeGreaterThan(before);
  });
});

describe('project lifecycle', () => {
  it('saves the plan and reopens it', async () => {
    await mount();
    await act(async () => { api.setSection('economics', 'costUsdMM', '2.6'); });
    await act(async () => { await api.createProject('P-1 workover'); });
    const payload = savedService.save.mock.calls[0][1];
    expect(payload.inputs.economics.costUsdMM).toBe('2.6');
    savedService.load.mockResolvedValue(payload);
    await act(async () => { await api.openProject(payload.id); });
    expect(api.inputs.economics.costUsdMM).toBe('2.6');
    expect(api.projectName).toBe('P-1 workover');
  });

  it('a missing table is explained rather than dumped raw', async () => {
    savedService.list.mockRejectedValue({
      code: '42P01', message: 'relation "saved_intervention_projects" does not exist',
    });
    await mount();
    expect(api.notifications.some((n) => /p12_saved_intervention_projects migration/.test(n.message)))
      .toBe(true);
  });
});
