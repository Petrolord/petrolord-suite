// D1/TD3: the in-app help guide renders every section with its navigation
// entry and stays honest about the shipped feature set.

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TorqueDragHelpGuide from '../TorqueDragHelpGuide';

const renderGuide = () => render(
  <MemoryRouter>
    <TorqueDragHelpGuide />
  </MemoryRouter>,
);

describe('TorqueDragHelpGuide', () => {
  test('renders the header and every navigation section', () => {
    renderGuide();
    expect(screen.getByText('Torque & Drag Studio Help Guide')).toBeInTheDocument();
    for (const id of [
      'overview', 'quickstart', 'string', 'geometry', 'operations', 'analysis',
      'wear', 'sensitivity', 'validation', 'pitfalls', 'glossary',
    ]) {
      expect(document.getElementById(`section-${id}`)).not.toBeNull();
    }
  });

  test('content matches the shipped model and rules', () => {
    renderGuide();
    // Model honesty markers.
    expect(screen.getByText(/Johancsik formulation/)).toBeInTheDocument();
    expect(screen.getAllByText(/SPE 11380/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Paslay-Dawson/).length).toBeGreaterThan(0);
    // Collapse derating is deliberately out of D1.
    expect(screen.getByText(/Collapse derating is deliberately not shown/)).toBeInTheDocument();
  });

  test('copy carries no em dashes (owner rule)', () => {
    const { container } = renderGuide();
    expect(container.textContent.includes('—')).toBe(false);
  });
});
