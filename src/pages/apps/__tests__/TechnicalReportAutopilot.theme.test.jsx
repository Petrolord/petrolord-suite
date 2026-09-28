/**
 * Design system rollout batch 4D: Technical Report Autopilot opts in to the
 * Petrolord theme. The shared four checks run on the opened brief (opens
 * light, the header toggle goes to dark and back and stores the choice, no
 * legacy console colour with a negative control, every route alias is
 * registered). Below: the help drawer, the written draft with its preview
 * accordion, and the outage panel all stay on roles. The DOCX export code is
 * not touched by the rollout, so the document it writes is unchanged.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  describeAppTheme, expectNoLegacyChrome, expectThemedPath, getScopeRoot, installDomShims,
  installDashboardScope,
} from '@/design/testing/themeAssertions';
import { themeStorageKey } from '@/design/ThemeProvider';

const mockInvoke = jest.fn();
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    from: jest.fn(),
    functions: { invoke: (...args) => mockInvoke(...args) },
  },
}));
jest.mock('@/contexts/SupabaseAuthContext', () => ({
  AuthContext: require('react').createContext(null),
  useAuth: () => ({ user: null }),
}));

// eslint-disable-next-line import/first
import TechnicalReportAutopilot from '@/pages/apps/TechnicalReportAutopilot';

const ROUTE = '/dashboard/apps/economics/report-autopilot';
const renderApp = () => render(<MemoryRouter initialEntries={[ROUTE]}><TechnicalReportAutopilot /></MemoryRouter>);
const ready = () => screen.findByRole('heading', { level: 1, name: 'Technical Report Autopilot' });

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: null });

describeAppTheme({
  name: 'Technical Report Autopilot',
  route: ROUTE,
  renderApp,
  ready,
  scopeTestId: 'trp-theme-scope',
});

describe('Technical Report Autopilot themed states', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    mockInvoke.mockReset();
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('registers every route alias for the themed cold-load loaders', () => {
    for (const path of [
      '/dashboard/apps/economics/report-autopilot',
      '/dashboard/apps/economics/technical-report-autopilot',
      '/dashboard/apps/economics-project-management/technical-report-autopilot',
      '/dashboard/apps/economic/technical-report-autopilot',
    ]) expectThemedPath(path);
  });

  it('the help drawer opens themed with no legacy colour', async () => {
    renderApp();
    await ready();
    fireEvent.click(screen.getByTitle('Documentation'));
    expect(await screen.findByText('What this app is for')).toBeInTheDocument();
    expectNoLegacyChrome();
  });

  it('the written draft and its preview stay on roles', async () => {
    mockInvoke.mockResolvedValue({
      data: { sections: [{ title: 'Executive Summary', content: 'Line one.\nLine two.' }] },
      error: null,
    });
    renderApp();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /Generate Report/ }));
    expect(await screen.findByText('Generated Report Preview')).toBeInTheDocument();
    expect(screen.getByText('Line one.')).toBeInTheDocument();
    expectNoLegacyChrome();
  });

  it('the outage panel stays on the warning roles in dark', async () => {
    window.localStorage.setItem(themeStorageKey(null), 'dark');
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'Edge Function returned a non-2xx status code' } });
    renderApp();
    await ready();
    expect(getScopeRoot('trp-theme-scope')).toHaveAttribute('data-pl-theme', 'dark');
    fireEvent.click(screen.getByRole('button', { name: /Generate Report/ }));
    await waitFor(() => expect(screen.getByText('Report generation is unavailable')).toBeInTheDocument());
    expectNoLegacyChrome();
  });
});
