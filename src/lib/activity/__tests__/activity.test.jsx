// Activity (Guided Journey design 6.4): the registry, the leave decision, the
// server-jobs reader, the Seismolord mapping, the indicator and the leave guard.
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import {
  publishActivity, getActivity, resetActivity, buildActivity, appOfPath, leaveVerdict,
} from '../activity';
import { jobItem, startServerJobs } from '../sources/serverJobs';

const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

const SEIS = '/dashboard/apps/geoscience/seismolord';
const item = (over) => ({ id: 'a', appId: 'seismolord', appName: 'Seismolord', kind: 'upload', title: 'stack.zgy: uploading', state: 'running', href: SEIS, onLeave: 'continues', ...over });

beforeEach(() => { resetActivity(); mockToast.mockReset(); });

describe('registry and decisions', () => {
  test('sources replace their own items; an empty list removes the source', () => {
    publishActivity('seismolord', [item({ id: '1' }), item({ id: '2', state: 'done' })]);
    publishActivity('server-jobs', [item({ id: 'j', kind: 'server-job' })]);
    expect(getActivity().map((i) => i.id)).toEqual(['1', '2', 'j']);
    publishActivity('seismolord', []);
    expect(getActivity().map((i) => i.id)).toEqual(['j']);
    expect(getActivity()[0].onLeave).toBe('continues');   // default
  });
  test('summary: running, attention and done', () => {
    const a = buildActivity([item({ id: '1' }), item({ id: '2', state: 'failed' }), item({ id: '3', state: 'done' })]);
    expect(a).toMatchObject({ count: 2, running: true, attention: 1, done: 1 });
  });
  test('app of a path', () => {
    expect(appOfPath('/dashboard/apps/geoscience/seismolord?panel=jobs')).toBe('seismolord');
    expect(appOfPath('/dashboard/projects')).toBeNull();
  });
  test('leaving Seismolord: background work carries on; staying inside is not leaving', () => {
    const items = [item({ id: '1' })];
    expect(leaveVerdict(items, SEIS, '/dashboard/apps/geoscience/well-data-manager')).toMatchObject({ leaving: true, block: [], carryOn: [items[0]] });
    expect(leaveVerdict(items, SEIS, `${SEIS}/help`).leaving).toBe(false);
  });
  test('work that would be lost blocks; other apps\' work never blocks', () => {
    const lose = item({ id: 'x', onLeave: 'loses', state: 'dirty', title: 'Unsaved separator case' });
    const other = item({ id: 'y', onLeave: 'loses', state: 'dirty', href: '/dashboard/apps/facilities/relief-blowdown-sizer' });
    const v = leaveVerdict([lose, other], SEIS, '/dashboard');
    expect(v.block.map((i) => i.id)).toEqual(['x']);
    // negative control: finished work never blocks
    expect(leaveVerdict([item({ onLeave: 'loses', state: 'done' })], SEIS, '/dashboard').block).toEqual([]);
  });
});

describe('server jobs', () => {
  test('a row becomes an item that links back to its app', () => {
    expect(jobItem({ id: 'j1', kind: 'stack_to_v4', status: 'running', progress: 0.4, progress_message: 'Converting', params: { name: 'stack.zgy' } }))
      .toMatchObject({ id: 'job:j1', appName: 'Seismolord', title: 'Converting a volume: stack.zgy (Converting)', progress: 0.4, state: 'running', href: `${SEIS}?panel=jobs` });
    expect(jobItem({ id: 'j2', kind: 'poststack_inversion', status: 'failed', params: {} })).toMatchObject({ appName: 'QI Studio', state: 'failed' });
    expect(jobItem({ id: 'j3', kind: 'stack_to_v4', status: 'queued', params: {} }).title).toBe('Converting a volume (waiting for the server)');
  });

  test('polls only while something runs, and keeps a finished job for the session', async () => {
    let rows = [{ id: 'j1', kind: 'stack_to_v4', status: 'running', progress: 0.5, params: { name: 'a.zgy' } }];
    const calls = [];
    const q = () => {
      const b = {
        _ids: null,
        select: () => b, eq: (c, v) => { calls.push(['eq', c, v]); return b; },
        in: (c, v) => { if (c === 'id') b._ids = v; return b; },
        order: () => b,
        limit: async () => ({ data: rows.filter((r) => r.status === 'queued' || r.status === 'running'), error: null }),
        then: (res) => res({ data: rows.filter((r) => (b._ids || []).includes(r.id)), error: null }),
      };
      return b;
    };
    const supabase = { from: () => q() };
    const timers = []; const st = (fn) => { timers.push(fn); return timers.length; }; const ct = () => {};
    const stop = startServerJobs(supabase, 'u1', { setTimeout: st, clearTimeout: ct });
    await waitFor(() => expect(getActivity()).toHaveLength(1));
    expect(calls).toContainEqual(['eq', 'user_id', 'u1']);
    expect(timers).toHaveLength(1);   // something runs: poll again
    rows = [{ ...rows[0], status: 'succeeded', progress: 1 }];
    await act(async () => { await timers[0](); });
    expect(getActivity()[0]).toMatchObject({ state: 'done' });
    expect(timers).toHaveLength(1);   // nothing runs: no more polling
    stop();
    expect(getActivity()).toEqual([]);
  });
});

