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

// the app renders the whole studio per test; the default 5 s is short on a cold run
jest.setTimeout(60000);

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

test('seismic QC: a job per chosen volume, its result on screen and kept, its issues added to the register', async () => {
  global.ResizeObserver = global.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
  renderApp();
  fireEvent.click(await screen.findByTestId('qi-volume-qi-v1', {}, { timeout: 20000 }));
  fireEvent.click(screen.getByTestId('qi-tab-qc'));
  fireEvent.click(screen.getByTestId('qi-qc-run-qi-v1'));
  const result = await screen.findByTestId('qi-qc-result', {}, { timeout: 60000 });
  expect(result).toHaveTextContent(/Footprint at \(ms\)/);
  expect(result).toHaveTextContent(/stripe: period 4\.0/); // the in-memory volume has a stripe every 4 crosslines
  fireEvent.click(screen.getByTestId('qi-qc-issues-qi-v1'));
  fireEvent.click(screen.getByTestId('qi-tab-issues'));
  expect(screen.getAllByTestId('qi-issue-row').some((r) => /acquisition footprint/.test(r.textContent))).toBe(true);
});

test('inversion: the wells read into impedance, the blind-well check and a volume run, kept in the project', async () => {
  const backend = makeInMemoryBackend();
  // a second complete well, so the blind check has two
  const base = await backend.listWells();
  const w4 = { ...base[0], id: 'qi-w4', name: 'KETA-4', surface_x: 600, surface_y: 300 };
  const listWells = backend.listWells; const loadWell = backend.loadWell;
  backend.listWells = async () => [...(await listWells()), w4];
  backend.loadWell = async (w) => (w.id === 'qi-w4' ? { ...(await loadWell(base[0])), well: w4 } : loadWell(w));
  const enqueue = jest.spyOn(backend.jobs, 'enqueueJob');
  render(<MemoryRouter><QIStudio backend={backend} sharingStore={null} /></MemoryRouter>);
  fireEvent.click(await screen.findByTestId('qi-well-qi-w1', {}, { timeout: 20000 }));
  fireEvent.click(screen.getByTestId('qi-well-qi-w4'));
  fireEvent.click(screen.getByTestId('qi-well-qi-w2'));
  fireEvent.click(screen.getByTestId('qi-volume-qi-v1'));
  fireEvent.click(screen.getByTestId('qi-tab-inversion'));
  // the field wavelet from the two stored tie wavelets is offered first
  expect(await screen.findByTestId('qi-inv-wavelet', {}, { timeout: 20000 })).toHaveTextContent(/Field wavelet \(average of 3 ties\)/);
  fireEvent.click(within(await screen.findByTestId('qi-inv-horizons', {}, { timeout: 20000 })).getByLabelText('Top Sand A'));
  fireEvent.click(screen.getByTestId('qi-inv-read-wells'));
  const wells = await screen.findByTestId('qi-inv-wells', {}, { timeout: 20000 });
  expect(wells).toHaveTextContent(/KETA-1\s*5, 8\s*DT and RHOB/);
  expect(wells).toHaveTextContent(/KETA-4\s*12, 24/);
  expect(wells).toHaveTextContent(/AKOMA-2No time-depth relationship/);
  fireEvent.click(screen.getByTestId('qi-inv-blind'));
  const blind = await screen.findByTestId('qi-inv-blind-table', {}, { timeout: 20000 });
  expect(within(blind).getAllByRole('row')).toHaveLength(3);
  const [kind, params] = enqueue.mock.calls[0];
  expect(kind).toBe('poststack_inversion');
  expect(params.mode).toBe('blind');
  expect(params.inversion.wells.map((w) => w.name)).toEqual(['KETA-1', 'KETA-4']);
  expect(params.inversion.horizon_ids).toEqual(['qi-h1']);
  expect(params.inversion.wavelet.samples.length % 2).toBe(1);
  // sensitivity: four wavelets (the field one and three ties) x three model cuts, then the spread at the wells
  expect(screen.getByTestId('qi-inv-scenarios')).toHaveTextContent('12 scenarios (at most 12)');
  fireEvent.click(screen.getByTestId('qi-inv-spread-blind'));
  expect(await screen.findByTestId('qi-inv-spread-wells', {}, { timeout: 20000 })).toHaveTextContent(/KETA-4\s*4\.0\s*6\.0\s*9\.0/);
  expect(enqueue.mock.calls[1][1].inversion.sensitivity).toMatchObject({ lfm_factors: [0.5, 1, 1.5] });
  expect(enqueue.mock.calls[1][1].inversion.sensitivity.wavelets).toHaveLength(4);
  fireEvent.click(screen.getByTestId('qi-inv-run'));
  const runs = await screen.findByTestId('qi-inv-runs', {}, { timeout: 20000 });
  await waitFor(() => expect(runs).toHaveTextContent(/Ready: open in Seismolord/));
  expect(enqueue.mock.calls[2][1]).toMatchObject({ mode: 'volume', volume_id: 'mem-inv-qi-v1' });

  // property prediction from the finished impedance volume
  fireEvent.click(screen.getByTestId('qi-tab-properties'));
  expect(screen.getByTestId('qi-prop-ai')).toHaveTextContent(/Keta 3D full stack AI, Model-based/);
  fireEvent.click(screen.getByTestId('qi-prop-read'));
  const pw = await screen.findByTestId('qi-prop-wells', {}, { timeout: 20000 });
  expect(pw).toHaveTextContent(/KETA-1DT and RHOBPHIE/);
  fireEvent.click(screen.getByTestId('qi-prop-calibrate'));
  expect(await screen.findByTestId('qi-prop-transform', {}, { timeout: 20000 })).toHaveTextContent(/porosity = 0\.4100 - 3\.400e-5 x AI/);
  expect(within(screen.getByTestId('qi-prop-check')).getAllByRole('row')).toHaveLength(3);
  const [pkind, pparams] = enqueue.mock.calls[3];
  expect(pkind).toBe('property_prediction');
  expect(pparams).toMatchObject({ mode: 'calibrate', ai_volume_id: 'mem-inv-qi-v1' });
  expect(pparams.property.wells.map((w) => w.name)).toEqual(['KETA-1', 'KETA-4']);
  expect(pparams.property.wells[0].target.filter(Number.isFinite).length).toBeGreaterThan(100);
  fireEvent.click(screen.getByTestId('qi-prop-run'));
  const pruns = await screen.findByTestId('qi-prop-runs', {}, { timeout: 20000 });
  await waitFor(() => expect(pruns).toHaveTextContent(/Ready: open in Seismolord/));
  expect(Object.keys(enqueue.mock.calls[4][1].volume_ids)).toEqual(['q10', 'q50', 'q90']);
});
