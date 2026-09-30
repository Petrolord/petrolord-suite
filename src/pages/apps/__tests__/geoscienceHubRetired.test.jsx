// WDM-U2-015: the legacy Geoscience Hub (/dashboard/apps/geoscience/hub)
// is retired. Its route redirects to the Geoscience module dashboard, its
// page is gone, and nothing in the Suite links to it. Before: the route
// rendered six cards, three pointing at redirect slugs and none at Well Data
// Manager, Seismolord or Mapping; it gated on an app id ('geoscience-hub')
// that has no catalog row.
import fs from 'fs';
import path from 'path';
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';

const SRC = path.join(__dirname, '..', '..', '..');
const app = fs.readFileSync(path.join(SRC, 'App.jsx'), 'utf8');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '__tests__') walk(p, out); } else if (/\.(jsx?|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

test('the route redirects to the Geoscience dashboard and the page is gone', () => {
  expect(app).toMatch(/<Route path="apps\/geoscience\/hub" element=\{<Navigate to="\/dashboard\/geoscience" replace \/>\} \/>/);
  expect(app).not.toMatch(/GeoscienceHub/);
  expect(fs.existsSync(path.join(SRC, 'pages', 'apps', 'GeoscienceHub.jsx'))).toBe(false);
});

test('nothing in the Suite links to the retired hub', () => {
  const offenders = walk(SRC).filter((f) => f !== path.join(SRC, 'App.jsx') && /geoscience\/hub\b|geoscience-hub/.test(fs.readFileSync(f, 'utf8')));
  expect(offenders).toEqual([]);
});

test('the same route element sends an old bookmark to the dashboard', () => {
  render(
    <MemoryRouter initialEntries={['/dashboard/apps/geoscience/hub']}>
      <Routes>
        <Route path="/dashboard">
          <Route path="apps/geoscience/hub" element={<Navigate to="/dashboard/geoscience" replace />} />
          <Route path="geoscience" element={<p>Geoscience dashboard</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByText('Geoscience dashboard')).toBeInTheDocument();
});
