// usePendingSave adoption (Guided Journey design 6.4): every studio that had
// the 10 s autosave cancelled on unmount now writes an edit made just before
// leaving. One row per studio: open a new project, edit, leave at once (no
// timers advanced) and the studio's own save must have written the edit.
// A control per studio: open, no edit, leave, and nothing more is written.
import React from 'react';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockSaves = [];
const mockRows = new Map();
jest.mock('@/utils/savedProjects', () => ({
  createSavedProjectsService: (table) => ({
    list: async () => [],
    listRows: async () => [],
    load: async (id) => mockRows.get(id) ?? null,
    loadRow: async (id) => (mockRows.has(id) ? { payload: mockRows.get(id), row: null } : null),
    save: async (id, payload) => {
      mockSaves.push({ table, id, payload: JSON.parse(JSON.stringify(payload)) });
      mockRows.set(id, payload);
      return { success: true };
    },
    remove: async () => ({ success: true }),
  }),
  exportProjectAsJSON: () => '{}',
  importProjectFromJSON: () => null,
}));
jest.mock('@/lib/productionSpine', () => new Proxy({ __esModule: true }, {
  get: (t, k) => (k in t ? t[k] : jest.fn(async () => (/^list/.test(String(k)) ? [] : null))),
}));
jest.mock('@/lib/customSupabaseClient', () => {
  const result = { data: [], error: null };
  const builder = new Proxy({}, {
    get: (t, k) => (k === 'then' ? (res) => Promise.resolve(result).then(res) : () => builder),
  });
  return {
    supabase: {
      from: () => builder,
      rpc: async () => result,
      auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }) },
      storage: { from: () => builder },
    },
  };
});
jest.mock('@/contexts/SupabaseAuthContext', () => ({ useAuth: () => ({ user: null, organization: null, profile: null }) }));
jest.mock('idb-keyval', () => ({ get: async () => undefined, del: async () => undefined, set: async () => undefined }));

const { resetActivity, getActivity } = require('../activity');

const print = (p) => { const { modified: _m, ...rest } = p || {}; return JSON.stringify(rest); };

// The first editable field of a setSection(section, key, value) studio.
function editSection(api) {
  for (const [section, block] of Object.entries(api.inputs || {})) {
    if (!block || typeof block !== 'object' || Array.isArray(block)) continue;
    for (const [key, v] of Object.entries(block)) {
      if (typeof v === 'string' || typeof v === 'number') {
        const next = typeof v === 'number' ? v + 7 : `${v === '7' ? '8' : '7'}`;
        api.setSection(section, key, next);
        return;
      }
    }
  }
  throw new Error('no editable field');
}
const firstKey = (o) => Object.keys(o || {})[0];

