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
      'mineral', 'publish', 'export', 'units', 'validation', 'pitfalls', 'glossary',
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
    // PT11d: the deterministic solver exists; the probabilistic one is the stated gap
    expect(text).not.toMatch(/no probabilistic multi-mineral solver/i);
    expect(text).toMatch(/there is no probabilistic solver yet/i);
    expect(text).toMatch(/refused and flagged, never clamped/i);
    expect(text).toMatch(/Not suited to/);
    expect(text).toMatch(/Gas-bearing intervals/);
    // PT11a: the SP route applies the fit and shows the chain
    expect(text).toMatch(/Bateman-Konen fit/i);
    expect(text).toMatch(/shows every value in the chain/i);
    expect(text).toMatch(/never a silent default/i);
    // PT11b/PT11c: the divider drags and depth shifting is per curve by tie points
    expect(text).toMatch(/drag the divider/i);
    expect(text).not.toMatch(/split divider is fixed/i);
    expect(text).toMatch(/Stretch and squeeze/);
    expect(text).toMatch(/per curve,\s*block or by tie points/i);
    expect(text).toMatch(/raw curve is never changed/i);
    // conditioned curves are never substituted silently
    expect(text).toMatch(/never substituted silently/i);
    // the LAS export carries only the four core outputs
    expect(text).toMatch(/VSH, PHIT, PHIE, SW, BVW, KPERM and PAY/);
    // PT7: digitized curves are always new rows and the AI only proposes
    expect(text).toMatch(/MNEMONIC_DIG/);
    expect(text).toMatch(/always a new curve/i);
    expect(text).toMatch(/reader proposes, it never traces and never saves/i);
  });

  test('copy carries no em dashes (owner rule)', () => {
    const { container } = renderGuide();
    expect(container.textContent.includes('—')).toBe(false);
  });
});
