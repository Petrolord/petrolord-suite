// WS4 on the seeded well: a show's quality is derived from controlled
// values and never typed; an observation carries its type, unit, source
// and the depth it refers to; a photo is attached once with its depth,
// user and times and appears in the grid (derive mocked: jsdom has no
// canvas), advancing the sample to photographed when the chain allows.
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
jest.mock('@/lib/wellsite/photos/derive', () => ({
  derivePhotoVariants: async (file, { keepOriginal }) => ({
    thumb: { blob: new Blob(['t']), width: 320, height: 240, bytes: 1 }, working: { blob: new Blob(['w']), width: 2048, height: 1536, bytes: 1 },
    original: keepOriginal ? { blob: file, width: 4000, height: 3000, bytes: file.size, contentType: file.type } : null, width: 4000, height: 3000, sha256: 'abc', contentType: 'image/webp',
  }),
}));
if (typeof URL.createObjectURL !== 'function') URL.createObjectURL = () => 'blob:mock';

let n = 0;
async function setup() {
  const db = openWellsiteDb(`ws-sp-${n += 1}`);
  const transport = makeFakeTransport({ user: SEED_USER, registryWells: SEED_REGISTRY_WELLS });
  const backend = makeLocalBackend({ transport, db, autoSync: false });
  await seedWellsite(backend);
  render(<MemoryRouter><WellsiteWorkstation backend={backend} /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId('ws-status-bit')).toHaveTextContent('Bit 10000 ft'));
  return backend;
}

test('a show on a sample: derived quality, controlled values, stored on the sample depth', async () => {
  const backend = await setup();
  fireEvent.click(screen.getByTestId('ws-nav-shows'));
  await waitFor(() => expect(screen.getByTestId('ws-shows')).toBeInTheDocument());
  expect(screen.getByTestId('ws-show-summary')).toHaveTextContent('No hydrocarbon indicators observed.');
  const wellId = (await backend.listWells())[0].id;
  const s20 = (await backend.listSamples(wellId)).find((s) => s.sample_no === 20);
  await waitFor(() => expect(screen.getByTestId('ws-show-sample').querySelector(`option[value="${s20.id}"]`)).not.toBeNull());
  fireEvent.change(screen.getByTestId('ws-show-sample'), { target: { value: s20.id } });
  fireEvent.change(screen.getByTestId('ws-show-fluorescence-colour'), { target: { value: 'bright_yellow' } });
  fireEvent.change(screen.getByTestId('ws-show-fluorescence-intensity'), { target: { value: 'bright' } });
  fireEvent.change(screen.getByTestId('ws-show-fluorescence-distribution'), { target: { value: '50' } });
  fireEvent.change(screen.getByTestId('ws-show-cut-speed'), { target: { value: 'fast' } });
  fireEvent.change(screen.getByTestId('ws-show-cut-type'), { target: { value: 'streaming' } });
  fireEvent.change(screen.getByTestId('ws-show-cut-colour'), { target: { value: 'yellow' } });
  fireEvent.change(screen.getByTestId('ws-show-stain'), { target: { value: 'spotty' } });
  fireEvent.change(screen.getByTestId('ws-show-odour'), { target: { value: 'faint' } });
  fireEvent.change(screen.getByTestId('ws-show-residue'), { target: { value: 'light' } });
  expect(screen.getByTestId('ws-show-summary')).toHaveAttribute('data-quality', 'very_good');
  expect(screen.getByTestId('ws-show-summary')).toHaveTextContent('Assessed as a very good show.');
  await act(async () => { fireEvent.click(screen.getByTestId('ws-show-save')); });
  await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent('Show recorded on sample 20: very good show.'));
  const rows = await backend.listRecords(wellId, { subtype: 'show' });
  expect(rows).toHaveLength(1);
  expect(rows[0].sample_id).toBe(s20.id);
  expect(rows[0].md_calc_m).toBeCloseTo(s20.md_calc_m, 6);
  expect(rows[0].payload.quality).toBeUndefined();
  expect(rows[0].payload.fluorescence).toEqual({ colour: 'bright_yellow', intensity: 'bright', distributionPct: 50 });
  expect(document.body.textContent).not.toMatch(/oil determined|determined/i);
});

