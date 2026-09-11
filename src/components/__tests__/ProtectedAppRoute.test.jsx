// 2026-09-11: the gate in front of every app route must settle. It used to
// re-run its "fresh data on mount" effect after every render, because the
// effect depends on `refetch`, which useUserEntitlements rebuilt on each
// render. Every pass forced a fresh entitlement read and flipped `loading`,
// so the full-screen spinner replaced the app again and again: the apps
// flickered continuously and could not be used. One mount, one read.
//
// The assertions count calls after real time has passed rather than waiting
// for React to go quiet, because the defect never let it go quiet.
import React from 'react';
import { render, screen } from '@testing-library/react';
import ProtectedAppRoute from '../ProtectedAppRoute';

const mockInvoke = jest.fn();
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: { functions: { invoke: (...a) => mockInvoke(...a) } },
}));

let mockAuthValue;
jest.mock('@/contexts/SupabaseAuthContext', () => ({
  useAuth: () => mockAuthValue,
}));

const tick = (ms) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue({ data: { accessible_app_ids: ['app-1'], entitlements: [] }, error: null });
  mockAuthValue = { user: { id: 'u1' }, isSuperAdmin: false, loading: false };
  window.localStorage.clear();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); });

test('one mount settles on the app, with a bounded number of reads', async () => {
  render(<ProtectedAppRoute appId="app-1" appName="Test App"><div>THE APP</div></ProtectedAppRoute>);
  await tick(300);
  // Two on a cold cache, by design: the hook's own cache-first read on mount,
  // and the gate's forced read that refuses to open an app on a stale licence.
  // What matters is that it is a fixed handful and not a stream.
  expect(mockInvoke.mock.calls.length).toBeLessThanOrEqual(2);
  expect(screen.getByText('THE APP')).toBeTruthy();
});

test('the gate stops reading once it has an answer', async () => {
  render(<ProtectedAppRoute appId="app-1" appName="Test App"><div>THE APP</div></ProtectedAppRoute>);
  await tick(300);
  const afterFirstSettle = mockInvoke.mock.calls.length;
  await tick(300);
  // A loop shows up as a count that keeps climbing while nothing else happens.
  expect(mockInvoke.mock.calls.length).toBe(afterFirstSettle);
});
