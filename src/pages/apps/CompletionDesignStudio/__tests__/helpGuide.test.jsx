// D7/CD3: the in-app help guide renders every section and stays honest.

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CompletionDesignHelpGuide from '../CompletionDesignHelpGuide';

const renderGuide = () => render(
  <MemoryRouter>
    <CompletionDesignHelpGuide />
  </MemoryRouter>,
);

describe('CompletionDesignHelpGuide', () => {
  test('renders the header and every navigation section', () => {
    renderGuide();
    expect(screen.getByText('Completion Design Studio Help Guide')).toBeInTheDocument();
    for (const id of [
      'overview', 'quickstart', 'string', 'program', 'schematic', 'checks',
      'sizing', 'validation', 'pitfalls', 'glossary',
    ]) {
      expect(document.getElementById(`section-${id}`)).not.toBeNull();
    }
  });

  test('content stays honest about the model', () => {
    renderGuide();
    expect(screen.getAllByText(/nominal planning/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/geometric access only/i)).toBeInTheDocument();
    expect(screen.getByText(/A screen, not a match/)).toBeInTheDocument();
    expect(screen.getAllByText(/API 5CT/).length).toBeGreaterThan(0);
    expect(screen.getByText(/8.525/)).toBeInTheDocument();
  });

  test('copy carries no em dashes (owner rule)', () => {
    const { container } = renderGuide();
    expect(container.textContent.includes('—')).toBe(false);
  });
});
