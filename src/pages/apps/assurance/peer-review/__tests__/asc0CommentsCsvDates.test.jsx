/**
 * ASC-0 (RC-8): the Peer Review comments CSV writes the local calendar
 * date of each stamp.
 *
 * It wrote `created_at.slice(0, 10)`, the date in whatever offset the
 * string carried (UTC from Postgres), so a comment raised in Lagos at
 * 00:30 read as the day before. The same instant is given here in two
 * offsets, +14:00 and -12:00. Their leading dates differ, so in any
 * zone at least one of them disagrees with the local date, and the old
 * code fails wherever the suite runs.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { toDateOnlyString } from '@/lib/peerReview';

const mockExport = jest.fn(() => true);
jest.mock('@/utils/exportUtils', () => ({
  exportToCSV: (...args) => mockExport(...args),
}));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

let mockState;
jest.mock('../hooks/usePeerReview', () => ({
  usePeerReview: () => mockState,
}));
jest.mock('recharts', () => {
  const Stub = ({ children }) => <div>{children}</div>;
  return new Proxy({}, { get: () => Stub });
});

import Reports from '../Reports';

// 23:30 UTC on 17 September 2026, 00:30 on 18 September in Lagos.
const INSTANT = new Date(Date.UTC(2026, 8, 17, 23, 30));
const EAST = '2026-09-18T13:30:00+14:00';
const WEST = '2026-09-17T11:30:00-12:00';

describe('ASC-0 RC-8: comments CSV dates', () => {
  beforeEach(() => {
    mockExport.mockClear();
    mockState = {
      reviews: [{ id: 'r1', review_code: 'PR-1', title: 'Well plan', stage: 'In Review' }],
      comments: [
        { id: 'c1', review_id: 'r1', severity: 'Minor', status: 'Verified',
          created_at: EAST, responded_at: EAST, verified_at: EAST },
        { id: 'c2', review_id: 'r1', severity: 'Minor', status: 'Verified',
          created_at: WEST, responded_at: WEST, verified_at: WEST },
      ],
      loading: false, error: null, refresh: jest.fn(),
    };
  });

  it('writes Raised, Responded and Verified as the local calendar date', () => {
    render(<MemoryRouter><Reports /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Comments \(CSV\)/i }));
    const [rows] = mockExport.mock.calls[0];
    const local = toDateOnlyString(INSTANT);
    rows.forEach((row) => {
      expect([row.Raised, row.Responded, row.Verified]).toEqual([local, local, local]);
    });
  });

  it('leaves a missing stamp blank', () => {
    mockState.comments = [{ id: 'c3', review_id: 'r1', status: 'Open', created_at: EAST }];
    render(<MemoryRouter><Reports /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Comments \(CSV\)/i }));
    const [[row]] = mockExport.mock.calls[0];
    expect(row.Responded).toBe('');
    expect(row.Verified).toBe('');
  });
});
