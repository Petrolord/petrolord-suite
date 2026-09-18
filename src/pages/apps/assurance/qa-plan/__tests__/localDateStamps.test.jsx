/**
 * AS13 hardening: the dates the QA hook stamps are the user's LOCAL
 * calendar date.
 *
 * They were `new Date().toISOString().slice(0, 10)`, which is the UTC
 * date. East of Greenwich in the morning (or west of it in the evening)
 * that is a different day, so an NCR raised then carried yesterday's or
 * tomorrow's date and its age read -1, dropping it out of every age
 * band. The clock below is 08:00 on 18 September in Auckland, which is
 * still 17 September in UTC.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
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

// jest.mock is hoisted above every import, so the hook sees the fakes.
import { useQualityAssurance } from '../hooks/useQualityAssurance';

const NOW = Date.UTC(2026, 8, 17, 20, 0); // 08:00 on 18 Sep in Auckland

// Jest's sandbox cannot switch the process time zone, so the local
// getters are moved 12 hours east (Auckland in September, UTC+12). The
// UTC getters and toISOString are left alone, which is exactly the gap
// the old stamp fell into.
const SHIFT_MS = 12 * 60 * 60 * 1000;
const LOCAL_GETTERS = {
  getFullYear: 'getUTCFullYear',
  getMonth: 'getUTCMonth',
  getDate: 'getUTCDate',
  getDay: 'getUTCDay',
  getHours: 'getUTCHours',
};

beforeAll(() => {
  jest.useFakeTimers({
    now: NOW,
    doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout',
      'setInterval', 'clearInterval', 'queueMicrotask'],
  });
  const RealDate = Date;
  Object.entries(LOCAL_GETTERS).forEach(([local, utc]) => {
    jest.spyOn(Date.prototype, local).mockImplementation(function shifted() {
      return new RealDate(this.valueOf() + SHIFT_MS)[utc]();
    });
  });
});

afterAll(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it('the clock really is on two different days in UTC and locally', () => {
  // The negative control: the old stamp gives the UTC day.
  expect(new Date().toISOString().slice(0, 10)).toBe('2026-09-17');
  expect(new Date().getDate()).toBe(18);
});

it('an NCR raised now is stamped with the local date, so its age is 0', async () => {
  mockFake = createFakeSupabase({ qa_plans: [], qa_checkpoints: [], qa_ncrs: [], qa_capas: [] });
  const view = renderHook(() => useQualityAssurance());
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  let outcome;
  await act(async () => {
    outcome = await view.result.current.createNcr({
      title: 'Weld undercut',
      description: 'Undercut on spool 4 weld 12',
      severity: 'Minor',
      requirement_ref: 'ASME B31.3 table 341.3.2',
    });
  });
  expect(outcome.success).toBe(true);
  const [insert] = writesTo(mockFake, 'qa_ncrs', 'insert');
  expect(insert.payload[0].raised_date).toBe('2026-09-18');
});
