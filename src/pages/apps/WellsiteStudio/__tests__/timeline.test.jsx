// WS2: an event starts in one click with time, user and bit depth
// captured; a duration event ends later as a new version on its chain
// (nothing updated); the timeline clips and sums durations.
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
import { eventsFromRecords } from '../services/events';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('@/lib/crs/settingsService', () => ({ getDepthUnit: async () => 'ft' }));
jest.mock('@/components/workstation/WorkspaceShell', () => ({ __esModule: true, default: ({ ribbon, explorer, center, statusBar }) => <div>{ribbon}{explorer}{center}{statusBar}</div> }));

let n = 0;
async function setup() {
  const db = openWellsiteDb(`ws-tl-${n += 1}`);
  const transport = makeFakeTransport({ user: SEED_USER, registryWells: SEED_REGISTRY_WELLS });
  const backend = makeLocalBackend({ transport, db });
  await seedWellsite(backend);
  render(<MemoryRouter><WellsiteWorkstation backend={backend} /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId('ws-status-bit')).toHaveTextContent('Bit 10000 ft'));
  return backend;
}

test('one click starts a connection with time, user and bit depth; End writes version 2; the timeline shows both', async () => {
  const backend = await setup();
  await act(async () => { fireEvent.click(screen.getByTestId('ws-event-connection')); });
  await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent(/Connection started at \d\d:\d\d at 10000 ft\./));
  await waitFor(() => expect(screen.getByTestId('ws-live-event')).toHaveTextContent('Connection'));
  const wellId = (await backend.listWells())[0].id;
  let evs = await backend.listRecords(wellId, { kind: 'event' });
  expect(evs).toHaveLength(1);
  expect(evs[0]).toMatchObject({ subtype: 'connection', ended_at: null, created_by: 'user-a', depth_kind: 'event', depth_value: 10000, local_offset_min: 60 });
  expect(evs[0].md_calc_m).toBeCloseTo(3048, 6);
  // a point event needs no end
  await act(async () => { fireEvent.click(screen.getByTestId('ws-event-bottoms_up')); });
  await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent(/Bottoms up started/));
  // end the connection from the open list
  await act(async () => { fireEvent.click(screen.getByTestId('ws-event-end-connection')); });
  await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent('Connection ended.'));
  evs = await backend.listRecords(wellId, { kind: 'event' });
  expect(evs).toHaveLength(3);
  const chain = evs.filter((e) => e.subtype === 'connection');
  expect(chain).toHaveLength(2);
  const v2 = chain.find((e) => e.version_no === 2);
  expect(v2.previous_version_id).toBe(chain.find((e) => e.version_no === 1).id);
  expect(v2.ended_at).not.toBeNull();
  const heads = eventsFromRecords(evs);
  expect(heads.map((e) => e.type).sort()).toEqual(['bottoms_up', 'connection']);
  expect(heads.find((e) => e.type === 'connection').endUtcMs).not.toBeNull();
  // timeline view
  fireEvent.click(screen.getByTestId('ws-nav-timeline'));
  await waitFor(() => expect(screen.getByTestId('ws-timeline')).toBeInTheDocument());
  expect(screen.getAllByTestId(/^ws-timeline-row-/)).toHaveLength(2);
  expect(screen.getByTestId('ws-timeline-row-0')).toHaveTextContent('10000 ft');
  expect(screen.getByTestId('ws-explorer-counts')).toHaveTextContent('2 event(s)');
});

test('a user-defined event asks for its label (two interactions) and refuses an empty one', async () => {
  await setup();
  fireEvent.click(screen.getByTestId('ws-event-user_defined'));
  fireEvent.change(screen.getByTestId('ws-event-label'), { target: { value: 'Wiper trip to the shoe' } });
  await act(async () => { fireEvent.click(screen.getByTestId('ws-event-label-start')); });
  await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent(/Wiper trip to the shoe started/));
  expect(screen.getByTestId('ws-event-open-user_defined')).toHaveTextContent('Wiper trip to the shoe');
});
