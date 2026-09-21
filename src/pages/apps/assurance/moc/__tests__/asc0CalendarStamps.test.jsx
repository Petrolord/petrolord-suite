/**
 * ASC-0 (RC-5): the MOC hook stamps the implementation and closure dates
 * as the LOCAL calendar date the user acted on.
 *
 * Both columns are timestamptz but mean a calendar date, and the engine
 * reads their leading YYYY-MM-DD (the emergency ratification window runs
 * seven days from the implementation date). The hook wrote
 * `new Date().toISOString()`, whose leading date is the UTC date: in
 * Lagos a change implemented at 00:30 on 18 September was stamped 17
 * September, and its ratification window closed a day early.
 *
 * The clock is pinned at 23:30 UTC on 17 September, which is 00:30 on
 * 18 September in Lagos. Whatever zone the suite runs in, the stamp must
 * be that zone's calendar date and nothing else.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { ratificationState, toDateOnlyString } from '@/lib/managementOfChange';
import { createFakeSupabase, writesTo } from '../../__tests__/fakeSupabase';

let mockFake;
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: (table) => mockFake.from(table),
    rpc: (...args) => mockFake.rpc(...args),
  },
}));
jest.mock('@/contexts/SupabaseAuthContext', () => ({
  useAuth: () => ({ organization: { id: 'org-1' }, user: { id: 'user-1' } }),
}));

import { useManagementOfChange } from '../hooks/useManagementOfChange';

const LAGOS_HALF_PAST_MIDNIGHT = Date.UTC(2026, 8, 17, 23, 30);

beforeEach(() => {
  // Fake the clock only: promises and timers stay real so waitFor works.
  jest.useFakeTimers({
    now: LAGOS_HALF_PAST_MIDNIGHT,
    doNotFake: [
      'hrtime', 'nextTick', 'performance', 'queueMicrotask',
      'requestAnimationFrame', 'cancelAnimationFrame',
      'requestIdleCallback', 'cancelIdleCallback',
      'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval',
      'setTimeout', 'clearTimeout',
    ],
  });
});
afterEach(() => { jest.useRealTimers(); });

const emergency = {
  id: 'm1', org_id: 'org-1', moc_code: 'MOC-2026-001', title: 'Clamp', type: 'Emergency',
  originator_id: 'originator', expiry_date: '2026-12-31',
};

const mount = async (record, approvals = []) => {
  mockFake = createFakeSupabase({
    moc_records: [record],
    moc_approvals: approvals,
    moc_actions: [], moc_impacts: [], moc_activity_log: [],
  });
  const view = renderHook(() => useManagementOfChange());
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
};

const lastMocUpdate = () => {
  const updates = writesTo(mockFake, 'moc_records', 'update');
  return updates[updates.length - 1].payload;
};

describe('ASC-0 RC-5: implementation and closure are calendar dates', () => {
  it('stamps actual_implementation_date as the local calendar date', async () => {
    const { result } = await mount({ ...emergency, stage: 'Approval' }, [
      { id: 'a1', moc_id: 'm1', approver_id: 'approver-1', level: 1, status: 'Approved' },
      { id: 'a2', moc_id: 'm1', approver_id: 'approver-2', level: 2, status: 'Pending' },
    ]);
    let out;
    await act(async () => {
      out = await result.current.advance(result.current.records[0], 'Implementation');
    });
    expect(out.success).toBe(true);
    const stamp = lastMocUpdate().actual_implementation_date;
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(stamp).toBe(toDateOnlyString(new Date()));
  });

  it('stamps closure_date as the local calendar date', async () => {
    const { result } = await mount({
      ...emergency, type: 'Permanent', stage: 'Implementation',
      actual_implementation_date: '2026-09-10',
    });
    let out;
    await act(async () => {
      out = await result.current.advance(result.current.records[0], 'Closed');
    });
    expect(out.success).toBe(true);
    const stamp = lastMocUpdate().closure_date;
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(stamp).toBe(toDateOnlyString(new Date()));
  });

  it('a local stamp read back from timestamptz keeps the full seven-day window', () => {
    // Postgres (session zone UTC) returns '2026-09-18' as midnight UTC.
    const state = ratificationState(
      { type: 'Emergency', stage: 'Implementation', actual_implementation_date: '2026-09-18T00:00:00+00:00' },
      [{ level: 1, status: 'Approved' }, { level: 2, status: 'Pending' }],
      new Date(2026, 8, 25),
    );
    expect(state.dueDate).toBe('2026-09-25');
    expect(state.state).toBe('Awaiting ratification');
  });
});
