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
  expect(t).toMatch(/Quantitative Interpretation Report/);
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
  // a cleared model cut holds the run (it would reach the job as 0 Hz)
  fireEvent.change(screen.getByTestId('qi-inv-lfm'), { target: { value: '' } });
  expect(screen.getByTestId('qi-inv-settings-problem')).toHaveTextContent('Give the low-frequency model cut, 2 to 20 Hz.');
  expect(screen.getByTestId('qi-inv-blind')).toBeDisabled();
  fireEvent.change(screen.getByTestId('qi-inv-lfm'), { target: { value: '8' } });
  expect(screen.queryByTestId('qi-inv-settings-problem')).toBeNull();
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

  // handover: SEG-Y of the impedance volume from the worker, and the run record
  fireEvent.click(within(runs).getByTestId('qi-export-ai'));
  expect(await within(runs).findByTestId('qi-export-link-ai', {}, { timeout: 20000 })).toHaveAttribute('href', 'https://storage.petrolord.com/harness/export.sgy');
  expect(enqueue.mock.calls[3]).toEqual(['export_segy', { volume_id: 'mem-inv-qi-v1', name: expect.stringMatching(/AI SEG-Y$/) }]);
  const blobs = [];
  global.URL.createObjectURL = jest.fn((b) => { blobs.push(b); return 'blob:x'; });
  global.URL.revokeObjectURL = jest.fn();
  fireEvent.click(within(runs).getByTestId('qi-run-record'));
  await waitFor(() => expect(blobs).toHaveLength(1));
  // jsdom's Blob has no text(): read it with a FileReader
  const rec = JSON.parse(await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsText(blobs[0]); }));
  expect(rec.contract).toBe('qi-run-record-1');
  expect(rec.job.kind).toBe('poststack_inversion');
  expect(rec.settings.inversion.wells[0].ln_ai.values).toBe(600);

  // property prediction from the finished impedance volume
  fireEvent.click(screen.getByTestId('qi-tab-properties'));
  expect(screen.getByTestId('qi-prop-ai')).toHaveTextContent(/Keta 3D full stack AI, Model-based/);
  fireEvent.click(screen.getByTestId('qi-prop-read'));
  const pw = await screen.findByTestId('qi-prop-wells', {}, { timeout: 20000 });
  expect(pw).toHaveTextContent(/KETA-1DT and RHOBPHIE/);
  fireEvent.click(screen.getByTestId('qi-prop-calibrate'));
  expect(await screen.findByTestId('qi-prop-transform', {}, { timeout: 20000 })).toHaveTextContent(/porosity = 0\.4100 - 3\.400e-5 x AI/);
  expect(within(screen.getByTestId('qi-prop-check')).getAllByRole('row')).toHaveLength(3);
  const [pkind, pparams] = enqueue.mock.calls[4];
  expect(pkind).toBe('property_prediction');
  expect(pparams).toMatchObject({ mode: 'calibrate', ai_volume_id: 'mem-inv-qi-v1' });
  expect(pparams.property.wells.map((w) => w.name)).toEqual(['KETA-1', 'KETA-4']);
  expect(pparams.property.wells[0].target.filter(Number.isFinite).length).toBeGreaterThan(100);
  fireEvent.click(screen.getByTestId('qi-prop-run'));
  const pruns = await screen.findByTestId('qi-prop-runs', {}, { timeout: 20000 });
  await waitFor(() => expect(pruns).toHaveTextContent(/Ready: open in Seismolord/));
  expect(Object.keys(enqueue.mock.calls[5][1].volume_ids)).toEqual(['q10', 'q50', 'q90']);
});

