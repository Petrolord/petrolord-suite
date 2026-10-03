/**
 * "Re-run prospect" in ReservoirCalc Pro (Risked Reserves Valuation U2-006):
 * the link from a valuation opens the prospect's project and reservoir, sets
 * the recorded seed and realizations, fills in Prospect Risking, adds the
 * re-run as a new record that names the old one, retires the old one, and
 * links back. A colleague's shared prospect opens read-only with the reason.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { configure } from '@testing-library/react';

// the pages read in-memory stores asynchronously; on a loaded machine the
// default one second for a findable element is too short
configure({ asyncUtilTimeout: 15000 });
import { ReservoirCalcProvider, useReservoirCalc } from '../contexts/ReservoirCalcContext';
import { makeInMemoryRcpBackend } from '../services/rcpBackend';
import { RERUN_PROJECT_ROW } from '../services/savedFixtures';
import RerunProspectBar from '../components/RerunProspectBar';
import ProspectRiskingPanel from '../components/tools/ProspectRiskingPanel';
import { RRV_SEED_PROSPECTS } from '../../riskedreserves/services/rrvFixtures';
import { upstreamState, fromRcpProspect } from '../../riskedreserves/services/rrvStore';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: { from: () => ({}), auth: { getUser: async () => ({ data: { user: null } }) } } }));
jest.mock('@/components/ui/use-toast', () => { const toast = jest.fn(); return { useToast: () => ({ toast }), toast }; });

function Probe({ onRisking }) {
  const { state, backend, rerun } = useReservoirCalc();
  return (
    <div>
      <span data-testid="probe-project">{state.project?.name || ''}</span>
      <span data-testid="probe-reservoir">{state.activeReservoirId || ''}</span>
      <span data-testid="probe-method">{state.calcMethod}</span>
      <span data-testid="probe-seed">{rerun?.seed ?? ''}</span>
      {onRisking && <ProspectRiskingPanel backend={backend.prospects} unrisked={{ mean: 41, p90: 14, p50: 34, p10: 80, unit: 'MMbbl', basis: 'recoverable' }} source={{ schema: 'rcp-source-1', projectId: 'project-ekene', reservoirId: 'r-d07', run: { seed: 123, iterations: 10000 } }} rerun={rerun} />}
    </div>
  );
}

const mount = (url, backend) => render(
  <MemoryRouter initialEntries={[url]}>
    <ReservoirCalcProvider backend={backend}>
      <RerunProspectBar onOpenRisking={() => {}} />
      <Probe onRisking />
    </ReservoirCalcProvider>
  </MemoryRouter>,
);
const text = (id) => screen.getByTestId(id).textContent;
const harness = (o = {}) => makeInMemoryRcpBackend({ savedRows: [RERUN_PROJECT_ROW], prospects: RRV_SEED_PROSPECTS, ...o });

test('the link opens the project and the reservoir, sets the seed, and fills in Prospect Risking', async () => {
  mount('/rcp?rerunProspect=prospect-1&returnTo=/dev/risked-reserves', harness());
  await waitFor(() => expect(screen.getByTestId('rcp-rerun')).toHaveAttribute('data-state', 'ready'));
  expect(text('rcp-rerun')).toMatch(/Re-run prospect "Ekene North", from Risked Reserves Valuation/);
  expect(text('rcp-rerun-message')).toBe('Opened project "Ekene Block", reservoir "D-07 sand". The run behind "Ekene North" used seed 123 and 10,000 realizations: both are set in the Probabilistic panel, so the same inputs give the same volumes and a changed input shows as a change.');
  await waitFor(() => expect(text('probe-project')).toBe('Ekene Block'));
  await waitFor(() => expect(text('probe-reservoir')).toBe('r-d07')); // the project saved E-02 as active
  expect(text('probe-method')).toBe('probabilistic');
  expect(text('probe-seed')).toBe('123');
  expect(screen.getByTestId('rcp-rerun')).toHaveAttribute('data-read-only', 'false');
  expect(screen.getByTestId('rcp-rerun-return')).toHaveAttribute('href', '/dev/risked-reserves?refresh=prospect-1');
  await waitFor(() => expect(screen.getByTestId('prospect-name')).toHaveValue('Ekene North'));
  expect(text('pgv-charge')).toBe('50.0%');
  expect(text('prospect-rerun-note')).toMatch(/Add to inventory saves the new record and retires the old one/);
});

test('adding the re-run saves a new record that names the old one, retires the old one, and the valuation follows it', async () => {
  const backend = harness();
  mount('/rcp?rerunProspect=prospect-1&returnTo=/dev/risked-reserves', backend);
  await waitFor(() => expect(screen.getByTestId('prospect-name')).toHaveValue('Ekene North'));
  const before = (await backend.prospects.listProspects()).find((r) => r.id === 'prospect-1');
  fireEvent.click(screen.getByTestId('prospect-add'));
  await waitFor(() => expect(text('prospect-status')).toMatch(/Added Ekene North to the inventory\. The record it replaces was retired, so the valuation follows the new one\./));
  const rows = await backend.prospects.listProspects();
  expect(rows.some((r) => r.id === 'prospect-1')).toBe(false);
  const fresh = rows.find((r) => r.name === 'Ekene North');
  expect(fresh.inputs.source).toMatchObject({ replaces: 'prospect-1', projectId: 'project-ekene' });
  expect(fresh.inputs.mean).toBe(41);
  expect(screen.getByTestId('prospect-return-link')).toHaveAttribute('href', '/dev/risked-reserves?refresh=prospect-1');
  // what the valuation sees: the re-run, with what moved
  const valuation = fromRcpProspect(before);
  const up = upstreamState(valuation, rows);
  expect(up).toMatchObject({ state: 'replaced', rerun: true });
  expect(up.row.id).toBe(fresh.id);
  expect(up.changes.map((c) => c.key)).toEqual(expect.arrayContaining(['p90', 'p50', 'p10']));
});

test('a colleague\'s shared prospect opens read-only with the reason, and nothing of theirs is retired', async () => {
  const backend = harness({ sharedRows: true });
  mount('/rcp?rerunProspect=prospect-shared', backend);
  await waitFor(() => expect(screen.getByTestId('rcp-rerun')).toHaveAttribute('data-read-only', 'true'));
  expect(text('rcp-rerun-readonly')).toMatch(/^This prospect belongs to a colleague and is shared with you for viewing, so it opens read-only/);
  // saved before the source was recorded: said, and Prospect Risking still offers the user's own version
  expect(screen.getByTestId('rcp-rerun')).toHaveAttribute('data-state', 'no-source');
  expect(text('rcp-rerun-message')).toMatch(/was saved before ReservoirCalc Pro recorded the project and run behind it/);
  await waitFor(() => expect(screen.getByTestId('prospect-name')).toHaveValue('Ada Deep (shared)'));
  expect(text('prospect-rerun-note')).toMatch(/belongs to a colleague: adding saves your own version, and theirs is left as it is/);
  fireEvent.click(screen.getByTestId('prospect-add'));
  await waitFor(() => expect(text('prospect-status')).toMatch(/^Added Ada Deep \(shared\) to the inventory\.$/));
  expect((await backend.prospects.listSharedProspects()).some((r) => r.id === 'prospect-shared')).toBe(true);
  expect((await backend.prospects.listProspects()).find((r) => r.name === 'Ada Deep (shared)').inputs.source?.replaces).toBeUndefined();
});

test('a prospect that is gone, and a return path that leaves the app, are refused', async () => {
  mount('/rcp?rerunProspect=nope&returnTo=https://evil.example', harness());
  await waitFor(() => expect(screen.getByTestId('rcp-rerun')).toHaveAttribute('data-state', 'missing'));
  expect(text('rcp-rerun-message')).toMatch(/not in your inventory and is not shared with you/);
  expect(screen.queryByTestId('rcp-rerun-return')).toBeNull();
  // and closing the bar clears the re-run
  fireEvent.click(screen.getByTestId('rcp-rerun-close'));
  expect(screen.queryByTestId('rcp-rerun')).toBeNull();
});

test('no link, no bar', () => {
  mount('/rcp', harness());
  expect(screen.queryByTestId('rcp-rerun')).toBeNull();
});
