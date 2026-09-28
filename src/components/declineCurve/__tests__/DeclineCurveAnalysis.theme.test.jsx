/**
 * Design-system pilot 2: Decline Curve Analysis runs inside its own opted-in
 * theme scope. The page root carries the scope (light by default), the header
 * toggle switches light and dark and remembers the choice, and the app tree
 * has no legacy console colours left outside the white chart canvases.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));

import DeclineCurveAnalysis from '@/pages/apps/DeclineCurveAnalysis';
import { themeStorageKey } from '@/design/ThemeProvider';
import { installDashboardScope, getScopeRoot } from '@/design/testing/themeAssertions';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
});
beforeEach(() => window.localStorage.clear());

const renderPage = () => render(<MemoryRouter><DeclineCurveAnalysis /></MemoryRouter>);

// legacy console colours that must not survive inside the migrated tree.
// Tokens under the `dark:` variant are ignored: they need a .dark ancestor,
// which the Suite never sets (the Switch primitive still carries a few).
const LEGACY_TOKEN = /^([a-z-]+:)*(bg|text|border|ring|from|to)-(slate|zinc|gray|neutral|lime)-\d|^text-white$|^bg-black/;
const hasLegacyColour = (cls) => cls.split(/\s+/)
  .filter((t) => !t.startsWith('dark:'))
  .some((t) => LEGACY_TOKEN.test(t));

// Since batch 7A a /dashboard page has no scope of its own: every render
// here mounts inside the dashboard's one scope, as DashboardLayout does.
installDashboardScope({ userId: null });

describe('Decline Curve Analysis on the design system', () => {
  it('renders inside a light theme scope by default', async () => {
    renderPage();
    await screen.findByText('Decline Curve Analysis');
    const root = getScopeRoot('dca-theme-scope');
    expect(root).toHaveAttribute('data-pl-theme', 'light');
    expect(root).toHaveAttribute('data-pl-root');
  });

  it('the header toggle switches light and dark and remembers the choice', async () => {
    renderPage();
    await screen.findByText('Decline Curve Analysis');
    const root = getScopeRoot('dca-theme-scope');
    const toggle = screen.getByTestId('theme-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(root).toHaveAttribute('data-pl-theme', 'dark');
    expect(screen.getByTestId('theme-toggle')).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem(themeStorageKey(null))).toBe('dark');
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(root).toHaveAttribute('data-pl-theme', 'light');
  });

  it('has no legacy console colours outside chart canvases, on both tabs', async () => {
    renderPage();
    await screen.findByText('Decline Curve Analysis');
    const offenders = () => [...getScopeRoot('dca-theme-scope').querySelectorAll('[class]')]
      .filter((el) => !el.closest('[data-canvas="chart"]'))
      .map((el) => el.getAttribute('class'))
      .filter(hasLegacyColour);
    expect(offenders()).toEqual([]);
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Type Curve' }));
    expect(screen.getByText(/Type Curve Analysis/i)).toBeInTheDocument();
    expect(offenders()).toEqual([]);
  });
});