const SECTION = (mod, Provider, hook) => ({ mod, Provider, hook, edit: editSection });
const STUDIOS = {
  Choke: SECTION('ChokePerformanceContext', 'ChokePerformanceProvider', 'useChoke'),
  Compressor: SECTION('CompressorStudioContext', 'CompressorStudioProvider', 'useCompressor'),
  Corrosion: SECTION('CorrosionStudioContext', 'CorrosionStudioProvider', 'useCorrosion'),
  'Gas Lift': SECTION('GasLiftDesignContext', 'GasLiftDesignProvider', 'useGasLift'),
  'Lift Advisor': SECTION('LiftAdvisorContext', 'LiftAdvisorProvider', 'useLiftAdvisor'),
  ESP: SECTION('EspDesignContext', 'EspDesignProvider', 'useEsp'),
  'Heat Exchanger': SECTION('HeatExchangerContext', 'HeatExchangerProvider', 'useHeatExchanger'),
  'Flow Assurance': SECTION('FlowAssuranceContext', 'FlowAssuranceProvider', 'useFlowAssurance'),
  'Gas Well': SECTION('GasWellPerformanceContext', 'GasWellPerformanceProvider', 'useGasWell'),
  'Line Sizing': SECTION('LineSizingContext', 'LineSizingProvider', 'useLineSizing'),
  'Gas Processing': SECTION('GasProcessingContext', 'GasProcessingProvider', 'useGasProcessing'),
  Intervention: SECTION('InterventionPlannerContext', 'InterventionPlannerProvider', 'useIntervention'),
  Pump: SECTION('PumpStudioContext', 'PumpStudioProvider', 'usePump'),
  Meter: SECTION('MeterStudioContext', 'MeterStudioProvider', 'useMeter'),
  'Produced Water': SECTION('ProducedWaterContext', 'ProducedWaterProvider', 'useProducedWater'),
  Separator: SECTION('SeparatorStudioContext', 'SeparatorStudioProvider', 'useSeparator'),
  Relief: SECTION('ReliefStudioContext', 'ReliefStudioProvider', 'useRelief'),
  Valve: SECTION('ValveStudioContext', 'ValveStudioProvider', 'useValve'),
  Tank: SECTION('TankStudioContext', 'TankStudioProvider', 'useTank'),
  'Rod Pump': SECTION('RodPumpDesignContext', 'RodPumpDesignProvider', 'useRodPump'),
  Allocation: { mod: 'ProductionAllocationContext', Provider: 'ProductionAllocationProvider', hook: 'useAllocation',
    edit: (api) => { const k = firstKey(api.inputs.settings); api.setSettingsField(k, `${api.inputs.settings[k]}7`); } },
  'Production Surveillance': { mod: 'ProductionSurveillanceContext', Provider: 'ProductionSurveillanceProvider', hook: 'useSurveillance',
    edit: (api) => { const k = firstKey(api.inputs.settings); api.setSettingsField(k, `${api.inputs.settings[k]}7`); } },
  Network: { mod: 'ProductionNetworkContext', Provider: 'ProductionNetworkProvider', hook: 'useProductionNetwork',
    edit: (api) => api.addJunction() },
  Nodal: { mod: 'NodalAnalysisStudioContext', Provider: 'NodalAnalysisStudioProvider', hook: 'useNodalStudio',
    edit: (api) => api.setWellField(firstKey(api.well), '7777') },
  EOR: { mod: 'EorScreeningContext', Provider: 'EorScreeningProvider', hook: 'useEorScreening',
    edit: (api) => api.setFormField('gravityApi', '31.7') },
  'Well Spacing': { mod: 'WellSpacingContext', Provider: 'WellSpacingProvider', hook: 'useWellSpacing',
    edit: (api) => api.setFormField(firstKey(api.inputs.form), '777') },
  VRR: { mod: 'VrrMonitorContext', Provider: 'VrrMonitorProvider', hook: 'useVrrMonitor',
    edit: (api) => api.addPeriod() },
  RF: { mod: 'RfEstimatorContext', Provider: 'RfEstimatorProvider', hook: 'useRfEstimator',
    edit: (api) => api.setIdentificationField('field', 'Smoke field') },
  Waterflood: { mod: 'WaterfloodDesignContext', Provider: 'WaterfloodDesignProvider', hook: 'useWaterfloodDesign',
    edit: (api) => api.setIdentificationField('field', 'Smoke field') },
  DCA: { mod: 'DeclineCurveContext', Provider: 'DeclineCurveProvider', hook: 'useDeclineCurve',
    edit: (api) => api.addWell('Smoke well') },
  'Well Test': { mod: 'WellTestStudioContext', Provider: 'WellTestStudioProvider', hook: 'useWellTestStudio',
    edit: (api) => api.setWellName('Smoke well') },
};

jest.setTimeout(30000);
let errSpy;
beforeEach(() => {
  mockSaves.length = 0;
  mockRows.clear();
  resetActivity();
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errSpy.mockRestore());

async function mount(row) {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const m = require(`@/contexts/${row.mod}`);
  const Provider = m[row.Provider];
  const useApi = m[row.hook];
  if (!Provider || !useApi) throw new Error(`${row.mod}: ${row.Provider} / ${row.hook} not exported`);
  const ref = {};
  const Probe = () => { ref.api = useApi(); return null; };
  let view;
  await act(async () => {
    view = render(<MemoryRouter><Provider><Probe /></Provider></MemoryRouter>);
  });
  await act(async () => { await ref.api.createProject('Smoke'); });
  await act(async () => { await Promise.resolve(); });
  return { ref, view };
}

const settle = async () => { for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); }); };

describe.each(Object.entries(STUDIOS))('%s', (name, row) => {
  test('an edit followed by leaving at once is written by the studio save', async () => {
    const { ref, view } = await mount(row);
    const id = ref.api.currentProjectId;
    expect(id).toBeTruthy();
    const before = mockSaves.length;
    const createdPrint = print(mockRows.get(id));
    await act(async () => { row.edit(ref.api); });
    expect(ref.api.dirty).toBe(true);
    expect(getActivity().some((i) => i.kind === 'unsaved')).toBe(true);
    view.unmount();
    await settle();
    const after = mockSaves.slice(before).filter((s) => s.id === id);
    expect(after.length).toBe(1);
    expect(print(after[0].payload)).not.toBe(createdPrint);
    expect(getActivity()).toEqual([]);
  });

  test('no edit: leaving writes nothing more', async () => {
    const { ref, view } = await mount(row);
    expect(ref.api.dirty).toBe(false);
    const before = mockSaves.length;
    view.unmount();
    await settle();
    expect(mockSaves.length).toBe(before);
  });
});
