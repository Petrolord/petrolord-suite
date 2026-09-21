/**
 * ASC-0: peer review segregation of duties (owner decision D1), through
 * the hook, the create form's gate and the comment buttons.
 *
 * Before ASC-0 any member could review work they wrote and verify,
 * reject or withdraw a comment on it: TRANSITION_ACTOR named a party for
 * a button label and nothing checked it.
 */
import React from 'react';
import { renderHook, act, waitFor, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createFakeSupabase, writesTo } from '../../__tests__/fakeSupabase';
import { formRosterRefusal, leadReviewerIdOf, rosterRefusal } from '../utils/segregation';

let mockFake;
let mockUserId = 'author-1';
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: (table) => mockFake.from(table),
    rpc: (...args) => mockFake.rpc(...args),
  },
}));
jest.mock('@/contexts/SupabaseAuthContext', () => ({
  useAuth: () => ({ organization: { id: 'org-1' }, user: { id: mockUserId } }),
}));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

// jest.mock is hoisted above every import, so the hook sees the fakes.
import { usePeerReview } from '../hooks/usePeerReview';
import ReviewDetail from '../ReviewDetail';

const REFUSED_REVIEWER = /The author of the work under review cannot review it/;

const review = {
  id: 'r1', org_id: 'org-1', review_code: 'PR-2026-001', title: 'Well plan',
  review_type: 'Well Design', stage: 'In Review', decision: 'Pending',
  author_id: 'author-1', lead_reviewer_id: 'lead-1',
};
const responded = {
  id: 'c1', review_id: 'r1', comment_text: 'Shoe depth unsupported', severity: 'Major',
  status: 'Responded', response_text: 'Offset data added',
};

const seed = (extra = {}) => createFakeSupabase({
  peer_reviews: [review],
  peer_review_comments: [responded],
  peer_review_participants: [],
  peer_review_audit: [],
  ...extra,
});

const mount = async () => {
  const view = renderHook(() => usePeerReview());
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
};

beforeEach(() => { mockUserId = 'author-1'; });

describe('the roster rules', () => {
  it('refuse the author as lead reviewer or reviewer, and allow other roles', () => {
    const r = { author_id: 'a' };
    expect(rosterRefusal({ ...r, lead_reviewer_id: 'a' }, [])).toMatch(REFUSED_REVIEWER);
    expect(rosterRefusal(r, [{ user_id: 'a', role: 'Reviewer' }])).toMatch(REFUSED_REVIEWER);
    expect(rosterRefusal(r, [{ user_id: 'a', role: 'Author' }, { user_id: 'b', role: 'Reviewer' }])).toBeNull();
    expect(leadReviewerIdOf([{ display_name: 'X', role: 'Lead Reviewer' }, { user_id: 'b', role: 'Lead Reviewer' }])).toBe('b');
  });

  it('on the form, a typed author and a typed reviewer with the same name are one person', () => {
    expect(formRosterRefusal({ id: null, name: 'Jane Doe' },
      [{ display_name: ' jane  doe ', role: 'Reviewer' }])).toMatch(REFUSED_REVIEWER);
    expect(formRosterRefusal({ id: null, name: 'Jane Doe' },
      [{ display_name: 'John Roe', role: 'Reviewer' }])).toBeNull();
    expect(formRosterRefusal({ id: null, name: '' }, [{ display_name: 'Jane', role: 'Reviewer' }])).toBeNull();
  });
});