test('prospects: a trap on the dome, a conforming anomaly, the assessment table and the report', async () => {
  let api;
  const Probe = () => { api = useQIStudio(); return null; };
  const backend = makeInMemoryBackend();
  render(<MemoryRouter><QIStudioProvider backend={backend}><Probe /></QIStudioProvider><QIStudio backend={backend} sharingStore={null} /></MemoryRouter>);
  fireEvent.click(await screen.findByTestId('qi-tab-prospects', {}, { timeout: 20000 }));
  fireEvent.click(await screen.findByTestId('qi-pros-add', {}, { timeout: 20000 }));
  fireEvent.change(screen.getByTestId('qi-pros-name'), { target: { value: 'Keta Dome' } });
  fireEvent.change(screen.getByTestId('qi-pros-surface'), { target: { value: 'qi-s1' } });
  fireEvent.change(screen.getByTestId('qi-pros-attr'), { target: { value: 'qi-s2' } });
  fireEvent.change(screen.getByTestId('qi-pros-threshold'), { target: { value: '0.5' } });
  fireEvent.change(screen.getByTestId('qi-pros-ev-name'), { target: { value: 'RMS amplitude' } });
  fireEvent.click(screen.getByTestId('qi-pros-ev-add'));
  fireEvent.change(screen.getByTestId('qi-pros-ev-name'), { target: { value: 'Class III AVO' } });
  fireEvent.change(screen.getByTestId('qi-pros-ev-source'), { target: { value: 'avo' } });
  fireEvent.click(screen.getByTestId('qi-pros-ev-add'));
  for (const k of ['tuning', 'lithology', 'porosity', 'fizz', 'processing']) fireEvent.change(screen.getByTestId(`qi-pros-comp-${k}`), { target: { value: 'ruled-out' } });
  fireEvent.click(screen.getByTestId('qi-pros-analyse'));
  const table = await screen.findByTestId('qi-pros-table', {}, { timeout: 20000 });
  expect(table).toHaveTextContent(/Keta Dome/);
  expect(table).toHaveTextContent(/2000 \/ 2\d{3} \(edge\)/);
  expect(table).toHaveTextContent(/0\.9\d, 100 percent inside, contact 2100 m/);
  // no target feasibility recorded, so the case is not shown visible: investigate, with the reason
  expect(table).toHaveTextContent(/Investigate/);
  expect(screen.getAllByText(/does not say the case is visible/).length).toBeGreaterThan(0);
  const model = reportModel({ ...api, project: { ...api.project, prospects: [] }, projectName: 'x' });
  expect(model.prospects).toEqual([]);
});

test('prestack: build gathers, angle stacks with a velocity table, the usable angle, and conversion to a volume', async () => {
  const backend = makeInMemoryBackend();
  const enqueue = jest.spyOn(backend.jobs, 'enqueueJob');
  const convert = jest.spyOn(backend, 'convertStack');
  render(<MemoryRouter><QIStudio backend={backend} sharingStore={null} /></MemoryRouter>);
  fireEvent.click(await screen.findByTestId('qi-tab-prestack', {}, { timeout: 20000 }));
  fireEvent.change(screen.getByTestId('qi-pre-bin'), { target: { value: '25' } });
  fireEvent.click(await screen.findByTestId('qi-pre-build-qi-d1', {}, { timeout: 20000 }));
  await waitFor(() => expect(enqueue).toHaveBeenCalledWith('ingest_gathers', expect.objectContaining({ dataset_id: 'qi-d1', bin_width_m: 25, mapping: { offsetByte: 37 } })));
  fireEvent.change(screen.getByTestId('qi-pre-vel'), { target: { value: '0 1700\n1500 2300\n3000 2900' } });
  fireEvent.click(screen.getByTestId('qi-pre-stack-qi-d2'));
  expect(await screen.findByTestId('qi-pre-result-qi-d2', {}, { timeout: 20000 })).toHaveTextContent(/near 0 to 15 degrees \(40000 traces\).*Q50 38\.2/);
  const [, params] = enqueue.mock.calls.find((c) => c[0] === 'angle_stacks');
  expect(params.velocity).toEqual({ t_ms: [0, 1500, 3000], vrms: [1700, 2300, 2900] });
  expect(params.ranges.map((r) => r.name)).toEqual(['near', 'mid', 'far']);
  // QC of the gathers: residual moveout, stretch mute, fold; its issues to the register
  fireEvent.change(screen.getByTestId('qi-pre-trim-centre'), { target: { value: '900' } });
  fireEvent.click(screen.getByTestId('qi-pre-trim-qi-d2'));
  await waitFor(() => expect(enqueue).toHaveBeenCalledWith('trim_gathers', expect.objectContaining({ dataset_id: 'qi-d2', centre_ms: 900, window_ms: 100, max_shift_ms: 8 })));
  fireEvent.click(screen.getByTestId('qi-pre-qc-qi-d2'));
  const qcr = await screen.findByTestId('qi-pre-qc-result-qi-d2', {}, { timeout: 20000 });
  expect(qcr).toHaveTextContent(/1480 CDPs sampled \(every 4\); median fold 58, far covered offset 3000 m/);
  expect(qcr).toHaveTextContent(/900\s*2\.1\s*5\.6\s*22\s*2450/);
  fireEvent.click(screen.getByTestId('qi-pre-qc-issues-qi-d2'));
  fireEvent.click(screen.getByTestId('qi-pre-convert-qi-d3'));
  await waitFor(() => expect(convert).toHaveBeenCalledWith(expect.objectContaining({ id: 'qi-d3' })));
});

