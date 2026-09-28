/**
 * Design system pilot 3 (docs/scope/DesignSystem-example-EPE.md): every EPE
 * route sits inside one ThemedApp scope, the app opens light, the header
 * toggle switches it to dark and back, and no legacy dark-console class is
 * left inside the migrated pages.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';

const CASES = [
  { id: 'c1', user_id: 'u1', case_name: 'Ekene', description: 'Ekene field', created_at: '2026-09-26T10:00:00Z' },
  { id: 'c2', user_id: 'u2', organization_id: 'o1', case_name: 'Partner case', description: null, created_at: '2026-09-26T10:00:00Z' },
];

const makeQuery = (table) => {
  const q = {};
  const chain = () => q;
  ['select', 'eq', 'order', 'limit', 'insert', 'update', 'in', 'is', 'not', 'or'].forEach((m) => { q[m] = jest.fn(chain); });
  q.single = jest.fn(() => Promise.resolve({ data: null, error: null }));
  q.then = (resolve, reject) => Promise.resolve({ data: table === 'epe_cases' ? CASES : [], error: null }).then(resolve, reject);
  return q;
};

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn((t) => makeQuery(t)),
  },
}));

import { AuthContext } from '@/contexts/SupabaseAuthContext';
import { ThemedApp, themeStorageKey } from '@/design/ThemeProvider';
import EpeCaseList from '../EpeCaseList';

// The same layout route App.jsx gives the EPE pages.
const mount = () => render(
  <AuthContext.Provider value={{ user: { id: 'u1' } }}>
    <MemoryRouter initialEntries={['/dashboard/apps/economics/epe/cases']}>
      <Routes>
        <Route element={<ThemedApp className="min-h-screen"><Outlet /></ThemedApp>}>
          <Route path="/dashboard/apps/economics/epe/cases" element={<EpeCaseList />} />
        </Route>
      </Routes>
    </MemoryRouter>
  </AuthContext.Provider>,
);

const LEGACY = /(^|\s)(?:[a-z-]+:)*(?:(?:bg|text|border|from|to)-(?:slate|gray|zinc|lime|cyan)-\d|text-white|bg-white\/|bg-gradient-)/;

beforeEach(() => window.localStorage.clear());

describe('Petroleum Economics Studio on the design system', () => {
  it('opens light inside the theme scope, and the header toggle switches to dark and back', async () => {
    mount();
    expect(await screen.findByText('Ekene')).toBeInTheDocument();
    const root = document.querySelector('[data-pl-root]');
    expect(root).toHaveAttribute('data-pl-theme', 'light');

    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(root).toHaveAttribute('data-pl-theme', 'dark');
    expect(window.localStorage.getItem(themeStorageKey('u1'))).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(root).toHaveAttribute('data-pl-theme', 'light');
  });

  it('leaves no legacy dark-console class inside the case list', async () => {
    mount();
    await screen.findByText('Partner case');
    const offenders = [...document.querySelectorAll('[data-pl-root] [class]')]
      .map((el) => el.getAttribute('class'))
      .filter((c) => LEGACY.test(c));
    expect(offenders).toEqual([]);
    // the page header is the design-system AppHeader with its back control
    expect(screen.getByRole('button', { name: 'Back to Economics' })).toBeInTheDocument();
  });

  it('wraps every EPE route in App.jsx in the one ThemedApp layout route', () => {
    const app = fs.readFileSync(path.resolve(__dirname, '../../../../App.jsx'), 'utf8');
    const start = app.indexOf('<Route element={<ThemedApp className="min-h-screen"><Outlet /></ThemedApp>}>');
    expect(start).toBeGreaterThan(-1);
    const end = app.indexOf('</Route>', start);
    const scoped = app.slice(start, end);
    const epeRoutes = app.match(/<Route path="apps\/economics\/epe\/[^"]+" element={<ProtectedAppRoute/g) || [];
    expect(epeRoutes.length).toBe(8);
    epeRoutes.forEach((r) => expect(scoped).toContain(r));
  });
});
