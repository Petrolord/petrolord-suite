// WS3 on the seeded well: the schedule reaches ahead of the bit from the
// authorised programme, catch confirmation records a stage, a mandatory
// stage cannot be skipped, the lag panel reads the golden lag, and a
// pump shutdown makes the lag time undefined.
import 'fake-indexeddb/auto';
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WellsiteWorkstation from '../components/WellsiteWorkstation';
import { openWellsiteDb } from '@/lib/wellsite/db';
import { makeLocalBackend } from '../services/localBackend';
import { makeFakeTransport } from '../services/transports/fakeTransport';
import { seedWellsite, SEED_REGISTRY_WELLS, SEED_USER } from '../services/seed';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('@/lib/crs/settingsService', () => ({ getDepthUnit: async () => 'ft' }));
jest.mock('@/components/workstation/WorkspaceShell', () => ({ __esModule: true, default: ({ ribbon, explorer, center, dock, statusBar }) => <div>{ribbon}{explorer}{center}{dock}{statusBar}</div> }));

let n = 0;
async function setup() {
  const db = openWellsiteDb(`ws-sv-${n += 1}`);
  const transport = makeFakeTransport({ user: SEED_USER, registryWells: SEED_REGISTRY_WELLS });
  const backend = makeLocalBackend({ transport, db });
  await seedWellsite(backend);
  render(<MemoryRouter><WellsiteWorkstation backend={backend} /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId('ws-status-bit')).toHaveTextContent('Bit 10000 ft'));
  return backend;
}

test('the schedule reaches three samples ahead of the bit; catch and stages; the lag panel and a shutdown', async () => {
  const backend = await setup();
  await waitFor(() => expect(screen.getByTestId('ws-status-lag-strokes')).toHaveTextContent(/Lag \d+ stk/));
  // seeded: 13.375 in casing to 3000 ft, 12.25 in hole, 600 ft of 8 in collars: the G4 volume at 10,000 ft
  expect(screen.getByTestId('ws-lag-strokes')).toHaveTextContent('11783 stk');
  expect(screen.getByTestId('ws-lag-spm')).toHaveTextContent('60 spm');
  expect(screen.getByTestId('ws-lag-time')).toHaveTextContent('3 h 16 min');
  fireEvent.click(screen.getByTestId('ws-nav-samples'));
  await waitFor(() => expect(screen.getByTestId('ws-samples-summary')).toHaveTextContent('23 scheduled'));
  expect(screen.getByTestId('ws-programme-version')).toHaveTextContent('version 1, authorised by Operations geologist');
  // samples 9810 .. 10030 ft: the ones at or above the bit are cut, the three beyond are scheduled;
  // sample 1 (9810 ft, cut four hours ago) is past its arrival by more than the tolerance
  expect(screen.getByTestId('ws-sample-row-23')).toHaveAttribute('data-state', 'scheduled');
  expect(screen.getByTestId('ws-sample-row-10')).toHaveAttribute('data-state', 'in_transit');
  expect(screen.getByTestId('ws-sample-row-1')).toHaveAttribute('data-state', 'overdue');
  expect(screen.getByTestId('ws-sample-state-1')).toHaveTextContent(/overdue for review \(\d+ min past arrival\)/);
  // catch sample 1, then described must wait for nothing but bagged needs described
  await act(async () => { fireEvent.click(screen.getByTestId('ws-sample-caught-1')); });
  await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent(/Sample 1 caught at \d\d:\d\d\./));
  expect(screen.getByTestId('ws-sample-state-1')).toHaveTextContent('caught');
  expect(screen.queryByTestId('ws-sample-bagged-1')).toBeNull();
  const wellId = (await backend.listWells())[0].id;
  const s1 = (await backend.listSamples(wellId)).find((s) => s.sample_no === 1);
  await expect(backend.addStage(wellId, s1.id, 'bagged')).rejects.toThrow('Stage bagged needs the mandatory stage described first.');
  await act(async () => { fireEvent.click(screen.getByTestId('ws-sample-described-1')); });
  await waitFor(() => expect(screen.getByTestId('ws-sample-bagged-1')).toBeInTheDocument());
  // never "missed"
  expect(document.body.textContent).not.toMatch(/missed/i);
  // the programme change needs an authoriser
  fireEvent.click(screen.getByTestId('ws-programme-edit'));
  fireEvent.change(screen.getByTestId('ws-programme-cell-0-interval'), { target: { value: '5' } });
  await act(async () => { fireEvent.click(screen.getByTestId('ws-programme-save')); });
  expect(screen.getByTestId('ws-status')).toHaveTextContent(/authorised/);
  fireEvent.change(screen.getByTestId('ws-programme-authoriser'), { target: { value: 'Ops geologist' } });
  await act(async () => { fireEvent.click(screen.getByTestId('ws-programme-save')); });
  await waitFor(() => expect(screen.getByTestId('ws-programme-version')).toHaveTextContent('version 2, authorised by Ops geologist'));
  await waitFor(() => expect(screen.getByTestId('ws-samples-summary')).toHaveTextContent(/4\d scheduled/));
  // pumps off: lag time undefined, arrivals wait
  await act(async () => { fireEvent.click(screen.getByTestId('ws-lag-pump-off')); });
  await waitFor(() => expect(screen.getByTestId('ws-lag-spm')).toHaveTextContent('off'));
  expect(screen.getByTestId('ws-lag-time')).toHaveTextContent('undefined');
  expect(screen.getByTestId('ws-lag-note')).toHaveTextContent('Pumps are off, lag time is undefined until circulation restarts.');
}, 60000);

test('describing from a sample fills its interval and records the described stage', async () => {
  const backend = await setup();
  fireEvent.click(screen.getByTestId('ws-nav-samples'));
  await waitFor(() => expect(screen.getByTestId('ws-sample-caught-2')).toBeInTheDocument());
  await act(async () => { fireEvent.click(screen.getByTestId('ws-sample-caught-2')); });
  await waitFor(() => expect(screen.getByTestId('ws-sample-describe-2')).toBeInTheDocument());
  fireEvent.click(screen.getByTestId('ws-sample-describe-2'));
  await waitFor(() => expect(screen.getByTestId('ws-desc-sample')).toHaveTextContent('sample 2'));
  expect(screen.getByTestId('ws-desc-top-value')).toHaveValue(9810);
  expect(screen.getByTestId('ws-desc-base-value')).toHaveValue(9820);
  const type = (id, text) => { const el = screen.getByTestId(id); fireEvent.change(el, { target: { value: text } }); fireEvent.blur(el); };
  type('ws-desc-comp-0-lithology', 'sh'); type('ws-desc-comp-0-percent', '100');
  await act(async () => { fireEvent.click(screen.getByTestId('ws-desc-save')); });
  await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent('sample 2 described.'));
  const wellId = (await backend.listWells())[0].id;
  const s2 = (await backend.listSamples(wellId)).find((s) => s.sample_no === 2);
  const st = (await backend.listStages(wellId)).filter((x) => x.sample_id === s2.id).map((x) => x.stage);
  expect(st).toEqual(['caught', 'described']);
  const d = (await backend.listRecords(wellId, { subtype: 'cuttings_description' }))[0];
  expect(d.sample_id).toBe(s2.id);
}, 60000);
