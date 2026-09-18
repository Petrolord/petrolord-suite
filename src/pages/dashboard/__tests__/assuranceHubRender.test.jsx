/**
 * AS11 — the hub renders every panel from real summaries without
 * throwing, lists what needs attention, and names an app it could not
 * read instead of drawing it as zero.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { fixture } from '@/lib/__tests__/assuranceHubFixture';

const mockNavigate = jest.fn();
let mockHub;

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));
jest.mock('@/hooks/useAssuranceHub', () => ({
  APP_STATE: { OK: 'ok', UNAVAILABLE: 'unavailable', ERROR: 'error' },
  useAssuranceHub: () => mockHub,
}));
jest.mock('@/components/ApplicationsGrid', () => () => <div data-testid="catalogue-grid" />);
jest.mock('@/components/charts/ChartLogo', () => () => null);
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/utils/exportUtils', () => ({ exportToCSV: jest.fn(() => true) }));
jest.mock('recharts', () => {
  const actual = jest.requireActual('recharts');
  const ReactLib = require('react');
  const ResponsiveContainer = ({ children }) => ReactLib.cloneElement(children, { width: 800, height: 320 });
  return { ...actual, ResponsiveContainer };
});

// eslint-disable-next-line import/first
import AssuranceHub from '../AssuranceHub';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});

const KEYS = ['risk', 'regulatory', 'documents', 'peerReview', 'moc', 'quality', 'iso', 'lessons', 'audits'];

const hubWith = (data, states) => ({
  data,
  states,
  messages: {},
  loading: false,
  refresh: jest.fn(),
  lastUpdated: new Date(),
  orgId: 'org-a',
});

describe('AssuranceHub page', () => {
  beforeEach(() => mockNavigate.mockReset());

  it('renders all nine app panels and the catalogue grid from real rows', () => {
    mockHub = hubWith(fixture(), Object.fromEntries(KEYS.map((k) => [k, 'ok'])));
    render(<MemoryRouter><AssuranceHub /></MemoryRouter>);
    ['Risk Register', 'Regulatory Compliance', 'Document Control', 'Peer Review Manager',
      'Management of Change', 'Quality Assurance Plan & NCR', 'ISO Compliance',
      'Lessons Learned', 'Audit & Findings Manager']
      .forEach((name) => expect(screen.getAllByText(name).length).toBeGreaterThan(0));
    expect(screen.getByTestId('catalogue-grid')).toBeTruthy();
    expect(screen.getByText('9 of 9')).toBeTruthy();
  });

  it('lists attention items, worst first, and opens the record', () => {
    mockHub = hubWith(fixture(), Object.fromEntries(KEYS.map((k) => [k, 'ok'])));
    render(<MemoryRouter><AssuranceHub /></MemoryRouter>);
    const row = screen.getByText('Temporary change running past its expiry');
    fireEvent.click(row);
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringMatching(/management-of-change\/m1$/));
  });

  it('names an app it could not read and does not count it as reporting', () => {
    const data = { ...fixture(), moc: null };
    const states = Object.fromEntries(KEYS.map((k) => [k, k === 'moc' ? 'unavailable' : 'ok']));
    mockHub = hubWith(data, states);
    render(<MemoryRouter><AssuranceHub /></MemoryRouter>);
    expect(screen.getByText('8 of 9')).toBeTruthy();
    expect(screen.getByText(/Not set up in this environment yet: Management of Change/)).toBeTruthy();
    expect(screen.queryByText('Temporary change running past its expiry')).toBeNull();
  });

  it('says so plainly when nothing needs attention', () => {
    const empty = Object.fromEntries(KEYS.map((k) => [k, null]));
    empty.risk = { risks: [] };
    mockHub = hubWith(empty, { risk: 'ok' });
    render(<MemoryRouter><AssuranceHub /></MemoryRouter>);
    expect(screen.getByText(/Nothing in the apps that report is exposed/)).toBeTruthy();
  });
});
