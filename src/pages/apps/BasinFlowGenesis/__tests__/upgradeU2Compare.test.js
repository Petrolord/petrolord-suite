/**
 * U2-008 (BF-U1-030): the scenario comparison the Scenario Manager claimed.
 * Two scenarios run from different heat flows are put side by side; the
 * rows that differ are marked; a scenario whose stored result belongs to
 * other inputs shows no numbers and says why.
 */
import { SimulationEngine } from '../services/SimulationEngine';
import { compareScenarios, compareProfiles, scenarioResultState } from '../services/scenarioCompare';
import { referenceBasinRow } from '../services/backend';
import { engineInputsKey } from '../services/honesty';
import { stampRun } from '../contexts/BasinFlowContext';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

const base = () => { const r = referenceBasinRow(); return { stratigraphy: r.stratigraphy, heatFlow: r.heat_flow, erosionEvents: r.erosion_events, settings: r.settings }; };
const scenario = async (id, name, inputs) => ({ id, name, ...inputs, results: stampRun(await SimulationEngine.run(inputs), inputs) });

let hot; let cold;
beforeAll(async () => {
  hot = await scenario('s-hot', 'Hot', { ...base(), heatFlow: { type: 'constant', value: 75 } });
  cold = await scenario('s-cold', 'Cold', { ...base(), heatFlow: { type: 'constant', value: 50 } });
}, 240000);

test('the inputs that differ are marked and each scenario shows its own result', () => {
  const { columns, rows } = compareScenarios([hot, cold], { depth: 'm', temp: 'C' });
  expect(columns.map((c) => c.name)).toEqual(['Hot', 'Cold']);
  expect(columns.every((c) => c.state.ok && !c.state.unverified)).toBe(true);
  const row = (k) => rows.find((r) => r.key === k);
  expect(row('hf')).toMatchObject({ values: ['75', '50'], differs: true });
  expect(row('ero').differs).toBe(false);
  const ro = row('ro-source_shale');
  expect(ro.label).toBe('Source Shale');
  const [rh, rc] = ro.values.map(Number);
  expect(rh).toBeGreaterThan(rc);
  // the numbers are the scenarios' own present day
  const src = hot.results.meta.layers.findIndex((l) => l.id === 'source_shale');
  expect(rh).toBeCloseTo(hot.results.data.maturity[src].slice(-1)[0].value, 2);
  expect(row('tr').values[0]).toMatch(/%$/);
  expect(compareProfiles([hot, cold])[0].points.length).toBeGreaterThan(5);
});

test('a stored result from other inputs, or none, is said and not shown', () => {
  const edited = { ...hot, id: 's-edit', name: 'Edited', heatFlow: { type: 'constant', value: 90 } };
  expect(scenarioResultState(edited).ok).toBe(false);
  const empty = { ...cold, id: 's-none', name: 'None', results: null };
  const { columns, rows } = compareScenarios([edited, empty]);
  expect(columns[0].state.text).toMatch(/other inputs/);
  expect(columns[1].state.text).toMatch(/No result/);
  expect(rows.find((r) => r.key === 'cm').values).toEqual(['n/a', 'n/a']);
  // saved before results carried their inputs: shown, and said
  const legacy = { ...cold, results: { ...cold.results, runOf: undefined } };
  expect(scenarioResultState(legacy)).toMatchObject({ ok: true, unverified: true });
  expect(engineInputsKey(cold)).toBe(cold.results.runOf.key);
});