test('prestack: typed angle ranges are compared as numbers (a typed 5 to 15 used to be refused)', async () => {
  const { angleRangeProblem } = await import('../components/PrestackPanel');
  expect(angleRangeProblem([{ name: 'near', from: '5', to: '15' }, { name: 'far', from: '25', to: '35' }])).toBeNull();
  expect(angleRangeProblem([{ name: 'near', from: '15', to: '5' }])).toMatch(/from below to/);
  expect(angleRangeProblem([{ name: 'near', from: '', to: '15' }])).toMatch(/from below to/);
  expect(angleRangeProblem([{ name: ' ', from: 0, to: 15 }])).toMatch(/name/);
  expect(angleRangeProblem([{ name: 'wide', from: 0, to: 75 }])).toMatch(/0 to 60/);
  // in the tab: type the ranges, and the stack button is enabled
  const backend = makeInMemoryBackend();
  render(<MemoryRouter><QIStudio backend={backend} sharingStore={null} /></MemoryRouter>);
  fireEvent.click(await screen.findByTestId('qi-tab-prestack', {}, { timeout: 20000 }));
  await screen.findByTestId('qi-pre-stack-qi-d2', {}, { timeout: 20000 });
  fireEvent.change(screen.getByTestId('qi-pre-vel'), { target: { value: '0 1700\n1500 2300' } });
  fireEvent.change(screen.getByLabelText('Range 1 from'), { target: { value: '5' } });
  fireEvent.change(screen.getByLabelText('Range 1 to'), { target: { value: '15' } });
  expect(screen.getByTestId('qi-pre-stack-qi-d2')).not.toBeDisabled();
});

test('prestack: a worker file is removed after a confirmation, and kept when it is declined', async () => {
  const backend = makeInMemoryBackend();
  const enqueue = jest.spyOn(backend.jobs, 'enqueueJob');
  const confirm = jest.spyOn(window, 'confirm');
  render(<MemoryRouter><QIStudio backend={backend} sharingStore={null} /></MemoryRouter>);
  fireEvent.click(await screen.findByTestId('qi-tab-prestack', {}, { timeout: 20000 }));
  // negative control: declined, nothing is queued and the file stays
  confirm.mockReturnValueOnce(false);
  fireEvent.click(await screen.findByTestId('qi-pre-remove-qi-d3', {}, { timeout: 20000 }));
  expect(enqueue).not.toHaveBeenCalledWith('remove_dataset', expect.anything());
  expect(screen.getByTestId('qi-pre-remove-qi-d3')).toBeInTheDocument();
  confirm.mockReturnValueOnce(true);
  fireEvent.click(screen.getByTestId('qi-pre-remove-qi-d3'));
  await waitFor(() => expect(enqueue).toHaveBeenCalledWith('remove_dataset', { dataset_id: 'qi-d3' }));
  await waitFor(() => expect(screen.queryByTestId('qi-pre-remove-qi-d3')).not.toBeInTheDocument());
  expect(screen.getByTestId('qi-pre-remove-qi-d1')).toBeInTheDocument();
  confirm.mockRestore();
});

