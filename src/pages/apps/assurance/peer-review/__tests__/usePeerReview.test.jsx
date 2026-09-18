/**
 * AS13 — Peer Review Manager repairs, against an in-memory query
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
