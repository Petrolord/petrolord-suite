/**
 * AS13: Management of Change repairs, against an in-memory query
 * builder.
 *
 *   A temporary or emergency draft saved without an expiry date could
 *   not leave Draft, not even to Cancelled, and had no way to gain one.
 *   Gates, decisions and actions stayed open to change on Closed,
 *   Rejected and Cancelled changes.
 *   Actions and impacts wrote nothing to moc_activity_log, although the
 *   dashboard said they would appear there.
 *   The expiry badge said "No expiry" beside a real date, and the
 *   expiry report listed changes that never went in.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { EXPIRY } from '@/lib/managementOfChange';
import { createFakeSupabase, writesTo } from '../../__tests__/fakeSupabase';
import { mocLockReason, validateExpiryEdit, validateMoc } from '../utils/mocPayload';
import { NOT_YET_IN_EFFECT, expiryDisplay, expiryReportRows } from '../utils/expiryDisplay';

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
import { useManagementOfChange } from '../hooks/useManagementOfChange';

const TODAY = new Date(2026, 8, 18);

const moc = (id, stage, extra = {}) => ({
  id,
  org_id: 'org-1',
  moc_code: `M-${id}`,
  title: id,
  type: 'Temporary',
  category: 'Facility or hardware',
  stage,
  current_situation: 'Existing clamp',
  ...extra,
});

const seed = (records, children = {}) => createFakeSupabase({
  moc_records: records,
  moc_approvals: [],
  moc_actions: [],
  moc_impacts: [],
  moc_activity_log: [],
  ...children,
});

const mount = async () => {
  const view = renderHook(() => useManagementOfChange());
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
};

describe('the create form asks for the expiry date at Save draft', () => {
  const base = { title: 'Clamp', category: 'Other', description: 'Fit a clamp' };

  it('refuses a temporary or emergency draft without one', () => {
    ['Temporary', 'Emergency'].forEach((type) => {
      expect(validateMoc({ ...base, type, stage: 'Draft' }).expiry_date)
        .toMatch(/needs an expiry date, even as a draft/);
    });
  });

  it('accepts one with a date, and a permanent draft without', () => {
    expect(validateMoc({ ...base, type: 'Temporary', stage: 'Draft', expiry_date: '2027-01-01' }))
      .toEqual({});
    expect(validateMoc({ ...base, type: 'Permanent', stage: 'Draft' })).toEqual({});
  });
});

describe('validateExpiryEdit', () => {
  it('lets a stuck draft gain its date', () => {
    expect(validateExpiryEdit(moc('a', 'Draft'), '2027-01-01')).toBeNull();
  });

  it('refuses past Draft, on a permanent change, and an unreadable or early date', () => {
    expect(validateExpiryEdit(moc('a', 'Screening'), '2027-01-01')).toMatch(/only be changed while/);
    expect(validateExpiryEdit(moc('a', 'Draft', { type: 'Permanent' }), '2027-01-01'))
      .toMatch(/Only a temporary/);
    expect(validateExpiryEdit(moc('a', 'Draft'), '')).toMatch(/Pick the date/);
    expect(validateExpiryEdit(
      moc('a', 'Draft', { target_implementation_date: '2027-02-01' }), '2027-01-01',
    )).toMatch(/expire before it is implemented/);
  });
});

describe('mocLockReason', () => {
  it('locks Closed, Rejected and Cancelled and nothing else', () => {
    ['Closed', 'Rejected', 'Cancelled'].forEach((s) => expect(mocLockReason(moc('a', s))).toBeTruthy());
    ['Draft', 'Screening', 'Review', 'Approval', 'Implementation']
      .forEach((s) => expect(mocLockReason(moc('a', s))).toBeNull());
  });
});

describe('expiryDisplay', () => {
  it('a change not yet in effect shows its date as planned, never "No expiry"', () => {
    const shown = expiryDisplay(moc('a', 'Review', { expiry_date: '2027-01-15' }), TODAY);
    expect(shown.state).toBe(NOT_YET_IN_EFFECT);
    expect(shown.label).toBe('Expires 15 Jan 2027 once in effect');
    expect(shown.label).not.toMatch(/No expiry/);
  });

  it('a rejected or cancelled change is not on the expiry report at all', () => {
    ['Rejected', 'Cancelled'].forEach((s) => {
      expect(expiryDisplay(moc('a', s, { expiry_date: '2027-01-15' }), TODAY)).toBeNull();
    });
  });

  it('a change in effect reads the rule\'s state unchanged', () => {
    expect(expiryDisplay(moc('a', 'Implementation', { expiry_date: '2026-09-01' }), TODAY).state)
      .toBe(EXPIRY.EXPIRED);
    expect(expiryDisplay(moc('a', 'Implementation', { expiry_date: '2026-09-25' }), TODAY).state)
      .toBe(EXPIRY.EXPIRING);
    expect(expiryDisplay(moc('a', 'Draft', { type: 'Permanent' }), TODAY)).toBeNull();
  });
});

describe('a closed temporary change (AS13 hardening)', () => {
  it('reads Closed out in the register and detail, with no expiry wording', () => {
    const shown = expiryDisplay(moc('a', 'Closed', { expiry_date: '2026-09-01' }), TODAY);
    expect(shown.state).toBe(EXPIRY.CLOSED_OUT);
    expect(shown.label).toBe('Closed out');
    expect(shown.title).not.toMatch(/expires/);
  });

  it('leaves the expiry report, which lists only changes still to be reverted', () => {
    const rows = expiryReportRows([
      moc('closed', 'Closed', { expiry_date: '2026-09-01' }),
      moc('live', 'Implementation', { expiry_date: '2026-09-25' }),
      moc('planned', 'Review', { expiry_date: '2026-10-25' }),
      moc('rejected', 'Rejected', { expiry_date: '2026-09-20' }),
      moc('perm', 'Implementation', { type: 'Permanent' }),
    ], TODAY);
    expect(rows.map((r) => r.id)).toEqual(['live', 'planned']);
    expect(rows.map((r) => r.state)).toEqual([EXPIRY.EXPIRING, NOT_YET_IN_EFFECT]);
  });

  it('an empty report is honest when the only temporary change is closed', () => {
    expect(expiryReportRows([moc('closed', 'Closed', { expiry_date: '2026-09-01' })], TODAY))
      .toEqual([]);
  });
});

describe('useManagementOfChange writes', () => {
  it('a stuck temporary draft can be given its expiry date, and it is logged', async () => {
    mockFake = seed([moc('d1', 'Draft')]);
    const { result } = await mount();
    let outcome;
    await act(async () => {
      outcome = await result.current.setExpiry(result.current.records[0], '2027-03-31');
    });
    expect(outcome.success).toBe(true);
    const [update] = writesTo(mockFake, 'moc_records', 'update');
    expect(update.payload.expiry_date).toBe('2027-03-31');
    const logs = writesTo(mockFake, 'moc_activity_log', 'insert');
    expect(logs.at(-1).payload[0].action).toMatch(/Expiry date set to 2027-03-31/);
  });

  it('refuses gates, decisions, actions and impacts on a final change', async () => {
    const closed = moc('c1', 'Closed', { expiry_date: '2027-01-01' });
    mockFake = seed([closed], {
      moc_approvals: [{ id: 'ap1', moc_id: 'c1', level: 1, status: 'Pending' }],
      moc_actions: [{ id: 'ac1', moc_id: 'c1', status: 'Open', action_type: 'Implementation', description: 'x' }],
    });
    const { result } = await mount();
    const outcomes = [];
    await act(async () => {
      outcomes.push(await result.current.addApprover('c1', { approver_id: 'user-1', role: 'TA', level: 2 }));
      outcomes.push(await result.current.decideApproval({ id: 'ap1', moc_id: 'c1', level: 1 }, 'Approved', ''));
      outcomes.push(await result.current.addActions('c1', [{ description: 'Late', action_type: 'Implementation' }]));
      outcomes.push(await result.current.updateAction('ac1', { status: 'Complete' }));
      outcomes.push(await result.current.addImpacts('c1', [{ impact_area: 'Operations' }]));
    });
    outcomes.forEach((o) => {
      expect(o.success).toBe(false);
      expect(o.error).toMatch(/closed/);
    });
    expect(mockFake.writes).toEqual([]);
  });

  it('only a draft can be deleted', async () => {
    mockFake = seed([moc('s1', 'Screening', { expiry_date: '2027-01-01' })]);
    const { result } = await mount();
    let outcome;
    await act(async () => { outcome = await result.current.deleteMoc('s1'); });
    expect(outcome.success).toBe(false);
    expect(writesTo(mockFake, 'moc_records', 'delete')).toEqual([]);
  });

  it('adding and completing an action, and recording an impact, write the audit trail', async () => {
    mockFake = seed([moc('r1', 'Review', { expiry_date: '2027-01-01' })], {
      moc_actions: [{ id: 'ac2', moc_id: 'r1', status: 'Open', action_type: 'Pre-implementation', description: 'Update the P&ID' }],
    });
    const { result } = await mount();
    await act(async () => {
      await result.current.addActions('r1', [{ description: 'Brief the crews', action_type: 'Implementation' }]);
      await result.current.updateAction('ac2', { status: 'Complete' });
      await result.current.addImpacts('r1', [{ impact_area: 'Process safety', severity: 'High' }]);
    });
    const logged = writesTo(mockFake, 'moc_activity_log', 'insert')
      .map((w) => w.payload[0]);
    expect(logged.map((l) => l.moc_id)).toEqual(['r1', 'r1', 'r1']);
    expect(logged.map((l) => l.action)).toEqual([
      'Implementation action added: Brief the crews',
      'Action marked complete: Update the P&ID',
      'Impact assessment recorded: Process safety',
    ]);
  });
});
