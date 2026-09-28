/**
 * Design system rollout batch 1E: Module access (/dashboard/modules) and
 * Seat management (/dashboard/seats) wrap themselves in <ThemedApp>.
 * describeAppTheme checks each page; the extra cases walk the loaded
 * licence list, the full-seat warning and the member picker.
 */
import '@testing-library/jest-dom';
import { screen, fireEvent } from '@testing-library/react';

jest.mock('@/lib/customSupabaseClient', () => {
  const { makeSupabase } = require('./accountTestKit');
  return {
    supabase: makeSupabase({
      purchased_modules: [
        { id: 'p1', app_id: 'a1', module_name: 'Seismolord', module_id: 'geoscience', seats_allocated: 1, expiry_date: '2027-01-01', status: 'active' },
        { id: 'p2', app_id: 'a2', module_name: 'Well Test', module_id: 'reservoir', seats_allocated: 3, expiry_date: null, status: 'active' },
      ],
      app_seat_assignments: [{ app_id: 'a1', user_id: 'u2', seat_number: 1 }],
      master_apps: [
        { id: 'a1', app_name: 'Seismolord', slug: 'seismolord', module_id: 'm-geo' },
        { id: 'a2', app_name: 'Well Test Analysis Studio', slug: 'well-test', module_id: 'm-res' },
      ],
      organization_members: [
        { user_id: 'u2', full_name: 'Ada Lovelace', email: 'ada@example.com', status: 'active' },
        { user_id: 'u3', full_name: 'Grace Hopper', email: 'grace@example.com', status: 'active' },
      ],
    }),
  };
});

import {
  describeAppTheme, expectNoLegacyChrome, installDomShims,
} from '@/design/testing/themeAssertions';
import ModuleAccess from '@/pages/ModuleAccess';
import SeatManagement from '@/pages/SeatManagement';
import { renderAccountPage } from './accountTestKit';

const modulesReady = () => screen.findByText('Seismolord');
const seatsReady = () => screen.findByText('Ada Lovelace');

describeAppTheme({
  name: 'Module access',
  route: '/dashboard/modules',
  renderApp: () => renderAccountPage(ModuleAccess),
  ready: modulesReady,
  scopeTestId: 'module-access-theme-scope',
  userId: 'u1',
});

describeAppTheme({
  name: 'Seat management',
  route: '/dashboard/seats',
  renderApp: () => renderAccountPage(SeatManagement),
  ready: seatsReady,
  scopeTestId: 'seat-management-theme-scope',
  userId: 'u1',
});

describe('Module access and seats, loaded states', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('module access shows each licence with a status word and the module overview', async () => {
    renderAccountPage(ModuleAccess);
    await modulesReady();
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(screen.getByText('Availability Overview')).toBeInTheDocument();
    expectNoLegacyChrome();
  });

  it('a full app shows the warning badge and text; the picker opens in the scope', async () => {
    renderAccountPage(SeatManagement);
    await seatsReady();
    expect(screen.getByText(/All seats are assigned/)).toBeInTheDocument();
    expectNoLegacyChrome();

    const triggers = screen.getAllByRole('combobox');
    const open = triggers.find((t) => !t.disabled);
    fireEvent.click(open);
    fireEvent.keyDown(open, { key: 'ArrowDown' });
    const listbox = await screen.findByRole('listbox');
    expect(listbox.closest('[data-pl-theme]')).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });
});
