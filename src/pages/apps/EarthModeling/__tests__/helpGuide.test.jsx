// The Earth Modeling help guide renders every section, quotes the live
// population methods, derived kinds, volume unit sets and VE options,
// and carries no em dashes.
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EarthModelingHelpGuide, { HELP_SECTIONS } from '../EarthModelingHelpGuide';
import { POPULATION_METHODS } from '../services/modelBuild';
import { DERIVED_KINDS } from '../services/derivedSurfaces';
import { VOLUME_UNIT_SETS } from '../services/units';

const renderGuide = () => render(<MemoryRouter><EarthModelingHelpGuide /></MemoryRouter>);

describe('EarthModelingHelpGuide', () => {
  test('renders the header and every navigation section', () => {
    renderGuide();
    expect(screen.getByRole('heading', { level: 1, name: /Earth Modeling Help Guide/ })).toBeInTheDocument();
    for (const { id } of HELP_SECTIONS) expect(document.getElementById(`section-${id}`)).not.toBeNull();
    expect(HELP_SECTIONS.length).toBe(14);
  });

  test('quotes the live methods, derived kinds and units', () => {
    const { container } = renderGuide();
    const text = container.textContent;
    for (const m of POPULATION_METHODS) expect(text).toContain(m.label);
    for (const k of DERIVED_KINDS) expect(text).toContain(k.label);
    for (const u of Object.values(VOLUME_UNIT_SETS)) expect(text).toContain(u.label);
    expect(text).toMatch(/four wells/i);
    expect(text).toMatch(/positive means the pick is deeper/i);
  });

  test('copy carries no em dashes (owner rule)', () => {
    const { container } = renderGuide();
    expect(container.textContent.includes('—')).toBe(false);
  });
});