describe('the hook refuses with the engine\'s reason', () => {
  it('createReview: the author as a reviewer writes nothing', async () => {
    mockFake = seed();
    const { result } = await mount();
    let out;
    await act(async () => {
      out = await result.current.createReview(
        { title: 'Self', review_type: 'Well Design', author_id: 'author-1' },
        [{ user_id: 'author-1', display_name: 'Me', role: 'Lead Reviewer' }],
      );
    });
    expect(out.success).toBe(false);
    expect(out.error).toMatch(REFUSED_REVIEWER);
    expect(writesTo(mockFake, 'peer_reviews', 'insert')).toEqual([]);
  });

  it('createReview: records the author and the lead reviewer from the roster', async () => {
    mockFake = seed();
    const { result } = await mount();
    let out;
    await act(async () => {
      out = await result.current.createReview(
        { title: 'Plan', review_type: 'Well Design', author_id: 'author-1' },
        [{ user_id: 'author-1', display_name: 'Me', role: 'Author' },
          { user_id: 'lead-1', display_name: 'Lead', role: 'Lead Reviewer' }],
      );
    });
    expect(out.success).toBe(true);
    const [insert] = writesTo(mockFake, 'peer_reviews', 'insert');
    const row = Array.isArray(insert.payload) ? insert.payload[0] : insert.payload;
    expect(row).toMatchObject({ author_id: 'author-1', lead_reviewer_id: 'lead-1' });
  });

  it('setRoster: refused before the stored roster is deleted', async () => {
    mockFake = seed();
    const { result } = await mount();
    let out;
    await act(async () => {
      out = await result.current.setRoster('r1', [{ user_id: 'author-1', role: 'Reviewer' }]);
    });
    expect(out.success).toBe(false);
    expect(out.error).toMatch(REFUSED_REVIEWER);
    expect(writesTo(mockFake, 'peer_review_participants', 'delete')).toEqual([]);
  });

  it('updateReview: the author made lead reviewer is refused; a stage move on a legacy review is not', async () => {
    mockFake = seed({
      peer_reviews: [review, { ...review, id: 'legacy', review_code: 'PR-2026-000', lead_reviewer_id: 'author-1' }],
    });
    const { result } = await mount();
    let out;
    await act(async () => {
      out = await result.current.updateReview('r1', { ...review, lead_reviewer_id: 'author-1' });
    });
    expect(out.success).toBe(false);
    expect(out.error).toMatch(REFUSED_REVIEWER);
    await act(async () => {
      out = await result.current.changeStage(
        result.current.reviews.find((r) => r.id === 'legacy'), 'Verification');
    });
    expect(out.success).toBe(true);
  });

  it('disposeComment: the author cannot verify, reject or withdraw', async () => {
    mockFake = seed();
    const { result } = await mount();
    for (const to of ['Verified', 'Rejected']) {
      let out;
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        out = await result.current.disposeComment(result.current.comments[0], to, { text: 'no' });
      });
      expect(out.success).toBe(false);
      expect(out.error).toMatch(/The author of the work under review cannot (verify|reject) a comment on it/);
    }
    let out;
    await act(async () => {
      out = await result.current.disposeComment(
        { ...result.current.comments[0], status: 'Open', response_text: null }, 'Withdrawn');
    });
    expect(out.error).toMatch(/cannot withdraw a comment on it/);
    expect(writesTo(mockFake, 'peer_review_comments', 'update')).toEqual([]);
  });

  it('disposeComment: a reviewer verifies', async () => {
    mockUserId = 'lead-1';
    mockFake = seed();
    const { result } = await mount();
    let out;
    await act(async () => {
      out = await result.current.disposeComment(result.current.comments[0], 'Verified');
    });
    expect(out.success).toBe(true);
    expect(writesTo(mockFake, 'peer_review_comments', 'update')).toHaveLength(1);
  });
});

describe('the comment buttons', () => {
  const renderDetail = () => render(
    <MemoryRouter initialEntries={['/r/r1']}>
      <Routes><Route path="/r/:id" element={<ReviewDetail />} /></Routes>
    </MemoryRouter>,
  );

  const button = (label) => screen.getAllByRole('button')
    .find((b) => b.textContent.startsWith(label) && /\((reviewer|author|coordinator)\)/.test(b.textContent));

  it('are disabled for the author, with the engine\'s reason', async () => {
    mockFake = seed();
    renderDetail();
    await waitFor(() => expect(screen.getByText('Shoe depth unsupported')).toBeTruthy());
    await waitFor(() => expect(button('Verified')).toBeTruthy());
    expect(button('Verified').disabled).toBe(true);
    expect(button('Rejected').disabled).toBe(true);
    expect(screen.getByText(/cannot verify a comment on it/)).toBeTruthy();
  });

  it('are enabled for a reviewer', async () => {
    mockUserId = 'lead-1';
    mockFake = seed();
    renderDetail();
    await waitFor(() => expect(button('Verified')).toBeTruthy());
    expect(button('Verified').disabled).toBe(false);
    expect(button('Rejected').disabled).toBe(false);
  });
});

describe('the create form', () => {
  // eslint-disable-next-line global-require
  const NewReview = require('../NewReview').default;
  const { fireEvent } = require('@testing-library/react');

  it('refuses the author as a reviewer before anything is saved', async () => {
    mockFake = seed({ organization_members: [] });
    render(<MemoryRouter><NewReview /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText('Author of the work under review: name')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Author of the work under review: name'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText('Name: name'), { target: { value: 'jane doe' } });
    expect(screen.getByRole('alert').textContent).toMatch(REFUSED_REVIEWER);
    expect(screen.getByRole('button', { name: /Save as draft/ }).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Name: name'), { target: { value: 'John Roe' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: /Save as draft/ }).disabled).toBe(false);
  });
});