test('AVO: three stacks with their angles, the products registered on the first, the run kept', async () => {
  global.ResizeObserver = global.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
  const backend = makeInMemoryBackend();
  const base = backend.listVolumes;
  backend.listVolumes = async () => [...(await base()), { id: 'qi-v2', name: 'Keta mid stack', kind: 'seismic', status: 'ready' }, { id: 'qi-v3', name: 'Keta far stack', kind: 'seismic', status: 'ready' }];
  const enqueue = jest.spyOn(backend.jobs, 'enqueueJob');
  render(<MemoryRouter><QIStudio backend={backend} sharingStore={null} /></MemoryRouter>);
  for (const v of ['qi-v1', 'qi-v2', 'qi-v3']) fireEvent.click(await screen.findByTestId(`qi-volume-${v}`, {}, { timeout: 20000 }));
  fireEvent.click(screen.getByTestId('qi-tab-avo'));
  [['qi-v1', 8], ['qi-v2', 20], ['qi-v3', 32]].forEach(([v, a], k) => {
    fireEvent.change(screen.getByTestId(`qi-avo-stack-${k}`), { target: { value: v } });
    fireEvent.change(screen.getByTestId(`qi-avo-angle-${k}`), { target: { value: String(a) } });
  });
  // match the stacks onto the near one first
  fireEvent.change(screen.getByTestId('qi-avo-match-ref'), { target: { value: 'qi-v1' } });
  fireEvent.click(screen.getByTestId('qi-avo-match-run'));
  const mt = await screen.findByTestId('qi-avo-match-table', {}, { timeout: 20000 });
  expect(within(mt).getAllByRole('row')).toHaveLength(3);
  const [, mp] = enqueue.mock.calls.find((c) => c[0] === 'match_stacks');
  expect(mp).toMatchObject({ reference_volume_id: 'qi-v1', stacks: ['qi-v2', 'qi-v3'], volume_ids: { 'qi-v2': 'mem-match-qi-v2', 'qi-v3': 'mem-match-qi-v3' } });
  enqueue.mockClear();
  // a cleared mean angle holds the run (it would reach the job as 0 degrees)
  fireEvent.change(screen.getByTestId('qi-avo-angle-2'), { target: { value: '' } });
  expect(screen.getByTestId('qi-avo-run')).toBeDisabled();
  expect(screen.getByText('Give each stack its mean angle, 0 to 50 degrees.')).toBeInTheDocument();
  fireEvent.change(screen.getByTestId('qi-avo-angle-2'), { target: { value: '32' } });
  fireEvent.click(screen.getByTestId('qi-avo-run'));
  const runs = await screen.findByTestId('qi-avo-runs', {}, { timeout: 20000 });
  await waitFor(() => expect(runs).toHaveTextContent(/Ready: open in Seismolord/));
  const [kind, params] = enqueue.mock.calls[0];
  expect(kind).toBe('avo_volumes');
  expect(params.stacks).toEqual([{ volume_id: 'qi-v1', angle: 8 }, { volume_id: 'qi-v2', angle: 20 }, { volume_id: 'qi-v3', angle: 32 }]);
  expect(params.products).toEqual({ A: 'mem-avo-qi-v1-A', B: 'mem-avo-qi-v1-B', FF: 'mem-avo-qi-v1-FF' });

  // at the wells: KETA-1 has a published gather, AKOMA-2 has none
  fireEvent.click(screen.getByTestId('qi-tab-setup'));
  fireEvent.click(await screen.findByTestId('qi-well-qi-w1', {}, { timeout: 20000 }));
  fireEvent.click(screen.getByTestId('qi-well-qi-w2'));
  fireEvent.click(screen.getByTestId('qi-tab-avo'));
  fireEvent.click(await screen.findByTestId('qi-avo-wells-run', {}, { timeout: 20000 }));
  expect(await screen.findByTestId('qi-avo-wells-summary', {}, { timeout: 20000 })).toHaveTextContent('Scale 2.00 from 1 well; the AVO class agrees at 1 of them.');
  const wt = screen.getByTestId('qi-avo-wells-table');
  expect(wt).toHaveTextContent(/KETA-1\s*-0\.050, -0\.120\s*-0\.050, -0\.120\s*III \/ III/);
  expect(wt).toHaveTextContent(/AKOMA-2No Rock Physics gather published/);
  const [skind, sparams] = enqueue.mock.calls.find((c) => c[0] === 'sample_volumes');
  expect(skind).toBe('sample_volumes');
  expect(sparams.volume_ids).toEqual(['mem-avo-qi-v1-A', 'mem-avo-qi-v1-B']);
  expect(sparams.points[0]).toMatchObject({ name: 'KETA-1', il: 5, xl: 8 });
});

