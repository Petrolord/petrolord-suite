// D5/G3: the in-app help guide renders every section and stays honest.

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GeomechanicsHelpGuide from '../GeomechanicsHelpGuide';

const renderGuide = () => render(
  <MemoryRouter>
    <GeomechanicsHelpGuide />
  </MemoryRouter>,
);

describe('GeomechanicsHelpGuide', () => {
  test('renders the header and every navigation section', () => {
    renderGuide();
    expect(screen.getByText('Geomechanics & Wellbore Stability Studio Help Guide')).toBeInTheDocument();
    for (const id of [
      'overview', 'quickstart', 'inputs', 'mem', 'stability', 'window',
      'publish', 'validation', 'pitfalls', 'glossary',
    ]) {
      expect(document.getElementById(`section-${id}`)).not.toBeNull();
    }
  });

  test('content stays honest about the model', () => {
    renderGuide();
    expect(screen.getByText(/Zero-breakout-width criterion/)).toBeInTheDocument();
    expect(screen.getByText(/1D MEM evaluated along a 3D trajectory/)).toBeInTheDocument();
    expect(screen.getAllByText(/Horsrud/).length).toBeGreaterThan(0);
    expect(screen.getByText(/limits are treated as bounds/i)).toBeInTheDocument();
    expect(screen.getAllByText(/pp-1.0.0/).length).toBeGreaterThan(0);
  });

  test('copy carries no em dashes (owner rule)', () => {
    const { container } = renderGuide();
    expect(container.textContent.includes('—')).toBe(false);
  });
});
