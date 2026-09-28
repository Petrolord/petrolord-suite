/**
 * Design system rollout batch 4F: the three Process Safety studios (LOPA &
 * SIL, Consequence Modelling, QRA) opt in to the Petrolord theme. Each page
 * and its help guide wrap themselves in <ThemedApp>. describeAppTheme checks
 * light by default, the toggle round trip, no legacy console colour outside
 * canvases (with a negative control) and the cold-load registration. The
 * tests below walk every tab (the results carry the SIL, ALARP, F-N and
 * distance states), keep the charts white in dark, show that a state word is
 * printed next to its status colour, and open each help guide.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  describeAppTheme, expectNoLegacyChrome, expectThemedPath, getScopeRoot, installDomShims,
} from '@/design/testing/themeAssertions';

const mockFrom = jest.fn();
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: (...args) => mockFrom(...args),
  },
}));

jest.mock('@/contexts/SupabaseAuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, organization: { id: 'org-1' } }),
  AuthContext: require('react').createContext(null),
}));

/* eslint-disable import/first */
import LopaSilStudio from '@/pages/apps/LopaSilStudio';
import LopaSilStudioHelpGuide from '@/pages/apps/LopaSilStudioHelpGuide';
import ConsequenceModellingStudio from '@/pages/apps/ConsequenceModellingStudio';
import ConsequenceModellingStudioHelpGuide from '@/pages/apps/ConsequenceModellingStudioHelpGuide';
import QraStudio from '@/pages/apps/QraStudio';
import QraStudioHelpGuide from '@/pages/apps/QraStudioHelpGuide';
/* eslint-enable import/first */

const chain = () => {
  const q = {
    select: jest.fn(() => q),
    eq: jest.fn(() => q),
    order: jest.fn().mockResolvedValue({ data: [], error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    upsert: jest.fn().mockResolvedValue({ error: null }),
    delete: jest.fn(() => q),
  };
  return q;
};

beforeEach(() => {
  mockFrom.mockReset();
  mockFrom.mockImplementation(() => chain());
});

const openTab = async (name) => fireEvent.mouseDown(await screen.findByRole('tab', { name }));

const APPS = [
  {
    name: 'LOPA & SIL Studio',
    route: '/dashboard/apps/process-safety/lopa-sil-studio',
    Page: LopaSilStudio,
    Help: LopaSilStudioHelpGuide,
    scopeTestId: 'lopa-theme-scope',
    helpTestId: 'lopa-help-theme-scope',
    title: /LOPA & SIL Studio/i,
    tabs: [/LOPA worksheet/, /SIF verification/, /Proof test interval/],
  },
  {
    name: 'Consequence Modelling Studio',
    route: '/dashboard/apps/process-safety/consequence-studio',
    Page: ConsequenceModellingStudio,
    Help: ConsequenceModellingStudioHelpGuide,
    scopeTestId: 'consequence-theme-scope',
    helpTestId: 'consequence-help-theme-scope',
    title: /Consequence Modelling Studio/i,
    tabs: [/Source term/, /Dispersion/, /Fire/, /Explosion/, /Harm/],
  },
  {
    name: 'QRA Studio',
    route: '/dashboard/apps/process-safety/qra-studio',
    Page: QraStudio,
    Help: QraStudioHelpGuide,
    scopeTestId: 'qra-theme-scope',
    helpTestId: 'qra-help-theme-scope',
    title: /QRA Studio/i,
    tabs: [/Register/, /Event tree/, /Individual risk/, /Societal risk/, /ALARP and cost-benefit/],
  },
];

APPS.forEach((app) => {
  const renderApp = () => render(<MemoryRouter><app.Page /></MemoryRouter>);
  const ready = () => screen.findByRole('heading', { level: 1, name: app.title });

  describeAppTheme({
    name: app.name,
    route: app.route,
    renderApp,
    ready,
    scopeTestId: app.scopeTestId,
  });

  describe(`${app.name} themed states`, () => {
    beforeAll(installDomShims);
    beforeEach(() => { try { window.localStorage.clear(); } catch { /* storage unavailable */ } });

    it('every tab reads on roles in light and in dark', async () => {
      renderApp();
      await ready();
      for (const tab of app.tabs) {
        await openTab(tab);
        expectNoLegacyChrome();
      }
      fireEvent.click(screen.getByTestId('theme-toggle'));
      expect(getScopeRoot(app.scopeTestId)).toHaveAttribute('data-pl-theme', 'dark');
      for (const tab of app.tabs) {
        await openTab(tab);
        expectNoLegacyChrome();
      }
    });

    it('the help guide opens light in its own scope with no legacy colour', () => {
      render(<MemoryRouter><app.Help /></MemoryRouter>);
      expect(getScopeRoot(app.helpTestId)).toHaveAttribute('data-pl-theme', 'light');
      expectNoLegacyChrome();
      expectThemedPath(`${app.route}/help`);
    });
  });
});

describe('process safety results stay readable', () => {
  beforeAll(installDomShims);
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* storage unavailable */ } });

  it('LOPA prints the SIL outcome as a word beside its status tone', async () => {
    render(<MemoryRouter><LopaSilStudio /></MemoryRouter>);
    const badge = (await screen.findAllByTestId('lopa-outcome'))[0];
    expect(badge.textContent.trim()).not.toBe('');
    expect(badge.className).toMatch(/pl-(success|info|warning|danger)/);
  });

  it('the proof test chart keeps the white chart standard in dark', async () => {
    render(<MemoryRouter><LopaSilStudio /></MemoryRouter>);
    await screen.findByRole('heading', { level: 1 });
    fireEvent.click(screen.getByTestId('theme-toggle'));
    await openTab(/Proof test interval/);
    const chart = await screen.findByTestId('sensitivity-chart');
    expect(chart).toHaveAttribute('data-canvas', 'chart');
    expect(chart).toHaveClass('bg-white');
    expectNoLegacyChrome();
  });

  it('QRA F-N and ALARP charts keep the white chart standard in dark', async () => {
    render(<MemoryRouter><QraStudio /></MemoryRouter>);
    await screen.findByRole('heading', { level: 1 });
    fireEvent.click(screen.getByTestId('theme-toggle'));
    await openTab(/Societal risk/);
    const charts = getScopeRoot('qra-theme-scope').querySelectorAll('[data-canvas="chart"]');
    expect(charts.length).toBeGreaterThan(0);
    charts.forEach((c) => expect(c).toHaveClass('bg-white'));
    expectNoLegacyChrome();
  });

  it('a QRA refusal shows as a danger alert with the engine words', async () => {
    render(<MemoryRouter><QraStudio /></MemoryRouter>);
    fireEvent.change(await screen.findByTestId('cell-0-0-dose-input'), { target: { value: '' } });
    const alert = within(screen.getByTestId('cell-0-0')).getByRole('alert');
    expect(alert).toHaveTextContent(/^heatFluxWM2:/);
    expect(alert.className).toMatch(/text-pl-danger-text/);
    expectNoLegacyChrome();
  });
});
