// Slow-machine races in the Wellsite workstation (PR #830 CI, 2026-09-30):
// (1) a new prognosis version arriving after the user has already changed
// the offset chooser must not wipe their choice; (2) overlapping data
// refreshes must not let an older, slower read overwrite a newer one.
// Both tests slow the backend on purpose; both fail on the code before the fix.
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
jest.mock('@/components/workstation/WorkspaceShell', () => ({ __esModule: true, default: ({ ribbon, explorer, center, statusBar }) => <div>{ribbon}{explorer}{center}{statusBar}</div> }));
jest.setTimeout(30000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
async function seeded() {
  const db = openWellsiteDb(`ws-race-${n += 1}`);
  const transport = makeFakeTransport({ user: SEED_USER, registryWells: SEED_REGISTRY_WELLS });
  const backend = makeLocalBackend({ transport, db, autoSync: false });
  const well = await seedWellsite(backend);
  render(<MemoryRouter><WellsiteWorkstation backend={backend} /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId('ws-status-bit')).toHaveTextContent('Bit 10000 ft'));
  return { backend, well };
}

test('a choice made while the new prognosis version is still arriving is kept and used', async () => {
  const { backend, well } = await seeded();
  fireEvent.click(screen.getByTestId('ws-nav-tops'));
  await waitFor(() => expect(screen.getByTestId('ws-prognosis-offsets-summary')).toHaveTextContent('Offset wells (1 chosen)'));
  fireEvent.click(screen.getByTestId('ws-prognosis-offset-KETA-1'));
  await waitFor(() => expect(screen.getByTestId('ws-prognosis-offsets-summary')).toHaveTextContent('Offset wells (0 chosen)'));
  // from now on the refreshed prognosis list arrives late, as on a slow runner
  const real = backend.listPrognosis.bind(backend);
  backend.listPrognosis = async (...a) => { const r = await real(...a); await sleep(400); return r; };
  await act(async () => { fireEvent.click(screen.getByTestId('ws-prognosis-load')); });
  await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent(/Prognosis version \d+ loaded: .*, 0 offset top\(s\)/));
  // the user picks KETA-1 again before the new version (with no offsets) reaches the view
  fireEvent.click(screen.getByTestId('ws-prognosis-offset-KETA-1'));
  expect(screen.getByTestId('ws-prognosis-offsets-summary')).toHaveTextContent('Offset wells (1 chosen)');
  await act(async () => { await sleep(900); });
  expect(screen.getByTestId('ws-prognosis-offsets-summary')).toHaveTextContent('Offset wells (1 chosen)');
  await act(async () => { fireEvent.click(screen.getByTestId('ws-prognosis-load')); });
  await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent(/, 2 offset top\(s\)/));
  const last = (await real(well.id)).sort((a, b) => b.version - a.version)[0];
  expect(last.source.offset_well_ids).toEqual(['geo-keta-1']);
});

test('an older, slower refresh never overwrites a newer one', async () => {
  const { backend } = await seeded();
  fireEvent.click(screen.getByTestId('ws-nav-observations'));
  await waitFor(() => expect(screen.getByTestId('ws-observations')).toBeInTheDocument());
  // the first refresh after the first save is slow; the second is fast
  const real = backend.listRecords.bind(backend);
  let slowOnce = true;
  backend.listRecords = async (...a) => {
    if (slowOnce && a[1]?.subtype === 'bit_depth') { slowOnce = false; const r = await Promise.all([real(...a), sleep(600)]); return r[0]; }
    return real(...a);
  };
  fireEvent.change(screen.getByTestId('ws-obs-depth-mode'), { target: { value: 'bit' } });
  fireEvent.change(screen.getByTestId('ws-obs-value'), { target: { value: '2.4' } });
  await act(async () => { fireEvent.click(screen.getByTestId('ws-obs-save')); });
  await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent('Total gas 2.4 %'));
  fireEvent.click(screen.getByTestId('ws-obs-type-note'));
  fireEvent.change(screen.getByTestId('ws-obs-text'), { target: { value: 'Sand stringers' } });
  await act(async () => { fireEvent.click(screen.getByTestId('ws-obs-save')); });
  await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent('Geological note: Sand stringers recorded'));
  await act(async () => { await sleep(1200); });
  expect(screen.getAllByTestId(/^ws-obs-row-/)).toHaveLength(2);
});
