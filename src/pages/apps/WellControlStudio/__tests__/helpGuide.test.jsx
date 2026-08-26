// D3/W3: the in-app help guide renders every section and stays honest.

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WellControlHelpGuide from '../WellControlHelpGuide';

const renderGuide = () => render(
  <MemoryRouter>
    <WellControlHelpGuide />
  </MemoryRouter>,
);

describe('WellControlHelpGuide', () => {
  test('renders the header and every navigation section', () => {
    renderGuide();
    expect(screen.getByText('Well Control Studio Help Guide')).toBeInTheDocument();
    for (const id of [
      'overview', 'quickstart', 'volumes', 'killsheet', 'methods', 'kicktol',
      'validation', 'pitfalls', 'glossary',
    ]) {
      expect(document.getElementById(`section-${id}`)).not.toBeNull();
    }
  });

  test('content stays honest about scope and assumptions', () => {
    renderGuide();
    expect(screen.getByText(/PLANNING tool/)).toBeInTheDocument();
    expect(screen.getByText(/surface BOP/)).toBeInTheDocument();
    expect(screen.getAllByText(/Single-bubble|single bubble/).length).toBeGreaterThan(0);
    expect(screen.getByText(/not a substitute/i)).toBeInTheDocument();
    expect(screen.getAllByText(/IWCF/).length).toBeGreaterThan(0);
  });

  test('copy carries no em dashes (owner rule)', () => {
    const { container } = renderGuide();
    expect(container.textContent.includes('—')).toBe(false);
  });
});
