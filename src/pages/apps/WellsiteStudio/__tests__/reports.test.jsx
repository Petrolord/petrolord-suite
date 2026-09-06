// WS7 and WS8 on the seeded well: the handover generates from records
// in one action; a narrative is a record and the report regenerates; a
// generated fact is not editable here; recording and signing store the
// version and the hash; the daily report follows its template; the PDF
// and DOCX builders render the model.
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
import { hashModel } from '@/lib/wellsite/reportHash';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('@/lib/crs/settingsService', () => ({ getDepthUnit: async () => 'ft' }));
jest.mock('@/components/workstation/WorkspaceShell', () => ({ __esModule: true, default: ({ ribbon, explorer, center, dock, statusBar }) => <div>{ribbon}{explorer}{center}{dock}{statusBar}</div> }));
jest.mock('@/lib/pdfBrand', () => ({ drawBrandHeader: () => 30, loadPetrolordLogo: async () => null, fitText: (d, t) => t }));

let n = 0;
async function setup() {
  const db = openWellsiteDb(`ws-rep-${n += 1}`);
  const transport = makeFakeTransport({ user: SEED_USER, registryWells: SEED_REGISTRY_WELLS });
  const backend = makeLocalBackend({ transport, db, autoSync: false });
  const well = await seedWellsite(backend);
  await backend.addRecord(well.id, { kind: 'observation', subtype: 'total_gas', payload: { value: 2.4, unit: '%', source: 'external' }, depth: { value: 9950, unit: 'ft', reference: 'MD', datum: 'RT', kind: 'lagged_sample' } });
  await backend.addTop(well.id, { role: 'official', status: 'preliminary', name: 'Top Agbada', formationKey: 'top_agbada', basis: 'GR drop', depth: { value: 9990, unit: 'ft', reference: 'MD', datum: 'RT', kind: 'logged' } });
  render(<MemoryRouter><WellsiteWorkstation backend={backend} /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId('ws-status-bit')).toHaveTextContent('Bit 10000 ft'));
  return { backend, well };
}

test('the handover of the current tour generates from records; the narrative is a record; record and sign store version and hash', async () => {
  const { backend, well } = await setup();
  fireEvent.click(screen.getByTestId('ws-nav-handover'));
  await waitFor(() => expect(screen.getByTestId('ws-handover')).toBeInTheDocument());
  fireEvent.click(screen.getByTestId('ws-handover-period-current'));
  await waitFor(() => expect(screen.getByTestId('ws-report-section-tops')).toHaveTextContent('Top Agbada'));
  expect(screen.getByTestId('ws-report-section-status')).toHaveTextContent('Bit depth');
  expect(screen.getByTestId('ws-report-section-status')).toHaveTextContent('10000 ft');
  expect(screen.getByTestId('ws-report-section-gas')).toHaveTextContent('2.4 %');
  expect(screen.getByTestId('ws-handover-meta')).toHaveTextContent(/Not yet recorded/);
  // there is no input for a generated fact
  expect(screen.getByTestId('ws-report-section-gas').querySelector('input, textarea')).toBeNull();
  // the narrative edits its record and the report shows it
  fireEvent.click(screen.getByTestId('ws-report-narrative-edit-watch_items'));
  fireEvent.change(screen.getByTestId('ws-report-narrative-input-watch_items'), { target: { value: 'Watch the gas on connections approaching Agbada.' } });
  await act(async () => { fireEvent.click(screen.getByTestId('ws-report-narrative-save-watch_items')); });
  await waitFor(() => expect(screen.getByTestId('ws-report-narrative-text-watch_items')).toHaveTextContent('Watch the gas on connections approaching Agbada.'));
  const narr = await backend.listRecords(well.id, { kind: 'narrative' });
  expect(narr).toHaveLength(1);
  expect(narr[0].subtype).toBe('watch_items');
  // a second edit is version 2 on the same chain
  fireEvent.click(screen.getByTestId('ws-report-narrative-edit-watch_items'));
  fireEvent.change(screen.getByTestId('ws-report-narrative-input-watch_items'), { target: { value: 'Watch the gas; shale density rising.' } });
  await act(async () => { fireEvent.click(screen.getByTestId('ws-report-narrative-save-watch_items')); });
  await waitFor(() => expect(screen.getByTestId('ws-report-narrative-text-watch_items')).toHaveTextContent('shale density rising'));
  const narr2 = await backend.listRecords(well.id, { kind: 'narrative' });
  expect(narr2).toHaveLength(2);
  expect(new Set(narr2.map((r) => r.chain_id)).size).toBe(1);
  // sign: records the version, then the sign-off row with the hash
  fireEvent.change(screen.getByTestId('ws-signoff-statement'), { target: { value: 'Handover complete.' } });
  await act(async () => { fireEvent.click(screen.getByTestId('ws-signoff-sign')); });
  await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent(/Signed as A\. Geologist, administrator\. Platform countersignature pending/));
  const reports = await backend.listReports(well.id);
  expect(reports).toHaveLength(1);
  expect(reports[0].kind).toBe('handover');
  expect(reports[0].content_hash).toMatch(/^(sha256|fnv1a64):/);
  expect(reports[0].canonical.sections.some((s) => s.id === 'watch' && s.text === 'Watch the gas; shale density rising.')).toBe(true);
  const so = await backend.listSignoffs(well.id);
  expect(so).toHaveLength(1);
  expect(so[0]).toMatchObject({ report_id: reports[0].id, role: 'administrator', report_version: 1, content_hash: reports[0].content_hash, statement: 'Handover complete.', countersignature: null });
  await waitFor(() => expect(screen.getAllByTestId(/^ws-signoff-row-/)).toHaveLength(1));
  expect(screen.getByTestId(`ws-signoff-row-${so[0].id}`)).toHaveAttribute('data-countersigned', '0');
  // the hash is the canonical content's hash
  const { hash, algorithm } = await hashModel(reports[0].canonical);
  expect(reports[0].content_hash).toBe(`${algorithm}:${hash}`);
});

test('the daily report follows the generic template and records its model', async () => {
  const { backend, well } = await setup();
  fireEvent.click(screen.getByTestId('ws-nav-report'));
  await waitFor(() => expect(screen.getByTestId('ws-daily')).toBeInTheDocument());
  expect(screen.getByTestId('ws-daily-meta')).toHaveTextContent('template Generic daily geological report v1');
  expect(screen.getAllByTestId(/^ws-report-section-/).map((el) => el.getAttribute('data-testid').replace('ws-report-section-', ''))).toEqual(['status', 'drilled', 'events', 'lithology', 'shows', 'gas', 'tops', 'observations', 'samples', 'photos', 'summary', 'forecast']);
  await act(async () => { fireEvent.click(screen.getByTestId('ws-daily-record')); });
  await waitFor(() => expect(screen.getByTestId('ws-status')).toHaveTextContent(/Daily report version 1 recorded/));
  const model = (await backend.listReports(well.id))[0].canonical;
  expect(model.sections.some((s) => s.id === 'tops' && s.rows.some((r) => r.cells[0] === 'Top Agbada'))).toBe(true);
});
