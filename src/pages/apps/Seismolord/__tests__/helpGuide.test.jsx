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
    expect(HELP_SECTIONS.length).toBe(16);
  });

  test('names the launchers, the depth unit and the sign convention', () => {
    const { container } = renderGuide();
    const text = container.textContent;
    expect(text).toMatch(/Well data/);
    expect(text).toMatch(/Depth unit selector/);
    expect(text).toMatch(/negative below the datum/);
  });

  test('names the real Make surface buttons and the import formats', () => {
    const { container } = renderGuide();
    const text = container.textContent;
    expect(text).toMatch(/Make surface/);
    expect(text).toMatch(/Grid in Seismolord/);
    expect(text).toMatch(/Publish to the registry/);
    expect(text).toMatch(/Save as surface/);
    for (const f of ['Charisma 3D interpretation lines', 'IESX', 'EarthVision', 'ZMAP+', 'CPS-3', 'column mapping']) {
      expect(text).toContain(f);
    }
  });

  test('covers attribute volumes, Tops to Horizons, automatic faults and large surveys', () => {
    const { container } = renderGuide();
    const text = container.textContent;
    for (const f of ['Attribute volume', 'Variance (discontinuity)', 'Sweetness', 'Co-render', 'Tops to horizons',
      'Tie and match tops', 'Pick faults', 'Track the framework', 'Accept and save', 'Prognosis',
      'View it now', 'display copy', 'Large surveys', 'What Seismolord makes for you',
      'Start here', 'Take the tour', 'Detect faults', 'around the line on screen']) {
      expect(text).toContain(f);
    }
  });

  test('copy carries no em dashes (owner rule)', () => {
    const { container } = renderGuide();
    expect(container.textContent.includes('—')).toBe(false);
  });
});
