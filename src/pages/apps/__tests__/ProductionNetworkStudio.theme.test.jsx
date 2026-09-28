/**
 * Design system rollout batch 2B: Production Network Studio opts in to the
 * Petrolord theme (the page wraps itself in <ThemedApp>). The shared
 * describeAppTheme block checks light by default, the toggle round trip, no
 * legacy console colour and the cold-load registration; the walk below
 * repeats the legacy check on every tab with the default three-well network
 * solved, in a selected well's inspector (the shared well-model kit), in the
 * help drawer and the new-project dialog, and confirms the schematic sits on
 * a dark canvas and the charts keep the white chart standard in dark.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/lib/productionSpine', () => ({
  listFields: jest.fn().mockResolvedValue([]),
  listPoWells: jest.fn().mockResolvedValue([]),
  getWellModel: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/utils/savedProjects', () => {
  const service = {
    list: jest.fn().mockResolvedValue([]),
    load: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  return { createSavedProjectsService: () => service };
});

import {
  describeAppTheme, expectNoLegacyChrome, getScopeRoot, installDomShims,
} from '@/design/testing/themeAssertions';
import ProductionNetworkStudio from '@/pages/apps/ProductionNetworkStudio';

const renderApp = () => render(<MemoryRouter><ProductionNetworkStudio /></MemoryRouter>);
const ready = () => screen.findByText('Production Network Studio');

describeAppTheme({
  name: 'Production Network Studio',
  route: '/dashboard/apps/production/production-network-studio',
  renderApp,
  ready,
  scopeTestId: 'network-theme-scope',
});

const solve = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /Solve the network/i }));
  expect((await screen.findAllByText(/Lost to backpressure/i, {}, { timeout: 30000 })).length).toBeGreaterThan(0);
};

describe('Production Network Studio theme, every tab and overlay', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('no legacy colour on any tab with the default network solved', async () => {
    renderApp();
    await ready();
    expectNoLegacyChrome();
    await solve();
    expectNoLegacyChrome();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Results' }));
    expect((await screen.findAllByText(/The field makes/i)).length).toBeGreaterThan(0);
    expectNoLegacyChrome();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Sensitivity' }));
    expect(await screen.findByText(/What the separator pressure is worth/i)).toBeInTheDocument();
    expectNoLegacyChrome();
  }, 60000);

  it('the inspector with a well selected (shared well-model kit) carries no legacy colour', async () => {
    renderApp();
    await ready();
    const wellButtons = screen.getAllByRole('button').filter((b) => (b.textContent || '').startsWith('well'));
    expect(wellButtons.length).toBeGreaterThan(0);
    fireEvent.click(wellButtons[0]);
    expectNoLegacyChrome();
  });

  it('the help drawer and the new-project dialog carry the scope', async () => {
    renderApp();
    await ready();
    fireEvent.click(screen.getByTitle('Production network documentation'));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
    fireEvent.keyDown(drawer, { key: 'Escape' });

    fireEvent.click(screen.getByTitle('Create new project'));
    const create = await screen.findByRole('dialog');
    expect(create).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
  });

  it('in dark the schematic keeps its dark canvas and the charts stay white', async () => {
    renderApp();
    await ready();
    const scope = getScopeRoot('network-theme-scope');
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
    const schematic = screen.getByRole('img', { name: 'Production network schematic' });
    expect(schematic.closest('[data-canvas]')).toHaveAttribute('data-canvas', 'dark');
    await solve();
    const frame = scope.querySelector('[data-canvas="chart"]');
    expect(frame).not.toBeNull();
    expect(frame.className).toMatch(/\bbg-white\b/);
    expectNoLegacyChrome();
  }, 60000);
});
