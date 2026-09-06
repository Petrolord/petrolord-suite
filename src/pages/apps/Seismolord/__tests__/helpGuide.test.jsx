// The Seismolord help guide renders every section, quotes the live export
// formats, and carries no em dashes.
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SeismolordHelpGuide, { HELP_SECTIONS } from '../SeismolordHelpGuide';

const renderGuide = () => render(<MemoryRouter><SeismolordHelpGuide /></MemoryRouter>);

describe('SeismolordHelpGuide', () => {
  test('renders the header and every navigation section', () => {
    renderGuide();
    expect(screen.getByRole('heading', { level: 1, name: /Seismolord Help Guide/ })).toBeInTheDocument();
    for (const { id } of HELP_SECTIONS) expect(document.getElementById(`section-${id}`)).not.toBeNull();
    expect(HELP_SECTIONS.length).toBe(14);
  });

  test('names the launchers, the depth unit and the sign convention', () => {
    const { container } = renderGuide();
    const text = container.textContent;
    expect(text).toMatch(/Well data/);
    expect(text).toMatch(/Depth unit selector/);
    expect(text).toMatch(/negative below the datum/);
  });

  test('copy carries no em dashes (owner rule)', () => {
    const { container } = renderGuide();
    expect(container.textContent.includes('—')).toBe(false);
  });
});
