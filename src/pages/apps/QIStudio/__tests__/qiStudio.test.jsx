/**
 * QI Studio end to end on the in-memory backend (QI programme Q1 / A4):
 * setup, the usability matrix and its reasons, the suggested issues and a
 * dismissal, feasibility, a saved project that reopens with everything, the
 * not-switched-on note before the migration, and the report read back from
 * the PDF file.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockStore = { rows: new Map(), missing: false };
jest.mock('@/utils/savedProjects', () => {
  const missing = () => { const e = new Error('relation "public.saved_qi_studio_projects" does not exist'); e.code = '42P01'; return e; };
  const service = {
    list: async () => { if (mockStore.missing) throw missing(); return [...mockStore.rows.values()].map((r) => ({ id: r.id, name: r.name })); },
    listRows: async () => { if (mockStore.missing) throw missing(); return [...mockStore.rows.values()].map((r) => ({ id: r.id, name: r.name })); },
    load: async (id) => mockStore.rows.get(id)?.payload ?? null,
    loadRow: async (id) => { const r = mockStore.rows.get(id); return r ? { payload: r.payload, row: { id, project_name: r.name } } : null; },
    save: async (id, payload) => { if (mockStore.missing) throw missing(); mockStore.rows.set(id, { id, name: payload.name, payload: JSON.parse(JSON.stringify(payload)) }); return { success: true }; },
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
import { reportModel, buildQIStudioPdf } from '../services/report';
// eslint-disable-next-line import/first
import { readPdf, flat } from '@/lib/reportKit/testKit';

const renderApp = () => render(<MemoryRouter><QIStudio backend={makeInMemoryBackend()} sharingStore={null} /></MemoryRouter>);

async function setUp() {
  renderApp();
  fireEvent.click(await screen.findByTestId('qi-well-qi-w1', {}, { timeout: 20000 }));
  fireEvent.click(screen.getByTestId('qi-well-qi-w2'));
  fireEvent.click(screen.getByTestId('qi-well-qi-w3'));
  fireEvent.click(await screen.findByTestId('qi-target-SAND A', {}, { timeout: 20000 }));
  fireEvent.change(screen.getByTestId('qi-seismic-date'), { target: { value: '2021-03-01' } });
}

beforeEach(() => { mockStore.rows = new Map(); mockStore.missing = false; });

test('the usability matrix grades each well and explains a cell', async () => {
  await setUp();
  fireEvent.click(screen.getByTestId('qi-tab-usability'));
  expect(screen.getByTestId('qi-cell-qi-w1-SAND A')).toHaveTextContent('Good');
  expect(screen.getByTestId('qi-cell-qi-w2-SAND A')).toHaveTextContent('Limited'); // no shear, no checkshots, no survey
  expect(screen.getByTestId('qi-cell-qi-w3-SAND A')).toHaveTextContent('Missing'); // no elevation
  fireEvent.click(screen.getByTestId('qi-cell-qi-w3-SAND A'));
  expect(screen.getByTestId('qi-cell-detail')).toHaveTextContent(/The well elevation is not set/);
  expect(screen.getByTestId('qi-cell-detail')).toHaveTextContent(/digitized, utility grade/);
});

test('issues are suggested from the matrix, and a dismissal sticks', async () => {
  await setUp();
  fireEvent.click(screen.getByTestId('qi-tab-issues'));
  const rows = screen.getAllByTestId('qi-issue-row');
  expect(rows.some((r) => /AKOMA-2: shear sonic \(vs\) limited/.test(r.textContent))).toBe(true);
  expect(rows[0]).toHaveTextContent(/^high/); // high severity first (BONSU-3 elevation)
  fireEvent.change(screen.getByTestId('qi-issue-status-qi-w2:shear'), { target: { value: 'dismissed' } });
  const after = screen.getAllByTestId('qi-issue-row');
  const shear = after.find((r) => /AKOMA-2: shear/.test(r.textContent));
  expect(within(shear).getByDisplayValue('dismissed')).toBeInTheDocument();
  expect(shear).not.toHaveTextContent('(suggested)');
  expect(after[after.length - 1]).toBe(shear); // dismissed issues sink to the end
});

test('a saved project reopens with its wells, targets, dates and decisions', async () => {
  const backend = makeInMemoryBackend();
  let api;
  const Probe = () => { api = useQIStudio(); return null; };
  const { unmount } = render(<QIStudioProvider backend={backend}><Probe /></QIStudioProvider>);
  await waitFor(() => expect(api.wells?.length).toBe(3));
  await waitFor(() => { api.toggleWell('qi-w2'); });
  await waitFor(() => expect(api.targetChoices).toContain('SAND B'));
  await waitFor(() => { api.toggleTarget('SAND B'); });
  await waitFor(() => { api.setFeasibility('SAND B', { verdict: 'conditional', route: 'Post-stack inversion first' }); });
  await waitFor(() => expect(api.project.feasibility['SAND B']?.verdict).toBe('conditional'));
  await api.createProject('Keta QI audit');
  await waitFor(() => expect(mockStore.rows.size).toBe(1));
  unmount();
  const id = [...mockStore.rows.keys()][0];
  render(<QIStudioProvider backend={backend}><Probe /></QIStudioProvider>);
  await waitFor(() => expect(api.projects.length).toBe(1));
  await api.openProject(id);
  await waitFor(() => expect(api.project.wellIds).toEqual(['qi-w2']));
  expect(api.project.targets).toEqual(['SAND B']);
  expect(api.project.feasibility['SAND B']).toEqual({ verdict: 'conditional', route: 'Post-stack inversion first' });
  expect(api.projectName).toBe('Keta QI audit');
});

test('before the migration, saving says it is not switched on', async () => {
  mockStore.missing = true;
  renderApp();
  expect(await screen.findByTestId('qi-saving-off', {}, { timeout: 20000 })).toHaveTextContent(/Saving is not switched on yet for QI Studio/);
});

test('the report: summary, inventory, matrix reasons, issues and feasibility, read back from the PDF', async () => {
  const backend = makeInMemoryBackend();
  let api;
  const Probe = () => { api = useQIStudio(); return null; };
  render(<QIStudioProvider backend={backend}><Probe /></QIStudioProvider>);
  await waitFor(() => expect(api.wells?.length).toBe(3));
  await waitFor(() => { api.toggleWell('qi-w1'); api.toggleWell('qi-w3'); });
  await waitFor(() => expect(api.ready.length).toBe(2));
  await waitFor(() => { api.toggleTarget('SAND A'); api.setFeasibility('SAND A', { verdict: 'feasible', separability: 'Gas separates from brine in AI and Vp/Vs.' }); });
  await waitFor(() => expect(api.matrix.rows[0].cells.length).toBe(1));
  const model = reportModel({ ...api, projectName: 'Keta QI audit', organizationName: 'Lordsway Energy' });
  expect(model.summary).toMatch(/2 wells and 1 target interval were audited/);
  const built = buildQIStudioPdf(model, { generatedAt: new Date('2026-10-06T12:00:00Z') });
  const pdf = readPdf(built.doc);
  const t = flat(pdf.text);
  expect(t).toMatch(/QI Data Audit and Feasibility Report/);
  expect(t).toMatch(/Keta QI audit/);
  expect(t).toMatch(/Usability matrix/);
  expect(t).toMatch(/BONSU-3/);
  expect(t).toMatch(/The well elevation is not set/);
  expect(t).toMatch(/Feasibility: SAND A/);
  expect(t).toMatch(/Verdict: Feasible\./);
  expect(t).toMatch(/Gas separates from brine in AI and Vp\/Vs/);
});