test('simultaneous: five stacks, the wells with shear and density, the blind table and the four volumes', async () => {
  const backend = makeInMemoryBackend();
  const base = await backend.listWells();
  const w4 = { ...base[0], id: 'qi-w4', name: 'KETA-4', surface_x: 600, surface_y: 300 };
  const listWells = backend.listWells; const loadWell = backend.loadWell;
  backend.listWells = async () => [...(await listWells()), w4];
  const facies = { id: 'fac', mnemonic: 'RP_FACIES', start_md_m: 1500, stop_md_m: 2800, step_m: 0.5, provenance: { kind: 'facies', codes: [{ code: 1, name: 'gas sand' }, { code: 2, name: 'shale' }] } };
  const withFacies = async (x) => ({ ...x, logs: [...x.logs, facies] });
  backend.loadWell = async (w) => withFacies(w.id === 'qi-w4' ? { ...(await loadWell(base[0])), well: w4 } : await loadWell(w));
  const vols = ['qi-v1', 'qi-v2', 'qi-v3', 'qi-v4', 'qi-v5'];
  const baseV = backend.listVolumes;
  backend.listVolumes = async () => [...(await baseV()), ...vols.slice(1).map((id, k) => ({ id, name: `Keta stack ${k + 2}`, kind: 'seismic', status: 'ready' }))];
  const enqueue = jest.spyOn(backend.jobs, 'enqueueJob');
  render(<MemoryRouter><QIStudio backend={backend} sharingStore={null} /></MemoryRouter>);
  fireEvent.click(await screen.findByTestId('qi-well-qi-w1', {}, { timeout: 20000 }));
  fireEvent.click(screen.getByTestId('qi-well-qi-w4'));
  for (const v of vols) fireEvent.click(await screen.findByTestId(`qi-volume-${v}`, {}, { timeout: 20000 }));
  fireEvent.click(screen.getByTestId('qi-tab-simultaneous'));
  [4, 12, 20, 28, 36].forEach((a, k) => {
    fireEvent.change(screen.getByTestId(`qi-sim-stack-${k}`), { target: { value: vols[k] } });
    fireEvent.change(screen.getByTestId(`qi-sim-angle-${k}`), { target: { value: String(a) } });
  });
  fireEvent.click(await screen.findByTestId('qi-sim-read', {}, { timeout: 20000 }));
  expect(await screen.findByTestId('qi-sim-wells', {}, { timeout: 20000 })).toHaveTextContent(/KETA-1DT and RHOB, DTSM for Vs/);
  // one wavelet per stack, extracted at the wells
  fireEvent.click(screen.getByTestId('qi-sim-aw'));
  const awt = await screen.findByTestId('qi-sim-aw-table', {}, { timeout: 20000 });
  expect(within(awt).getAllByRole('row')).toHaveLength(6);
  expect(await screen.findByTestId('qi-sim-use-aw', {}, { timeout: 20000 })).toBeChecked();
  fireEvent.click(screen.getByTestId('qi-sim-blind'));
  expect(await screen.findByTestId('qi-sim-blind-table', {}, { timeout: 20000 })).toHaveTextContent(/KETA-1\s*4\.1\s*5\.2\s*3\.3\s*0\.62/);
  const [, bp] = enqueue.mock.calls.find((c) => c[0] === 'prestack_inversion');
  expect(bp.inversion.stacks.map((s) => s.angle)).toEqual([4, 12, 20, 28, 36]);
  expect(bp.inversion.wavelets).toHaveLength(5);
  expect(bp.inversion.wells[0].ln_si.filter(Number.isFinite).length).toBeGreaterThan(100);
  fireEvent.click(screen.getByTestId('qi-sim-run'));
  const runs = await screen.findByTestId('qi-sim-runs', {}, { timeout: 20000 });
  await waitFor(() => expect(runs).toHaveTextContent(/Ready: open in Seismolord/));
  expect(enqueue.mock.calls.filter((c) => c[0] === 'prestack_inversion')[1][1].volume_ids).toEqual({ ai: 'mem-sim-qi-v1-ai', si: 'mem-sim-qi-v1-si', rho: 'mem-sim-qi-v1-rho', vpvs: 'mem-sim-qi-v1-vpvs' });

  // facies in AI and Vp/Vs from the simultaneous inversion
  fireEvent.click(screen.getByTestId('qi-tab-properties'));
  fireEvent.change(await screen.findByTestId('qi-prop-ai', {}, { timeout: 20000 }), { target: { value: 'mem-sim-qi-v1-ai' } });
  fireEvent.change(screen.getByTestId('qi-prop-kind'), { target: { value: 'facies' } });
  fireEvent.change(await screen.findByTestId('qi-prop-attrs', {}, { timeout: 20000 }), { target: { value: 'ai_vpvs' } });
  fireEvent.click(screen.getByTestId('qi-prop-read'));
  await screen.findByTestId('qi-prop-wells', {}, { timeout: 20000 });
  fireEvent.click(screen.getByTestId('qi-prop-calibrate'));
  await waitFor(() => expect(enqueue.mock.calls.some((c) => c[0] === 'property_prediction')).toBe(true));
  const [, pp] = enqueue.mock.calls.find((c) => c[0] === 'property_prediction');
  expect(pp).toMatchObject({ mode: 'calibrate', ai_volume_id: 'mem-sim-qi-v1-ai', second_volume_id: 'mem-sim-qi-v1-vpvs' });
  expect(pp.property.attributes).toBe('ai_vpvs');
  expect(pp.property.wells[0].vpvs.filter(Number.isFinite).length).toBeGreaterThan(100);
});
