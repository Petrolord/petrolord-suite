/**
 * The comparison page lists the runs of the user's other cases, grouped by
 * case with this case first, so a with-project run can be compared with a
 * without-project run kept in its own case. Supabase is mocked per table.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const DB = {
  epe_runs: [
    { id: 'r2', run_name: 'Without Ekene-11', created_at: '2026-10-13T10:00:00Z', case_id: 'c2' },
    { id: 'r1', run_name: 'With Ekene-11', created_at: '2026-10-13T09:00:00Z', case_id: 'c1' },
  ],
  epe_cases: [{ id: 'c2', case_name: 'Ekene without Ekene-11' }, { id: 'c1', case_name: 'Ekene with Ekene-11' }],
};
const makeQuery = (table) => {
  const q = {};
  ['select', 'eq', 'order', 'limit', 'in', 'or', 'is'].forEach((m) => { q[m] = jest.fn(() => q); });
  q.then = (resolve, reject) => Promise.resolve({ data: DB[table] || [], error: null }).then(resolve, reject);
  return q;
};
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn((t) => makeQuery(t)),
  },
}));

// eslint-disable-next-line import/first
import EpeRunComparison from '../EpeRunComparison';

test('runs of another case are listed under that case, this case first', async () => {
  render(
    <MemoryRouter initialEntries={['/cases/c1/compare']}>
      <Routes><Route path="/cases/:caseId/compare" element={<EpeRunComparison />} /></Routes>
    </MemoryRouter>,
  );
  const groups = await screen.findAllByTestId('compare-case-group');
  expect(groups).toHaveLength(2);
  expect(groups[0]).toHaveTextContent('Ekene with Ekene-11 (this case)');
  expect(groups[0]).toHaveTextContent('With Ekene-11');
  expect(groups[1]).toHaveTextContent('Ekene without Ekene-11');
  expect(groups[1]).toHaveTextContent('Without Ekene-11');
});
