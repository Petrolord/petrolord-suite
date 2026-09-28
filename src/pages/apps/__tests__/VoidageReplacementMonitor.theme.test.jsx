/**
 * Design system pilot 5: the Voidage Replacement Monitor opts in to the
 * Petrolord theme at its route (<ThemedApp>). Inside the scope the page is
 * light by default, the header toggle switches it to dark and back, and no
 * console colour (slate, lime, sky, emerald, amber, red, blue, cyan) is left
 * on any element outside the white chart frames, across every tab and the
 * imported, pressure and pattern states.
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

import { ThemedApp } from '@/design/ThemeProvider';
import VoidageReplacementMonitor from '@/pages/apps/VoidageReplacementMonitor';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
});

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* storage unavailable */ }
});

const CONSOLE_COLOUR = /(^|\s)([a-z-[\]=&>:/]+:)*(bg|text|border|ring|ring-offset|from|to|shadow|divide|placeholder)-(slate|zinc|gray|lime|sky|blue|cyan|emerald|amber|red|indigo)-\d/;

// Every class string in the document outside chart frames (which keep the
// white chart standard in both themes).
function leftoverConsoleClasses() {
  return [...document.body.querySelectorAll('[class]')]
    .filter((el) => !el.closest('[data-canvas="chart"]'))
    .map((el) => el.getAttribute('class'))
    .filter((cls) => CONSOLE_COLOUR.test(cls) || /(^|\s)text-white(\s|$)/.test(cls));
}

const renderThemed = () => render(
  <MemoryRouter>
    <ThemedApp userId="vrr-theme-test"><VoidageReplacementMonitor /></ThemedApp>
  </MemoryRouter>,
);

describe('Voidage Replacement Monitor in the design-system theme', () => {
  it('the app root carries the theme scope, light by default, and the toggle switches light and dark', async () => {
    const { container } = renderThemed();
    expect(await screen.findByText('Voidage Replacement Monitor')).toBeInTheDocument();
    const scope = container.firstElementChild;
    expect(scope).toHaveAttribute('data-pl-theme', 'light');
    expect(scope).toHaveAttribute('data-pl-root');

    const toggle = screen.getByTestId('theme-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
    expect(screen.getByTestId('theme-toggle')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(scope).toHaveAttribute('data-pl-theme', 'light');
  });

  it('no console colours are left on the page across tabs and data states', async () => {
    renderThemed();
    await screen.findByText('Voidage Replacement Monitor');
    expect(leftoverConsoleClasses()).toEqual([]);

    // Manual grid with the sample, PVT override columns and the dashboard.
    fireEvent.click(screen.getByRole('button', { name: 'Sample' }));
    fireEvent.click(screen.getByRole('button', { name: /PVT overrides/i }));
    expect(leftoverConsoleClasses()).toEqual([]);
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'VRR Dashboard' }));
    expect(screen.getByText(/VRR trend/i)).toBeInTheDocument();
    expect(leftoverConsoleClasses()).toEqual([]);

    // Imported ledger: import note, monthly ledger with target flags.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Data & PVT' }));
    fireEvent.click(screen.getByRole('button', { name: /Sample wells/i }));
    await screen.findByText(/Monthly field ledger/i);
    expect(leftoverConsoleClasses()).toEqual([]);

    // Pressure tab: gated notice, then a survey and pressure-track mode.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Pressure' }));
    expect(screen.getByText(/withheld/i)).toBeInTheDocument();
    expect(leftoverConsoleClasses()).toEqual([]);
    fireEvent.click(screen.getByTitle('Add survey'));
    fireEvent.change(screen.getByPlaceholderText('YYYY-MM-DD'), { target: { value: '2025-01-01' } });
    fireEvent.change(screen.getByPlaceholderText('psia'), { target: { value: '3000' } });
    fireEvent.click(screen.getByRole('button', { name: /Pressure track/i }));
    expect(await screen.findByText(/pressure-dependent FVFs active/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pressure track/i })).toHaveAttribute('aria-pressed', 'true');
    expect(leftoverConsoleClasses()).toEqual([]);

    // Patterns: manager, allocation matrix, rollup, per-pattern cards.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Patterns' }));
    fireEvent.change(screen.getByPlaceholderText('New pattern name'), { target: { value: 'North' } });
    fireEvent.click(screen.getByTitle('Add pattern'));
    fireEvent.click(screen.getByRole('button', { name: 'P-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'P-2' }));
    expect(screen.getByRole('button', { name: 'P-1' })).toHaveAttribute('aria-pressed', 'true');
    screen.getAllByRole('button', { name: /Even split/i }).forEach((b) => fireEvent.click(b));
    expect(await screen.findByText(/Rollup/i)).toBeInTheDocument();
    expect(screen.getAllByText(/scale water injection/i).length).toBeGreaterThan(0);
    expect(leftoverConsoleClasses()).toEqual([]);

    // KPI rail uses the shared StatTile; the status banner is a status role.
    expect(screen.getByTestId('vrr-status').closest('[role="status"]').className).toMatch(/-pl-(success|warning|info)-bg\b/);
  }, 30000);

  it('dialogs and the help drawer carry the scope attribute', async () => {
    renderThemed();
    await screen.findByText('Voidage Replacement Monitor');
    fireEvent.click(screen.getByTitle('VRR documentation'));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveAttribute('data-pl-theme', 'light');
    expect(screen.getByText('What is VRR?')).toBeInTheDocument();
    expect(leftoverConsoleClasses()).toEqual([]);
    fireEvent.keyDown(drawer, { key: 'Escape' });

    fireEvent.click(screen.getByTitle('Create new project'));
    const create = await screen.findByRole('dialog');
    expect(create).toHaveAttribute('data-pl-theme', 'light');
    expect(create.className).toMatch(/\bbg-pl-raised\b/);
  });

  it('the charts keep the white chart standard in dark', async () => {
    const { container } = renderThemed();
    await screen.findByText('Voidage Replacement Monitor');
    fireEvent.click(screen.getByTestId('theme-toggle'));
    fireEvent.click(screen.getByRole('button', { name: 'Sample' }));
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'VRR Dashboard' }));
    const frame = container.querySelector('[data-canvas="chart"]');
    expect(frame).not.toBeNull();
    expect(frame.className).toMatch(/\bbg-white\b/);
    expect(frame.closest('[data-pl-theme]')).toHaveAttribute('data-pl-theme', 'dark');
  });
});
