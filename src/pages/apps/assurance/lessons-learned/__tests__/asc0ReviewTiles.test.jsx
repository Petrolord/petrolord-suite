/**
 * ASC-0 (RC-8): the Lessons Learned dashboard shows the review counts
 * that summarise() computes. It computed reviewsOverdue and
 * reviewsDueSoon and never displayed either.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { summarise, toDateOnlyString } from '@/lib/lessonsLearned';

let mockState;
jest.mock('../hooks/useLessonsLearned', () => ({
  useLessonsLearned: () => mockState,
}));
jest.mock('recharts', () => {
  const Stub = ({ children }) => <div>{children}</div>;
  return new Proxy({}, { get: () => Stub });
});

import Dashboard from '../Dashboard';

const inDays = (n) => {
  const d = new Date();
  return toDateOnlyString(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
};

const lesson = (id, status, reviewDue) => ({
  id, lesson_code: `LL-${id}`, title: id, status, review_due: reviewDue, applications: [],
});

// Two overdue and one due soon among visible lessons; a Draft past its
// date is not a review anybody owes.
const LESSONS = [
  lesson('a', 'Published', inDays(-3)),
  lesson('b', 'Embedded', inDays(-40)),
  lesson('c', 'Published', inDays(10)),
  lesson('d', 'Published', inDays(90)),
  lesson('e', 'Draft', inDays(-5)),
];

const tileValue = (label) => {
  const tile = screen.getByText(label).closest('div');
  return tile.querySelector('p.text-2xl').textContent;
};

describe('ASC-0 RC-8: review tiles on the Lessons Learned dashboard', () => {
  beforeEach(() => {
    mockState = {
      lessons: LESSONS, applications: [], applicationsByLesson: new Map(),
      loading: false, error: null, refresh: jest.fn(), hasAs9Schema: true,
    };
  });

  it('shows Review overdue and Review due soon from summarise()', () => {
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    const summary = summarise({ lessons: LESSONS, applications: [] }, new Date());
    expect(summary.reviewsOverdue).toBe(2);
    expect(summary.reviewsDueSoon).toBe(1);
    expect(tileValue('Review overdue')).toBe('2');
    expect(tileValue('Review due soon')).toBe('1');
  });
});
