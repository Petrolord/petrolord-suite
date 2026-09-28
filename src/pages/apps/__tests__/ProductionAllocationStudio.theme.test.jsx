/**
 * Design system rollout batch 2B: Production Allocation Studio opts in to
 * the Petrolord theme (the page wraps itself in <ThemedApp>). The shared
 * describeAppTheme block checks light by default, the toggle round trip, no
 * legacy console colour and the cold-load registration; the walk below
 * loads a two-well field with tests, ledger and metered totals and repeats
 * the legacy check on every tab, in the add-total dialog, the create-field
 * dialog and the help drawer, and confirms the charts stay white in dark.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockField = { id: 'f1', name: 'Test Field', is_own: true, organization_id: null };
const mockP1 = { id: 'w1', name: 'P-1', well_type: 'producer', field_id: 'f1' };
const mockP2 = { id: 'w2', name: 'P-2', well_type: 'producer', field_id: 'f1' };
const mockTests = [
  {
    id: 't1', well_id: 'w1', test_date: '2025-01-01', duration_hours: 8,
    oil_rate_stbd: 1000, water_rate_stbd: 100, gas_rate_mscfd: 500, is_valid: true,
    well: { id: 'w1', name: 'P-1' },
  },
  {
    id: 't2', well_id: 'w2', test_date: '2025-01-01', duration_hours: 8,
    oil_rate_stbd: 500, water_rate_stbd: 50, gas_rate_mscfd: 250, is_valid: true,
    well: { id: 'w2', name: 'P-2' },
  },
];
const mockLedger = ['2025-01-10', '2025-01-11'].flatMap((date) => ([
  {
    id: `l1-${date}`, well_id: 'w1', prod_date: date, oil_stb: 950, water_stb: 95,
    gas_mscf: 470, winj_stb: 0, ginj_mscf: 0, hours_on: 24, well: mockP1,
  },
  {
    id: `l2-${date}`, well_id: 'w2', prod_date: date, oil_stb: 480, water_stb: 48,
    gas_mscf: 240, winj_stb: 0, ginj_mscf: 0, hours_on: 24, well: mockP2,
  },
]));
const mockTotals = [
  { id: 'ft1', total_date: '2025-01-10', oil_stb: 1200, water_stb: 120, gas_mscf: 600 },
  { id: 'ft2', total_date: '2025-01-11', oil_stb: 1500, water_stb: 150, gas_mscf: 750 },
];

jest.mock('@/lib/productionSpine', () => ({
  listFields: jest.fn(() => Promise.resolve([mockField])),
  listPoWells: jest.fn(() => Promise.resolve([mockP1, mockP2])),
  getDailyProduction: jest.fn(() => Promise.resolve(mockLedger)),
  listFieldWellTests: jest.fn(() => Promise.resolve(mockTests)),
  getFieldTotals: jest.fn(() => Promise.resolve(mockTotals)),
  listAllocationFactors: jest.fn(() => Promise.resolve([])),
  listFieldWellModels: jest.fn(() => Promise.resolve([])),
  saveField: jest.fn(() => Promise.resolve(mockField)),
  deleteField: jest.fn(), shareField: jest.fn(), unshareField: jest.fn(),
  importFieldTotals: jest.fn(), importWellTests: jest.fn(), saveFieldTotal: jest.fn(),
  deleteFieldTotal: jest.fn(), updateWellTest: jest.fn(), deleteWellTest: jest.fn(),
  upsertAllocationFactors: jest.fn(), writeAllocatedProduction: jest.fn(),
}));
jest.mock('@/utils/savedProjects', () => {
  const service = {
    list: jest.fn(() => Promise.resolve([])),
    load: jest.fn(() => Promise.resolve(null)),
    save: jest.fn(() => Promise.resolve(undefined)),
    remove: jest.fn(() => Promise.resolve(undefined)),
  };
  return { createSavedProjectsService: () => service };
});

import {
  describeAppTheme, expectNoLegacyChrome, getScopeRoot, installDomShims,
  installDashboardScope,
} from '@/design/testing/themeAssertions';
import { AuthContext } from '@/contexts/SupabaseAuthContext';
import ProductionAllocationStudio from '@/pages/apps/ProductionAllocationStudio';

const AUTH = { user: { id: 'u1' }, organization: { id: 'org-1', name: 'Test Org' } };
const renderApp = () => render(
  <AuthContext.Provider value={AUTH}>
    <MemoryRouter><ProductionAllocationStudio /></MemoryRouter>
  </AuthContext.Provider>,
);
const ready = () => screen.findByText('Production Allocation Studio');

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: 'u1' });

describeAppTheme({
  name: 'Production Allocation Studio',
  route: '/dashboard/apps/production/production-allocation-studio',
  renderApp,
  ready,
  scopeTestId: 'allocation-theme-scope',
  userId: 'u1',
});

// Load the field through the FieldPicker's create dialog (the mocked
// saveField returns the field with its data, and the context selects it).
const pickField = async () => {
  fireEvent.click(screen.getByTitle('Create field'));
  fireEvent.change(await screen.findByPlaceholderText('Field name'), { target: { value: 'Test Field' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create field' }));
  expect(await screen.findByText(/Allocated volumes/i)).toBeInTheDocument();
};

describe('Production Allocation Studio theme, every tab and overlay', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('no legacy colour on any tab with a field loaded', async () => {
    renderApp();
    await ready();
    await pickField();
    expectNoLegacyChrome();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Test QC' }));
    expect(await screen.findByText(/Well test QC/i)).toBeInTheDocument();
    expectNoLegacyChrome();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Reconciliation' }));
    expect(await screen.findByText(/Meter against ledger/i)).toBeInTheDocument();
    expectNoLegacyChrome();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Factors' }));
    expect(await screen.findByText(/Monthly factors/i)).toBeInTheDocument();
    expectNoLegacyChrome();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Data' }));
    expect(await screen.findByText(/Metered field totals/i)).toBeInTheDocument();
    expectNoLegacyChrome();
    fireEvent.click(screen.getByRole('button', { name: /Add date/i }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  }, 60000);

  it('the create-field dialog and the help drawer carry the scope', async () => {
    renderApp();
    await ready();
    fireEvent.click(screen.getByTitle('Create field'));
    const create = await screen.findByRole('dialog');
    expect(create).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
    fireEvent.keyDown(create, { key: 'Escape' });

    fireEvent.click(screen.getByTitle('Allocation documentation'));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });

  it('the factor chart keeps the white chart standard in dark', async () => {
    renderApp();
    await ready();
    const scope = getScopeRoot('allocation-theme-scope');
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
    await pickField();
    const frame = scope.querySelector('[data-canvas="chart"]');
    expect(frame).not.toBeNull();
    expect(frame.className).toMatch(/\bbg-white\b/);
    expectNoLegacyChrome();
  }, 60000);
});
