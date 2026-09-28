/**
 * FDP Accelerator on the design system (rollout batches 6A and 6B).
 *
 * The app wraps itself in <ThemedApp> (6A), so the whole app is in scope
 * from 6A on. 6A converted the shell (layout, navigation, modes), the module
 * pages in modules/*.jsx and the community, concepts, cost, facilities and
 * field-overview subtrees. 6B converts the files in PENDING_6B_FILES below.
 *
 * FOR 6B: when your files are on theme roles, delete PENDING_6B_FILES and
 * PENDING_6B_ALLOW, move the 6B tabs into CONVERTED_TABS and check that the
 * static source check below covers the whole components/fdp tree.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  describeAppTheme, expectNoLegacyChrome, hasLegacyChrome, installDomShims,
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

// The files 6B converts (subtrees under components/fdp/modules).
const PENDING_6B_DIRS = ['generation', 'hse', 'risk', 'scenarios', 'schedule', 'subsurface', 'wells'];
const PENDING_6B_FILES = PENDING_6B_DIRS.flatMap((d) => fs.readdirSync(path.join(FDP, 'modules', d))
  .filter((f) => f.endsWith('.jsx'))
  .map((f) => path.join('modules', d, f)));

// Every legacy colour token those files still carry, plus the text- twin of
// each bg- token (two of them build an icon colour with
// colorClass.replace('bg-', 'text-')). Used only on the 6B tabs, so the 6A
// chrome around them is still checked for anything else.
const PENDING_6B_TOKENS = PENDING_6B_FILES.flatMap((f) => fs
  .readFileSync(path.join(FDP, f), 'utf8')
  .split(/[\s"'`{}()]+/)
  .filter((t) => t && hasLegacyChrome(t)));
const PENDING_6B_ALLOW = [...new Set([
  ...PENDING_6B_TOKENS,
  ...PENDING_6B_TOKENS.filter((t) => t.startsWith('bg-')).map((t) => t.replace('bg-', 'text-')),
])];

// Sidebar label -> converted in 6A.
const CONVERTED_TABS = ['Field Overview', 'Concepts', 'Facilities', 'Economics', 'Community'];
const PENDING_6B_TABS = ['Subsurface', 'Scenarios', 'Wells & Drilling', 'Schedule', 'HSE', 'Risk Management', 'Documents'];

const mount = () => render(<MemoryRouter><FDPAccelerator /></MemoryRouter>);
const ready = () => screen.findByText('Saved plan');

// The opening screen (Field Overview) renders no 6B file, so the standard
// checks run with no allow-list at all.
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

  it.each(CONVERTED_TABS)('the 6A tab "%s" has no legacy colour, light and dark', async (label) => {
    mount();
    await ready();
    openTab(label);
    expectNoLegacyChrome();
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expectNoLegacyChrome();
  });

  it.each(PENDING_6B_TABS)('the tab "%s" adds nothing beyond its pending 6B files', async (label) => {
    mount();
    await ready();
    openTab(label);
    expectNoLegacyChrome({ allow: PENDING_6B_ALLOW });
  });

  it('the 6A source files carry no legacy colour token', () => {
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(p);
      return e.name.endsWith('.jsx') ? [path.relative(FDP, p)] : [];
    });
    const pending = new Set(PENDING_6B_FILES);
    const offenders = walk(FDP)
      .filter((f) => !pending.has(f))
      .flatMap((f) => fs.readFileSync(path.join(FDP, f), 'utf8')
        .split(/[\s"'`{}()]+/)
        .filter((t) => t && hasLegacyChrome(t))
        .map((t) => `${f}: ${t}`));
    expect(offenders).toEqual([]);
    expect(PENDING_6B_FILES.length).toBeGreaterThan(0);
  });
});
