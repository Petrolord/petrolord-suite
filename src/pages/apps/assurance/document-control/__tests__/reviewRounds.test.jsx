/**
 * AS13 hardening — Document Control's review rounds, schema detection
 * and review dates, run through the hook against an in-memory database.
 *
 * 1. A rejected revision could never be approved on a second review: the
 *    outcome was computed over every task ever raised on the revision,
 *    the old rejection included.
 * 2. After a rejection the other reviewers' tasks stayed Pending, which
 *    blocked a new revision while the queue told the author to revise.
 * 3. On an EMPTY library the schema was assumed new, so the full form
 *    was offered, the insert failed and the retry dropped the purpose and
 *    review period while reporting success.
 * 4. Edit details re-derived a published document's review date on the
 *    24-month default instead of its own period.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { makeSchemaFake } from '../../shared/__tests__/fakeSupabaseSchema';
import { useDocumentControl } from '../hooks/useDocumentControl';
import {
  CLOSED_TASK_STATUS,
  as4ValuesEntered,
  buildDocumentWrite,
  canPublish,
  canStartRevision,
  canSubmitForReview,
  currentRoundOf,
  pendingReviewTasks,
  reviewOutcome,
  roundOf,
  tasksToClose,
} from '../utils/documentPayload';

let mockDb;
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: (...args) => mockDb.client.from(...args),
    rpc: (...args) => mockDb.client.rpc(...args),
    get storage() { return mockDb.client.storage; },
  },
}));
jest.mock('@/contexts/SupabaseAuthContext', () => ({
  useAuth: () => ({ organization: { id: 'org-1' }, user: { id: 'author' } }),
}));

const ORG = 'org-1';
const T1 = '2026-09-01T09:00:00.000Z';
const T2 = '2026-09-05T09:00:00.000Z';

const AS4_DOC_COLUMNS = ['description', 'review_period_months', 'superseded_by'];
const AS4_REV_COLUMNS = ['storage_path', 'file_type', 'is_current'];

const seed = () => ({
  documents: [{
    id: 'd1', org_id: ORG, document_number: 'HSE-POL-001', title: 'Policy', status: 'In Review',
    current_revision: '01', department: 'HSE', description: null, review_period_months: 24,
    superseded_by: null, updated_at: T1,
  }],
  doc_categories: [],
  doc_revisions: [{
    id: 'r1', document_id: 'd1', revision_number: '01', status: 'In Review', is_current: true, created_at: T1,
  }],
  doc_workflows: [
    { id: 'w1', revision_id: 'r1', reviewer_id: 'u1', role: 'Reviewer', status: 'Pending', created_at: T1 },
    { id: 'w2', revision_id: 'r1', reviewer_id: 'u2', role: 'Approver', status: 'Pending', created_at: T1 },
    { id: 'w3', revision_id: 'r1', reviewer_id: 'u3', role: 'Reviewer', status: 'Pending', created_at: T1 },
  ],
  doc_activity_log: [],
  organization_members: [],
});

const setup = async (initial = seed(), missing = {}) => {
  mockDb = makeSchemaFake(initial, { missing });
  const view = renderHook(() => useDocumentControl());
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
};

const task = (result, id) => result.current.approvals.find((a) => a.id === id);
const docOf = (result) => result.current.documents.find((d) => d.id === 'd1');
const wf = (id) => mockDb.tables.doc_workflows.find((w) => w.id === id);

describe('review rounds (pure)', () => {
  const old = [
    { id: 'a', revision_id: 'r1', status: 'Rejected', created_at: T1 },
    { id: 'b', revision_id: 'r1', status: CLOSED_TASK_STATUS, created_at: T1 },
  ];
  const fresh = [
    { id: 'c', revision_id: 'r1', status: 'Approved', created_at: T2 },
    { id: 'd', revision_id: 'r1', status: 'Approved', created_at: T2 },
  ];

  it('the current round is the latest Submit for review, and its outcome ignores the old rejection', () => {
    const all = [...fresh, ...old];
    expect(currentRoundOf(all, 'r1').map((w) => w.id)).toEqual(['c', 'd']);
    expect(reviewOutcome(currentRoundOf(all, 'r1'))).toBe('Approved');
    // What the app used to compute: every task on the revision.
    expect(reviewOutcome(all)).toBe('Rejected');
  });

  it('roundOf keeps a decision inside the round it was raised in', () => {
    expect(roundOf([...old, ...fresh], old[0]).map((w) => w.id)).toEqual(['a', 'b']);
  });

  it('Closed tasks carry no decision', () => {
    expect(reviewOutcome([{ status: 'Approved' }, { status: CLOSED_TASK_STATUS }])).toBe('Approved');
    expect(reviewOutcome([{ status: CLOSED_TASK_STATUS }])).toBe('In Review');
  });

  it('a decided round closes its Pending tasks; an undecided one closes none', () => {
    const round = [{ id: 'x', status: 'Rejected' }, { id: 'y', status: 'Pending' }];
    expect(tasksToClose(round, 'Rejected').map((w) => w.id)).toEqual(['y']);
    expect(tasksToClose(round, 'In Review')).toEqual([]);
  });

  it('Pending tasks left over in a decided round do not block a new revision or a new round', () => {
    const doc = {
      status: 'Rejected', current_revision: '01',
      revisions: [{ id: 'r1', revision_number: '01', status: 'Rejected', is_current: true }],
    };
    const legacy = [
      { id: 'a', revision_id: 'r1', status: 'Rejected', created_at: T1 },
      { id: 'b', revision_id: 'r1', status: 'Pending', created_at: T1 },
    ];
    expect(pendingReviewTasks(doc.revisions[0], legacy)).toEqual([]);
    expect(canStartRevision(doc, legacy)).toBe(true);
    expect(canSubmitForReview(doc, legacy)).toBe(true);
  });
});

describe('a rejection decides the round (items 1 and 2)', () => {
  it('closes the other reviewers\' Pending tasks, logs it, and frees the document for a new revision', async () => {
    const { result } = await setup();
    let out;
    await act(async () => {
      out = await result.current.decideWorkflow(task(result, 'w1'), 'Rejected', 'Wrong scope');
    });
    expect(out.success).toBe(true);
    expect(out.outcome).toBe('Rejected');
    expect(out.closed).toBe(2);
    expect(wf('w1').status).toBe('Rejected');
    expect(wf('w2').status).toBe(CLOSED_TASK_STATUS);
    expect(wf('w3').status).toBe(CLOSED_TASK_STATUS);
    expect(mockDb.tables.doc_revisions[0].status).toBe('Rejected');
    expect(mockDb.tables.documents[0].status).toBe('Rejected');
    expect(mockDb.tables.doc_activity_log.map((l) => l.action))
      .toContain('2 review tasks closed without a decision: the round was rejected');

    const doc = docOf(result);
    expect(canStartRevision(doc, result.current.workflows)).toBe(true);
    expect(canSubmitForReview(doc, result.current.workflows)).toBe(true);
    // Nothing of the decided round is left in the queue.
    expect(result.current.approvals.filter((a) => a.status === 'Pending')).toEqual([]);
  });

  it('a closed task cannot then be decided', async () => {
    const { result } = await setup();
    const stale = task(result, 'w2');
    await act(async () => { await result.current.decideWorkflow(task(result, 'w1'), 'Rejected', 'No'); });
    let out;
    await act(async () => { out = await result.current.decideWorkflow(stale, 'Approved', ''); });
    expect(out.success).toBe(false);
    expect(wf('w2').status).toBe(CLOSED_TASK_STATUS);
  });

  it('the same revision sent again is a new round, and approval by that round approves it', async () => {
    const { result } = await setup();
    await act(async () => { await result.current.decideWorkflow(task(result, 'w1'), 'Rejected', 'Fix 3.2'); });
    await act(async () => {
      const out = await result.current.submitForReview(docOf(result), {
        reviewers: [{ reviewer_id: 'u1', role: 'Reviewer' }, { reviewer_id: 'u2', role: 'Approver' }],
      });
      expect(out.success).toBe(true);
    });
    const round2 = result.current.approvals.filter((a) => a.status === 'Pending');
    expect(round2).toHaveLength(2);

    let out;
    await act(async () => { out = await result.current.decideWorkflow(round2[0], 'Approved', ''); });
    expect(out.outcome).toBe('In Review');
    await act(async () => {
      out = await result.current.decideWorkflow(
        result.current.approvals.find((a) => a.id === round2[1].id), 'Approved', '');
    });
    // Before rounds, the rejection in round 1 made this 'Rejected' forever.
    expect(out.outcome).toBe('Approved');
    expect(mockDb.tables.doc_revisions[0].status).toBe('Approved');
    expect(mockDb.tables.documents[0].status).toBe('Approved');
    expect(canPublish(docOf(result))).toBe(true);
  });
});

describe('schema detection on an empty library (item 3)', () => {
  const empty = () => ({ ...seed(), documents: [], doc_revisions: [], doc_workflows: [] });

  it('an empty library on a database without the AS4 columns is detected by asking', async () => {
    const { result } = await setup(empty(), { documents: AS4_DOC_COLUMNS, doc_revisions: AS4_REV_COLUMNS });
    expect(result.current.hasAs4Schema).toBe(false);
  });

  it('an empty library on an up to date database keeps the full form', async () => {
    const { result } = await setup(empty());
    expect(result.current.hasAs4Schema).toBe(true);
  });

  it('a save that drops the purpose says so, and is never a plain success', async () => {
    const { result } = await setup(empty(), { documents: AS4_DOC_COLUMNS, doc_revisions: AS4_REV_COLUMNS });
    let out;
    await act(async () => {
      out = await result.current.createDocument({
        title: 'Plan', department: 'HSE', categoryName: 'Policy', description: 'Why it exists',
        review_period_months: 12, status: 'Draft',
      }, null);
    });
    expect(out.success).toBe(true);
    expect(out.warning).toMatch(/purpose and review period/);
    expect(out.warning).toMatch(/20260917200000/);
    expect(mockDb.tables.documents[0]).not.toHaveProperty('description');
  });

  it('a save on the old schema with nothing to lose carries no warning', async () => {
    const { result } = await setup(empty(), { documents: AS4_DOC_COLUMNS, doc_revisions: AS4_REV_COLUMNS });
    let out;
    await act(async () => {
      out = await result.current.createDocument({
        title: 'Plan', department: 'HSE', categoryName: 'Policy', description: '',
        review_period_months: 24, status: 'Draft',
      }, null);
    });
    expect(out.success).toBe(true);
    expect(out.warning).toBeFalsy();
  });

  it('as4ValuesEntered ignores a review period left at the default', () => {
    expect(as4ValuesEntered({ description: ' ', review_period_months: 24 })).toEqual([]);
    expect(as4ValuesEntered({ description: 'x', review_period_months: '12', superseded_by: 'd2' }))
      .toEqual(['purpose', 'review period', 'superseding document']);
  });
});

describe('Edit details keeps the review date the document earned (item 4)', () => {
  const published = {
    status: 'Published', issue_date: '2026-01-15', next_review_date: '2027-01-15',
  };

  it('with its own 12-month period, the date is counted on 12 months, not 24', () => {
    const { row } = buildDocumentWrite({ ...published, review_period_months: 12, title: 'Renamed' });
    expect(row.next_review_date).toBe('2027-01-15');
  });

  it('with no period on the row (published before the AS4 columns), the date on it is kept', () => {
    const { row } = buildDocumentWrite({ ...published, review_period_months: '', title: 'Renamed' });
    expect(row.next_review_date).toBe('2027-01-15');
    const old = buildDocumentWrite({ ...published, title: 'Renamed' }, { hasAs4Columns: false });
    expect(old.row.next_review_date).toBe('2027-01-15');
  });

  it('a changed period moves the date, from the issue date', () => {
    const { row } = buildDocumentWrite({ ...published, review_period_months: 6 });
    expect(row.next_review_date).toBe('2026-07-15');
  });

  it('with neither a period nor a date, the 24-month default applies', () => {
    const { row } = buildDocumentWrite({ status: 'Published', issue_date: '2026-01-15' });
    expect(row.next_review_date).toBe('2028-01-15');
  });

  it('through the hook: editing a document published on 12 months, before the period column, leaves its review date alone', async () => {
    const initial = seed();
    const { description: _d, review_period_months: _p, superseded_by: _s, ...legacy } = initial.documents[0];
    initial.documents[0] = {
      ...legacy, status: 'Published', issue_date: '2026-01-15', next_review_date: '2027-01-15',
    };
    initial.doc_revisions = initial.doc_revisions.map(({ is_current: _c, ...r }) => r);
    initial.doc_workflows = [];
    const { result } = await setup(initial, { documents: AS4_DOC_COLUMNS, doc_revisions: AS4_REV_COLUMNS });
    expect(result.current.hasAs4Schema).toBe(false);
    const doc = docOf(result);
    let out;
    await act(async () => {
      out = await result.current.updateDocument(doc.id, {
        ...doc, title: 'Renamed', review_period_months: doc.review_period_months || '',
      });
    });
    expect(out.success).toBe(true);
    expect(mockDb.tables.documents[0].next_review_date).toBe('2027-01-15');
  });
});
