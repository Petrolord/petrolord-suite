/**
 * QI Studio, Data matrix tab (Project Data Inventory, 2026-10-11): the
 * shared inventory over the study's wells on the in-memory backend. The
 * states come from what the backend holds (KETA-1 complete with dipole
 * shear, AKOMA-2 with no shear or checkshots, BONSU-3 with a digitized
 * density and no elevation); a hand-set state and a report held outside
 * Petrolord are saved in the project and come back on reopen. The tab is
 * appended after Report, so the recorded tabs keep their order.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockStore = { rows: new Map() };
jest.mock('@/utils/savedProjects', () => {
  const service = {
    list: async () => [...mockStore.rows.values()].map((r) => ({ id: r.id, name: r.name })),
    listRows: async () => [...mockStore.rows.values()].map((r) => ({ id: r.id, name: r.name })),
    load: async (id) => mockStore.rows.get(id)?.payload ?? null,
    loadRow: async (id) => { const r = mockStore.rows.get(id); return r ? { payload: r.payload, row: { id, project_name: r.name } } : null; },
    save: async (id, payload) => { mockStore.rows.set(id, { id, name: payload.name, payload: JSON.parse(JSON.stringify(payload)) }); return { success: true }; },
    remove: async (id) => { mockStore.rows.delete(id); return { success: true }; },
  };
  return { createSavedProjectsService: () => service };
});
jest.mock('@/contexts/SupabaseAuthContext', () => ({ useAuth: () => ({ organization: { name: 'Lordsway Energy' } }) }));

// eslint-disable-next-line import/first
import QIStudio from '../QIStudio';
// eslint-disable-next-line import/first
import { makeInMemoryBackend } from '../services/inMemoryBackend';
// eslint-disable-next-line import/first
import { QIStudioProvider, useQIStudio } from '../QIStudioContext';
// eslint-disable-next-line import/first
import ProjectInventoryTab from '../components/ProjectInventoryTab';

jest.setTimeout(90000);
beforeEach(() => { mockStore.rows = new Map(); });
const cell = (well, col) => screen.getByTestId(`pdi-cell-${well}-${col}`);

test('the tab is last; the recorded tabs keep their names and order', async () => {
  render(<MemoryRouter><QIStudio backend={makeInMemoryBackend()} sharingStore={null} /></MemoryRouter>);
  await screen.findByTestId('qi-well-qi-w1', {}, { timeout: 30000 });
  const tabs = within(screen.getByRole('tablist')).getAllByRole('tab').map((t) => t.getAttribute('data-testid'));
  expect(tabs).toEqual(['setup', 'inventory', 'usability', 'qc', 'ties', 'prestack', 'avo', 'inversion', 'simultaneous', 'properties', 'prospects', 'issues', 'feasibility', 'report', 'datainventory'].map((k) => `qi-tab-${k}`));
  expect(screen.getByTestId('qi-tab-setup')).toHaveAttribute('aria-selected', 'true');
});

test('the matrix is built from the study wells, with states, notes and readiness', async () => {
  render(<MemoryRouter><QIStudio backend={makeInMemoryBackend()} sharingStore={null} /></MemoryRouter>);
  fireEvent.click(await screen.findByTestId('qi-well-qi-w1', {}, { timeout: 30000 }));
  fireEvent.click(screen.getByTestId('qi-well-qi-w2'));
  fireEvent.click(screen.getByTestId('qi-well-qi-w3'));
  fireEvent.click(await screen.findByTestId('qi-target-SAND A', {}, { timeout: 20000 }));
  fireEvent.click(screen.getByTestId('qi-tab-datainventory'));
  await screen.findByTestId('pdi-board', {}, { timeout: 30000 });
  await waitFor(() => expect(screen.getByTestId('pdi-scan-state')).toHaveTextContent(/Coverage from \d+ curves' samples/), { timeout: 30000 });
  expect(cell('KETA-1', 'dts')).toHaveAttribute('data-status', 'complete');
  expect(cell('AKOMA-2', 'dts')).toHaveAttribute('data-status', 'missing');
  expect(cell('AKOMA-2', 'checkshots')).toHaveAttribute('data-status', 'missing');
  expect(cell('BONSU-3', 'rhob')).toHaveAttribute('data-status', 'derived');
  expect(cell('BONSU-3', 'datum')).toHaveAttribute('data-status', 'missing');
  expect(cell('KETA-1', 'pressure')).toHaveAttribute('data-status', 'unrecorded');
  expect(screen.getByTestId('pdi-note-shear-none')).toHaveTextContent(/local shear trend calibrated on KETA-1/);
  expect(screen.getByTestId('pdi-note-low-bits')).toHaveTextContent(/16-bit/);
  expect(screen.getByTestId('pdi-ready-avo')).toHaveAttribute('data-level', 'blocked');
  expect(screen.getByTestId('pdi-seismic')).toHaveTextContent('Keta 3D full stack');
  expect(screen.getByTestId('pdi-title')).toHaveTextContent('QI study');
  fireEvent.click(cell('AKOMA-2', 'dts'));
  expect(screen.getByTestId('pdi-cell-detail')).toHaveTextContent(/No shear slowness curve on this well/);
});

test('a hand-set state and a report outside Petrolord are saved with the project and reopen', async () => {
  const backend = makeInMemoryBackend();
  let api;
  const Probe = () => { api = useQIStudio(); return null; };
  const ui = () => <MemoryRouter><QIStudioProvider backend={backend}><Probe /><ProjectInventoryTab /></QIStudioProvider></MemoryRouter>;
  const { unmount } = render(ui());
  await waitFor(() => expect(api.wells?.length).toBe(3));
  await waitFor(() => { api.toggleWell('qi-w1'); api.toggleWell('qi-w2'); });
  await waitFor(() => expect(api.ready.length).toBe(2));
  await api.createProject('Keta matrix');
  await screen.findByTestId('pdi-board', {}, { timeout: 30000 });
  fireEvent.click(cell('AKOMA-2', 'dts'));
  fireEvent.change(screen.getByTestId('pdi-cell-override'), { target: { value: 'notAcquired' } });
  await waitFor(() => expect(cell('AKOMA-2', 'dts')).toHaveAttribute('data-status', 'notAcquired'));
  fireEvent.change(screen.getByTestId('pdi-manual-kind'), { target: { value: 'pvt' } });
  fireEvent.change(screen.getByTestId('pdi-manual-title'), { target: { value: 'KETA-1 PVT report' } });
  fireEvent.click(screen.getByTestId('pdi-manual-add-btn'));
  await waitFor(() => expect(screen.getAllByTestId('pdi-manual-row')).toHaveLength(1));
  expect(screen.queryByTestId('pdi-note-pvt-none')).not.toBeInTheDocument();
  await api.manualSave();
  const saved = [...mockStore.rows.values()][0].payload;
  expect(saved.dataInventory.cells['qi-w2'].dts.status).toBe('notAcquired');
  expect(saved.dataInventory.manual[0]).toMatchObject({ kind: 'pvt', title: 'KETA-1 PVT report', state: 'received' });
  unmount();
  render(ui());
  await waitFor(() => expect(api.projects.length).toBe(1));
  await api.openProject(saved.id);
  await waitFor(() => expect(api.project.dataInventory.manual).toHaveLength(1));
  await waitFor(() => expect(cell('AKOMA-2', 'dts')).toHaveAttribute('data-status', 'notAcquired'), { timeout: 30000 });
  expect(api.dirty).toBe(false);
});
