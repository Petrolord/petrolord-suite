/**
 * "Re-run prospect" (Risked Reserves Valuation U2-006): what ReservoirCalc
 * Pro can open for a prospect, and why not. Pure.
 */
import { rerunPlan, safeReturnPath, returnHref, replacing } from '../services/prospectRerun';

const source = { schema: 'rcp-source-1', projectId: 'proj-1', projectName: 'Ekene Block', reservoirId: 'r-d07', reservoirName: 'D-07 sand', volumesFrom: 'monte-carlo', run: { seed: 123, iterations: 10000 } };
const prospect = { id: 'pr-1', user_id: 'me', name: 'Ekene North', inputs: { mean: 38, unit: 'MMbbl', basis: 'recoverable', source } };
const project = { id: 'proj-1', user_id: 'me', name: 'Ekene Block', reservoirs: [{ id: 'r-d07', name: 'D-07 sand' }, { id: 'r-e02', name: 'E-02 sand' }] };

test('ready: the project, the reservoir, the seed and the realizations of the run behind the prospect', () => {
  const plan = rerunPlan({ prospect, own: true, projects: [project], userId: 'me' });
  expect(plan).toMatchObject({ state: 'ready', readOnly: false, project, reservoirId: 'r-d07', reservoirName: 'D-07 sand', seed: 123, iterations: 10000 });
  expect(plan.message).toBe('Opened project "Ekene Block", reservoir "D-07 sand". The run behind "Ekene North" used seed 123 and 10,000 realizations: both are set in the Probabilistic panel, so the same inputs give the same volumes and a changed input shows as a change.');
});

test('a colleague\'s shared prospect opens read-only with the reason; a colleague\'s project says so', () => {
  const plan = rerunPlan({ prospect: { ...prospect, user_id: 'ada' }, own: false, projects: [{ ...project, user_id: 'ada' }], userId: 'me' });
  expect(plan.state).toBe('ready');
  expect(plan.readOnly).toBe(true);
  expect(plan.readOnlyReason).toMatch(/^This prospect belongs to a colleague and is shared with you for viewing, so it opens read-only/);
  expect(plan.message).toMatch(/The project is a colleague's: it opens as they shared it/);
});

test('what cannot be opened says why', () => {
  expect(rerunPlan({ prospect: null, own: false }).state).toBe('missing');
  expect(rerunPlan({ prospect: { ...prospect, inputs: { mean: 38 } }, own: true }).message).toMatch(/saved before ReservoirCalc Pro recorded the project and run behind it/);
  expect(rerunPlan({ prospect: { ...prospect, inputs: { ...prospect.inputs, source: { ...source, volumesFrom: 'entered' } } }, own: true }).state).toBe('typed');
  const gone = rerunPlan({ prospect, own: true, projects: [], userId: 'me' });
  expect(gone).toMatchObject({ state: 'project-missing' });
  expect(gone.message).toMatch(/The project behind "Ekene North" \("Ekene Block"\) is not on your account/);
  // the reservoir was removed since: the project still opens, and that is said
  const noRes = rerunPlan({ prospect, own: true, projects: [{ ...project, reservoirs: [{ id: 'r-x', name: 'X' }] }], userId: 'me' });
  expect(noRes).toMatchObject({ state: 'ready', reservoirId: null });
  expect(noRes.message).toMatch(/reservoir "D-07 sand" is not in this project now/);
  // no seed recorded
  expect(rerunPlan({ prospect: { ...prospect, inputs: { ...prospect.inputs, source: { ...source, run: null } } }, own: true, projects: [project] }).message).toMatch(/recorded no seed/);
});

test('the return link goes back inside the app only, and names the record to refresh', () => {
  expect(returnHref('/dev/risked-reserves', 'pr-1')).toBe('/dev/risked-reserves?refresh=pr-1');
  expect(safeReturnPath('https://evil.example/x')).toBe('/dashboard/apps/reservoir/risked-reserves-valuation');
  expect(safeReturnPath('//evil.example')).toBe('/dashboard/apps/reservoir/risked-reserves-valuation');
  expect(safeReturnPath('/dashboard/apps/reservoir/risked-reserves-valuation')).toBe('/dashboard/apps/reservoir/risked-reserves-valuation');
  expect(safeReturnPath(null)).toBe('/dashboard/apps/reservoir/risked-reserves-valuation');
  expect(replacing(source, 'pr-1')).toEqual({ ...source, replaces: 'pr-1' });
});
