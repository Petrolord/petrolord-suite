// D6/U2: the in-app help guide renders every section and stays honest.

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CasingTubingHelpGuide from '../CasingTubingHelpGuide';

const renderGuide = () => render(
  <MemoryRouter>
    <CasingTubingHelpGuide />
  </MemoryRouter>,
);

describe('CasingTubingHelpGuide', () => {
  test('renders the header and every navigation section', () => {
    renderGuide();
    expect(screen.getByText('Casing & Tubing Design Studio Help Guide')).toBeInTheDocument();
    for (const id of [
      'overview', 'quickstart', 'spine', 'catalog', 'loadcases', 'casing',
      'tubing', 'validation', 'pitfalls', 'glossary',
    ]) {
      expect(document.getElementById(`section-${id}`)).not.toBeNull();
    }
  });

  test('content stays honest about the model', () => {
    renderGuide();
    expect(screen.getByText(/Connection efficiencies are nominal/)).toBeInTheDocument();
    expect(screen.getByText(/does not run the permanent-corkscrew check/)).toBeInTheDocument();
    expect(screen.getByText(/Annular pressure buildup, sour-service and temperature derating/)).toBeInTheDocument();
    expect(screen.getAllByText(/pp-1.0.0/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Flow lives in Nodal Analysis Studio/)).toBeInTheDocument();
  });

  test('copy carries no em dashes (owner rule)', () => {
    const { container } = renderGuide();
    expect(container.textContent.includes('—')).toBe(false);
  });
});
