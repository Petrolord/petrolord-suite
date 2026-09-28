/**
 * Design system rollout batch 3B: Casing & Tubing Design Studio wraps itself
 * in <ThemedApp> (the shared content component, so the routed page and the
 * /dev harness share the scope) and so does its help guide. The shared
 * helpers check the standard four (light by default, toggle to dark and back
 * stored per user, no legacy colour outside data-canvas with a negative
 * control, the route registered). The extra cases walk every studio tab with
 * the golden case loaded, open each dialog and the help drawer inside the
 * scope, and check the charts and the schematic stay white chart canvases.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  describeAppTheme, expectNoLegacyChrome, installDomShims, expectThemedPath,
  installDashboardScope,
} from '@/design/testing/themeAssertions';
import CasingTubingHarness from '../CasingTubingHarness';
import CasingTubingHelpGuide from '../CasingTubingHelpGuide';

const STUDIO = 'Casing & Tubing Design Studio';
const ROUTE = '/dashboard/apps/drilling/casing-tubing-design-pro';

// The harness runs the full studio on the in-memory backend, which seeds the
// golden site, wellbore and design case and selects them.
const renderStudio = () => render(<MemoryRouter><CasingTubingHarness /></MemoryRouter>);
const caseLoaded = () => screen.findByRole('tab', { name: /Casing Design/ }, { timeout: 10000 });

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: null });

describeAppTheme({
  name: STUDIO,
  route: ROUTE,
  renderApp: renderStudio,
  ready: caseLoaded,
  scopeTestId: 'ct-theme-scope',
});

describeAppTheme({
  name: `${STUDIO} help guide`,
  route: `${ROUTE}/help`,
  renderApp: () => render(<MemoryRouter><CasingTubingHelpGuide /></MemoryRouter>),
  ready: () => screen.findByText(`${STUDIO} Help Guide`),
  scopeTestId: 'ct-help-theme-scope',
});

describe('Casing & Tubing Design Studio themed states', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  const openTab = async (name) => {
    const tab = screen.getByRole('tab', { name: new RegExp(name) });
    fireEvent.mouseDown(tab);
    await waitFor(() => expect(tab).toHaveAttribute('data-state', 'active'));
  };

  it('every studio tab leaves no legacy colour, and charts and the schematic are white chart canvases', async () => {
    renderStudio();
    await caseLoaded();
    expectNoLegacyChrome();
    for (const name of ['Well & Loads', 'Load Cases', 'Casing Design', 'Tubing Design', 'Visualizer']) {
      await openTab(name);
      expectNoLegacyChrome();
    }
    // Visualizer: the full-well schematic draws on the white chart standard.
    const viz = await screen.findByTestId('ct-viz');
    expect(viz).toHaveAttribute('data-canvas', 'chart');

    // Tubing Design, Forces view: the Lubinski force chart frame is a chart canvas.
    await openTab('Tubing Design');
    const forces = await screen.findByTestId('ct-forces-chart');
    expect(forces).toHaveAttribute('data-canvas', 'chart');
  }, 60000);

  it('the bottom strip tabs stay clean', async () => {
    renderStudio();
    await caseLoaded();
    for (const name of [/Warnings/, /API References/, /Calculation Log/]) {
      fireEvent.click(screen.getByRole('button', { name }));
      expectNoLegacyChrome();
    }
  }, 30000);

  it('the new case, load case, add string and catalog dialogs carry the scope and stay clean', async () => {
    renderStudio();
    await caseLoaded();

    fireEvent.click(screen.getByTestId('ct-new-case'));
    let dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await openTab('Load Cases');
    fireEvent.click(screen.getByTestId('ct-add-load-case'));
    dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await openTab('Casing Design');
    fireEvent.click(screen.getByTestId('ct-add-casing-string'));
    dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Browse Tubular Catalog' }));
    dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('data-pl-theme', 'light');
    expect(within(dialog).getByText('Tubular Catalog')).toBeInTheDocument();
    expectNoLegacyChrome();
  }, 60000);

  it('the help drawer carries the scope and stays clean on every tab', async () => {
    renderStudio();
    await caseLoaded();
    fireEvent.click(screen.getByTitle('Help & Shortcuts (Ctrl+H)'));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
    for (const name of ['Concepts', 'Examples']) {
      const tab = within(drawer).getByRole('tab', { name });
      fireEvent.mouseDown(tab);
      await waitFor(() => expect(tab).toHaveAttribute('data-state', 'active'));
      expectNoLegacyChrome();
    }
  }, 30000);

  it('the help sub-path is covered by the registered prefix', () => {
    expectThemedPath(`${ROUTE}/help`);
  });
});
