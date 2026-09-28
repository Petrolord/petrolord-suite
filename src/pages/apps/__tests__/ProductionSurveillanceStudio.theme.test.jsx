/**
 * Design system rollout batch 2B: Production Surveillance Studio opts in to
 * the Petrolord theme (the page wraps itself in <ThemedApp>). The shared
 * describeAppTheme block checks light by default, the toggle round trip, no
 * legacy console colour and the cold-load registration; the walk below
 * picks a field with a ledger and repeats the legacy check on every tab,
 * in the field picker's create dialog, the record-deferment dialog and the
 * help drawer, and confirms the charts keep the white chart standard in dark.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockField = { id: 'f1', name: 'Test Field', is_own: true, organization_id: null };
const mockP1 = { id: 'w1', name: 'P-1', well_type: 'producer', field_id: 'f1' };
const mockIso = (i) => new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10);
// 60 producing days with a hard drop in the final week, so the exception
// list, the KPI rail and the decline fit all have something to show.
const mockLedger = Array.from({ length: 60 }, (_, i) => ({
  id: `r${i}`, prod_date: mockIso(i), oil_stb: i < 53 ? 1000 - i : 400, water_stb: 200,
  gas_mscf: 500, winj_stb: 0, ginj_mscf: 0, hours_on: 24, well: mockP1,
}));
const mockDeferments = [{
  id: 'd1', well_id: 'w1', well: mockP1, start_date: mockIso(55), end_date: null, category: 'well',
  cause: 'ESP trip', oil_deferred_stb: 600, water_deferred_stb: 0, gas_deferred_mscf: 0, comment: null,
}];

jest.mock('@/lib/productionSpine', () => ({
  listFields: jest.fn(() => Promise.resolve([mockField])),
  listPoWells: jest.fn(() => Promise.resolve([mockP1])),
  getDailyProduction: jest.fn(() => Promise.resolve(mockLedger)),
  listDeferments: jest.fn(() => Promise.resolve(mockDeferments)),
  saveField: jest.fn(() => Promise.resolve(mockField)), deleteField: jest.fn(), shareField: jest.fn(), unshareField: jest.fn(),
  importDailyProduction: jest.fn(), importWellTests: jest.fn(), applyRegistryLinks: jest.fn(),
  updatePoWell: jest.fn(), saveDeferment: jest.fn(), updateDeferment: jest.fn(), deleteDeferment: jest.fn(),
  DEFERMENT_CATEGORIES: ['well', 'reservoir', 'surface_facility', 'export'],
}));
jest.mock('@/lib/wellsRegistry', () => ({ listWells: jest.fn(() => Promise.resolve([])) }));
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
} from '@/design/testing/themeAssertions';
import { AuthContext } from '@/contexts/SupabaseAuthContext';
import ProductionSurveillanceStudio from '@/pages/apps/ProductionSurveillanceStudio';

const AUTH = { user: { id: 'u1' }, organization: { id: 'org-1', name: 'Test Org' } };
const renderApp = () => render(
  <AuthContext.Provider value={AUTH}>
    <MemoryRouter><ProductionSurveillanceStudio /></MemoryRouter>
  </AuthContext.Provider>,
);
const ready = () => screen.findByText('Production Surveillance Studio');

describeAppTheme({
  name: 'Production Surveillance Studio',
  route: '/dashboard/apps/production/production-surveillance-studio',
  renderApp,
  ready,
  scopeTestId: 'surveillance-theme-scope',
  userId: 'u1',
});

// Load the field through the FieldPicker's create dialog (the mocked
// saveField returns the field with a ledger, and the context selects it).
const pickField = async () => {
  fireEvent.click(screen.getByTitle('Create field'));
  fireEvent.change(await screen.findByPlaceholderText('Field name'), { target: { value: 'Test Field' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create field' }));
  expect(await screen.findByText(/Trailing \d+ days to/i)).toBeInTheDocument();
};

describe('Production Surveillance Studio theme, every tab and overlay', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('no legacy colour on any tab with a field loaded', async () => {
    renderApp();
    await ready();
    await pickField();
    expectNoLegacyChrome();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Trends' }));
    expect(await screen.findByText('Trend Controls')).toBeInTheDocument();
    expectNoLegacyChrome();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Deferments' }));
    expect(await screen.findByText(/Loss by cause/i)).toBeInTheDocument();
    expectNoLegacyChrome();
    fireEvent.click(screen.getByRole('button', { name: /Record deferment/i }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
    fireEvent.keyDown(dialog, { key: 'Escape' });

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Decline' }));
    expect(await screen.findByText('Decline Controls')).toBeInTheDocument();
    expectNoLegacyChrome();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Data' }));
    expect(await screen.findByText(/Production data/i)).toBeInTheDocument();
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

    fireEvent.click(screen.getByTitle('Surveillance documentation'));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });

  it('the trend chart keeps the white chart standard in dark', async () => {
    renderApp();
    await ready();
    const scope = getScopeRoot('surveillance-theme-scope');
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
    await pickField();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Trends' }));
    await screen.findByText('Trend Controls');
    const frame = scope.querySelector('[data-canvas="chart"]');
    expect(frame).not.toBeNull();
    expect(frame.className).toMatch(/\bbg-white\b/);
    expectNoLegacyChrome();
  }, 60000);
});
