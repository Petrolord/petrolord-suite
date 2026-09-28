/**
 * Design system rollout batch 3E: EOR Screening opts in to the Petrolord
 * theme (the page and its help guide wrap themselves in <ThemedApp>).
 * describeAppTheme checks light by default, the toggle round trip, no
 * legacy console colour outside canvases (with a negative control) and the
 * cold-load registration; the tests below cover an expanded method card,
 * the white ranking chart in dark and the help guide.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  describeAppTheme, expectNoLegacyChrome, expectThemedPath, getScopeRoot, installDomShims,
} from '@/design/testing/themeAssertions';
import EorScreeningTool from '@/pages/apps/EorScreeningTool';
import EorScreeningHelpGuide from '@/pages/apps/EorScreeningHelpGuide';

const ROUTE = '/dashboard/apps/reservoir/eor-screening';
const renderApp = () => render(<MemoryRouter><EorScreeningTool /></MemoryRouter>);
const ready = () => screen.findByText('Method ranking');

describeAppTheme({
  name: 'EOR Screening',
  route: ROUTE,
  renderApp,
  ready,
  scopeTestId: 'eor-theme-scope',
});

describe('EOR Screening themed states', () => {
  beforeAll(installDomShims);
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* storage unavailable */ } });

  it('an expanded method shows its verdict table on roles', async () => {
    renderApp();
    await ready();
    const firstMethod = screen.getAllByRole('button').find((b) => /screened criteria met/.test(b.textContent));
    fireEvent.click(firstMethod);
    expect(await screen.findByText(/Oil composition guide/)).toBeInTheDocument();
    expectNoLegacyChrome();
  });

  it('the ranking chart keeps the white chart standard in dark', async () => {
    renderApp();
    await ready();
    const scope = getScopeRoot('eor-theme-scope');
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
    expect(scope.querySelector('.bg-white[data-canvas="chart"]')).not.toBeNull();
    expectNoLegacyChrome();
  });

  it('the help guide opens light in its own scope with no legacy colour', () => {
    render(<MemoryRouter><EorScreeningHelpGuide /></MemoryRouter>);
    expect(getScopeRoot('eor-help-theme-scope')).toHaveAttribute('data-pl-theme', 'light');
    expectNoLegacyChrome();
    expectThemedPath(`${ROUTE}/help`);
  });
});
