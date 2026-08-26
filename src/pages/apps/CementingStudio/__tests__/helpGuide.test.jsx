// D4/C3: the in-app help guide renders every section and stays honest.

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CementingHelpGuide from '../CementingHelpGuide';

const renderGuide = () => render(
  <MemoryRouter>
    <CementingHelpGuide />
  </MemoryRouter>,
);

describe('CementingHelpGuide', () => {
  test('renders the header and every navigation section', () => {
    renderGuide();
    expect(screen.getByText('Cementing Studio Help Guide')).toBeInTheDocument();
    for (const id of [
      'overview', 'quickstart', 'volumes', 'placement', 'centralization',
      'checklist', 'validation', 'pitfalls', 'glossary',
    ]) {
      expect(document.getElementById(`section-${id}`)).not.toBeNull();
    }
  });

  test('content stays honest about the model', () => {
    renderGuide();
    expect(screen.getAllByText(/PLUGS with no intermixing/).length).toBeGreaterThan(0);
    expect(screen.getByText(/transient free-fall\s*rate itself is not modeled/)).toBeInTheDocument();
    expect(screen.getByText(/no single displacement-efficiency percentage/)).toBeInTheDocument();
    expect(screen.getAllByText(/API 10D/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Liner jobs/)).toBeInTheDocument();
  });

  test('copy carries no em dashes (owner rule)', () => {
    const { container } = renderGuide();
    expect(container.textContent.includes('—')).toBe(false);
  });
});
