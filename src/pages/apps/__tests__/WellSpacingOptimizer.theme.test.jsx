/**
 * Design system rollout batch 2A: Well Spacing Optimizer opts in to the
 * Petrolord theme (the page and its help guide wrap themselves in
 * <ThemedApp>). describeAppTheme checks light by default, the toggle round
 * trip, no legacy console colour and the cold-load registration; the tests
 * below repeat the legacy check with the example field computed (results
 * table and the three spacing charts, which stay white in dark) and on the
 * help guide. The leaflet map is stubbed (jsdom has no layout for tiles).
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/components/wellspacing/InteractiveMap', () => () => <div data-testid="ws-map-stub" />);

import {
  describeAppTheme, expectNoLegacyChrome, expectThemedPath, getScopeRoot, installDomShims,
  installDashboardScope,
} from '@/design/testing/themeAssertions';
import WellSpacingOptimizer from '@/pages/apps/WellSpacingOptimizer';
import WellSpacingHelpGuide from '@/pages/apps/WellSpacingHelpGuide';

const renderApp = () => render(<MemoryRouter><WellSpacingOptimizer /></MemoryRouter>);
const ready = () => screen.findByText('Well Spacing Optimizer');

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: null });

describeAppTheme({
  name: 'Well Spacing Optimizer',
  route: '/dashboard/apps/reservoir/well-spacing-optimizer',
  renderApp,
  ready,
  scopeTestId: 'wso-theme-scope',
});

describe('Well Spacing Optimizer theme, results and help', () => {
  beforeAll(installDomShims);
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* storage unavailable */ }
  });

  it('no legacy colour with the example field computed; charts stay white in dark', async () => {
    renderApp();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /Load example field/i }));
    // WS-U1: the cases recompute on every edit; there is no Calculate button
    expect(await screen.findByText('Spacing cases')).toBeInTheDocument();
    expect(screen.getByText('How to read this')).toBeInTheDocument();
    expectNoLegacyChrome();

    const scope = getScopeRoot('wso-theme-scope');
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
    const panels = scope.querySelectorAll('[data-canvas="chart"]');
    expect(panels.length).toBe(4); // WS-U1: NPV, EUR, cost per barrel, plan and deliverable rate
    expectNoLegacyChrome();
  });

  it('the help guide opens light in its own scope with no legacy colour', () => {
    render(<MemoryRouter><WellSpacingHelpGuide /></MemoryRouter>);
    expect(getScopeRoot('wso-help-root')).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
    expectThemedPath('/dashboard/apps/reservoir/well-spacing-optimizer/help');
  });
});
