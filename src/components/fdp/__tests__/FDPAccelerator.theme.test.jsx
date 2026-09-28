/**
 * FDP Accelerator on the design system (rollout batches 6A and 6B).
 *
 * The app wraps itself in <ThemedApp> (6A), so the whole app is in scope
 * from 6A on. 6A converted the shell (layout, navigation, modes), the module
 * pages in modules/*.jsx and the community, concepts, cost, facilities and
 * field-overview subtrees. 6B converted the rest (generation, hse, risk,
 * scenarios, schedule, subsurface and wells), so every tab and the whole
 * components/fdp source tree are checked with no allow-list.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  describeAppTheme, expectNoLegacyChrome, hasLegacyChrome, installDomShims,
  installDashboardScope,
} from '@/design/testing/themeAssertions';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
        eq: jest.fn(() => ({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) })),
      })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));

import FDPAccelerator from '@/pages/apps/FDPAccelerator';

const FDP = path.resolve(__dirname, '..');
const ROUTE = '/dashboard/apps/economics/fdp-accelerator';

// Sidebar label, every tab of the app.
const TABS = [
  'Field Overview', 'Subsurface', 'Concepts', 'Scenarios', 'Wells & Drilling', 'Facilities',
  'Economics', 'Schedule', 'HSE', 'Community', 'Risk Management', 'Documents',
];

const mount = () => render(<MemoryRouter><FDPAccelerator /></MemoryRouter>);
const ready = () => screen.findByText('Saved plan');

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: null });

describeAppTheme({
  name: 'FDP Accelerator',
  route: ROUTE,
  renderApp: mount,
  ready,
  scopeTestId: 'fdp-theme-scope',
});

describe('FDP Accelerator tabs inside the scope', () => {
  beforeAll(installDomShims);
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* storage unavailable */ } });

  const openTab = (label) => {
    const nav = document.querySelector('aside');
    const button = [...nav.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(label));
    if (!button) throw new Error(`No sidebar button "${label}"`);
    fireEvent.click(button);
  };
  const clickIfPresent = (name) => {
    const button = screen.queryAllByRole('button').find((b) => b.textContent.trim() === name);
    if (button) fireEvent.click(button);
    return Boolean(button);
  };
  const bothThemes = () => {
    expectNoLegacyChrome();
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expectNoLegacyChrome();
    fireEvent.click(screen.getByTestId('theme-toggle'));
  };

  it.each(TABS)('the empty tab "%s" has no legacy colour, light and dark', async (label) => {
    mount();
    await ready();
    openTab(label);
    bothThemes();
  });

  it('a plan with every example loaded has no legacy colour on any tab, light and dark', async () => {
    mount();
    await ready();
    // Fill the plan so the tables, cards, charts and registers render rows.
    const loaded = TABS.filter((label) => {
      openTab(label);
      return clickIfPresent('Load example');
    });
    expect(loaded).toEqual(expect.arrayContaining(['Subsurface', 'Wells & Drilling', 'Schedule', 'HSE']));
    TABS.forEach((label) => {
      openTab(label);
      // open the sections that start closed
      ['Response Planning', 'Activity List'].forEach((title) => {
        const header = screen.queryAllByText(title).find((el) => el.closest('button'));
        if (header) fireEvent.click(header.closest('button'));
      });
      bothThemes();
    });
    openTab('Schedule');
    expect(clickIfPresent('List')).toBe(true);
    bothThemes();
  });

  it.each([
    ['Scenarios', 'New Scenario'], ['Wells & Drilling', 'Add Well'], ['Schedule', 'Add Activity'],
    ['HSE', 'Add Risk'], ['Risk Management', 'Add Project Risk'],
  ])('the "%s" form has no legacy colour, light and dark', async (label, action) => {
    mount();
    await ready();
    openTab(label);
    expect(clickIfPresent(action)).toBe(true);
    bothThemes();
  });

  it('the components/fdp source tree carries no legacy colour token', () => {
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(p);
      return /\.jsx?$/.test(e.name) ? [path.relative(FDP, p)] : [];
    });
    const files = walk(FDP);
    const offenders = files
      .flatMap((f) => fs.readFileSync(path.join(FDP, f), 'utf8')
        .split(/[\s"'`{}()]+/)
        .filter((t) => t && hasLegacyChrome(t))
        .map((t) => `${f}: ${t}`));
    expect(offenders).toEqual([]);
    // the 6B subtrees are in the walk
    ['generation', 'hse', 'risk', 'scenarios', 'schedule', 'subsurface', 'wells']
      .forEach((d) => expect(files.some((f) => f.startsWith(path.join('modules', d)))).toBe(true));
  });
});
