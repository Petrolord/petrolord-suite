/**
 * AS13 — the hook's write paths, against an in-memory query builder.
 *
 * Three defects the AS13 review found live here rather than on a page:
 *
 *   "Verifier, if not you" could not be left blank, because the gate
 *   ran before the hook filled in the current user.
 *   A closed, superseded or cancelled plan still took new items and
 *   new results, from any caller.
 *   'Actions in progress' and 'Verification' were NCR statuses that
 *   nothing ever wrote.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { createFakeSupabase, writesTo } from '../../__tests__/fakeSupabase';
import {
  ncrStatusFromActions,
  planLockReason,
  withDecisionDefaults,
} from '../utils/qaPayload';
import { canDecideCheckpoint } from '@/lib/qualityAssurance';

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

const plan = (id, status) => ({ id, org_id: 'org-1', plan_code: `P-${id}`, title: id, status });
const hold = (id, planId) => ({
  id, plan_id: planId, item_no: '1.1', title: 'Hydrotest', point_type: 'Hold point',
  status: 'Pending', acceptance_criteria: '1.5 x design pressure for 4 hours',
});

const seed = (overrides = {}) => createFakeSupabase({
  qa_plans: [plan('live', 'Active'), plan('closed', 'Closed'), plan('cancelled', 'Cancelled')],
  qa_checkpoints: [hold('cp-live', 'live'), hold('cp-closed', 'closed')],
  qa_ncrs: [],
  qa_capas: [],
  qa_activity_log: [],
  ...overrides,
});

const mount = async () => {
  const view = renderHook(() => useQualityAssurance());
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
};

describe('withDecisionDefaults', () => {
  const today = new Date(2026, 8, 18);

  it('a blank verifier is the person recording the result', () => {
    const row = withDecisionDefaults({ verifier_name: '' }, 'Passed', 'user-1', today);
    expect(row.verified_by).toBe('user-1');
    expect(row.result_date).toBe('2026-09-18');
    // and the gate now accepts it, which it did not when it ran first
    expect(canDecideCheckpoint(hold('x', 'p'), 'Passed', row).ok).toBe(true);
  });

  it('a named verifier replaces any earlier Suite user', () => {
    const row = withDecisionDefaults(
      { verifier_name: 'Class surveyor', verified_by: 'someone-else' }, 'Passed', 'user-1', today);
    expect(row.verified_by).toBeNull();
    expect(row.verifier_name).toBe('Class surveyor');
  });

  it('invents nobody: with no user and no name the gate still refuses', () => {
    const row = withDecisionDefaults({}, 'Passed', null, today);
    expect(row.verified_by).toBeUndefined();
    expect(canDecideCheckpoint(hold('x', 'p'), 'Passed', row).ok).toBe(false);
  });

  it('a status that is not a decision gets no verifier', () => {
    expect(withDecisionDefaults({}, 'In progress', 'user-1', today)).toEqual({});
  });
});

describe('planLockReason', () => {
  it('locks the three terminal statuses and nothing else', () => {
    ['Closed', 'Superseded', 'Cancelled'].forEach((s) => {
      expect(planLockReason(plan('p', s))).toMatch(/can no longer be changed/);
    });
    ['Draft', 'Under review', 'Active'].forEach((s) => {
      expect(planLockReason(plan('p', s))).toBeNull();
    });
  });
});

describe('ncrStatusFromActions', () => {
  const ncr = (status) => ({ id: 'n', status });
  it('follows the actions once the disposition is agreed', () => {
    expect(ncrStatusFromActions(ncr('Disposition agreed'), [])).toBe('Disposition agreed');
    expect(ncrStatusFromActions(ncr('Disposition agreed'), [{ status: 'Open' }]))
      .toBe('Actions in progress');
    expect(ncrStatusFromActions(ncr('Actions in progress'),
      [{ status: 'Complete' }, { status: 'Cancelled' }])).toBe('Verification');
    expect(ncrStatusFromActions(ncr('Verification'), [{ status: 'Complete' }, { status: 'Open' }]))
      .toBe('Actions in progress');
    expect(ncrStatusFromActions(ncr('Verification'), [{ status: 'Cancelled' }]))
      .toBe('Disposition agreed');
  });

  it('leaves the status alone before the disposition and after closure', () => {
    ['Open', 'Under investigation', 'Closed', 'Voided'].forEach((s) => {
      expect(ncrStatusFromActions(ncr(s), [{ status: 'Open' }])).toBe(s);
    });
  });
});

describe('useQualityAssurance writes', () => {
  it('records a Passed hold point with the verifier left blank', async () => {
    mockFake = seed();
    const { result } = await mount();
    let outcome;
    await act(async () => {
      outcome = await result.current.decideCheckpoint(
        hold('cp-live', 'live'), 'Passed', { verifier_name: null, remarks: null });
    });
    expect(outcome.success).toBe(true);
    const [update] = writesTo(mockFake, 'qa_checkpoints', 'update');
    expect(update.payload.status).toBe('Passed');
    expect(update.payload.verified_by).toBe('user-1');
    expect(update.payload.result_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('refuses a result on a closed plan, and writes nothing', async () => {
    mockFake = seed();
    const { result } = await mount();
    let outcome;
    await act(async () => {
      outcome = await result.current.decideCheckpoint(hold('cp-closed', 'closed'), 'Passed', {});
    });
    expect(outcome.success).toBe(false);
    expect(outcome.error).toMatch(/closed/);
    expect(writesTo(mockFake, 'qa_checkpoints')).toEqual([]);
  });

  it('refuses new items, edits and removals on a terminal plan', async () => {
    mockFake = seed();
    const { result } = await mount();
    const outcomes = [];
    await act(async () => {
      outcomes.push(await result.current.addCheckpoints('cancelled',
        [{ item_no: '2', title: 'Late item', point_type: 'Review point' }]));
      outcomes.push(await result.current.updateCheckpoint('cp-closed', { remarks: 'x' }));
      outcomes.push(await result.current.deleteCheckpoint('cp-closed'));
    });
    outcomes.forEach((o) => expect(o.success).toBe(false));
    expect(writesTo(mockFake, 'qa_checkpoints')).toEqual([]);
  });

  it('still takes items on a live plan', async () => {
    mockFake = seed();
    const { result } = await mount();
    let outcome;
    await act(async () => {
      outcome = await result.current.addCheckpoints('live',
        [{ item_no: '2', title: 'Coating check', point_type: 'Review point' }]);
    });
    expect(outcome.success).toBe(true);
    expect(writesTo(mockFake, 'qa_checkpoints', 'insert')).toHaveLength(1);
  });

  it('moves an NCR to Actions in progress, then Verification, as its actions move', async () => {
    const ncr = {
      id: 'ncr-1', org_id: 'org-1', ncr_code: 'N-1', severity: 'Minor',
      status: 'Disposition agreed', disposition: 'Repair', disposition_date: '2026-09-01',
    };
    mockFake = seed({ qa_ncrs: [ncr] });
    const { result } = await mount();
    await act(async () => {
      await result.current.addCapas('ncr-1',
        [{ description: 'Re-weld the joint', due_date: '2026-10-01' }]);
    });
    let statusWrites = writesTo(mockFake, 'qa_ncrs', 'update');
    expect(statusWrites.at(-1).payload.status).toBe('Actions in progress');

    // The next render sees the action and the new status.
    mockFake.tables.qa_ncrs = [{ ...ncr, status: 'Actions in progress' }];
    mockFake.tables.qa_capas = [{
      id: 'capa-1', ncr_id: 'ncr-1', action_type: 'Corrective', status: 'Open',
      description: 'Re-weld the joint', due_date: '2026-10-01',
    }];
    await act(async () => { await result.current.refresh(); });
    await act(async () => {
      await result.current.updateCapa('capa-1',
        { ...mockFake.tables.qa_capas[0], status: 'Complete' });
    });
    statusWrites = writesTo(mockFake, 'qa_ncrs', 'update');
    expect(statusWrites.at(-1).payload.status).toBe('Verification');
  });

  it('agreeing a disposition over open actions lands on Actions in progress', async () => {
    const ncr = {
      id: 'ncr-2', org_id: 'org-1', ncr_code: 'N-2', severity: 'Minor', status: 'Open',
    };
    mockFake = seed({
      qa_ncrs: [ncr],
      qa_capas: [{ id: 'c', ncr_id: 'ncr-2', status: 'Open', action_type: 'Corrective' }],
    });
    const { result } = await mount();
    await act(async () => {
      await result.current.setDisposition(ncr, { disposition: 'Rework' });
    });
    const [update] = writesTo(mockFake, 'qa_ncrs', 'update');
    expect(update.payload.status).toBe('Actions in progress');
  });

  it('refuses action changes on a closed NCR', async () => {
    mockFake = seed({
      qa_ncrs: [{ id: 'ncr-3', org_id: 'org-1', status: 'Closed', severity: 'Minor' }],
      qa_capas: [{ id: 'c3', ncr_id: 'ncr-3', status: 'Complete', action_type: 'Corrective' }],
    });
    const { result } = await mount();
    const outcomes = [];
    await act(async () => {
      outcomes.push(await result.current.addCapas('ncr-3', [{ description: 'x', due_date: '2026-10-01' }]));
      outcomes.push(await result.current.updateCapa('c3', { status: 'Open' }));
      outcomes.push(await result.current.deleteCapa('c3'));
    });
    outcomes.forEach((o) => expect(o.success).toBe(false));
    expect(writesTo(mockFake, 'qa_capas')).toEqual([]);
  });
});
