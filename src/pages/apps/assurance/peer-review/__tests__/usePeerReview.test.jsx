/**
 * AS13: Peer Review Manager repairs, against an in-memory query
 * builder.
 *
 *   Comments could still be raised, and dispositions recorded, on a
 *   Closed or Cancelled review, rewriting the record after it finished.
 *   The hook moved a review to whatever stage it was handed, so a
 *   Closed review could be reopened by any caller.
 *   A comment's discipline was never captured, so the "Comments by
 *   discipline" chart was one Unspecified bar.
 *   Delete removed a review of any stage in one click.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { createFakeSupabase, writesTo } from '../../__tests__/fakeSupabase';
import { reviewLockReason } from '../utils/reviewPayload';

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
import { usePeerReview } from '../hooks/usePeerReview';

const review = (id, stage) => ({
  id, org_id: 'org-1', review_code: `R-${id}`, title: id, stage, decision: 'Pending',
  closed_at: null,
});

const comment = (id, reviewId, status) => ({
  id, review_id: reviewId, comment_text: 'Relief case missing', severity: 'Major', status,
  response_text: status === 'Responded' ? 'Added in rev B' : null,
});

const seed = (reviews, comments = []) => createFakeSupabase({
  peer_reviews: reviews,
  peer_review_comments: comments,
  peer_review_participants: [],
  peer_review_audit: [],
});

const mount = async () => {
  const view = renderHook(() => usePeerReview());
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
};

describe('reviewLockReason', () => {
  it('locks Closed and Cancelled and nothing else', () => {
    ['Closed', 'Cancelled'].forEach((s) => expect(reviewLockReason(review('a', s))).toBeTruthy());
    ['Draft', 'In Review', 'Verification'].forEach((s) => {
      expect(reviewLockReason(review('a', s))).toBeNull();
    });
  });
});

describe('usePeerReview writes', () => {
  it('refuses a new comment or a disposition on a final review, and writes nothing', async () => {
    mockFake = seed(
      [review('closed', 'Closed'), review('cancelled', 'Cancelled')],
      [comment('c1', 'cancelled', 'Responded')],
    );
    const { result } = await mount();
    const outcomes = [];
    await act(async () => {
      outcomes.push(await result.current.addComment('closed', { comment_text: 'Late', severity: 'Minor' }));
      outcomes.push(await result.current.disposeComment(comment('c1', 'cancelled', 'Responded'), 'Verified'));
    });
    outcomes.forEach((o) => expect(o.success).toBe(false));
    expect(mockFake.writes).toEqual([]);
  });

  it('will not reopen a closed review', async () => {
    mockFake = seed([review('closed', 'Closed')]);
    const { result } = await mount();
    let outcome;
    await act(async () => {
      outcome = await result.current.changeStage(review('closed', 'Closed'), 'In Review');
    });
    expect(outcome.success).toBe(false);
    expect(outcome.error).toMatch(/final/);
    expect(writesTo(mockFake, 'peer_reviews')).toEqual([]);
  });

  it('writes the discipline a comment is raised under', async () => {
    mockFake = seed([review('live', 'In Review')]);
    const { result } = await mount();
    await act(async () => {
      await result.current.addComment('live',
        { comment_text: 'Check the relief load', severity: 'Major', discipline: 'Process' });
    });
    const [insert] = writesTo(mockFake, 'peer_review_comments', 'insert');
    expect(insert.payload[0].discipline).toBe('Process');
  });

  it('only a draft can be deleted', async () => {
    mockFake = seed([review('live', 'In Review'), review('draft', 'Draft')]);
    const { result } = await mount();
    let refused;
    let allowed;
    await act(async () => {
      refused = await result.current.deleteReview('live');
      allowed = await result.current.deleteReview('draft');
    });
    expect(refused.success).toBe(false);
    expect(allowed.success).toBe(true);
    expect(writesTo(mockFake, 'peer_reviews', 'delete')).toHaveLength(1);
  });
});

describe('AS14: the exchange and the trail', () => {
  it('answering a rejection adds to the exchange instead of erasing the reason', async () => {
    const rejected = {
      ...comment('c1', 'live', 'Rejected'),
      response_text: 'Added in rev B\n\nRejected: the relief case still uses the old set pressure',
    };
    mockFake = seed([review('live', 'In Review')], [rejected]);
    const { result } = await mount();
    await act(async () => {
      await result.current.disposeComment(rejected, 'Responded', { text: 'Rev C uses 49.6 barg' });
    });
    const [upd] = writesTo(mockFake, 'peer_review_comments', 'update');
    expect(upd.payload.response_text).toBe(
      'Added in rev B\n\nRejected: the relief case still uses the old set pressure\n\nResponse: Rev C uses 49.6 barg');
    const [log] = writesTo(mockFake, 'peer_review_audit', 'insert');
    expect(log.payload[0].details).toEqual({ comment_id: 'c1', text: 'Rev C uses 49.6 barg' });
  });

  it('a first response still just records the answer', async () => {
    const open = comment('c2', 'live', 'Open');
    mockFake = seed([review('live', 'In Review')], [open]);
    const { result } = await mount();
    await act(async () => {
      await result.current.disposeComment(open, 'Responded', { text: 'Fixed' });
    });
    const [upd] = writesTo(mockFake, 'peer_review_comments', 'update');
    expect(upd.payload.response_text).toBe('Fixed');
  });

  it('reads one review\'s whole trail, past the old 200-row cap, and nothing from other reviews', async () => {
    const rows = Array.from({ length: 1250 }, (_, i) => ({
      id: `a${i}`, review_id: 'old', action: `step ${i}`, created_at: '2026-01-01T00:00:00Z',
    }));
    mockFake = createFakeSupabase({
      peer_reviews: [review('old', 'In Review'), review('other', 'In Review')],
      peer_review_comments: [],
      peer_review_participants: [],
      peer_review_audit: [...rows, { id: 'x', review_id: 'other', action: 'elsewhere' }],
    });
    const { result } = await mount();
    expect(result.current.auditFor('old')).toEqual([]);
    let out;
    await act(async () => { out = await result.current.loadAudit('old'); });
    expect(out.success).toBe(true);
    expect(result.current.auditFor('old')).toHaveLength(1250);
    expect(result.current.auditFor('other')).toEqual([]);
  });
});


describe('AS14: a failed register load', () => {
  it('reports the error instead of throwing while clearing the trail', async () => {
    mockFake = seed([review('live', 'In Review')]);
    const from = mockFake.from;
    mockFake.from = (table) => (table === 'peer_reviews'
      ? { select: () => ({ eq: () => ({ order: async () => ({ data: null, error: { message: 'boom' } }) }) }) }
      : from(table));
    const { result } = await mount();
    expect(result.current.error).toBe('boom');
    expect(result.current.auditFor('live')).toEqual([]);
  });
});
