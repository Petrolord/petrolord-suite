// D2/H3: the in-app help guide renders every section and stays honest
// about the shipped model.

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HydraulicsHelpGuide from '../HydraulicsHelpGuide';

const renderGuide = () => render(
  <MemoryRouter>
    <HydraulicsHelpGuide />
  </MemoryRouter>,
);

describe('HydraulicsHelpGuide', () => {
  test('renders the header and every navigation section', () => {
    renderGuide();
    expect(screen.getByText('Drilling Fluids & Hydraulics Studio Help Guide')).toBeInTheDocument();
    for (const id of [
      'overview', 'quickstart', 'rheology', 'hydraulics', 'surge', 'cleaning',
      'charts', 'validation', 'pitfalls', 'glossary',
    ]) {
      expect(document.getElementById(`section-${id}`)).not.toBeNull();
    }
  });

  test('content matches the shipped model and limitations', () => {
    renderGuide();
    expect(screen.getAllByText(/Herschel-Bulkley/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Burkhardt/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Hagen-Poiseuille/)).toBeInTheDocument();
    // High-angle limitation is stated, not hidden.
    expect(screen.getByText(/vertical-well correlation/)).toBeInTheDocument();
    // Motor/MWD losses are explicitly out of model.
    expect(screen.getByText(/Motor and MWD/)).toBeInTheDocument();
  });

  test('copy carries no em dashes (owner rule)', () => {
    const { container } = renderGuide();
    expect(container.textContent.includes('—')).toBe(false);
  });
});
