// Server import and the Jobs dock (QI programme Q0): the import uploads
// first and registers the volume only once the file is all there; the dock
// shows each job's state, cancels, and offers Open once a server import's
// display copy is up.
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { serverImportAdvice, startServerImport, SERVER_IMPORT_SUGGEST_BYTES } from '../services/serverImport';
import { jobView, volumesChanged, DISPLAY_READY_MESSAGE } from '../lib/serverJobsView';
import ServerJobsPanel from '../components/workspace/ServerJobsPanel';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('../services/importJobsRuntime', () => ({ prepareV4Row: jest.fn() }));

describe('serverImportAdvice', () => {
  test('recommends the server from 2 GB', () => {
    expect(serverImportAdvice(SERVER_IMPORT_SUGGEST_BYTES, { ok: true })).toEqual({ offer: true, preferred: true, reason: 'large' });
  });
  test('recommends the server when the browser cannot run the background import', () => {
    expect(serverImportAdvice(1e6, { ok: false, reason: 'no-opfs' })).toMatchObject({ preferred: true, reason: 'browser' });
  });
  test('offers it without choosing it for a small file in a capable browser', () => {
    expect(serverImportAdvice(1e6, { ok: true })).toEqual({ offer: true, preferred: false, reason: null });
  });
  test('nothing to offer without a file size', () => {
    expect(serverImportAdvice(0, null).offer).toBe(false);
  });
});

describe('startServerImport', () => {
  const file = { name: 'big.sgy', size: 5e9 };
  const prep = { volumeId: 'vol-1', name: 'Big', crsPlan: { storeTag: null }, customDefs: {}, ingestRec: { fingerprint: { hash: 'h' } } };

  test('uploads, then registers the row, then enqueues stack_to_v4 with everything the worker needs', async () => {
    const order = [];
    const deps = {
      upload: jest.fn(async () => { order.push('upload'); return { id: 'ds-1' }; }),
      prepare: jest.fn(async () => { order.push('prepare'); return prep; }),
      enqueue: jest.fn(async () => { order.push('enqueue'); return 'job-1'; }),
    };
    const out = await startServerImport({ file, mapping: { ilByte: 189 }, scan: { il: {}, xl: {} }, nativeCrs: 'EPSG:32631', name: 'Big' }, deps);
    expect(order).toEqual(['upload', 'prepare', 'enqueue']);
    expect(out).toEqual({ jobId: 'job-1', volumeId: 'vol-1', datasetId: 'ds-1' });
    expect(deps.prepare).toHaveBeenCalledWith({ file, mapping: { ilByte: 189 }, nativeCrs: 'EPSG:32631', name: 'Big' });
    expect(deps.enqueue).toHaveBeenCalledWith('stack_to_v4', {
      dataset_id: 'ds-1', volume_id: 'vol-1', name: 'Big', file_name: 'big.sgy', scan: { il: {}, xl: {} },
      crs_plan: prep.crsPlan, custom_defs: {}, ingest_rec: prep.ingestRec,
    });
  });

  test('an interrupted upload registers no volume and enqueues nothing', async () => {
    const deps = {
      upload: jest.fn(async () => { throw Object.assign(new Error('paused'), { name: 'AbortError' }); }),
      prepare: jest.fn(), enqueue: jest.fn(),
    };
    await expect(startServerImport({ file, mapping: {}, scan: {}, nativeCrs: null }, deps)).rejects.toMatchObject({ name: 'AbortError' });
    expect(deps.prepare).not.toHaveBeenCalled();
    expect(deps.enqueue).not.toHaveBeenCalled();
  });
});

const job = (over = {}) => ({
  id: 'j1', kind: 'stack_to_v4', status: 'running', progress: 0.42, progress_message: 'Converting',
  params: { name: 'Survey A', volume_id: 'vol-1' }, result_refs: null, cancel_requested: false, ...over,
});

describe('jobView', () => {
  test('running import: percent, detail, cancellable, not yet openable', () => {
    expect(jobView(job())).toMatchObject({ title: 'Survey A', kind: 'Server import', pct: 42, detail: 'Converting', canCancel: true, canOpen: false });
  });
  test('openable once the display copy is up, and when done', () => {
    expect(jobView(job({ progress_message: DISPLAY_READY_MESSAGE })).canOpen).toBe(true);
    const done = jobView(job({ status: 'succeeded', progress: 1, result_refs: { volume_id: 'vol-1', trace_count: 1024, display_bytes: 7722, f32_bytes: 35850 } }));
    expect(done).toMatchObject({ canOpen: true, canCancel: false, pct: 100, volumeId: 'vol-1' });
    expect(done.detail).toBe('1,024 traces; display copy 0.0 MB, full copy 0.0 MB');
  });
  test('a failure shows the server message; a requested cancel shows as stopping', () => {
    expect(jobView(job({ status: 'failed', error_message: 'Over quota.' }))).toMatchObject({ detail: 'Over quota.', canOpen: false });
    expect(jobView(job({ cancel_requested: true }))).toMatchObject({ canCancel: false, cancelling: true });
  });
  test('volumesChanged fires only on the poll where a job becomes openable', () => {
    const a = [job()];
    const b = [job({ progress_message: DISPLAY_READY_MESSAGE })];
    expect(volumesChanged(a, b)).toBe(true);
    expect(volumesChanged(b, b)).toBe(false);
    expect(volumesChanged(a, a)).toBe(false);
  });
});

describe('ServerJobsPanel', () => {
  test('lists jobs, cancels one, and opens a finished import', async () => {
    let rows = [
      job(),
      job({ id: 'j2', status: 'succeeded', progress: 1, params: { name: 'Survey B', volume_id: 'vol-2' }, result_refs: { volume_id: 'vol-2', trace_count: 10 } }),
    ];
    const api = {
      listJobs: jest.fn(async () => rows),
      cancelJob: jest.fn(async (id) => { rows = rows.map((r) => (r.id === id ? { ...r, cancel_requested: true } : r)); return 'cancel_requested'; }),
    };
    const onOpen = jest.fn();
    render(<ServerJobsPanel visible api={api} onOpenVolume={onOpen} />);
    expect(await screen.findByText('Survey A')).toBeTruthy();
    expect(screen.getByText('Survey B')).toBeTruthy();
    expect(screen.getAllByRole('progressbar')[0].getAttribute('aria-valuenow')).toBe('42');
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(api.cancelJob).toHaveBeenCalledWith('j1'));
    expect(await screen.findByText('Stopping…')).toBeTruthy();
    fireEvent.click(screen.getByText('Open'));
    expect(onOpen).toHaveBeenCalledWith('vol-2');
  });

  test('says when there are no jobs, and shows a friendly message when the worker is not set up', async () => {
    const { unmount } = render(<ServerJobsPanel visible api={{ listJobs: async () => [], cancelJob: jest.fn() }} />);
    expect(await screen.findByText('No server jobs yet.')).toBeTruthy();
    unmount();
    render(<ServerJobsPanel visible api={{ listJobs: async () => { throw Object.assign(new Error('relation "qi_jobs" does not exist'), { code: '42P01' }); }, cancelJob: jest.fn() }} />);
    expect((await screen.findByRole('alert')).textContent).toBe('The seismic worker is not set up on this server yet.');
  });

  test('does not poll while hidden', async () => {
    const api = { listJobs: jest.fn(async () => []), cancelJob: jest.fn() };
    render(<ServerJobsPanel visible={false} api={api} />);
    await act(async () => {});
    expect(api.listJobs).not.toHaveBeenCalled();
  });
});
