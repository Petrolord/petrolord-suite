/**
 * Design system rollout W4C: BasinFlow Genesis (Basin & Charge Modeling)
 * opts in to the Petrolord theme. The page mounts on the in-memory backend
 * (the /dev harness twin, seeded with the oracle reference basin) in place
 * of the registry, so no Supabase is needed, and runs the shared four
 * checks: opens light, the toggle goes to dark and back and stores the
 * choice, no legacy console colour outside data-canvas regions (with a
 * negative control), and the route is registered for the themed cold-load
 * loaders. Further states (Expert mode and each of its tabs, a run with the
 * results plots, the dialogs, the Guided wizard steps and the help guide)
 * are checked below with expectNoLegacyChrome.
 *
 * Canvas choice: every BasinFlow plot (burial history, temperature, maturity,
 * generation and expulsion, the events chart, calibration profiles,
 * residuals, heat-flow history and sensitivity) is a white chartTheme chart
 * and sits in data-canvas="chart". The app has no 2D or 3D basin view drawn
 * for a dark ground, so it has no data-canvas="dark" region.
 */
import React from 'react';
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  describeAppTheme, expectNoLegacyChrome, expectLightByDefault, expectNegativeControl,
  expectThemedPath, installDomShims, getScopeRoot,
} from '@/design/testing/themeAssertions';
import { themeStorageKey } from '@/design/ThemeProvider';
import BasinFlowGenesis from '../BasinFlowGenesis';
import BasinFlowHelpGuide from '../BasinFlowHelpGuide';

jest.mock('../services/backend', () => {
  const actual = jest.requireActual('../services/backend');
  return { ...actual, makeRegistryBackend: () => actual.makeInMemoryBackend({ persist: false }) };
});

const ROUTE = '/dashboard/apps/geoscience/basinflow-genesis';
const SCOPE = 'bf-theme-scope';
const renderApp = () => render(<MemoryRouter initialEntries={[ROUTE]}><BasinFlowGenesis /></MemoryRouter>);
const modesShown = () => screen.findByTestId('bf-mode-expert');

// Radix tabs switch on mousedown with the primary button.
const selectTab = (el) => { fireEvent.mouseDown(el, { button: 0, ctrlKey: false }); fireEvent.click(el); };

beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});

describeAppTheme({
  name: 'BasinFlow Genesis',
  route: ROUTE,
  renderApp,
  ready: modesShown,
  scopeTestId: SCOPE,
});

describe('BasinFlow Genesis themed states', () => {
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* storage unavailable */ } });

  const openExpert = async () => {
    renderApp();
    fireEvent.click(await modesShown());
    await screen.findByTestId('bf-tab-properties');
    return getScopeRoot(SCOPE);
  };

  test('Expert mode: header, wells sidebar and every tab use roles, with the toggle in the header', async () => {
    const scope = await openExpert();
    expect(within(scope).getByTestId('theme-toggle')).toBeInTheDocument();
    expectNoLegacyChrome();
    for (const tab of ['calibration', 'scenarios', 'sensitivity', 'results', 'templates', 'batch', 'import', 'properties']) {
      selectTab(screen.getByTestId(`bf-tab-${tab}`));
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => expect(screen.getByTestId(`bf-tab-${tab}`)).toHaveAttribute('data-state', 'active'));
      expectNoLegacyChrome();
    }
    expectNegativeControl(scope);
  });

  test('the import sub-tabs and the calibration plots keep chrome on roles, plots on chart paper', async () => {
    await openExpert();
    selectTab(screen.getByTestId('bf-tab-import'));
    for (const sub of ['tops', 'registry', 'calibration']) {
      selectTab(screen.getByTestId(`bf-import-tab-${sub}`));
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => expect(screen.getByTestId(`bf-import-tab-${sub}`)).toHaveAttribute('data-state', 'active'));
      expectNoLegacyChrome();
    }
    selectTab(screen.getByTestId('bf-tab-sensitivity'));
    await waitFor(() => expect(screen.getByText('Parameter Sensitivity: Max Final %Ro').closest('[data-canvas]')).toHaveAttribute('data-canvas', 'chart'));
  });

  test('dark: Expert mode reads in dark with no legacy chrome', async () => {
    window.localStorage.setItem(themeStorageKey(null), 'dark');
    const scope = await openExpert();
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
    expectNoLegacyChrome();
  });

  test('the export, scenario and new-well dialogs open inside the scope with no legacy chrome', async () => {
    await openExpert();
    const check = async (open) => {
      open();
      const dialog = await screen.findByRole('dialog');
      expect(dialog.closest('[data-pl-theme]')).not.toBeNull();
      expectNoLegacyChrome();
      fireEvent.keyDown(dialog, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    };
    await check(() => fireEvent.click(screen.getByTestId('bf-export')));
    selectTab(screen.getByTestId('bf-tab-scenarios'));
    await check(() => fireEvent.click(screen.getByRole('button', { name: /Save Current State/ })));
    const addWell = screen.getByRole('heading', { name: 'Project Wells' }).parentElement.querySelector('button');
    await check(() => fireEvent.click(addWell));
  });

  test('a run: the simulation dialog and the results plots (white chart paper, chrome on roles)', async () => {
    await openExpert();
    fireEvent.click(screen.getByTestId('bf-simulate'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.closest('[data-pl-theme]')).not.toBeNull();
    expectNoLegacyChrome();
    const view = await screen.findByTestId('bf-sim-view', {}, { timeout: 15000 });
    fireEvent.click(view);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    selectTab(screen.getByTestId('bf-tab-results'));
    for (const tab of ['summary', 'burial', 'temperature', 'maturity', 'generation', 'timing']) {
      selectTab(screen.getByTestId(`bf-results-tab-${tab}`));
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => expect(screen.getByTestId(`bf-results-tab-${tab}`)).toHaveAttribute('data-state', 'active'));
      expectNoLegacyChrome();
    }
    expect(screen.getByTestId('bf-events-chart')).toHaveAttribute('data-canvas', 'chart');
  }, 30000);

  test('Guided mode: the wizard steps use roles and the toggle stays visible', async () => {
    renderApp();
    fireEvent.click(await screen.findByTestId('bf-mode-guided'));
    const scope = getScopeRoot(SCOPE);
    await screen.findByText('Select Basin Template');
    expect(within(scope).getByTestId('theme-toggle')).toBeInTheDocument();
    expectNoLegacyChrome();
    fireEvent.click(screen.getAllByText('Passive Margin')[0]);
    expectNoLegacyChrome();
    for (let i = 0; i < 5; i += 1) {
      const next = screen.queryByRole('button', { name: /Next/ });
      if (!next) break;
      act(() => { fireEvent.click(next); });
      expectNoLegacyChrome();
    }
    // the wizard moved past the template step
    expect(screen.queryByText('Select Basin Template')).toBeNull();
  });

  test('the help guide shares the scope and opens light', () => {
    render(<MemoryRouter><BasinFlowHelpGuide /></MemoryRouter>);
    const scope = screen.getByTestId('bf-help-theme-scope');
    expectLightByDefault(scope);
    expectNoLegacyChrome();
    expectThemedPath(`${ROUTE}/help`);
    expect(within(scope).getByRole('heading', { level: 1, name: /Basin & Charge Modeling Help Guide/ })).toBeInTheDocument();
  });
});