test('observations: a total gas reading at the bit depth with its unit and source; a note needs text', async () => {
  const backend = await setup();
  fireEvent.click(screen.getByTestId('ws-nav-observations'));
  await waitFor(() => expect(screen.getByTestId('ws-observations')).toBeInTheDocument());
  fireEvent.change(screen.getByTestId('ws-obs-depth-mode'), { target: { value: 'bit' } });
  fireEvent.change(screen.getByTestId('ws-obs-value'), { target: { value: '2.4' } });
  fireEvent.change(screen.getByTestId('ws-obs-source'), { target: { value: 'external' } });
  await act(async () => { fireEvent.click(screen.getByTestId('ws-obs-save')); });
  await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent('Total gas 2.4 % recorded at 10000 ft.'));
  fireEvent.click(screen.getByTestId('ws-obs-type-note'));
  await act(async () => { fireEvent.click(screen.getByTestId('ws-obs-save')); });
  expect(screen.getByTestId('ws-status')).toHaveTextContent('Geological note needs a description.');
  fireEvent.change(screen.getByTestId('ws-obs-text'), { target: { value: 'Sand stringers increasing' } });
  await act(async () => { fireEvent.click(screen.getByTestId('ws-obs-save')); });
  await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent('Geological note: Sand stringers increasing recorded'));
  const wellId = (await backend.listWells())[0].id;
  const gas = (await backend.listRecords(wellId, { subtype: 'total_gas' }))[0];
  expect(gas).toMatchObject({ depth_kind: 'bit_depth', depth_value: 10000 });
  expect(gas.payload).toEqual({ value: 2.4, unit: '%', text: null, source: 'external' });
  expect(screen.getAllByTestId(/^ws-obs-row-/)).toHaveLength(2);
});

test('a photo attaches once with depth, user and times, shows in the grid, and advances a caught sample to photographed', async () => {
  const backend = await setup();
  const wellId = (await backend.listWells())[0].id;
  const s20 = (await backend.listSamples(wellId)).find((s) => s.sample_no === 20);
  await backend.addStage(wellId, s20.id, 'caught');
  await backend.addStage(wellId, s20.id, 'described'); // described is mandatory before photographed on this well
  fireEvent.click(screen.getByTestId('ws-nav-photos'));
  await waitFor(() => expect(screen.getByTestId('ws-photos-empty')).toBeInTheDocument());
  await waitFor(() => expect(screen.getByTestId('ws-photo-sample').querySelector(`option[value="${s20.id}"]`)).not.toBeNull());
  fireEvent.change(screen.getByTestId('ws-photo-sample'), { target: { value: s20.id } });
  fireEvent.change(screen.getByTestId('ws-photo-caption'), { target: { value: 'Tray 20 under UV' } });
  const file = new File([new Uint8Array([1, 2, 3])], 'tray20.jpg', { type: 'image/jpeg', lastModified: Date.now() });
  await act(async () => { fireEvent.change(screen.getByTestId('ws-photo-file'), { target: { files: [file] } }); });
  await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent('Photo attached to the sample at 10000 ft.'));
  await waitFor(() => expect(screen.getAllByTestId(/^ws-photo-[0-9a-f-]{36}$/)).toHaveLength(1));
  const photos = await backend.listPhotos(wellId, { sampleId: s20.id });
  expect(photos).toHaveLength(1);
  expect(photos[0]).toMatchObject({ caption: 'Tray 20 under UV', created_by: 'user-a', local_offset_min: 60, depth_kind: 'lagged_sample', upload_state: 'local', content_type: 'image/webp' });
  expect(photos[0].md_calc_m).toBeCloseTo(s20.md_calc_m, 6);
  expect(photos[0].variants.original).toBeNull();
  expect(await backend.db.blobs.where('photo_id').equals(photos[0].id).count()).toBe(2);
  expect(await backend.db.outbox.where('entity_id').equals(photos[0].id).count()).toBe(1);
  const stages = (await backend.listStages(wellId)).filter((x) => x.sample_id === s20.id).map((x) => x.stage);
  expect(stages).toEqual(['caught', 'described', 'photographed']);
  expect(screen.getByTestId('ws-explorer-counts')).toHaveTextContent('1 photo(s)');
});
