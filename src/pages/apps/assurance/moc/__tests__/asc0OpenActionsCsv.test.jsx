/**
 * ASC-0 (RC-7): the MOC CSVs count open actions the way the dashboard
 * does.
 *
 * The Register and Reports CSVs counted every unfinished action,
 * including those on Closed, Rejected and Cancelled changes. The
 * dashboard reads the engine's summarise(), which leaves those out
 * (AS14). The CSV column now asks the same function.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { summarise } from '@/lib/managementOfChange';
import { openActionsOf } from '../utils/openActions';

const mockExport = jest.fn(() => true);
jest.mock('@/utils/exportUtils', () => ({
  exportToCSV: (...args) => mockExport(...args),
}));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

let mockState;
jest.mock('../hooks/useManagementOfChange', () => ({
  useManagementOfChange: () => mockState,
}));
// Charts need a laid-out container; this test reads the export only.
jest.mock('recharts', () => {
  const Stub = ({ children }) => <div>{children}</div>;
  return new Proxy({}, { get: () => Stub });
});

import MOCRegister from '../Register';
import MOCReports from '../Reports';

const TODAY = new Date(2026, 8, 18);

const action = (id, mocId, status, due = '2026-09-01') => ({
  id, moc_id: mocId, status, due_date: due, description: id,
});

const change = (id, stage, actions) => ({
  id, moc_code: `MOC-${id}`, title: id, type: 'Permanent', stage, actions,
});

const RECORDS = [
  change('live', 'Implementation', [action('l1', 'live', 'Open'), action('l2', 'live', 'Complete')]),
  change('closed', 'Closed', [action('c1', 'closed', 'Open')]),
  change('rejected', 'Rejected', [action('r1', 'rejected', 'In Progress')]),
  change('cancelled', 'Cancelled', [action('x1', 'cancelled', 'Open')]),
];
const ACTIONS = RECORDS.flatMap((m) => m.actions);

beforeEach(() => {
  mockExport.mockClear();
  mockState = {
    records: RECORDS, actions: ACTIONS, approvals: [],
    loading: false, error: null, hasAs6Schema: true, refresh: jest.fn(),
  };
});

describe('openActionsOf', () => {
  it('is the engine summarise() count for the one change', () => {
    expect(RECORDS.map((m) => openActionsOf(m, TODAY))).toEqual([1, 0, 0, 0]);
  });

  it('sums to the dashboard figure', () => {
    const total = RECORDS.reduce((n, m) => n + openActionsOf(m, TODAY), 0);
    expect(total).toBe(summarise(RECORDS, { actions: ACTIONS }, TODAY).openActions);
  });
});

const openActionsColumn = () => {
  const [rows] = mockExport.mock.calls[0];
  return Object.fromEntries(rows.map((r) => [r.Number, r['Open actions']]));
};

const EXPECTED = { 'MOC-live': 1, 'MOC-closed': 0, 'MOC-rejected': 0, 'MOC-cancelled': 0 };

describe('the CSV Open actions column', () => {
  it('Register export agrees with summarise()', () => {
    render(<MemoryRouter><MOCRegister /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/i }));
    expect(openActionsColumn()).toEqual(EXPECTED);
  });

  it('Reports register export agrees with summarise()', () => {
    render(<MemoryRouter><MOCReports /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Register \(CSV\)/i }));
    expect(openActionsColumn()).toEqual(EXPECTED);
  });
});
