/**
 * Gates for the Production Network Studio state layer (P11).
 *
 * The solver is gated in the engine package against a bisection oracle
 * and the physics in src/utils/production/__tests__/network.test.js.
 * These gate the wiring: that the topology stays live and cheap while
 * the solve stays explicit and goes stale, that editing the network
 * discards a stale answer rather than leaving it on screen, that the
 * shared per-well records come in whole, and that the layout is derived
 * from the topology rather than stored.
 */
import React from 'react';
import { render, act } from '@testing-library/react';

jest.mock('@/lib/productionSpine', () => ({
  listFields: jest.fn(),
  listPoWells: jest.fn(),
  getWellModel: jest.fn(),
}));
jest.mock('@/utils/savedProjects', () => {
  const service = { list: jest.fn(), load: jest.fn(), save: jest.fn(), remove: jest.fn() };
  return { createSavedProjectsService: () => service, __service: service };
});

const spine = jest.requireMock('@/lib/productionSpine');
const savedService = jest.requireMock('@/utils/savedProjects').__service;

import {
  ProductionNetworkProvider, useProductionNetwork, defaultInputs,
  inputsFromPayload, analysisInputsFrom,
} from '@/contexts/ProductionNetworkContext';
import { WELL_MODEL_SECTIONS } from '@/utils/production/wellModel';

const FIELD = { id: 'f1', name: 'Test Field', is_own: true };
const WELLS = [
  { id: 'sw1', name: 'A-1', field_id: 'f1' },
  { id: 'sw2', name: 'A-2', field_id: 'f1' },
];

const MODEL_PAYLOAD = {
  schema: 1,
  well: { mode: 'vertical', depthFt: '8100', whtF: '145', bhtF: '205', phase: 'oil' },
  fluid: { api: '31', gasSg: '0.72', gor: '540', salinityPpm: '25000' },
  inflow: { model: 'vogel', pr: '2900', pb: '2050', calMode: 'pi', pi: '1.1' },
  gasInflow: { model: 'backPressure', c: '0.004', n: '0.86' },
  completion: { idIn: '2.441', roughnessIn: '0.0006', correlation: 'beggsBrill', stepFt: '100' },
};

let api = null;
const Probe = () => { api = useProductionNetwork(); return null; };

