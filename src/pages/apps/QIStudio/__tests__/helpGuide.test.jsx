// The QI Studio help guide renders every section, quotes the live inventory
// groups and curve families, and carries no em or en dashes.
import React from 'react';
import fs from 'fs';
import path from 'path';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import QIStudioHelpGuide, { HELP_SECTIONS } from '../QIStudioHelpGuide';
import { GROUPS } from '../services/inventory';
import { FAMILIES } from '../services/usability';

test('every section renders and the live groups and curve families are quoted', () => {
  const { container } = render(<MemoryRouter><QIStudioHelpGuide /></MemoryRouter>);
  expect(screen.getByRole('heading', { level: 1, name: /QI Studio Help Guide/ })).toBeInTheDocument();
  for (const { id } of HELP_SECTIONS) expect(document.getElementById(`section-${id}`)).not.toBeNull();
  const text = container.textContent;
  for (const g of GROUPS) expect(text).toContain(g.label);
  for (const f of Object.values(FAMILIES)) expect(text).toContain(f.label);
});

test('no em or en dashes in the app copy', () => {
  const dir = path.join(__dirname, '..');
  const files = ['QIStudio.jsx', 'QIStudioHelpGuide.jsx', 'components/Panels.jsx', 'services/usability.js', 'services/inventory.js', 'services/report.js', 'services/model.js'];
  for (const f of files) expect(fs.readFileSync(path.join(dir, f), 'utf8')).not.toMatch(/[–—]/);
});