describe('Seismolord mapping', () => {
  // the bridge maps runtime snapshots; imported lazily so its runtimes are not started here
  const { serverUploadItem, browserJobItem } = jest.requireActual('../../../pages/apps/Seismolord/services/activityBridge');
  test('an upload to the server and a job on this computer', () => {
    expect(serverUploadItem({ id: 'u1', name: 'a.zgy', phase: 'uploading', bytesDone: 25, bytesTotal: 100 }))
      .toMatchObject({ id: 'sl-upload:u1', state: 'running', progress: 0.25, href: SEIS, onLeave: 'continues' });
    const paused = serverUploadItem({ id: 'u2', name: 'a.zgy', phase: 'paused', bytesDone: 25, bytesTotal: 100 });
    expect(Object.keys(paused.actions).sort()).toEqual(['dismiss', 'resume']);
    expect(browserJobItem({ id: 'b', name: 'Coherence', phase: 'running', fraction: 0.3 }).title).toBe('Coherence: 30% on this computer');
  });
});

describe('indicator and leave guard', () => {
  const ActivityButton = jest.requireActual('../../../components/activity/ActivityButton').default;
  const LeaveGuard = jest.requireActual('../../../components/activity/LeaveGuard').default;

  function Shell() {
    return (
      <>
        <ActivityButton variant="sidebar" />
        <LeaveGuard />
        <Routes>
          <Route path="/dashboard/apps/geoscience/seismolord" element={<div>In Seismolord <Link to="/dashboard/apps/geoscience/well-data-manager">Well Data Manager</Link></div>} />
          <Route path="/dashboard/apps/geoscience/well-data-manager" element={<div>In Well Data Manager</div>} />
        </Routes>
      </>
    );
  }

  test('the indicator lists the items with a count', async () => {
    publishActivity('seismolord', [item({ id: '1', title: 'stack.zgy: uploading to the server 40%', progress: 0.4 })]);
    render(<MemoryRouter initialEntries={[SEIS]}><Shell /></MemoryRouter>);
    expect(screen.getByTestId('activity-count').textContent).toBe('1');
    fireEvent.click(screen.getByTestId('activity-button-sidebar'));
    expect(await screen.findByText('stack.zgy: uploading to the server 40%')).toBeTruthy();
  });

  test('leaving with an upload running: the link works and a toast says it carries on', async () => {
    publishActivity('seismolord', [item({ id: '1', title: 'stack.zgy: uploading' })]);
    render(<MemoryRouter initialEntries={[SEIS]}><Shell /></MemoryRouter>);
    fireEvent.click(screen.getByText('Well Data Manager'));
    expect(await screen.findByText('In Well Data Manager')).toBeTruthy();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Carrying on in the background' }));
  });

  test('leaving with unsaved work: asked first; Stay stays, Save and leave saves then goes', async () => {
    const save = jest.fn(async () => {});
    publishActivity('seismolord', [item({ id: 'x', onLeave: 'loses', state: 'dirty', title: 'Horizon edits not saved', actions: { save } })]);
    render(<MemoryRouter initialEntries={[SEIS]}><Shell /></MemoryRouter>);
    fireEvent.click(screen.getByText('Well Data Manager'));
    expect(await screen.findByTestId('leave-dialog')).toBeTruthy();
    expect(screen.getByText('In Seismolord', { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByTestId('leave-stay'));
    await waitFor(() => expect(screen.queryByTestId('leave-dialog')).toBeNull());
    fireEvent.click(screen.getByText('Well Data Manager'));
    fireEvent.click(await screen.findByTestId('leave-save'));
    expect(await screen.findByText('In Well Data Manager')).toBeTruthy();
    expect(save).toHaveBeenCalledTimes(1);
  });
});
