/**
 * AS15 owner decisions, through the MOC hook.
 *
 * Segregation of duties: an approval is decided by its assignee, and the
 * originator never approves their own change. Before AS15 any member
 * could decide any level, and "Add a gate" always assigned the person
 * who clicked it, so an originator could add themselves and approve.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { createFakeSupabase, writesTo } from '../../__tests__/fakeSupabase';

let mockFake;
let mockUserId = 'originator';
const mockUser = { get id() { return mockUserId; } };
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: (table) => mockFake.from(table),
    rpc: (...args) => mockFake.rpc(...args),
  },
}));
jest.mock('@/contexts/SupabaseAuthContext', () => ({
  useAuth: () => ({ organization: { id: 'org-1' }, user: mockUser }),
}));

import { useManagementOfChange } from '../hooks/useManagementOfChange';

const change = {
  id: 'm1', org_id: 'org-1', moc_code: 'MOC-2026-001', title: 'Clamp', type: 'Emergency',
  stage: 'Approval', originator_id: 'originator', expiry_date: '2026-12-31',
};
const approval = (id, approverId, level, status = 'Pending') => ({
  id, moc_id: 'm1', approver_id: approverId, level, status,
});

const seed = () => createFakeSupabase({
  moc_records: [change],
  moc_approvals: [approval('a1', 'approver-1', 1), approval('a2', 'approver-2', 2)],
  moc_actions: [],
  moc_impacts: [],
  moc_activity_log: [],
});

const mount = async () => {
  const view = renderHook(() => useManagementOfChange());
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
};

beforeEach(() => { mockUserId = 'originator'; });

describe('AS15: who decides an MOC approval', () => {
  it('refuses the originator as an approver', async () => {
    mockFake = seed();
    const { result } = await mount();
    let out;
    await act(async () => {
      out = await result.current.addApprover('m1', { approver_id: 'originator', role: 'TA', level: 3 });
    });
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/originator/);
    expect(writesTo(mockFake, 'moc_approvals', 'insert')).toEqual([]);
  });

  it('lets only the assignee decide, and records nothing otherwise', async () => {
    mockFake = seed();
    const { result } = await mount();
    const target = result.current.approvals.find((a) => a.id === 'a1');
    let refused;
    mockUserId = 'approver-2';
    await act(async () => { refused = await result.current.decideApproval(target, 'Approved', ''); });
    expect(refused.success).toBe(false);
    expect(refused.error).toMatch(/assigned to/);
    expect(writesTo(mockFake, 'moc_approvals', 'update')).toEqual([]);

    let allowed;
    mockUserId = 'approver-1';
    await act(async () => { allowed = await result.current.decideApproval(target, 'Approved', ''); });
    expect(allowed.success).toBe(true);
    expect(writesTo(mockFake, 'moc_approvals', 'update')).toHaveLength(1);
  });

  it('reassigns a pending approval, but never to the originator', async () => {
    mockFake = seed();
    const { result } = await mount();
    const target = result.current.approvals.find((a) => a.id === 'a2');
    let refused;
    let allowed;
    await act(async () => {
      refused = await result.current.reassignApproval(target, 'originator');
      allowed = await result.current.reassignApproval(target, 'deputy');
    });
    expect(refused.success).toBe(false);
    expect(allowed.success).toBe(true);
    const [upd] = writesTo(mockFake, 'moc_approvals', 'update');
    expect(upd.payload).toEqual({ approver_id: 'deputy' });
  });
});

describe('AS15: an emergency change goes in on its first level', () => {
  it('advances to Implementation with level 1 signed and level 2 still pending', async () => {
    mockFake = createFakeSupabase({
      moc_records: [change],
      moc_approvals: [approval('a1', 'approver-1', 1, 'Approved'), approval('a2', 'approver-2', 2)],
      moc_actions: [], moc_impacts: [], moc_activity_log: [],
    });
    const { result } = await mount();
    let out;
    await act(async () => {
      out = await result.current.advance(result.current.records[0], 'Implementation');
    });
    expect(out.success).toBe(true);
  });

  it('a permanent change with the same approvals still waits for every level', async () => {
    mockFake = createFakeSupabase({
      moc_records: [{ ...change, type: 'Permanent' }],
      moc_approvals: [approval('a1', 'approver-1', 1, 'Approved'), approval('a2', 'approver-2', 2)],
      moc_actions: [], moc_impacts: [], moc_activity_log: [],
    });
    const { result } = await mount();
    let out;
    await act(async () => {
      out = await result.current.advance(result.current.records[0], 'Implementation');
    });
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/level 2/);
  });
});
