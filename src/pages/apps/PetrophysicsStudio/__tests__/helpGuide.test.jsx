// The in-app help guide renders every section and stays honest about
// what the Studio does (written at the PS1-PS10 close-out, 2026-09-02).

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PetrophysicsHelpGuide from '../PetrophysicsHelpGuide';
import { CURVE_ALIASES } from '../services/curveMap';

const renderGuide = () => render(
  <MemoryRouter>
    <PetrophysicsHelpGuide />
  </MemoryRouter>,
);

describe('PetrophysicsHelpGuide', () => {
  test('renders the header and every navigation section', () => {
    renderGuide();
    expect(screen.getByRole('heading', { level: 1, name: /Petrophysics Studio Help Guide/ })).toBeInTheDocument();
    for (const id of [
      'overview', 'quickstart', 'wells', 'tracks', 'layouts', 'parameters', 'zones',
      'interpretations', 'crossplots', 'histograms', 'conditioning', 'rwtools', 'field',
      'publish', 'export', 'units', 'validation', 'pitfalls', 'glossary',
    ]) {
      expect(document.getElementById(`section-${id}`)).not.toBeNull();
    }
  });

  test('the alias table quotes the live curve map', () => {
    const { container } = renderGuide();
    const text = container.textContent;
    for (const [key, aliases] of Object.entries(CURVE_ALIASES)) {
      expect(text).toContain(`${key}`);
      expect(text).toContain(aliases.join(', '));
    }
  });

  test('content stays honest about the model', () => {
    const { container } = renderGuide();
    const text = container.textContent;
    // every Sw model the panel offers is described
    for (const m of ['archie', 'simandoux', 'indonesia', 'waxman-smits', 'dual-water', 'mod-simandoux']) {
      expect(text).toContain(m);
    }
    // the recorded deferrals are stated, never hidden
    expect(text).toMatch(/no probabilistic multi-mineral solver/i);
    expect(text).toMatch(/without a Bateman-Konen correction/i);
    // conditioned curves are never substituted silently
    expect(text).toMatch(/never substituted silently/i);
    // the LAS export carries only the four core outputs
    expect(text).toMatch(/VSH, PHIE, SW and PAY/);
  });

  test('copy carries no em dashes (owner rule)', () => {
    const { container } = renderGuide();
    expect(container.textContent.includes('—')).toBe(false);
  });
});