const mount = async () => {
  await act(async () => {
    render(<ProductionNetworkProvider><Probe /></ProductionNetworkProvider>);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  api = null;
  spine.listFields.mockResolvedValue([FIELD]);
  spine.listPoWells.mockResolvedValue(WELLS);
  spine.getWellModel.mockResolvedValue({ id: 'm1', model_data: MODEL_PAYLOAD });
  savedService.list.mockResolvedValue([]);
  savedService.save.mockResolvedValue(undefined);
});

describe('payload shape', () => {
  it('opens on the smallest network that shows the point: three wells on a header', () => {
    // One well has nothing to fight with, so a single-well default would
    // demonstrate nothing this studio exists for.
    const d = defaultInputs();
    expect(d.nodes.filter((n) => n.kind === 'well')).toHaveLength(3);
    expect(d.nodes.filter((n) => n.kind === 'junction')).toHaveLength(1);
    expect(d.nodes.filter((n) => n.kind === 'sink')).toHaveLength(1);
    expect(d.branches).toHaveLength(4);
  });

  it('every well node carries the whole shared record, gas inflow included', () => {
    defaultInputs().nodes.filter((n) => n.kind === 'well').forEach((n) => {
      WELL_MODEL_SECTIONS.forEach((s) => expect(n.model[s]).toBeDefined());
    });
  });

  it('duty stays on the node, and the wellhead pressure is nowhere in the inputs', () => {
    // In a network nobody sets the wellhead pressure. The network does.
    const d = defaultInputs();
    const well = d.nodes.find((n) => n.kind === 'well');
    expect(well.duty.wctPct).toBeDefined();
    expect(well.duty).not.toHaveProperty('whpPsia');
    WELL_MODEL_SECTIONS.forEach((s) => expect(well.model[s]).not.toHaveProperty('whpPsia'));
    expect(JSON.stringify(d)).not.toContain('whpPsia');
  });

  it('a restored network REPLACES the default one rather than merging into it', () => {
    const saved = {
      inputs: {
        nodes: [
          { id: 'x', kind: 'well', label: 'Solo', model: {}, duty: { wctPct: '30' } },
          { id: 'y', kind: 'sink', label: 'Sep', pressurePsia: '250' },
        ],
        branches: [{ id: 'b', from: 'x', to: 'y', label: 'Line' }],
      },
    };
    const r = inputsFromPayload(saved);
    expect(r.nodes).toHaveLength(2);
    expect(r.branches).toHaveLength(1);
    expect(r.nodes[0].duty.wctPct).toBe('30');
    // and the well model is filled out from the defaults, not left half built
    WELL_MODEL_SECTIONS.forEach((s) => expect(r.nodes[0].model[s]).toBeDefined());
    // a branch restored without geometry still gets a usable default
    expect(r.branches[0].lengthFt).toBeDefined();
    expect(r.branches[0].idIn).toBeDefined();
  });

  it('the analysis inputs carry the duty and the geometry, never the well models', () => {
    const a = analysisInputsFrom(defaultInputs());
    expect(a.nodes.every((n) => !('model' in n))).toBe(true);
    expect(a.branches[0].lengthFt).toBeDefined();
  });

  it('returns null for a missing payload', () => {
    expect(inputsFromPayload(null)).toBeNull();
  });
});

describe('live topology', () => {
  it('is valid on mount, with every well model complete', async () => {
    await mount();
    expect(api.topology.ok).toBe(true);
    expect(api.wellProblems).toHaveLength(0);
    expect(api.canRun).toBe(true);
    expect(Object.values(api.wellModels).every((m) => m && m.ipr)).toBe(true);
  });

  it('goes invalid the moment a node is stranded, with the engine\'s own message', async () => {
    await mount();
    await act(async () => { api.addJunction(); });
    expect(api.topology.ok).toBe(false);
    expect(api.topology.error).toMatch(/no route to a delivery point/);
    expect(api.canRun).toBe(false);
  });

  it('the layout is DERIVED from the topology, not stored', async () => {
    await mount();
    // Wells furthest from the delivery point, separator at the last column.
    const sink = api.inputs.nodes.find((n) => n.kind === 'sink');
    const well = api.inputs.nodes.find((n) => n.kind === 'well');
    expect(api.layout.positions[sink.id].col).toBeGreaterThan(api.layout.positions[well.id].col);
    expect(api.layout.columns).toBe(3);
    // Nothing about position is in the saved inputs.
    expect(JSON.stringify(api.inputs)).not.toContain('"col"');
    expect(JSON.stringify(api.inputs)).not.toContain('"x"');
  });

  it('adding a well hangs it off the header and keeps the network valid', async () => {
    await mount();
    const before = api.inputs.branches.length;
    await act(async () => { api.addWell(); });
    expect(api.inputs.nodes.filter((n) => n.kind === 'well')).toHaveLength(4);
    expect(api.inputs.branches).toHaveLength(before + 1);
    expect(api.topology.ok).toBe(true);
  });

  it('removing a node takes its lines with it', async () => {
    await mount();
    const well = api.inputs.nodes.find((n) => n.kind === 'well');
    await act(async () => { api.removeNode(well.id); });
    expect(api.inputs.branches.some((b) => b.from === well.id || b.to === well.id)).toBe(false);
    expect(api.topology.ok).toBe(true);
  });

  it('picking a nominal size fills the bore and leaves it editable', async () => {
    await mount();
    const b = api.inputs.branches[0];
    await act(async () => { api.applySchedule(b.id, 8, '40'); });
    const after = api.inputs.branches.find((x) => x.id === b.id);
    expect(after.idIn).toBe('7.981');
    await act(async () => { api.setBranch(b.id, 'idIn', '7.5'); });
    expect(api.inputs.branches.find((x) => x.id === b.id).idIn).toBe('7.5');
  });
});

describe('the explicit solve', () => {
  it('runs on demand, produces the loss per well, and goes stale', async () => {
    await mount();
    expect(api.result).toBeNull();
    await act(async () => { await api.solve(); });
    expect(api.result.ok).toBe(true);
    expect(api.result.wells).toHaveLength(3);
    api.result.wells.forEach((w) => {
      expect(w.qoAloneStbd).toBeGreaterThan(w.qoStbd);
    });
    expect(api.resultStale).toBe(false);
    await act(async () => { api.setNodeDuty(api.inputs.nodes[0].id, 'wctPct', '35'); });
    expect(api.resultStale).toBe(true);
  }, 120000);

  it('editing the TOPOLOGY throws the answer away rather than leaving a stale one on screen', async () => {
    // A stale number against a network that no longer exists is worse
    // than no number, because the drawing next to it has changed.
    await mount();
    await act(async () => { await api.solve(); });
    expect(api.result).not.toBeNull();
    await act(async () => { api.addWell(); });
    expect(api.result).toBeNull();
  }, 120000);

  it('refuses to solve a network that is not one, and says which problem it is', async () => {
    await mount();
    await act(async () => { api.addJunction(); });
    await act(async () => { await api.solve(); });
    expect(api.result).toBeNull();
    expect(api.notifications.some((n) => /no route to a delivery point/.test(n.message))).toBe(true);
  });
});

describe('the shared well records', () => {
  it('loads fields on mount and wells only once a field is picked', async () => {
    await mount();
    expect(spine.listFields).toHaveBeenCalled();
    expect(spine.listPoWells).not.toHaveBeenCalled();
    await act(async () => { api.patchLink({ fieldId: 'f1' }); });
    expect(spine.listPoWells).toHaveBeenCalledWith('f1');
    expect(api.spineWells).toHaveLength(2);
  });

  it('pulling one well in brings the WHOLE record, not the sections this studio edits', async () => {
    await mount();
    await act(async () => { api.patchLink({ fieldId: 'f1' }); });
    const node = api.inputs.nodes.find((n) => n.kind === 'well');
    await act(async () => { await api.loadWellFromSpine(node.id, 'sw1'); });
    const after = api.inputs.nodes.find((n) => n.id === node.id);
    expect(after.label).toBe('A-1');
    expect(after.spineWellId).toBe('sw1');
    expect(after.model.well.depthFt).toBe('8100');
    expect(after.model.inflow.pr).toBe('2900');
    // The gas coefficients come through even on an oil well, because
    // the record is the record (the P6.5 regression).
    expect(after.model.gasInflow.c).toBe('0.004');
  });

  it('building from a field puts every described well on a header', async () => {
    await mount();
    await act(async () => { api.patchLink({ fieldId: 'f1' }); });
    await act(async () => { await api.buildFromField(); });
    expect(api.inputs.nodes.filter((n) => n.kind === 'well')).toHaveLength(2);
    expect(api.inputs.nodes.map((n) => n.label)).toEqual(
      expect.arrayContaining(['A-1', 'A-2', 'Header', 'Separator']),
    );
    expect(api.inputs.branches).toHaveLength(3);
    expect(api.topology.ok).toBe(true);
  });

  it('a well with no shared record is NAMED, not counted', async () => {
    // A count tells a user something is missing. A name tells them
    // which well to go and open.
    spine.getWellModel.mockImplementation(async (id) => (
      id === 'sw1' ? { id: 'm1', model_data: MODEL_PAYLOAD } : null
    ));
    await mount();
    await act(async () => { api.patchLink({ fieldId: 'f1' }); });
    await act(async () => { await api.buildFromField(); });
    expect(api.inputs.nodes.filter((n) => n.kind === 'well')).toHaveLength(1);
    const msg = api.notifications.map((n) => n.message).join(' ');
    expect(msg).toMatch(/A-2/);
    expect(msg).toMatch(/no shared well record/);
  });

  it('and a field where nothing is described says so instead of building an empty network', async () => {
    spine.getWellModel.mockResolvedValue(null);
    await mount();
    const before = api.inputs.nodes.length;
    await act(async () => { api.patchLink({ fieldId: 'f1' }); });
    await act(async () => { await api.buildFromField(); });
    expect(api.inputs.nodes).toHaveLength(before);
    expect(api.notifications.some((n) => /None of the wells/.test(n.message))).toBe(true);
  });
});

describe('project lifecycle', () => {
  it('saves the network and reopens it', async () => {
    await mount();
    const sink = api.inputs.nodes.find((n) => n.kind === 'sink');
    await act(async () => { api.setNode(sink.id, 'pressurePsia', '240'); });
    await act(async () => { await api.createProject('Field A'); });
    const payload = savedService.save.mock.calls[0][1];
    expect(payload.inputs.nodes.find((n) => n.kind === 'sink').pressurePsia).toBe('240');
    savedService.load.mockResolvedValue(payload);
    await act(async () => { await api.openProject(payload.id); });
    expect(api.inputs.nodes.find((n) => n.kind === 'sink').pressurePsia).toBe('240');
    expect(api.projectName).toBe('Field A');
    expect(api.topology.ok).toBe(true);
  });

  it('a missing table is explained rather than dumped raw', async () => {
    savedService.list.mockRejectedValue({
      code: '42P01', message: 'relation "saved_network_projects" does not exist',
    });
    await mount();
    expect(api.notifications.some((n) => /p11_saved_network_projects migration/.test(n.message)))
      .toBe(true);
  });
});
