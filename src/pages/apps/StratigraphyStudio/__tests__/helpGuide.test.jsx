// The Stratigraphy Studio help guide renders every section, quotes the
// live vocabulary (so it cannot drift from what the app stores), names
// the limits, and carries no em dashes.
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StratigraphyHelpGuide, { HELP_SECTIONS } from '../StratigraphyHelpGuide';
import { SURFACE_TYPES, SYSTEMS_TRACTS } from '@/lib/stratigraphy/vocabulary';
import { INTERVAL_KINDS } from '@/lib/stratigraphy/lithology';
import { TIMESCALE_VERSION } from '@/lib/stratigraphy/timescale';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

const renderGuide = () => render(<MemoryRouter><StratigraphyHelpGuide /></MemoryRouter>);

describe('StratigraphyHelpGuide', () => {
  test('renders the header and every navigation section', () => {
    renderGuide();
    expect(screen.getByRole('heading', { level: 1, name: /Stratigraphy Studio Help Guide/ })).toBeInTheDocument();
    for (const { id } of HELP_SECTIONS) expect(document.getElementById(`section-${id}`)).not.toBeNull();
    expect(HELP_SECTIONS.length).toBe(14);
  });

  test('quotes the live vocabulary and the timescale version', () => {
    const { container } = renderGuide();
    const text = container.textContent;
    for (const s of SURFACE_TYPES) expect(text).toContain(s.name);
    for (const t of SYSTEMS_TRACTS) expect(text).toContain(t.name);
    for (const k of INTERVAL_KINDS) expect(text).toContain(k.name);
    expect(text).toContain(TIMESCALE_VERSION);
    expect(text).toContain('Sequence boundary (SB)');            // the Exxon display column
    expect(text).toContain('no equivalent');                      // the fallback rule
    expect(text).toMatch(/measured-depth thicknesses/i);          // the ST4 limit
    expect(text).toMatch(/5 MB per image and 200 MB per well/);   // the ST1 caps
  });

  test('copy carries no em dashes (owner rule)', () => {
    const { container } = renderGuide();
    expect(container.textContent.includes('—')).toBe(false);
  });
});
