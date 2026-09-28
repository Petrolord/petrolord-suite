/**
 * Design-system rollout batch W1B: ReservoirCalc Pro wraps itself in
 * <ThemedApp> (ReservoirCalcPro.jsx). The standard four checks come from the
 * shared helpers; the extra cases walk the input tabs, the header sheets and
 * dialogs, the results modal and the probabilistic wizard, and check that the
 * map and 3D views stay a dark canvas and the charts and slide stay white.
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Any supabase call resolves empty, so the registry doors and project lists
// mount without a network.
jest.mock('@/lib/customSupabaseClient', () => {
  const result = Promise.resolve({ data: [], error: null, count: 0 });
  const chain = () => new Proxy(function () {}, {
    get: (t, prop) => (prop === 'then' ? result.then.bind(result) : chain()),
    apply: () => chain(),
  });
  return {
    supabase: {
      from: () => chain(),
      rpc: () => chain(),
      storage: { from: () => chain() },
      auth: {
        getUser: () => Promise.resolve({ data: { user: null }, error: null }),
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
    },
  };
});

// The page on the in-memory backend pair the dev harness uses (projects,
// surfaces, wells, culture, prospects), so no registry call leaves the test.
jest.mock('../services/rcpBackend', () => {
  const actual = jest.requireActual('../services/rcpBackend');
  return { ...actual, makeRegistryRcpBackend: actual.makeInMemoryRcpBackend };
});

// ESM-only in node_modules; the map canvas only needs a size
jest.mock('react-resize-detector', () => ({
  useResizeDetector: () => ({ width: 400, height: 300, ref: { current: null } }),
}));

jest.mock('d3-scale-chromatic', () => {
  const grey = () => 'rgb(128, 128, 128)';
  return {
    interpolateViridis: grey, interpolateTurbo: grey, interpolateInferno: grey, interpolateYlGnBu: grey,
    interpolateBlues: grey, interpolateYlOrBr: grey, interpolateRdYlBu: grey,
  };
});

import {
  describeAppTheme, expectNoLegacyChrome, getScopeRoot, installDomShims,
} from '@/design/testing/themeAssertions';
import { AuthContext } from '@/contexts/SupabaseAuthContext';
import ReservoirCalcPro, { ReservoirCalcProContent } from '../ReservoirCalcPro';
import { ReservoirCalcProvider, useReservoirCalc } from '../contexts/ReservoirCalcContext';
import { makeInMemoryRcpBackend } from '../services/rcpBackend';
import { ThemedApp } from '@/design/ThemeProvider';
import { TooltipProvider } from '@/components/ui/tooltip';

const USER_ID = 'rcp-theme-user';

const ROUTE = '/dashboard/apps/geoscience/reservoircalc-pro';

const renderApp = () => render(
  <AuthContext.Provider value={{ user: { id: USER_ID } }}>
    <MemoryRouter initialEntries={[ROUTE]}>
      <ReservoirCalcPro />
    </MemoryRouter>
  </AuthContext.Provider>,
);
// generous waits: the suite runs beside the heavy engine tests in CI
const WAIT = { timeout: 5000 };
const ready = () => screen.findByText('ReservoirCalc Pro', {}, WAIT);

describeAppTheme({
  name: 'ReservoirCalc Pro',
  route: ROUTE,
  renderApp,
  ready,
  scopeTestId: 'rcp-theme-scope',
  userId: USER_ID,
});

describe('ReservoirCalc Pro theme: further states', () => {
  beforeAll(() => {
    installDomShims();
    // jsdom has no 2D canvas; the map and 3D viewers draw nothing here
    window.HTMLCanvasElement.prototype.getContext = () => null;
  });
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  const mount = async () => {
    renderApp();
    await ready();
    return getScopeRoot('rcp-theme-scope');
  };

  const pressTab = (el) => {
    fireEvent.mouseDown(el);
    fireEvent.click(el);
  };

  it('the QuickVol alias is registered too', async () => {
    const { isThemedPath } = await import('@/design/coldLoad');
    expect(isThemedPath('/dashboard/apps/geoscience/quickvol')).toBe(true);
  });

  it('every input tab is free of legacy colour, in light and in dark', async () => {
    const scope = await mount();
    const tabs = ['rcp-tab-geometry', 'rcp-tab-surfaces', 'rcp-tab-registry', 'rcp-tab-aoi'];
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') fireEvent.click(screen.getByTestId('theme-toggle'));
      expect(scope).toHaveAttribute('data-pl-theme', theme);
      for (const id of tabs) {
        pressTab(screen.getByTestId(id));
        await act(async () => {});
        expectNoLegacyChrome();
      }
      pressTab(screen.getByRole('tab', { name: 'Fluid' }));
      expectNoLegacyChrome();
      pressTab(screen.getByRole('tab', { name: 'Maps' }));
      expectNoLegacyChrome();
    }
  }, 30000);

  it('the map and 3D area is a dark canvas', async () => {
    await mount();
    const canvas = document.querySelector('#vis-panel-container [data-canvas="dark"]');
    expect(canvas).not.toBeNull();
    // the panel header around it follows the theme
    expect(document.querySelector('#vis-panel-container').className).toMatch(/\bbg-pl-surface\b/);
  });

  it('the header sheets, the tools hub and the save dialog carry the scope', async () => {
    await mount();

    fireEvent.click(screen.getByRole('button', { name: /Projects/i }));
    let panel = await screen.findByRole('dialog', {}, WAIT);
    expect(panel).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
    fireEvent.keyDown(panel, { key: 'Escape' });

    fireEvent.click(screen.getByRole('button', { name: /Tools/i }));
    panel = await screen.findByRole('dialog', {}, WAIT);
    expect(panel).toHaveAttribute('data-pl-theme', 'light');
    for (const label of ['Settings', 'Prospect Risking', 'Audit Trail', 'Data Manager', 'Collaboration']) {
      const btn = screen.getByRole('button', { name: new RegExp(`^${label}$`) });
      fireEvent.click(btn);
      expect(btn).toHaveAttribute('aria-pressed', 'true');
      await act(async () => {});
      expectNoLegacyChrome();
    }
    fireEvent.keyDown(panel, { key: 'Escape' });

    fireEvent.click(screen.getByTestId('rcp-save'));
    panel = await screen.findByRole('dialog', {}, WAIT);
    expect(panel).toHaveAttribute('data-pl-theme', 'light');
    expect(panel.className).toMatch(/\bbg-pl-raised\b/);
    expectNoLegacyChrome();
  }, 30000);

  it('the documentation hub carries the scope', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Documentation' }));
    const hub = await screen.findByRole('dialog', {}, WAIT);
    expect(hub).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });

  it('results: the modal is themed and the slide keeps its white export surface in dark', async () => {
    await mount();
    fireEvent.click(screen.getByTestId('theme-toggle'));
    fireEvent.click(await screen.findByRole('button', { name: /Recalculate/i }, WAIT));
    fireEvent.click(await screen.findByRole('button', { name: /View Full Results/i }, WAIT));
    const modal = await screen.findByRole('dialog', {}, WAIT);
    expect(modal).toHaveAttribute('data-pl-theme', 'dark');
    expectNoLegacyChrome();

    // the slide preview sits in a white chart canvas, so the PNG and PDF
    // capture is the same in both themes
    const slide = modal.querySelector('[data-canvas="chart"] .bg-white');
    expect(slide).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Detailed/i }));
    expect(screen.getByRole('button', { name: /Detailed/i })).toHaveAttribute('aria-pressed', 'true');
    await act(async () => {});
    expectNoLegacyChrome();
  }, 30000);

  it('probabilistic: the wizard and the Monte Carlo results are themed, charts stay white', async () => {
    const Probabilistic = () => {
      const { setCalcMethod } = useReservoirCalc();
      React.useEffect(() => { setCalcMethod('probabilistic'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
      return null;
    };
    render(
      <AuthContext.Provider value={{ user: { id: USER_ID } }}>
        <MemoryRouter initialEntries={[ROUTE]}>
          <ThemedApp data-testid="rcp-theme-scope" className="h-full">
            <ReservoirCalcProvider backend={makeInMemoryRcpBackend()}>
              <Probabilistic />
              <TooltipProvider><ReservoirCalcProContent /></TooltipProvider>
            </ReservoirCalcProvider>
          </ThemedApp>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(await screen.findByText('Probabilistic Analysis', {}, WAIT)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expectNoLegacyChrome();

    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    fireEvent.click(screen.getByRole('button', { name: '1k' }));
    expect(screen.getByRole('button', { name: '1k' })).toHaveAttribute('aria-pressed', 'true');
    expectNoLegacyChrome();
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    await act(async () => { fireEvent.click(screen.getByTestId('rcp-mc-run')); });
    await screen.findByText(/P50 \(Best estimate\)/, {}, { timeout: 15000 });
    expectNoLegacyChrome();

    fireEvent.click(screen.getByRole('button', { name: /View Full Analysis/i }));
    const modal = await screen.findByRole('dialog', {}, WAIT);
    expect(modal).toHaveAttribute('data-pl-theme', 'dark');
    fireEvent.click(screen.getByRole('button', { name: /Detailed/i }));
    await act(async () => {});
    expectNoLegacyChrome();
    // histogram, CDF and tornado stay on the white chart surface in dark
    const charts = modal.querySelectorAll('[data-canvas="chart"]');
    expect(charts.length).toBeGreaterThanOrEqual(3);
    charts.forEach((c) => expect(c.closest('[data-pl-theme]')).toHaveAttribute('data-pl-theme', 'dark'));
  }, 60000);
});
